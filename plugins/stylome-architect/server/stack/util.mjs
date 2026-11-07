// 判别栈共用的小工具：AUC、分位、分组 k 折、逻辑回归、线性模型。
// 纯函数，不依赖语料。

import { mulberry32 } from '../../lib/net/rng.mjs'

/** AUC（Mann–Whitney）：正样本得分高于负样本的比例。 */
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return null
  let s = 0
  for (const x of pos) for (const y of neg) s += x > y ? 1 : x === y ? 0.5 : 0
  return s / (pos.length * neg.length)
}

/** 线性插值分位。p ∈ [0,1]。 */
export function quantile(xs, p) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * p
  const lo = Math.floor(h), hi = Math.ceil(h)
  return s[lo] + (s[hi] - s[lo]) * (h - lo)
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

export function stdev(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** 按分组键的 k 折：同一组的全部样本同进同出。 */
export function groupFolds(groups, k, seed) {
  const rng = mulberry32(seed)
  const uniq = [...new Set(groups)]
  const order = uniq.map((g) => ({ g, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.g)
  const foldOf = new Map(order.map((g, i) => [g, i % k]))
  return groups.map((g) => foldOf.get(g))
}

/**
 * L2 逻辑回归。正类 = 1。
 * 标准化默认用训练集全体均值/方差（判别器内部坐标）；
 * 证据表的 z 分数另用人类分布，不在这里算。
 */
export class LogReg {
  constructor(n) { this.n = n; this.w = new Float64Array(n); this.b = 0; this.mu = null; this.sd = null }
  z(x) {
    let s = this.b
    for (let i = 0; i < this.n; i++) s += this.w[i] * (x[i] - this.mu[i]) / this.sd[i]
    return s
  }
  p(x) { const z = this.z(x); return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))) }
  /** weights：逐样本权重（缺省全 1），按均值归一，只缩放损失梯度、不缩放 L2 项。 */
  /**
   * prior：源模型（LogReg）。迁移学习用：沿用源模型的标准化坐标与权重作起点，L2 把权重拉向源权重而不是 0。
   */
  fit(xs, ys, { epochs = 400, lr = 0.2, l2 = 1e-2, seed = 7, weights = null, prior = null } = {}) {
    if (prior) {
      this.mu = Float64Array.from(prior.mu); this.sd = Float64Array.from(prior.sd)
      this.w = Float64Array.from(prior.w); this.b = prior.b
    } else {
      this.mu = xs[0].map((_, j) => mean(xs.map((x) => x[j])))
      this.sd = xs[0].map((_, j) => { const s = stdev(xs.map((x) => x[j])); return s > 1e-9 ? s : 1 })
    }
    const w0 = prior ? Float64Array.from(prior.w) : new Float64Array(this.n)
    const wm = weights ? mean(weights) : 1
    const rng = mulberry32(seed)
    const order = xs.map((_, i) => i)
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      for (const k of order) {
        const x = xs[k], e = (this.p(x) - ys[k]) * (weights ? weights[k] / wm : 1)
        for (let i = 0; i < this.n; i++) this.w[i] -= lr * (e * (x[i] - this.mu[i]) / this.sd[i] + l2 * (this.w[i] - w0[i]))
        this.b -= lr * e
      }
    }
    return this
  }
  toJSON() { return { n: this.n, w: [...this.w], b: this.b, mu: [...this.mu], sd: [...this.sd] } }
  static fromJSON(j) { const m = new LogReg(j.n); m.w = Float64Array.from(j.w); m.b = j.b; m.mu = Float64Array.from(j.mu); m.sd = Float64Array.from(j.sd); return m }
}

/** 在分组 k 折上按 AUC 选 L2 正则强度。 */
export function selectL2(xs, ys, groups, { grid = [1e-3, 1e-2, 1e-1], k = 5, seed = 7, epochs = 300 } = {}) {
  const folds = groupFolds(groups, Math.min(k, new Set(groups).size), seed)
  let best = { l2: grid[0], auc: -1 }
  for (const l2 of grid) {
    const pos = [], neg = []
    for (let f = 0; f < k; f++) {
      const tr = folds.map((v, i) => v !== f ? i : -1).filter((i) => i >= 0)
      const te = folds.map((v, i) => v === f ? i : -1).filter((i) => i >= 0)
      if (!tr.length || !te.length) continue
      const m = new LogReg(xs[0].length).fit(tr.map((i) => xs[i]), tr.map((i) => ys[i]), { l2, seed, epochs })
      for (const i of te) (ys[i] === 1 ? pos : neg).push(m.p(xs[i]))
    }
    const a = auc(pos, neg) ?? 0
    if (a > best.auc) best = { l2, auc: a }
  }
  return best
}

/** 线性回归（最小二乘，带 L2）。用于 Platt 诊断。 */
export function linSolve(A, b, l2 = 0) {
  const n = A[0].length
  const ata = Array.from({ length: n }, () => new Float64Array(n))
  const atb = new Float64Array(n)
  for (let i = 0; i < A.length; i++) {
    for (let r = 0; r < n; r++) { atb[r] += A[i][r] * b[i]; for (let c = 0; c < n; c++) ata[r][c] += A[i][r] * A[i][c] }
  }
  for (let r = 0; r < n; r++) ata[r][r] += l2
  // 高斯消元
  const M = ata.map((row, r) => { const o = Float64Array.from(row); return { row: o, b: atb[r] } })
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r].row[c]) > Math.abs(M[piv].row[c])) piv = r
    ;[M[c], M[piv]] = [M[piv], M[c]]
    const d = M[c].row[c] || 1e-12
    for (let r = c + 1; r < n; r++) {
      const f = M[r].row[c] / d
      for (let k = c; k < n; k++) M[r].row[k] -= f * M[c].row[k]
      M[r].b -= f * M[c].b
    }
  }
  const x = new Float64Array(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r].b
    for (let c = r + 1; c < n; c++) s -= M[r].row[c] * x[c]
    x[r] = s / (M[r].row[r] || 1e-12)
  }
  return x
}
