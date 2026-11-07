// 计量风格学的分析层（概述 §6.1、§5 附、§8；设计 14.2、14.4、14.7、14.8、14.13）：
//   Delta 参数网格搜索并冻结；虚词 PCA 的载荷与方差贡献率；风格分期检测；
//   按前提选择的双样本检验（Shapiro 近似用 Jarque–Bera，方差齐性用 Brown–Forsythe 型 Levene）与
//   Benjamini–Hochberg 多重比较校正。全部是纯函数，结果可落盘复核。

import { mean, stdev, burrowsDelta, cosineDelta, quantile } from '../meter/stats.mjs'
import { flatten } from './screen.mjs'

// ---- Delta（设计 14.2） ----

/** 每万字虚词频率矩阵：行是单位，列是 words。 */
export function fwMatrix(measures, words) {
  return measures.map((m) => words.map((w) => m.functionWords[w] ?? 0))
}

/** 按语料总频率排序的虚词（MFW）。 */
export function mostFrequent(measures, words) {
  const tot = words.map((w) => measures.reduce((s, m) => s + (m.functionWords[w] ?? 0), 0))
  return words.map((w, i) => [w, tot[i]]).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).map(([w]) => w)
}

/** culling：只保留在至少 (1 − culling) 比例的单位里出现过的词（stylo 的定义）。 */
export function cull(measures, words, culling) {
  return words.filter((w) => measures.filter((m) => (m.functionWords[w] ?? 0) > 0).length >= (1 - culling) * measures.length)
}

function zRows(rows, mu, sd) { return rows.map((r) => r.map((v, j) => (sd[j] > 0 ? (v - mu[j]) / sd[j] : 0))) }

const DELTA = {
  burrows: burrowsDelta,
  cosine: cosineDelta,
  quadratic: (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s / a.length },
}

/**
 * Delta 归类：每个待测单位归到 Delta 更近的那一类（与该类训练单位 z 向量均值比较）。
 * 返回待测单位的归类准确率。
 */
export function deltaAccuracy({ trainT, trainC, testT, testC, words, variant }) {
  const all = [...fwMatrix(trainT, words), ...fwMatrix(trainC, words)]
  const mu = words.map((_, j) => mean(all.map((r) => r[j]))), sd = words.map((_, j) => stdev(all.map((r) => r[j])))
  const centroid = (rows) => words.map((_, j) => mean(rows.map((r) => r[j])))
  const cT = centroid(zRows(fwMatrix(trainT, words), mu, sd)), cC = centroid(zRows(fwMatrix(trainC, words), mu, sd))
  const d = DELTA[variant]
  const hit = (rows, isT) => zRows(rows, mu, sd).filter((z) => (d(z, cT) < d(z, cC)) === isT).length
  const n = testT.length + testC.length
  return n ? (hit(fwMatrix(testT, words), true) + hit(fwMatrix(testC, words), false)) / n : 0
}

/** 网格搜索 MFW × culling × 变体，在验证单位上按归类准确率选定（并列时取 MFW 少、culling 小的）。 */
export function deltaGrid({ trainT, trainC, valT, valC, words, mfw = [50, 100, 150, 200], culling = [0, 0.2, 0.4], variants = ['burrows', 'cosine', 'quadratic'] }) {
  const ranked = mostFrequent([...trainT, ...trainC], words)
  const rows = []
  for (const c of culling) {
    const kept = cull([...trainT, ...trainC], ranked, c)
    for (const n of mfw) {
      const w = kept.slice(0, n)
      if (w.length < 5) continue
      for (const v of variants) rows.push({ mfw: n, culling: c, variant: v, words: w.length, accuracy: deltaAccuracy({ trainT, trainC, testT: valT, testC: valC, words: w, variant: v }) })
    }
  }
  rows.sort((a, b) => b.accuracy - a.accuracy || a.mfw - b.mfw || a.culling - b.culling)
  const best = rows[0] ?? null
  return { best: best && { ...best, list: cull([...trainT, ...trainC], ranked, best.culling).slice(0, best.mfw) }, grid: rows }
}

/** 冻结的 Delta：参照均值与标准差、词表、变体。distance(a, b) 比较两组测量的 z 向量均值。 */
export function frozenDelta({ measures, words, variant }) {
  const rows = fwMatrix(measures, words)
  const mu = words.map((_, j) => mean(rows.map((r) => r[j]))), sd = words.map((_, j) => stdev(rows.map((r) => r[j])))
  return { words, variant, mu, sd }
}

export function deltaBetween(frozen, groupA, groupB) {
  const z = (ms) => { const zs = zRows(fwMatrix(ms, frozen.words), frozen.mu, frozen.sd); return frozen.words.map((_, j) => mean(zs.map((r) => r[j]))) }
  return DELTA[frozen.variant](z(groupA), z(groupB))
}

// ---- PCA（设计 14.7） ----

/** 对称矩阵的特征分解（Jacobi 旋转）。返回按特征值降序的 {values, vectors}，vectors[k] 是第 k 个特征向量。 */
export function eigSym(A) {
  const n = A.length
  const a = A.map((r) => Float64Array.from(r))
  const V = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2
    if (off < 1e-20) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i])
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => Float64Array.from(V, (row) => row[i])) }
}

/** 标准化后的 PCA。返回方差贡献率与前 k 个主成分的载荷（按绝对值排序的词）。 */
export function pcaLoadings(measures, words, { k = 4 } = {}) {
  const X = zRows(fwMatrix(measures, words), words.map((_, j) => mean(measures.map((m) => m.functionWords[words[j]] ?? 0))), words.map((_, j) => stdev(measures.map((m) => m.functionWords[words[j]] ?? 0))))
  const n = X.length, p = words.length
  const C = Array.from({ length: p }, (_, i) => Float64Array.from({ length: p }, (_, j) => { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * X[r][j]; return s / Math.max(1, n - 1) }))
  const { values, vectors } = eigSym(C)
  const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1
  return {
    explained: values.slice(0, k).map((v) => Math.max(0, v) / total),
    components: vectors.slice(0, k).map((vec, c) => ({
      pc: c + 1, explained: Math.max(0, values[c]) / total,
      loadings: words.map((w, j) => ({ word: w, loading: vec[j] })).sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading)).slice(0, 10),
    })),
    // 每个词在 PC1、PC2 上载荷绝对值之和：改写指令按它挑虚词（设计 14.7）
    weights: Object.fromEntries(words.map((w, j) => [w, Math.abs(vectors[0]?.[j] ?? 0) + Math.abs(vectors[1]?.[j] ?? 0)])),
    warning: (values[0] + (values[1] ?? 0)) / total < 0.5 ? 'PC1+PC2 方差贡献率低于 50%，二维图失真，解读要谨慎（概述 §6.1）' : null,
  }
}

// ---- 风格分期（设计 14.8） ----

/**
 * 按语料顺序检测风格断点：在每个可能的切点 i，比较前 w 个单位与后 w 个单位的 Delta，
 * 与“随机打乱顺序”时同一统计量的分布比较（置换检验）。
 * 返回最大的那个切点、它的 Delta 与置换 p 值；p < 0.05 时认为有分期。
 */
export function periodization(frozen, measures, { window = 10, permutations = 200, seed = 7 } = {}) {
  if (measures.length < 2 * window) return { ok: false, reason: `单位数 ${measures.length} 少于 ${2 * window}，不做分期检测` }
  const scan = (ms) => {
    let best = { at: -1, delta: -Infinity }
    for (let i = window; i <= ms.length - window; i++) {
      const d = deltaBetween(frozen, ms.slice(i - window, i), ms.slice(i, i + window))
      if (d > best.delta) best = { at: i, delta: d }
    }
    return best
  }
  const observed = scan(measures)
  let a = seed >>> 0
  const rng = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  let ge = 0
  for (let k = 0; k < permutations; k++) {
    const p = [...measures]
    for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
    if (scan(p).delta >= observed.delta) ge++
  }
  const pValue = (ge + 1) / (permutations + 1)
  return { ok: true, at: observed.at, delta: observed.delta, pValue, periods: pValue < 0.05 }
}

// ---- 统计检验（设计 14.4） ----

/** 正态分布 CDF（Abramowitz–Stegun 7.1.26，误差 < 1.5e−7）。 */
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (const v of c) ser += v / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}

/** 正则化不完全 beta 函数（连分式，Numerical Recipes betacf）。 */
function ibeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  const cf = (x, a, b) => {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap
    d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d)
    let h = d
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
      d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c; h *= d * c
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
      d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < 3e-14) break
    }
    return h
  }
  return x < (a + 1) / (a + b + 2) ? bt * cf(x, a, b) / a : 1 - bt * cf(1 - x, b, a) / b
}

/** t 分布双侧 p 值。 */
export function tTwoSided(t, df) { return ibeta(df / (df + t * t), df / 2, 0.5) }

/** F 分布上侧 p 值。 */
export function fUpper(f, d1, d2) { return f <= 0 ? 1 : ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2) }

/** 正态性：Jarque–Bera（偏度与峰度），卡方 2 自由度的上侧 p = exp(−JB/2)。样本少于 8 时不检验，按不正态处理。 */
export function normality(xs) {
  const n = xs.length
  if (n < 8) return { p: 0, n, note: '样本少于 8，按不正态处理' }
  const m = mean(xs), s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / n) || 1e-12
  const skew = xs.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n, kurt = xs.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / n - 3
  const jb = (n / 6) * (skew * skew + (kurt * kurt) / 4)
  return { p: Math.exp(-jb / 2), n }
}

/** 方差齐性：Brown–Forsythe（以中位数为中心的 Levene）。 */
export function levene(a, b) {
  const med = (xs) => quantile(xs, 0.5)
  const za = a.map((x) => Math.abs(x - med(a))), zb = b.map((x) => Math.abs(x - med(b)))
  const all = [...za, ...zb], N = all.length, gm = mean(all)
  const between = za.length * (mean(za) - gm) ** 2 + zb.length * (mean(zb) - gm) ** 2
  const within = za.reduce((s, x) => s + (x - mean(za)) ** 2, 0) + zb.reduce((s, x) => s + (x - mean(zb)) ** 2, 0)
  const F = within === 0 ? 0 : (between / 1) / (within / (N - 2))
  return { F, p: fUpper(F, 1, N - 2) }
}

/** Mann–Whitney U（正态近似，带并列校正）。 */
export function mannWhitney(a, b) {
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v)
  let i = 0, tie = 0
  while (i < all.length) {
    let j = i
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) all[k].r = r
    const t = j - i + 1
    tie += t ** 3 - t
    i = j + 1
  }
  const n1 = a.length, n2 = b.length, N = n1 + n2
  const R1 = all.filter((x) => x.g === 0).reduce((s, x) => s + x.r, 0)
  const U = R1 - n1 * (n1 + 1) / 2
  const sigma = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tie / (N * (N - 1))))
  const zv = sigma === 0 ? 0 : (U - n1 * n2 / 2) / sigma
  return { U, z: zv, p: sigma === 0 ? 1 : 2 * (1 - normCdf(Math.abs(zv))) }
}

/** Student t（合并方差）与 Welch t。 */
export function tTest(a, b, { welch = false } = {}) {
  const n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b), v1 = stdev(a) ** 2, v2 = stdev(b) ** 2
  if (welch) {
    const se = Math.sqrt(v1 / n1 + v2 / n2) || 1e-12
    const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1) || 1e-12)
    const t = (m1 - m2) / se
    return { t, df, p: tTwoSided(t, df) }
  }
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2)) || 1e-12
  const t = (m1 - m2) / (sp * Math.sqrt(1 / n1 + 1 / n2))
  return { t, df: n1 + n2 - 2, p: tTwoSided(t, n1 + n2 - 2) }
}

/** 按前提选择检验（设计 14.4）：两组都正态且方差齐 → t；正态但方差不齐 → Welch；不正态 → Mann–Whitney U。 */
export function compareGroups(a, b) {
  const sp = Math.sqrt(((a.length - 1) * stdev(a) ** 2 + (b.length - 1) * stdev(b) ** 2) / Math.max(1, a.length + b.length - 2))
  const d = sp === 0 ? 0 : (mean(a) - mean(b)) / sp
  const normal = normality(a).p >= 0.05 && normality(b).p >= 0.05
  const eq = levene(a, b).p >= 0.05
  const test = !normal ? 'mann-whitney' : eq ? 't' : 'welch'
  const r = test === 'mann-whitney' ? mannWhitney(a, b) : tTest(a, b, { welch: test === 'welch' })
  return { test, p: r.p, d, n: [a.length, b.length] }
}

/** Benjamini–Hochberg：返回校正后的 q 值，与输入同序。 */
export function benjaminiHochberg(ps) {
  const order = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0])
  const q = new Array(ps.length)
  let min = 1
  for (let k = order.length - 1; k >= 0; k--) { min = Math.min(min, (order[k][0] * ps.length) / (k + 1)); q[order[k][1]] = min }
  return q
}

/**
 * 分布吻合（S8）：对一组特征逐个比较两组单位，BH 校正，按概述的四种组合给结论（设计 14.4）：
 *   q ≥ 0.05 且 |d| < 0.2：吻合；q ≥ 0.05 且 |d| ≥ 0.2：需扩大样本；q < 0.05：不吻合（附效应量）。
 */
export function distributionMatch(groupA, groupB, features) {
  const fa = groupA.map(flatten), fb = groupB.map(flatten)
  const rows = features.map((name) => {
    const a = fa.map((f) => f[name]).filter(Number.isFinite), b = fb.map((f) => f[name]).filter(Number.isFinite)
    return a.length >= 3 && b.length >= 3 ? { name, ...compareGroups(a, b) } : { name, test: 'none', p: 1, d: 0, n: [a.length, b.length] }
  })
  const q = benjaminiHochberg(rows.map((r) => r.p))
  // 样本不足（任一组 < 3）没有做过检验，不许判“吻合”：空样本会得到 d=0 的假阳性（第一次验收 S8 的教训）
  return rows.map((r, i) => ({ ...r, q: q[i], verdict: r.test === 'none' ? '需扩大样本' : q[i] < 0.05 ? '不吻合' : Math.abs(r.d) < 0.2 ? '吻合' : '需扩大样本' }))
}
