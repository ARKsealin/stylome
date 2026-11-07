// 特征体检（设计 14.1）。
// 每个候选特征算三个数：长度稳定性、作者内变异系数、与对照语料的 Cohen's d。
// 只有长度稳定、作者内一致、可分的特征进入控制集。没有对照语料时拒绝产出控制集。

import { stdev, cohensD, mean } from '../meter/stats.mjs'

/** 把 measure() 的结果展平成 { 特征名: 数值 }。虚词只取每万字频率。没有某一族（旧版测量）时跳过。
 * litidentify v1.4：syntactic/reuse/frame 三族单块可定义，直接展开；posBigrams/posTrigrams 的
 * 单块频次无统计意义，展开需语料级 Top-K 键（第二参数 posGramKeys，由扫描脚本两遍法提供）。 */
export function flatten(m, posGramKeys = null) {
  const out = {}
  for (const [w, v] of Object.entries(m.functionWords)) out[`fw:${w}`] = v
  for (const [k, v] of Object.entries(m.punctuation)) out[`punct:${k}`] = v
  for (const k of ['sentLenMean', 'sentLenCv', 'shortSentRatio', 'longSentRatio', 'clauseLenMean', 'clausesPerSent', 'fragmentation']) out[`sent:${k}`] = m.sentence[k]
  for (const k of ['paraLenMean', 'paraLenCv', 'singleSentParaRatio', 'adjacentLenRatioMean']) out[`para:${k}`] = m.paragraph[k]
  out['dialogue:ratio'] = m.dialogueRatio
  for (const k of ['mattr', 'yuleK', 'honoreR', 'hapaxRatio']) out[`lex:${k}`] = m.lexical[k]
  for (const [k, v] of Object.entries(m.lexicon ?? {})) out[`lexicon:${k}`] = v
  for (const [k, v] of Object.entries(m.pronoun ?? {})) out[`pron:${k}`] = v
  for (const [k, v] of Object.entries(m.words ?? {})) out[`word:${k}`] = v
  for (const [k, v] of Object.entries(m.stripe ?? {})) if (k !== 'sentences') out[`stripe:${k}`] = v
  const syn = m.syntactic ?? null
  if (syn) {
    for (const [k, v] of Object.entries(syn.posUnigrams ?? {})) out[`pos:${k}`] = v
    if (posGramKeys) for (const k of posGramKeys) {
      const v = syn.posBigrams?.[k] ?? syn.posTrigrams?.[k]
      if (v !== undefined) out[`posg:${k}`] = v
    }
  }
  for (const [k, v] of Object.entries(m.reuse ?? {})) out[k] = v
  for (const [k, v] of Object.entries(m.frame ?? {})) out[k] = v
  return out
}

const relChange = (xs) => {
  const m = mean(xs)
  return m === 0 ? 0 : (Math.max(...xs) - Math.min(...xs)) / Math.abs(m)
}

/** 长度漂移：各长度片段上特征均值的相对极差（设计 14.1）。不依赖对照语料，导入时算一次。 */
export function lengthDrift(byLength) {
  const sets = [...byLength.values()].map((ms) => ms.map(flatten))
  const names = Object.keys(sets[0]?.[0] ?? {})
  return Object.fromEntries(names.map((name) => [name, relChange(sets.map((fs) => mean(fs.map((f) => f[name]).filter(Number.isFinite))))]))
}

/**
 * @param {object} args
 * @param {Map<number, object[]>} args.byLength 长度（字数）→ 该长度片段的测量结果数组
 * @param {object[]} args.target 目标语料各块的测量结果（同一长度）
 * @param {object[]} args.contrast 对照语料各块的测量结果
 * @param {number} [args.lengthDriftMax] 长度漂移上限，默认 0.25
 * @param {number} [args.cvMax] 作者内变异系数上限，默认 0.5
 * @param {number} [args.dMin] 可分性下限，默认 0.5
 * @param {Set<string>} [args.exclude] 不进控制集的特征（审计集，设计第 4 节“控制集与审计集分开”）
 */
export function screen({ byLength, drift: driftMap = null, target, contrast, lengthDriftMax = 0.25, cvMax = 0.5, dMin = 0.5, exclude = new Set() }) {
  if (!contrast || contrast.length === 0) {
    return { ok: false, reason: '没有对照语料，无法计算可分性，拒绝产出控制集（设计 14.1）', control: [], audit: [], dropped: [] }
  }
  const tFlat = target.map(flatten), cFlat = contrast.map(flatten)
  const dm = driftMap ?? lengthDrift(byLength)
  const names = Object.keys(tFlat[0])
  const rows = []
  for (const name of names) {
    const finite = (xs) => xs.filter((x) => Number.isFinite(x))
    // 没有长度漂移数据的特征按不稳定处理，不进控制集
    const drift = dm[name] ?? Infinity
    // 对照单位里没有这个特征（例如条纹特征只在目标单位上算过）时，不能判断可分性
    const within = finite(tFlat.map((f) => f[name])), other = finite(cFlat.map((f) => f[name]))
    if (within.length < 2 || other.length < 2) { rows.push({ name, drift, cv: NaN, d: 0, set: 'dropped' }); continue }
    const cv = mean(within) === 0 ? 0 : stdev(within) / Math.abs(mean(within))
    const d = Math.abs(cohensD(within, other))
    const lengthStable = Number.isFinite(drift) && drift <= lengthDriftMax
    const consistent = cv <= cvMax
    const separable = d >= dMin
    const set = exclude.has(name) ? (separable ? 'audit' : 'dropped') : lengthStable && consistent && separable ? 'control' : separable ? 'audit' : 'dropped'
    rows.push({ name, drift, cv, d, set })
  }
  return {
    ok: true,
    control: rows.filter((r) => r.set === 'control'),
    audit: rows.filter((r) => r.set === 'audit'),
    dropped: rows.filter((r) => r.set === 'dropped'),
  }
}
