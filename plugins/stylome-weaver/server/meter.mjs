// 段落级测量：清洗 → 按空行分段 → 逐段分词 + measure → flatten + 补算三项。
// 单位是「段」而不是判别器的「窗」——本插件的对象是作者可编辑的段落结构。
// 分词走 py/segment_server.py 常驻桥；零模型：无句向量、无 LLM、零网络。

import { startSegmenter } from '../lib/corpus/segmenter.mjs'
import { measure } from '../lib/meter/measure.mjs'
import { flatten } from '../lib/profile/flatten.mjs'
import { charCount, paragraphs, sentences } from '../lib/meter/segment.mjs'
import { cleanText } from './clean.mjs'
import { extraFeatures } from './features.mjs'
import { MIN_CHECK_CHARS } from './catalog.mjs'

/** 解释器来源：显式配置 → STYLOME_WEAVER_PYTHON → STYLOME_PYTHON → python。 */
export const pythonPath = () => process.env.STYLOME_WEAVER_PYTHON || process.env.STYLOME_PYTHON || 'python'

export class ParaMeter {
  constructor(python = pythonPath()) { this.seg = startSegmenter(python) }

  /**
   * 整篇文档的段落测量。
   * @param {string} text 原文（docx/txt/md 读出的正文）
   * @returns {Promise<{paras: Array<{idx:number, han:number, checkable:boolean, text:string, sents:string[], features:object|null}>, hanTotal:number}>}
   */
  async document(text) {
    const clean = cleanText(text)
    const units = paragraphs(clean)
    const out = []
    for (let i = 0; i < units.length; i++) {
      const p = units[i]
      const han = charCount(p)
      const checkable = han >= MIN_CHECK_CHARS
      const item = { idx: i + 1, han, checkable, text: p, sents: sentences(p), features: null }
      if (checkable) {
        const toks = await this.seg.segment(p)
        const f = flatten(measure(p, toks))
        Object.assign(f, extraFeatures(p, f, toks))
        item.features = f
      }
      out.push(item)
    }
    return { paras: out, hanTotal: out.reduce((s, p) => s + p.han, 0) }
  }

  /** 段内滑窗测量（片段定位用）：把句群窗重新分词后测特征。 */
  async windowsOf(sents, maxChars = 300) {
    const wins = []
    let cur = [], n = 0
    const flush = () => { if (cur.length) wins.push(cur.join('')); cur = []; n = 0 }
    for (const s of sents) {
      cur.push(s)
      n += charCount(s)
      if (n >= maxChars) flush()
    }
    flush()
    const out = []
    for (const w of wins) {
      if (charCount(w) < 20) continue
      const toks = await this.seg.segment(w)
      const f = flatten(measure(w, toks))
      Object.assign(f, extraFeatures(w, f, toks))
      out.push({ text: w, features: f })
    }
    return out
  }

  close() { this.seg.stop() }
}
