// D-OPEN：开放集单类距离头（v2 §1，落地设计 §4.5）。
// 只在 AI 侧、只用 pos7 训练：AI 云中心 = 训练集 AI 块在标准化 pos7 空间的均值，
// 距离 = 到中心的欧氏距离。阈值 = 留出人类块距离的 95 分位。
// 准入：留出人类与留出 AI 的距离分布可分（AUC ≥ 0.7，人类距离应更大）；
// 不过则报告"开放集距离未超过距离基线"，不进输出。

import { mean, stdev, quantile, auc } from './util.mjs'
import { POS7 } from './registry.mjs'

export class OpenSetHead {
  /**
   * @param {object[]} train 训练行
   * @param {object[]} hold 留出行（准入与阈值都从留出算）
   */
  constructor(train, hold, { names = POS7 } = {}) {
    this.names = names
    const ai = train.filter((r) => r.side === 'ai')
    this.mu = names.map((n) => mean(ai.map((r) => r.features[n] ?? 0)))
    this.sd = names.map((n) => { const s = stdev(ai.map((r) => r.features[n] ?? 0)); return s > 1e-9 ? s : 1 })
    const holdDist = (side) => hold.filter((r) => r.side === side).map((r) => this.distance(r.features))
    const humanD = holdDist('human'), aiD = holdDist('ai')
    // 人类应离 AI 云更远：AUC 以人类距离为正类
    this.separationAuc = auc(humanD, aiD)
    this.admitted = (this.separationAuc ?? 0) >= 0.7
    this.threshold = humanD.length ? quantile(humanD, 0.95) : Infinity
  }

  /** 到 AI 云中心的距离（标准化 pos7 空间）。 */
  distance(features) {
    let s = 0
    for (let i = 0; i < this.names.length; i++) { const z = ((features[this.names[i]] ?? 0) - this.mu[i]) / this.sd[i]; s += z * z }
    return Math.sqrt(s)
  }

  /** 距离 / 阈值：>1 即超出人类留出 95 分位。未准入时返回 null。 */
  normalized(features) { return this.admitted ? this.distance(features) / (this.threshold || 1) : null }

  toJSON() { return { names: this.names, mu: this.mu, sd: this.sd, threshold: this.threshold, separationAuc: this.separationAuc, admitted: this.admitted } }
  static fromJSON(j) { const h = Object.create(OpenSetHead.prototype); Object.assign(h, j); return h }
}
