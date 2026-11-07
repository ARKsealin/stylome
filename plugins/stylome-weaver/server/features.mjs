// 从原文补算的零模型特征（测量与画像学习共用同一份实现）：
//   sent:hurst   段内句长序列的赫斯特指数（DFA；句数 < 16 时为 NaN）
//   emo:R        七类情绪词表每千字命中之和
//   bigramDiv    相邻词性转移种类数 / 144（需要分词 tokens）
// 无句向量、无本地判别模型、无网络。

import { sentences, charCount } from '../lib/meter/segment.mjs'
import { hurstDFA } from '../lib/meter/stats.mjs'
import { EMOTIONS } from '../lib/meter/lexicons.mjs'

/** 句长序列的赫斯特指数。 */
export function hurstOf(text) {
  const lens = sentences(text).map((s) => charCount(s)).filter((n) => n > 0)
  return hurstDFA(lens)
}

const BIGRAM_CLASSES = { n: 'N', nr: 'N', ns: 'N', nt: 'N', nz: 'N', v: 'V', vd: 'V', vn: 'V', a: 'A', ad: 'A', an: 'A', d: 'D', m: 'M', q: 'M', r: 'R', c: 'C', p: 'P', u: 'U', ud: 'U', uj: 'U', ul: 'U', uv: 'U', uz: 'U', y: 'Y', t: 'T', s: 'T', f: 'T', b: 'B', z: 'B', e: 'B', o: 'B' }

/** 相邻词性转移的种类数 / 144（12 类 × 12 类）；标点与未知词性处重置转移链。 */
export function bigramDivOfTokens(toks) {
  const transitions = new Set()
  let prev = null
  for (const t of toks) {
    const cls = BIGRAM_CLASSES[t.p] ?? null
    if (cls) {
      if (prev) transitions.add(prev + '>' + cls)
      prev = cls
    } else prev = null
    if (/[。！？；?!;]/.test(t.w ?? '')) prev = null
  }
  return transitions.size / 144
}

/**
 * @param {string} text 段原文（已清洗）
 * @param {object} flat flatten(measure) 的结果（取 lexicon:* 算 emo:R）
 * @param {Array<{w:string,p:string}>|null} toks 分词结果
 */
export function extraFeatures(text, flat, toks = null) {
  let emo = 0
  for (const e of EMOTIONS) emo += flat[`lexicon:${e}`] ?? 0
  return { 'sent:hurst': hurstOf(text), 'emo:R': emo, ...(toks ? { bigramDiv: bigramDivOfTokens(toks) } : {}) }
}
