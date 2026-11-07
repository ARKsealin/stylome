// 测量层的统计量。每个函数都是纯函数，输入数组，输出有限数。
// 公式来源见 literary-style-network-design.md 第 4 节与第 14 节。

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/** 分位数，线性插值。p ∈ [0,1]。 */
export function quantile(xs, p) {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * p
  const lo = Math.floor(h), hi = Math.ceil(h)
  return s[lo] + (s[hi] - s[lo]) * (h - lo)
}

/** 20 个分位（5%、10%、…、100%）。 */
export function quantiles20(xs) {
  return Array.from({ length: 20 }, (_, i) => quantile(xs, (i + 1) / 20))
}

export function stdev(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** 变异系数。均值为 0 时返回 0。 */
export function cv(xs) {
  const m = mean(xs)
  return m === 0 ? 0 : stdev(xs) / Math.abs(m)
}

/** Cohen's d（合并标准差）。 */
export function cohensD(a, b) {
  const sp = Math.sqrt(((a.length - 1) * stdev(a) ** 2 + (b.length - 1) * stdev(b) ** 2) / (a.length + b.length - 2))
  return sp === 0 ? 0 : (mean(a) - mean(b)) / sp
}

/**
 * MATTR：滑动窗口的类型-词例比的平均。N 是词数，窗口固定为词数（设计 14.9）。
 * 序列短于窗口时退化为整段 TTR。
 */
export function mattr(tokens, window = 500) {
  if (tokens.length === 0) return 0
  if (tokens.length <= window) return new Set(tokens).size / tokens.length
  const freq = new Map()
  let types = 0
  const add = (t) => { const c = freq.get(t) ?? 0; freq.set(t, c + 1); if (c === 0) types++ }
  const del = (t) => { const c = freq.get(t) - 1; if (c === 0) { freq.delete(t); types-- } else freq.set(t, c) }
  for (let i = 0; i < window; i++) add(tokens[i])
  let sum = types / window
  let n = 1
  for (let i = window; i < tokens.length; i++) { del(tokens[i - window]); add(tokens[i]); sum += types / window; n++ }
  return sum / n
}

/**
 * Yule's K = 10^4 · (Σ r²V_r − N) / N²。V_r 是出现恰好 r 次的词数。
 * 长度稳定性最好的词汇丰富度指标（概述 §6.1）。
 */
export function yuleK(tokens) {
  const N = tokens.length
  if (N === 0) return 0
  const freq = new Map()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const Vr = new Map()
  for (const c of freq.values()) Vr.set(c, (Vr.get(c) ?? 0) + 1)
  let sum = 0
  for (const [r, v] of Vr) sum += r * r * v
  return 1e4 * (sum - N) / (N * N)
}

/** Honoré's R = 100 · log(N) / (1 − V₁/V)。 */
export function honoreR(tokens) {
  const N = tokens.length
  if (N === 0) return 0
  const freq = new Map()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const V = freq.size
  let V1 = 0
  for (const c of freq.values()) if (c === 1) V1++
  const denom = 1 - V1 / V
  return denom <= 0 ? Infinity : 100 * Math.log(N) / denom
}

/** 单现词占比 V₁/V。 */
export function hapaxRatio(tokens) {
  if (tokens.length === 0) return 0
  const freq = new Map()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  let V1 = 0
  for (const c of freq.values()) if (c === 1) V1++
  return V1 / freq.size
}

/**
 * DFA 赫斯特指数。等长序列、固定估计器（设计 14.8）。
 * 序列短于 16 时返回 NaN，不报告。
 */
export function hurstDFA(xs) {
  const n = xs.length
  if (n < 16) return NaN
  const m = mean(xs)
  const y = new Float64Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) y[i] = (acc += xs[i] - m)
  const scales = []
  for (let s = 4; s <= Math.floor(n / 4); s *= 2) scales.push(s)
  if (scales.length < 2) return NaN
  const logS = [], logF = []
  for (const s of scales) {
    const segs = Math.floor(n / s)
    let f2 = 0
    for (let g = 0; g < segs; g++) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0
      for (let i = 0; i < s; i++) { const v = y[g * s + i]; sx += i; sy += v; sxx += i * i; sxy += i * v }
      const d = s * sxx - sx * sx
      const b = (s * sxy - sx * sy) / d, a = (sy - b * sx) / s
      for (let i = 0; i < s; i++) f2 += (y[g * s + i] - (a + b * i)) ** 2
    }
    logS.push(Math.log(s))
    logF.push(0.5 * Math.log(f2 / (segs * s)))
  }
  return slope(logS, logF)
}

function slope(x, y) {
  const n = x.length, mx = mean(x), my = mean(y)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2 }
  return den === 0 ? NaN : num / den
}

/** 序列的 DFT 幅度谱中最大峰的频率（周期/样本）。直流分量除外。 */
export function peakFrequency(xs) {
  const n = xs.length
  if (n < 4) return NaN
  const m = mean(xs)
  let best = 0, bestK = 1
  const half = Math.floor(n / 2)
  for (let k = 1; k < half; k++) {
    let re = 0, im = 0
    for (let t = 0; t < n; t++) { const a = 2 * Math.PI * k * t / n; re += (xs[t] - m) * Math.cos(a); im -= (xs[t] - m) * Math.sin(a) }
    const mag = Math.hypot(re, im)
    if (mag > best) { best = mag; bestK = k }
  }
  return bestK / n
}

/** Burrows's Delta：z 分数向量的平均绝对距离。 */
export function burrowsDelta(z1, z2) {
  let s = 0
  for (let i = 0; i < z1.length; i++) s += Math.abs(z1[i] - z2[i])
  return s / z1.length
}

/** Cosine Delta：1 − 余弦相似度。 */
export function cosineDelta(z1, z2) {
  let dot = 0, a = 0, b = 0
  for (let i = 0; i < z1.length; i++) { dot += z1[i] * z2[i]; a += z1[i] ** 2; b += z2[i] ** 2 }
  const d = Math.sqrt(a) * Math.sqrt(b)
  return d === 0 ? 0 : 1 - dot / d
}

export { mean }
