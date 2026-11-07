// 标点与句式特征。全部按字面计数，不依赖分词。

import { sentences, clauses, charCount, paragraphs } from './segment.mjs'
import { quantiles20, cv, mean } from './stats.mjs'

const PUNCT = {
  // 半角句点只在不挨着数字时算句号（"2.5" 的小数点不算）
  comma: /[，,]/gu, period: /。|(?<!\d)\.(?!\d)/gu, question: /[？?]/gu, exclaim: /[！!]/gu,
  ellipsis: /…+/gu, dash: /[—–―]+/gu, quote: /[“”「」『』]/gu, enumeration: /[、]/gu, semicolon: /[；;]/gu,
}

/** 每千字的标点频率。 */
export function punctuation(text) {
  const chars = Math.max(1, charCount(text))
  const out = {}
  for (const [k, re] of Object.entries(PUNCT)) out[k] = (text.match(re) ?? []).length * 1000 / chars
  return out
}

/** 句长与小句特征（设计 14.6）。 */
export function sentenceFeatures(text) {
  const sents = sentences(text)
  const lens = sents.map((s) => charCount(s))
  const clauseLens = sents.flatMap((s) => clauses(s).map((c) => charCount(c))).filter((n) => n > 0)
  const perSent = sents.map((s) => clauses(s).length)
  const n = lens.length || 1
  return {
    sentCount: sents.length,
    sentLenQuantiles: lens.length ? quantiles20(lens) : [],
    sentLenMean: lens.length ? mean(lens) : 0,
    sentLenCv: lens.length > 1 ? cv(lens) : 0,
    shortSentRatio: lens.filter((l) => l <= 8).length / n,
    longSentRatio: lens.filter((l) => l >= 40).length / n,
    clauseLenMean: clauseLens.length ? mean(clauseLens) : 0,
    clausesPerSent: perSent.length ? mean(perSent) : 0,
    // 破碎度：每百字小句数
    fragmentation: charCount(text) > 0 ? (clauseLens.length * 100) / charCount(text) : 0,
  }
}

/** 段落特征。 */
export function paragraphFeatures(text) {
  const paras = paragraphs(text)
  const lens = paras.map((p) => charCount(p))
  const sentsPerPara = paras.map((p) => sentences(p).length)
  const ratios = []
  for (let i = 1; i < lens.length; i++) if (lens[i - 1] > 0) ratios.push(lens[i] / lens[i - 1])
  const n = lens.length || 1
  return {
    paraCount: paras.length,
    paraLenMean: lens.length ? mean(lens) : 0,
    paraLenCv: lens.length > 1 ? cv(lens) : 0,
    singleSentParaRatio: sentsPerPara.filter((k) => k === 1).length / n,
    adjacentLenRatioMean: ratios.length ? mean(ratios) : 1,
  }
}

/** 引号外的叙述文字（叙述视角的代词只在这里数）。 */
export function narrationText(text) {
  const pairs = { '“': '”', '「': '」', '『': '』' }
  let out = '', open = null
  for (const ch of String(text)) {
    if (!open && pairs[ch]) { open = pairs[ch]; continue }
    if (open) { if (ch === open) open = null; continue }
    out += ch
  }
  return out
}

/** 引号内字数占比。 */
export function dialogueRatio(text) {
  const chars = charCount(text)
  if (chars === 0) return 0
  let inside = 0, open = false
  const pairs = { '“': '”', '「': '」', '『': '』' }
  const close = new Set(Object.values(pairs))
  let buf = ''
  for (const ch of text) {
    if (!open && pairs[ch]) { open = pairs[ch]; continue }
    if (open && ch === open) { inside += charCount(buf); buf = ''; open = false; continue }
    if (open) buf += ch
    else if (close.has(ch)) continue
  }
  return inside / chars
}
