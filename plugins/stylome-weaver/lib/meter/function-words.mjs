// 虚词谱。虚词是风格指纹的主体（概述 §5：实词反映题材，虚词反映作者）。
// 词表按“虚词优先”取高频功能词；用户可以在工作区里追加，但不能删这些。

import { scanHits } from './scan.mjs'
import { FUNCTION_WORD_MASKS, masksFor } from './masks.mjs'

export const FUNCTION_WORDS = [
  '的', '了', '着', '过', '地', '得',
  '是', '在', '有', '把', '被', '给', '让', '对', '向', '从', '以', '为', '与', '和', '跟', '同', '比', '将', '由', '于', '到',
  '也', '都', '就', '才', '又', '还', '再', '已', '曾', '正', '刚', '便', '却', '可', '但', '而', '并', '且', '或', '则', '即', '乃', '竟', '偏', '倒', '只', '仅', '仍', '总', '常', '很', '太', '更', '最', '极', '甚', '颇', '稍', '略',
  '不', '没', '未', '无', '非', '别', '莫',
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '自己', '人家', '大家', '这', '那', '其', '此', '某', '每', '各', '哪',
  '一个', '这个', '那个', '什么', '怎么', '如何', '为什么', '哪里', '谁',
  '因为', '所以', '虽然', '但是', '如果', '那么', '既然', '即使', '无论', '不管', '只要', '只有', '除非', '而且', '不过', '然而', '因此', '于是', '然后', '接着', '忽然', '突然', '终于', '原来', '其实', '当然', '果然', '似乎', '仿佛', '好像', '大概', '也许', '或许', '一定', '必须', '可能', '可以', '能够', '应该',
  '之', '乎', '者', '也', '矣', '焉', '哉', '耳', '兮', '其', '所', '以', '而', '则', '乃', '遂', '故', '盖', '夫', '且',
  '啊', '呢', '吧', '吗', '呀', '啦', '哇', '哦', '嘛', '罢了', '而已',
  '上', '下', '里', '中', '前', '后', '时', '间', '之后', '之前', '之中', '里面', '外面', '旁边',
]

/** 去重，保持顺序。词表里有意重复的文言虚词（也、其、而、则、乃）只计一次。 */
export function functionWordList(extra = []) {
  const seen = new Set()
  const out = []
  for (const w of [...FUNCTION_WORDS, ...extra]) if (!seen.has(w)) { seen.add(w); out.push(w) }
  return out
}

/**
 * 统计每个虚词的出现次数。按字面扫描，长词优先（“一个”不拆成“一”“个”以外的词，
 * 但“的”这类单字词会包含在更长词里，所以先匹配最长词，匹配处不再计数）。
 * 单字词条另按虚词遮蔽表排除名词化搭配：“地球”里的“地”不算，“不能”里的“不”仍算。
 */
export function countFunctionWords(text, words) {
  const hits = scanHits(text, words, masksFor(words, FUNCTION_WORD_MASKS))
  const counts = new Map(words.map((w) => [w, 0]))
  for (const [w, pos] of hits) counts.set(w, pos.length)
  return counts
}

/** 每万字频率。 */
export function per10k(counts, chars) {
  const scale = chars > 0 ? 10000 / chars : 0
  const out = new Map()
  for (const [w, c] of counts) out.set(w, c * scale)
  return out
}

/**
 * 参照系：一批文本的虚词频率均值与标准差。z 分数的分母。
 * 标准差为 0 的词（所有文本频率相同）标记为不可用，z 分数记 0。
 */
export function reference(freqMaps) {
  const words = [...freqMaps[0].keys()]
  const mean = new Map(), sd = new Map()
  for (const w of words) {
    const xs = freqMaps.map((m) => m.get(w))
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    const s = xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0
    mean.set(w, m)
    sd.set(w, s)
  }
  return { words, mean, sd }
}

/** 对参照系做 z 分数，按 words 的顺序输出数组。 */
export function zScores(freq, ref) {
  return ref.words.map((w) => { const s = ref.sd.get(w); return s > 0 ? (freq.get(w) - ref.mean.get(w)) / s : 0 })
}
