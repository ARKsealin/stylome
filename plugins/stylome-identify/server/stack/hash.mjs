// L3-HASH：字符 1–2 元组哈希线性模型（v2 §1，落地设计 §4.3）。
// 4096 桶，哈希技巧（±1 投影）+ L2 逻辑回归。输入是原文，不依赖分词。
// 准入：留一家族四格 AUC 都不低于 0.7，低于的格子综合时剔除。

import { mulberry32 } from '../../lib/net/rng.mjs'

const BUCKETS = 4096
const HAN = /\p{Script=Han}/u

function hash(s) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return h >>> 0
}

/** 文本 → 4096 维有符号计数（哈希技巧）。只取汉字。 */
export function hashFeatures(text, buckets = BUCKETS) {
  const chars = [...String(text)].filter((c) => HAN.test(c))
  const v = new Float64Array(buckets)
  const sign = (h) => ((h >>> 31) ? 1 : -1)
  for (let i = 0; i < chars.length; i++) {
    const h1 = hash(chars[i])
    v[h1 % buckets] += sign(h1)
    if (i + 1 < chars.length) { const h2 = hash(chars[i] + chars[i + 1]); v[h2 % buckets] += sign(h2) }
  }
  const n = Math.max(1, chars.length)
  for (let i = 0; i < buckets; i++) v[i] /= n
  return v
}

export class HashHead {
  /**
   * @param {object[]} train 训练行，必须带 text
   * @param {object} [opt]
   *   weights  逐样本权重（与 train 对齐，按均值归一），只缩放损失梯度
   *   prior    源模型（HashHead 或其 JSON）。迁移学习用：从源权重出发、沿用源模型的标准化坐标，
   *            L2 把权重拉向源权重而不是 0（先验中心正则 = 以源模型为均值的高斯先验下的 MAP）
   */
  // 标准化后的 4096 维输入 ‖z‖² ≈ 4096：学习率按维数缩放（lr / buckets），否则一步就把 logit 推到饱和
  //（原先 lr=0.5 时折外输出 99% 落在 <0.01 或 >0.99）
  // 默认值按训练集作品分组 5 折的折外 log-loss 选（lr 4 / l2 0.1：0.114，饱和 15%；lr 1 / l2 1e-3：0.135）；
  // 部署值由 scripts/tune.mjs 辨识，写在 server/tuning.json
  constructor(train, { buckets = BUCKETS, seed = 20261105, epochs = 12, lr = 4, l2 = 0.1, weights = null, prior = null } = {}) {
    if (train.some((r) => typeof r.text !== 'string')) throw new Error('L3 需要原文 text 字段')
    if (prior) buckets = prior.buckets
    this.buckets = buckets
    lr = lr / buckets
    const xs = train.map((r) => hashFeatures(r.text, buckets))
    const ys = train.map((r) => r.side === 'ai' ? 1 : 0)
    let mu, sd
    if (prior) { mu = Float64Array.from(prior.mu); sd = Float64Array.from(prior.sd) } else {
      mu = new Float64Array(buckets); sd = new Float64Array(buckets)
      for (const x of xs) for (let j = 0; j < buckets; j++) mu[j] += x[j]
      for (let j = 0; j < buckets; j++) mu[j] /= xs.length
      for (const x of xs) for (let j = 0; j < buckets; j++) sd[j] += (x[j] - mu[j]) ** 2
      for (let j = 0; j < buckets; j++) sd[j] = Math.sqrt(sd[j] / Math.max(1, xs.length - 1)) || 1
    }
    this.mu = mu; this.sd = sd
    const w0 = prior ? Float64Array.from(prior.w) : new Float64Array(buckets)
    const w = Float64Array.from(w0)
    let b = prior ? prior.b : 0
    const wm = weights ? weights.reduce((a, v) => a + v, 0) / weights.length : 1
    const rng = mulberry32(seed)
    const order = xs.map((_, i) => i)
    const pOf = (x) => {
      let z = b
      for (let j = 0; j < buckets; j++) z += w[j] * (x[j] - mu[j]) / sd[j]
      return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))
    }
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      for (const k of order) {
        const x = xs[k], e = (pOf(x) - ys[k]) * (weights ? weights[k] / wm : 1)
        for (let j = 0; j < buckets; j++) w[j] -= lr * (e * (x[j] - mu[j]) / sd[j] + l2 * (w[j] - w0[j]))
        b -= lr * e
      }
    }
    this.w = w; this.b = b
  }

  p(text) {
    const x = hashFeatures(text, this.buckets)
    let z = this.b
    for (let j = 0; j < this.buckets; j++) z += this.w[j] * (x[j] - this.mu[j]) / this.sd[j]
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))
  }

  toJSON() { return { buckets: this.buckets, b: this.b, w: [...this.w], mu: [...this.mu], sd: [...this.sd] } }
  static fromJSON(j) { const h = Object.create(HashHead.prototype); h.buckets = j.buckets; h.b = j.b; h.w = Float64Array.from(j.w); h.mu = Float64Array.from(j.mu); h.sd = Float64Array.from(j.sd); return h }
}

