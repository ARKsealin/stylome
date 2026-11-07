// L1-LR：逻辑回归主判别器（v2 §1，落地设计 §4.1）。默认输入 pos7；晋级的扩展层特征追加在后。
// 正类 = AI。标准化用训练集全体均值/方差；证据表的 z 分数另用人类分布，
// 贡献 = 权重 × z（人类坐标），符号即推向方向。
// 缺值（sent:hurst 句数不足时为 NaN）按训练集中位数补。

import { LogReg, selectL2, auc, mean, stdev, quantile } from './util.mjs'
import { POS7, PRIMARY, SPAN } from './registry.mjs'

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d

export class LinearHead {
  /**
   * @param {object[]} train 训练行（含 features、side、work）
   * @param {object} [opt] l2 指定则跳过分组 5 折选择
   */
  constructor(train, { names = POS7, seed = 20261105, l2 = null, weights = null } = {}) {
    this.names = names
    this.impute = Object.fromEntries(names.map((n) => [n, quantile(train.map((r) => r.features[n]).filter(Number.isFinite), 0.5)]))
    const xs = train.map((r) => this.vec(r.features))
    const ys = train.map((r) => r.side === 'ai' ? 1 : 0)
    this.l2 = l2 ?? selectL2(xs, ys, train.map((r) => r.work), { seed }).l2
    this.model = new LogReg(names.length).fit(xs, ys, { l2: this.l2, seed, weights })
    const human = train.filter((r) => r.side === 'human')
    this.human = Object.fromEntries(names.map((n, i) => {
      const v = human.map((r) => this.vec(r.features)[i])
      const s = [...v].sort((a, b) => a - b)
      const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
      return [n, { mean: mean(v), sd: stdev(v) || 1, lo: q(0.05), hi: q(0.95) }]
    }))
  }

  // 键缺失 = 该块没有这个词性/虚词，占比就是 0（127 块没有 pos:i）；键在但为 NaN（hurst 句数不足）才按中位数补
  vec(features) { return this.names.map((n) => { const v = features[n]; return v === undefined ? 0 : Number.isFinite(v) ? v : this.impute[n] }) }

  /** 原始特征 → pAI。 */
  p(features) { return this.model.p(this.vec(features)) }

  /** 人类坐标 z 向量（截断 ±12）。 */
  zHuman(features) {
    const x = this.vec(features)
    return this.names.map((n, i) => Math.max(-12, Math.min(12, (x[i] - this.human[n].mean) / this.human[n].sd)))
  }

  /**
   * 证据表行（设计方案 §7.1，落地设计 §7）。贡献 = w × z（人类坐标）。
   * w 定义在训练集全体标准化坐标上，与人类 z 差一个正的常数因子：排序与符号不受影响，绝对值只作行内比较。
   * 贡献绝对值低于最大一项 10% 的标"中性"。
   */
  evidence(features) {
    const z = this.zHuman(features), x = this.vec(features)
    const maxAbs = Math.max(...this.names.map((_, i) => Math.abs(this.model.w[i] * z[i])), 1e-9)
    return this.names.map((name, i) => {
      const push = this.model.w[i] * z[i]
      const span = SPAN[name]
      return {
        name,
        value: round(x[i], 4),
        humanBand: [round(this.human[name].lo, 4), round(this.human[name].hi, 4)],
        z: round(z[i]),
        weight: round(this.model.w[i], 4),
        push: round(push, 4),
        direction: Math.abs(push) < 0.1 * maxAbs ? '中性' : push > 0 ? '推向 AI' : '推向人类',
        role: PRIMARY.includes(name) ? '主特征' : span ? '辅特征' : '扩展层',
        spanRatio: span?.ratio ?? null,
        nearAiAuthors: span?.nearAi ?? [],
        inReport: false,
      }
    }).sort((a, b) => Math.abs(b.push) - Math.abs(a.push))
  }

  toJSON() { return { names: this.names, l2: this.l2, impute: this.impute, model: this.model.toJSON(), human: this.human } }
  static fromJSON(j) {
    const h = Object.create(LinearHead.prototype)
    h.names = j.names; h.l2 = j.l2; h.impute = j.impute; h.model = LogReg.fromJSON(j.model); h.human = j.human
    return h
  }
}

/** 在一组行上的 AUC（正类 AI）。 */
export function headAuc(head, rows) {
  return auc(rows.filter((r) => r.side === 'ai').map((r) => head.p(r.features)), rows.filter((r) => r.side === 'human').map((r) => head.p(r.features)))
}
