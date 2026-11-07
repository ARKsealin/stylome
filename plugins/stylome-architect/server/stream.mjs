// stylomeArchitect 段落流测量（L1 唯一测量层，生产化自实验 precompute-para）：
// 清洗 → 空行分段 → 逐段 [汉字数, 对白占比, 7 大类情绪强度, valence 两向, 实体计数]
// + 全文句长序列。分词走 py/segment_server.py 常驻桥；大工词典由 ./lexicon.mjs 外部解析。

import { startSegmenter } from '../lib/corpus/segmenter.mjs'
import { charCount, normalize } from '../lib/meter/segment.mjs'
import { dialogueRatio } from '../lib/meter/surface.mjs'
import { cleanText } from './stack/clean.mjs'
import { EMOTIONS7 } from './stack/registry.mjs'

export const pythonPath = () => process.env.LITISTRUCTURE_PYTHON || process.env.STYLOME_PYTHON || process.env.LITIDENTIFY_PYTHON || 'python'

function sentencesOf(text) {
  const out = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if (/[。！？!?]/.test(ch)) { out.push(buf); buf = '' }
  }
  if (buf.trim()) out.push(buf)
  return out.filter((s) => charCount(s) > 0)
}

export class StreamMeter {
  constructor(python = pythonPath()) { this.seg = startSegmenter(python) }

  /**
   * 整篇文档的段落流 + 句长序列。
   * @returns {Promise<{paras:Array, hanTotal:number, sentLens:number[]}>}
   * paras[]: { idx, han, skip, dial, emo:{乐..惊}, pos, neg, ents:{名:次数}, text }
   */
  async document(text, dict) {
    const clean = cleanText(text)
    const units = normalize(clean).split(/\n\s*\n/).map((p) => p.replace(/\s+/gu, '').trim()).filter(Boolean)
    const paras = []
    for (let i = 0; i < units.length; i++) {
      const p = units[i]
      const han = charCount(p)
      if (han < 20) { paras.push({ idx: i, han, skip: true, text: p }); continue }
      const toks = await this.seg.segment(p)
      const emo = Object.fromEntries(EMOTIONS7.map((m) => [m, 0]))
      let pos = 0, neg = 0
      const ents = {}
      for (const t of toks) {
        const d = dict.get(t.w)
        if (d) {
          emo[d.cat7] += d.strength
          if (d.polarity === 1) pos += d.strength
          else if (d.polarity === 2) neg += d.strength
        }
        if ((t.p === 'nr' || t.p === 'ns' || t.p === 'nt' || t.p === 'nz') && t.w.length >= 2) ents[t.w] = (ents[t.w] ?? 0) + 1
      }
      paras.push({ idx: i, han, skip: false, dial: dialogueRatio(p), emo, pos, neg, ents, text: p })
    }
    return { paras, hanTotal: paras.reduce((s, p) => s + p.han, 0), sentLens: sentencesOf(clean).map(charCount) }
  }

  close() { this.seg.stop() }
}
