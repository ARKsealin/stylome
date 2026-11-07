// SDN 的六轴（SDN 设计 §2：pos / fw / para / sig / hurst / emo，雷达图同源）。
// 每轴 ∈ [0,1]，越高越像 AI：
//   pos   = 该窗 L1 的 pAI（判别集本身）
//   其余  = σ( 均值_j  s_j · z_j )，z_j 用训练集人类分布标准化，s_j = sign(μ_AI − μ_人类)，
//           即"每个成员特征按自身方向推向 AI 的平均 z"。方向与人类参照都只从训练行估计。
// 带关系 = 轴分 − 训练集人类该轴分的 75 分位（截断 ±1）："探出人类带多远"。
// 缺值（hurst 句数不足）按人类中位数补，等于该特征对轴分零贡献。

import { mean, stdev, quantile } from './util.mjs'

export const AXES = ['pos', 'fw', 'para', 'sig', 'hurst', 'emo']
export const AXIS_FEATURES = {
  fw: ['fw:到', 'fw:这', 'fw:和'],
  para: ['para:paraLenMean', 'para:paraLenCv', 'para:adjacentLenRatioMean'],
  sig: ['sig:density'],
  hurst: ['sent:hurst'],
  emo: ['emo:R'],
}

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))))

export class AxisModel {
  /**
   * @param {object[]} train 训练行（features、side）
   * @param {(row:object)=>number} pOfRow 该行的 pos 轴（L1 pAI；训练时传交叉拟合的折外值）
   */
  constructor(train, pOfRow) {
    const human = train.filter((r) => r.side === 'human'), ai = train.filter((r) => r.side === 'ai')
    const fin = (xs) => xs.filter(Number.isFinite)
    this.stats = {}
    for (const names of Object.values(AXIS_FEATURES)) for (const n of names) {
      const h = fin(human.map((r) => r.features[n])), a = fin(ai.map((r) => r.features[n]))
      this.stats[n] = { mean: mean(h), sd: stdev(h) || 1, median: quantile(h, 0.5), sign: Math.sign(mean(a) - mean(h)) || 1 }
    }
    const humanScores = human.map((r) => this.scores(r.features, pOfRow(r)))
    this.bandHi = Object.fromEntries(AXES.map((k) => [k, quantile(humanScores.map((s) => s[k]), 0.75)]))
  }

  /** 一个窗的六轴分。 */
  scores(features, pPos) {
    const out = { pos: pPos }
    for (const [axis, names] of Object.entries(AXIS_FEATURES)) {
      const zs = names.map((n) => {
        const st = this.stats[n]
        const v = Number.isFinite(features[n]) ? features[n] : st.median
        return st.sign * (v - st.mean) / st.sd
      })
      out[axis] = sigmoid(zs.reduce((a, b) => a + b, 0) / zs.length)
    }
    return out
  }

  /** 带关系：轴分 − 人类 75 分位，截断 ±1。 */
  band(scores) { return Object.fromEntries(AXES.map((k) => [k, Math.max(-1, Math.min(1, scores[k] - this.bandHi[k]))])) }

  toJSON() { return { stats: this.stats, bandHi: this.bandHi } }
  static fromJSON(j) { const m = Object.create(AxisModel.prototype); m.stats = j.stats; m.bandHi = j.bandHi; return m }
}
