// 词性 n-gram 特征（设计 §2.8 H1，决策 D12）。
// 句法习惯的骨架：词性 unigram 占比 + 高频词性 bigram/trigram 频次（每千字）。
// 输入的分词 tokens 来自 segmenter（posseg：{w, p, f}），与本模块解耦。

import { charCount } from './segment.mjs'

/** 词性 unigram 占比（该词性词数 / 总词数）。jieba 词性约 30 类，含 x/w 等聚合类。 */
export function posUnigrams(tokens) {
  const out = {}
  let total = 0
  for (const t of tokens) {
    const p = t.p || 'x'
    out[p] = (out[p] ?? 0) + 1
    total++
  }
  const per = total || 1
  for (const k of Object.keys(out)) out[k] = out[k] / per
  return out
}

/**
 * 词性 bigram/trigram 频次（每千词）。
 * 返回全部出现的 n-gram 键（"n,v" / "n,v,n" 形式）；筛 Top-K 由调用方在语料级做
 * （单块内低频 n-gram 无统计意义，全库频次排序后取前 60 进特征筛选——设计 §4.2）。
 */
export function posNgrams(tokens, { n = 2, per = 1000 } = {}) {
  const out = {}
  const seq = tokens.map((t) => t.p || 'x')
  for (let i = 0; i + n <= seq.length; i++) {
    const key = seq.slice(i, i + n).join(',')
    out[key] = (out[key] ?? 0) + 1
  }
  const words = Math.max(1, seq.length)
  for (const k of Object.keys(out)) out[k] = out[k] * per / words
  return out
}

/** 常用词性中文名（证据表可读性用）。 */
export const POS_NAMES = {
  n: '名词', nr: '人名', ns: '地名', nt: '机构名', nz: '其他专名', ng: '名词语素',
  v: '动词', vd: '副动词', vn: '名动词', vg: '动语素',
  a: '形容词', ad: '副形词', an: '名形词', ag: '形语素',
  d: '副词', m: '数词', q: '量词', r: '代词', p: '介词', c: '连词',
  u: '助词', xc: '其他虚词', x: '字符串', w: '标点',
  t: '时间词', s: '处所词', f: '方位词', b: '区别词', y: '语气词', o: '拟声词', e: '叹词',
  h: '前缀', k: '后缀', g: '语素', i: '成语', j: '简称', l: '习用语', z: '状态词',
}
