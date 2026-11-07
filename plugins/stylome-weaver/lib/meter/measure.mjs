// 对一个文本块做全套测量。分词由调用方传入（tokens），测量本身不含任何模型。
// 返回的对象可 JSON 序列化，字段顺序固定，同一输入两次测量逐字节一致（设计 14.14）。

import { charCount } from './segment.mjs'
import { functionWordList, countFunctionWords, per10k } from './function-words.mjs'
import { punctuation, sentenceFeatures, paragraphFeatures, dialogueRatio, narrationText } from './surface.mjs'
import { mattr, yuleK, honoreR, hapaxRatio, mean } from './stats.mjs'
import { lexiconRates, countLexicon } from './lexicons.mjs'
import { posUnigrams, posNgrams, POS_NAMES } from './posfeat.mjs'
import { posConcentration, bigramReuse } from './reuse.mjs'
import { frameDensity, frameTotal } from './frame.mjs'

// 实词词性：名词、动词、形容词及其子类，地名、人名、机构、处所、方位、成语、习语。
// 这些换成词性标记；虚词、代词、副词、介词、连词、助词、语气词保留原形。
const CONTENT_POS = new Set(['n', 'nr', 'ns', 'nt', 'nz', 'ng', 'nrt', 'v', 'vn', 'vd', 'vg', 'a', 'ad', 'an', 'ag', 'i', 'l', 's', 'f', 't', 'j', 'b'])
const NOUN_POS = new Set(['n', 'nr', 'ns', 'nt', 'nz', 'ng', 'nrt'])
const ADJ_POS = new Set(['a', 'ad', 'an', 'ag', 'b', 'z'])
const VERB_POS = new Set(['v', 'vn', 'vd', 'vg'])
const ENTITY_POS = new Set(['nr', 'ns', 'nt', 'nz', 'nrt'])

/**
 * 去内容表示（设计 5.1）：虚词保留原形，实词换成词性标记，标点保留。
 * 这样风格编码器看不到题材词。
 */
export function decontent(tokens) {
  return tokens.map((t) => (CONTENT_POS.has(t.p) ? t.p : t.w)).join(' ')
}

const HAN = /\p{Script=Han}/u

/** 实词里的汉字集合（内容保持检查用）。 */
export function contentChars(tokens) {
  const out = new Set()
  for (const t of tokens) if (CONTENT_POS.has(t.p)) for (const ch of t.w) if (HAN.test(ch)) out.add(ch)
  return out
}

/**
 * 内容保持度：原段实词的字，在改写后的文本里出现的比例。原段没有实词时为 1。
 * 按字而不按词比较，同义替换里共用的字（结果 → 结论）不算丢失；换了情节的改写会丢掉大部分实词的字。
 */
export function contentRetention(sourceTokens, text) {
  const need = contentChars(sourceTokens)
  if (need.size === 0) return 1
  const have = new Set([...String(text)].filter((ch) => HAN.test(ch)))
  let hit = 0
  for (const ch of need) if (have.has(ch)) hit++
  return hit / need.size
}

/** 只要词，不要词性。标点也去掉。词汇丰富度在这个序列上算（设计 14.9）。 */
export function wordTokens(tokens) {
  return tokens.filter((t) => t.p !== 'x' && t.p !== 'w').map((t) => t.w)
}

/**
 * 叙述视角（narrative_perspective）的代词计数：只数引号外的叙述文字，对白里的“我”“你”不算。
 * 返回每千字频率与第一、二、三人称的占比。
 */
function pronouns(text) {
  const narr = narrationText(text)
  const chars = Math.max(1, charCount(narr))
  const plain = { masked: false }
  const first = countLexicon(narr, ['我们', '咱们', '我'], plain), second = countLexicon(narr, ['你们', '您', '你'], plain), third = countLexicon(narr, ['他们', '她们', '它们', '他', '她'], plain)
  const all = first + second + third || 1
  return { firstPer1k: first * 1000 / chars, secondPer1k: second * 1000 / chars, thirdPer1k: third * 1000 / chars, firstShare: first / all, secondShare: second / all, thirdShare: third / all }
}

/**
 * 词频与词类特征。f 是 jieba 词典词频（分词服务给出；没有时按 0 计）。
 * 词汇复杂度（vocabulary_complexity）：实词的平均 log 词频越低、低频实词越多，用词越典雅生僻。
 * 术语密度（terminology_density）：用户给了术语表时按术语表计；没给时用“词典外且不是人名地名的名词”近似。
 */
function wordStats(tokens, chars, terms) {
  const content = tokens.filter((t) => CONTENT_POS.has(t.p) && HAN.test(t.w))
  const logf = content.map((t) => Math.log10(1 + (t.f ?? 0)))
  const rare = content.filter((t) => (t.f ?? 0) < 50).length
  const words = tokens.filter((t) => t.p !== 'x' && t.p !== 'w').length || 1
  const nouns = tokens.filter((t) => NOUN_POS.has(t.p)).length, adjs = tokens.filter((t) => ADJ_POS.has(t.p)).length, verbs = tokens.filter((t) => VERB_POS.has(t.p)).length
  const termHits = terms?.length ? countLexicon(tokens.map((t) => t.w).join(''), terms, { masked: false }) : tokens.filter((t) => t.p === 'n' && (t.f ?? 0) === 0 && t.w.length >= 2).length
  // 信息揭示速度（information_reveal_speed）：每千字新出现的专名（人名、地名、机构等）
  const entities = new Set(tokens.filter((t) => ENTITY_POS.has(t.p)).map((t) => t.w))
  const scale = chars > 0 ? 1000 / chars : 0
  return {
    contentLogFreq: logf.length ? mean(logf) : 0,
    rareContentRatio: content.length ? rare / content.length : 0,
    nounRatio: nouns / words, adjRatio: adjs / words, verbRatio: verbs / words,
    descriptiveRatio: (adjs + tokens.filter((t) => t.p === 'uj').length) / words,
    termPer1k: termHits * scale,
    newEntityPer1k: entities.size * scale,
  }
}

/**
 * 测量一块文本。
 * @param {string} text
 * @param {Array<{w:string,p:string,f?:number}>} tokens 分词结果，与 text 对应
 * @param {object} [opts]
 * @param {string[]} [opts.functionWords] 虚词表
 * @param {number} [opts.mattrWindow] MATTR 窗口，词数，默认 500
 * @param {object} [opts.lexicons] 用户追加的词表词，按词表名
 * @param {string[]} [opts.terms] 术语表
 */
export function measure(text, tokens, opts = {}) {
  const words = opts.functionWords ?? functionWordList(opts.extraFunctionWords ?? [])
  const chars = charCount(text)
  const wt = wordTokens(tokens)
  const fwCounts = countFunctionWords(text, words)
  return {
    chars,
    wordCount: wt.length,
    functionWords: Object.fromEntries(per10k(fwCounts, chars)),
    punctuation: punctuation(text),
    sentence: sentenceFeatures(text),
    paragraph: paragraphFeatures(text),
    dialogueRatio: dialogueRatio(text),
    lexical: {
      mattr: mattr(wt, opts.mattrWindow ?? 500),
      yuleK: yuleK(wt),
      honoreR: honoreR(wt),
      hapaxRatio: hapaxRatio(wt),
      window: opts.mattrWindow ?? 500,
    },
    lexicon: lexiconRates(text, chars, opts.lexicons ?? {}),
    pronoun: pronouns(text),
    words: wordStats(tokens, chars, opts.terms ?? null),
    decontent: decontent(tokens),
    // v1.4 新特征族（设计 §2.8）：词性 n-gram、词复用集中度、框架句式密度
    syntactic: {
      posUnigrams: posUnigrams(tokens),
      posBigrams: posNgrams(tokens, { n: 2 }),
      posTrigrams: posNgrams(tokens, { n: 3 }),
      posNames: POS_NAMES,
    },
    reuse: { ...posConcentration(tokens), ...bigramReuse(tokens) },
    frame: { ...frameDensity(text), ...frameTotal(text) },
  }
}
