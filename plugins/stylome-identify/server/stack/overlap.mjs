// 高误报重叠区（v2 §3，落地设计 §6.2 的匿名化实现）。
// 登记作者由 scripts/train.mjs 按留一作者误报率实测得出（缺省取设计登记，见 registry.HIGH_FPR_AUTHORS）。
// 每个登记作者的区域 = 其作品块在 pos7 上的均值 ± 1 标准差盒子；
// 文本落入任一盒子 → AI 结论降一级。匿名可用：不需要知道作者是谁。

import { mean, stdev } from './util.mjs'
import { POS7, HIGH_FPR_AUTHORS } from './registry.mjs'

export class OverlapZone {
  /**
   * @param {object[]} humanRows 全部人类行（含留出：区域是描述性登记，不是训练）
   */
  constructor(humanRows, { names = POS7, authors = HIGH_FPR_AUTHORS, sdK = 1 } = {}) {
    this.names = names
    this.boxes = []
    for (const author of authors) {
      const rows = humanRows.filter((r) => r.author === author)
      if (rows.length < 3) continue
      this.boxes.push({
        author, n: rows.length,
        lo: names.map((n) => mean(rows.map((r) => r.features[n] ?? 0)) - sdK * (stdev(rows.map((r) => r.features[n] ?? 0)) || 0)),
        hi: names.map((n) => mean(rows.map((r) => r.features[n] ?? 0)) + sdK * (stdev(rows.map((r) => r.features[n] ?? 0)) || 0)),
      })
    }
  }

  /** 落入的登记作者名单（空 = 不在重叠区）。 */
  hits(features) {
    return this.boxes.filter((b) => this.names.every((n, i) => {
      const v = features[n] ?? 0
      return v >= b.lo[i] && v <= b.hi[i]
    })).map((b) => b.author)
  }

  toJSON() { return { names: this.names, boxes: this.boxes } }
  static fromJSON(j) { const z = Object.create(OverlapZone.prototype); Object.assign(z, j); return z }
}
