// 从原文补算的三项特征，训练与推理共用一份实现：
//   sent:hurst   块内句长序列的赫斯特指数（DFA，lib/meter/stats.mjs 的 hurstDFA；句数 < 32 时为 NaN）
//                注：总账 v5 记的是 R/S 法，这里用库里已有的 DFA 估计器，数值不可与 0.580/0.534 直接对比。
//   sig:density  AI 侧 Top-20 签名每千字命中（只做仲裁与 SDN 的 sig 轴，不进判别器）
//   emo:R        七类情绪词表每千字命中之和（总账 v5 §4 的 emo:R，SDN 的 emo 轴）
// units-flat.jsonl 里没有这三列，训练时由 corpus.attachText 重建块文本后补算。

import { sentences, charCount } from '../../lib/meter/segment.mjs'
import { hurstDFA } from '../../lib/meter/stats.mjs'
import { sigDensity } from './sig.mjs'

const EMOTIONS = ['joy', 'like', 'anger', 'sorrow', 'fear', 'disgust', 'surprise']

/** 句长序列的赫斯特指数。 */
export function hurstOf(text) {
  const lens = sentences(text).map((s) => charCount(s)).filter((n) => n > 0)
  return hurstDFA(lens)
}

/**
 * @param {string} text 块原文（已清洗）
 * @param {object} flat flatten(measure) 的结果（取 lexicon:* 算 emo:R）
 */

// bigramDiv：窗内相邻词性转移的种类数 / 144（12 类 × 12 类），句界重置转移链。
// 变化度实验（2026-11-06）确认为有效特征：窗口级 d=-1.63、四家族同向、增量 +0.012~+0.017。
const BIGRAM_CLASSES = { n: 'N', nr: 'N', ns: 'N', nt: 'N', nz: 'N', v: 'V', vd: 'V', vn: 'V', a: 'A', ad: 'A', an: 'A', d: 'D', m: 'M', q: 'M', r: 'R', c: 'C', p: 'P', u: 'U', ud: 'U', uj: 'U', ul: 'U', uv: 'U', uz: 'U', y: 'Y', t: 'T', s: 'T', f: 'T', b: 'B', z: 'B', e: 'B', o: 'B' }
export function bigramDivOfTokens(toks) {
  const transitions = new Set()
  let total = 0, prev = null
  for (const t of toks) {
    const cls = BIGRAM_CLASSES[t.p] ?? null
    if (cls) {
      if (prev) { transitions.add(prev + '>' + cls); total++ }
      prev = cls
    } else prev = null
    if (/[。！？；?!;]/.test(t.w ?? '')) prev = null
  }
  return transitions.size / 144
}

export function extraFeatures(text, flat, toks = null) {
  let emo = 0
  for (const e of EMOTIONS) emo += flat[`lexicon:${e}`] ?? 0
  return { 'sent:hurst': hurstOf(text), 'sig:density': sigDensity(text), 'emo:R': emo, ...(toks ? { bigramDiv: bigramDivOfTokens(toks) } : {}) }
}
