// 片段定位：把「段越带」落到「原文哪几句」。
//
// 两类定位：
//   hits:true（虚词/标点/情感情官/框架/人称）——逐句用测量层同一套文本计数原语重数，
//            引用密度显著偏离带沿的句子与命中词，零额外分词。
//   其余标量特征（词汇丰富度/用词构成/句式节奏含 bigramDiv、hurst）——段内滑窗
//            （句群 ≤300 字）重新测量，引用越带最远的窗。
//
// 输出统一为 evidence：
//   { key, kind:'hits', items:[{ text, quote, count, per10k }] }
//   { key, kind:'windows', items:[{ text, quote, value }] }

import { countFunctionWords } from '../lib/meter/function-words.mjs'
import { punctuation } from '../lib/meter/surface.mjs'
import { frameDensity, frameTotal } from '../lib/meter/frame.mjs'
import { countLexicon, LEXICONS } from '../lib/meter/lexicons.mjs'
import { charCount } from '../lib/meter/segment.mjs'
import { byKey } from './catalog.mjs'

const PER1K = (n, han) => (han > 0 ? (n * 1000) / han : 0)
const PER10K = (n, han) => (han > 0 ? (n * 10000) / han : 0) // fw 族测量口径是每万字
const trimQuote = (s, max = 90) => {
  const t = String(s).trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

// 句级密度必须与画像带同单位，否则「越带」的比较没有意义：
//   fw:*  → 每万字；punct / emo / lexicon / pron / frame → 每千字。
const UNIT_OF = (key) => (key.startsWith('fw:') ? 'per10k' : 'per1k')

const EMOTION_WORDS = [...LEXICONS.joy, ...LEXICONS.like, ...LEXICONS.anger, ...LEXICONS.sorrow, ...LEXICONS.fear, ...LEXICONS.disgust, ...LEXICONS.surprise]
const PRON_WORDS = { 'pron:firstPer1k': ['我们', '咱们', '我'], 'pron:secondPer1k': ['你们', '您', '你'], 'pron:thirdPer1k': ['他们', '她们', '它们', '他', '她'] }

/** 逐句文本计数（零分词）。返回 null 表示该特征没有句级计数器。rate 与画像带同单位。 */
function sentenceCounts(key, sentence, han) {
  if (key.startsWith('fw:')) {
    const w = key.slice(3)
    const n = countFunctionWords(sentence, [w])[w] ?? 0
    return { count: n, rate: PER10K(n, han), unit: 'per10k' }
  }
  if (key.startsWith('punct:')) {
    const p = punctuation(sentence)
    const rate = p[key.slice(6)] ?? 0
    return { count: Math.round((rate * han) / 1000), rate, unit: 'per1k' }
  }
  if (key === 'emo:R') {
    const n = countLexicon(sentence, EMOTION_WORDS)
    return { count: n, rate: PER1K(n, han), unit: 'per1k' }
  }
  if (key.startsWith('lexicon:')) {
    const words = LEXICONS[key.slice(8)]
    if (!words) return null
    const n = countLexicon(sentence, words)
    return { count: n, rate: PER1K(n, han), unit: 'per1k' }
  }
  if (PRON_WORDS[key]) {
    const n = countLexicon(sentence, PRON_WORDS[key], { masked: false })
    return { count: n, rate: PER1K(n, han), unit: 'per1k' }
  }
  if (key === 'frame:total') {
    const rate = frameTotal(sentence)['frame:total'] ?? 0
    return { count: Math.round((rate * han) / 1000), rate, unit: 'per1k' }
  }
  if (key.startsWith('frame:')) {
    const rate = frameDensity(sentence)[key] ?? 0
    return { count: Math.round((rate * han) / 1000), rate, unit: 'per1k' }
  }
  return null
}

/**
 * 定位一个发现的原文证据。
 * @param {object} para 段落单元（含 text/sents/features）
 * @param {object} finding 发现项（key/side/z/value/lo/hi）
 * @param {object} meter ParaMeter 实例（滑窗重测用）
 */
export async function locateFinding(para, finding, meter) {
  const c = byKey(finding.key)
  if (!c) return null
  if (c.hits) {
    const bandEdge = finding.side === 'hi' ? finding.hi : finding.lo
    const items = []
    for (const s of para.sents) {
      const han = charCount(s)
      if (han < 4) continue
      const sc = sentenceCounts(finding.key, s, han)
      if (!sc || !Number.isFinite(bandEdge) || sc.count <= 0) continue
      const beyond = finding.side === 'hi' ? sc.rate > bandEdge * 1.2 : sc.rate < bandEdge * 0.8
      if (beyond) items.push({ text: s, quote: trimQuote(s), count: sc.count, rate: Math.round(sc.rate * 100) / 100, unit: UNIT_OF(finding.key) })
    }
    items.sort((a, b) => (finding.side === 'hi' ? b.rate - a.rate : a.rate - b.rate))
    return { key: finding.key, kind: 'hits', items: items.slice(0, 4) }
  }
  if (!meter) return null
  const wins = await meter.windowsOf(para.sents)
  const bandEdge = finding.side === 'hi' ? finding.hi : finding.lo
  const items = []
  for (const w of wins) {
    const v = w.features[finding.key]
    if (!Number.isFinite(v)) continue
    const beyond = finding.side === 'hi' ? v > bandEdge : v < bandEdge
    if (beyond) items.push({ text: w.text, quote: trimQuote(w.text, 120), value: Math.round(v * 10000) / 10000 })
  }
  items.sort((a, b) => (finding.side === 'hi' ? b.value - a.value : a.value - b.value))
  return { key: finding.key, kind: 'windows', items: items.slice(0, 2) }
}

/** 一个段落全部发现的定位（串行；单特征失败不拖垮整段）。 */
export async function locatePara(para, findings, meter) {
  const out = []
  for (const f of findings) {
    try {
      const e = await locateFinding(para, f, meter)
      if (e && (e.items?.length ?? 0) > 0) out.push(e)
    } catch { /* 单特征定位失败不影响其余 */ }
  }
  return out
}
