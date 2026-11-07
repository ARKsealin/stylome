// 词复用集中度特征（设计 §2.8 H3a，决策 D13）。
// 全局多样性指标（MATTR/Yule K）回答"词汇总体是否多样"；本模块回答"哪些词被反复使用"——
// 度量复用行为（集中度）而非具体词的身份，题材稳健性优于原始词频。

import { charCount } from './segment.mjs'

/**
 * 词性内频次集中度：同一词性内部，top-K 词的词数占该词性总词数的比例。
 * AI 特征假设：AI 在同一词性内反复使用同一些词（"接住"式复用），集中度系统性偏高。
 * @param {Array<{w,p}>} tokens 分词结果
 * @param {object} [opts] posList 要统计的词性（默认动词 v/vn、形容词 a/an）；topK 默认 10
 */
export function posConcentration(tokens, { posList = ['v', 'vn', 'a', 'an'], topK = 10 } = {}) {
  const out = {}
  for (const pos of posList) {
    const counts = {}
    let total = 0
    for (const t of tokens) {
      if (!t.p || !pos.includes(t.p) || t.w.length < 1) continue
      // 单字虚化词（"着""了"）不计入动词复用：它们是语法成分不是实词选择
      if (t.w.length === 1 && /[着了过]/.test(t.w)) continue
      counts[t.w] = (counts[t.w] ?? 0) + 1
      total++
    }
    const top = Object.values(counts).sort((a, b) => b - a).slice(0, topK)
    out[`rep:${pos}Top${topK}`] = total > 0 ? top.reduce((s, x) => s + x, 0) / total : 0
  }
  return out
}

/**
 * 内容词二元组复现率：相邻内容词对中，重复出现的比例。
 * 人类写作偶用重复修辞；AI 的搭配复现是系统性的。按每千内容词归一。
 */
export function bigramReuse(tokens, { window = 'adjacent', per = 1000 } = {}) {
  // 内容词：实词性词性且非单字
  const isContent = (t) => t.p && /^[nva]|^vn|^an/.test(t.p) && t.w.length >= 2
  const seq = tokens.filter(isContent).map((t) => t.w)
  if (seq.length < 2) return { 'rep:bigramReuse': 0, 'rep:contentWords': seq.length }
  const counts = {}
  const pairs = window === 'adjacent' ? seq.length - 1 : 0
  for (let i = 0; i < seq.length - 1; i++) {
    const key = seq[i] + '|' + seq[i + 1]
    counts[key] = (counts[key] ?? 0) + 1
  }
  let repeats = 0
  for (const c of Object.values(counts)) if (c > 1) repeats += c - 1
  return { 'rep:bigramReuse': repeats * per / Math.max(1, pairs), 'rep:contentWords': seq.length }
}
