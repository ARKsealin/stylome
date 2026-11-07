// 混合管线（v2 §4.2）：滑窗 pAI + BOCPD 变点后验。
// 切窗 1200 字 → 逐窗 pAI → BOCPD（Gaussian 观测 + 常风险）→ 段级 MAP 分割 + 尾部振荡标注。
// 按"变点 + 振荡"而非过渡带设计（总账 v5 §2.2：实测混合文本没有渐变的中间簇）。
// 验证门（v2 §4.2：已知边界的定位误差 ≤ 1 窗）在留出拼接文档上按比例算，见 sdn-train.mjs 的 calibrateSpectrum。

import { charCount } from '../../lib/meter/segment.mjs'

const HAZARD = 1 / 50

/** 按汉字数切相邻窗（步长 = 窗长）。返回 [{text, chars, start}]。 */
export function windows(text, size = 1200) {
  const paras = String(text).split(/\n\s*\n/u).map((p) => p.trim()).filter(Boolean)
  const out = []
  let cur = [], n = 0, start = 0, seen = 0
  for (const p of paras) {
    cur.push(p); n += charCount(p)
    if (n >= size) { out.push({ text: cur.join('\n\n'), chars: n, start }); seen += n; cur = []; n = 0; start = seen }
  }
  // 尾段不足一窗的 1/4 才并入前窗；再多就单独成窗（短窗由调用方决定是否丢弃）
  if (cur.length) {
    if (out.length && n < size / 4) { out[out.length - 1].text += '\n\n' + cur.join('\n\n'); out[out.length - 1].chars += n }
    else out.push({ text: cur.join('\n\n'), chars: n, start })
  }
  return out
}

/**
 * BOCPD（Adams & MacKay 2007 的常数模型简化版）。
 * 观测模型：窗间 pAI 差为高斯，变点后均值重置为当前观测。
 * @param {number[]} xs 窗级 pAI 序列
 * @returns {{cp:number[], map:number[]}} cp[t] = 该窗处变点后验概率；map = MAP 游程长度
 */
export function bocpd(xs, { hazard = HAZARD, sigma = 0.15, prior = 0.5, sigma0 = 0.3 } = {}) {
  const n = xs.length
  const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI))
  // R[l] = 当前游程含 l 个观测的后验（含本窗）。
  // 新游程的本窗用无信息先验（均值 prior、宽 sigma0）打分；增长游程用自身历史均值、窄 sigma 打分。
  // 常风险下若变点也用各游程自身的预测打分，归一化后 P(r=0) 恒等于 hazard，没有信息量——
  // 所以变点后验读的是"本窗开启新游程"的质量 R[1]。
  let R = [1]
  const cp = [], map = []
  for (let t = 0; t < n; t++) {
    const next = new Array(R.length + 1).fill(0)
    const likePrior = Math.max(1e-300, gauss(xs[t], prior, sigma0))
    let mass = 0
    for (let l = 0; l < R.length; l++) {
      let mu = prior, s = sigma0
      if (l > 0) { mu = 0; for (let i = t - l; i < t; i++) mu += xs[i]; mu /= l; s = sigma }
      next[l + 1] += R[l] * (1 - hazard) * Math.max(1e-300, gauss(xs[t], mu, s))
      mass += R[l]
    }
    next[1] += hazard * likePrior * mass
    const z = next.reduce((a, b) => a + b, 0) || 1
    R = next.map((v) => v / z)
    // 第一窗必然开启游程，记 0：它不是变点
    cp.push(t === 0 ? 0 : R[1])
    let best = 0
    for (let l = 1; l < R.length; l++) if (R[l] > R[best]) best = l
    map.push(best)
  }
  return { cp, map }
}

/**
 * 段级分割：变点后验超过阈值处切开，并标注尾部振荡（末四窗内相邻窗跨 0.5 的次数 ≥ 2）。
 * sigma / prior / sigma0 由 sdn-train.mjs 的 calibrateSpectrum 从拼接文档的已知分段辨识，hazard 与 cpThreshold 在训练文档上选定，
 * 存在 model.json 的 spectrum 里。
 * @returns {{segments:object[], cuts:number[], changePoints:number[], oscillation:boolean}} cuts 为变点所在窗下标
 */
export function segmentSeries(xs, { sigma = 0.15, cpThreshold = 0.5, hazard = HAZARD, prior = 0.5, sigma0 = 0.3 } = {}) {
  const { cp } = bocpd(xs, { sigma, hazard, prior, sigma0 })
  const cuts = []
  for (let t = 1; t < xs.length; t++) if (cp[t] >= cpThreshold) cuts.push(t)
  const bounds = [0, ...cuts, xs.length]
  const segments = []
  for (let i = 0; i + 1 < bounds.length; i++) {
    const slice = xs.slice(bounds[i], bounds[i + 1])
    segments.push({ from: bounds[i], to: bounds[i + 1] - 1, mean: slice.reduce((a, b) => a + b, 0) / slice.length, n: slice.length })
  }
  const tail = xs.slice(Math.max(0, xs.length - 4))
  let crosses = 0
  for (let i = 1; i < tail.length; i++) if ((tail[i - 1] - 0.5) * (tail[i] - 0.5) < 0) crosses++
  return { segments, cuts, changePoints: cp, oscillation: crosses >= 2 }
}
