// 文档级判据：由逐窗结果拼出 SDN 的输入与三盏灯。训练（合成文档）与推理（真实文本）共用。
//
// 20 维（SDN 设计 §2 的 19 维 + 1）：
//   [0..5]   六轴轴分（pos/fw/para/sig/hurst/emo，逐窗轴分取均值）
//   [6..11]  六轴带关系（轴分 − 人类 75 分位，截断 ±1）
//   [12..16] 窗级 pAI 的 均值 / sd / 极差 / 振荡率（相邻窗跨 0.5 次数 ÷ 窗数）/ IQR
//   [17]     D-OPEN 距离（对人类留出 95 分位归一，逐窗均值；未准入记 0）
//   [18]     log 字数（码点）
//   [19]     winTop：连续 m 窗 pAI 均值的最大值（m = levelWindow，不足 m 窗取全文均值）
// 第 20 维是对设计的增补：等级（高度疑似/存在嫌疑/人工创作）由最可疑的一段决定，而全文均值会被人类段稀释，
// 前 19 维里没有能表达"最可疑一段"的量。m 在训练文档上选（sdn-train.mjs 的 chooseLevelWindow）。
// 单窗文档的 sd/极差/振荡/IQR 为 0，winTop 等于该窗 pAI。

import { AXES } from './axes.mjs'
import { quantile } from './util.mjs'

export const DIM = 20
export const IDX = { winMean: 12, winSd: 13, winRange: 14, winOsc: 15, winIqr: 16, open: 17, len: 18, winTop: 19 }

/** 连续 m 窗 pAI 均值的最大值。 */
export function topRun(ps, m) {
  const w = Math.max(1, Math.min(m, ps.length))
  let best = -Infinity, s = 0
  for (let i = 0; i < ps.length; i++) {
    s += ps[i]
    if (i >= w) s -= ps[i - w]
    if (i >= w - 1) best = Math.max(best, s / w)
  }
  return best
}

/** 窗级 pAI 序列统计。 */
export function windowStats(ps, levelWindow = 1) {
  const k = ps.length
  const m = ps.reduce((a, b) => a + b, 0) / k
  const sd = k > 1 ? Math.sqrt(ps.reduce((a, x) => a + (x - m) ** 2, 0) / k) : 0
  let cross = 0
  for (let i = 1; i < k; i++) if ((ps[i - 1] - 0.5) * (ps[i] - 0.5) < 0) cross++
  return {
    mean: m, sd,
    range: k > 1 ? Math.max(...ps) - Math.min(...ps) : 0,
    osc: k > 1 ? cross / k : 0,
    iqr: k > 1 ? quantile(ps, 0.75) - quantile(ps, 0.25) : 0,
    top: topRun(ps, levelWindow),
  }
}

/**
 * @param {Array<{features:object, p:number, pPos?:number}>} wins 逐窗：特征、综合 pAI、L1 pAI
 * @param {object} ctx axisModel（AxisModel）、open（OpenSetHead，可空）、chars（码点数）、levelWindow
 * @returns {{x:number[], axes:object, stats:object, openNorm:number}}
 */
export function docVector(wins, { axisModel, open, chars, levelWindow = 1 }) {
  // pos 轴是 L1 的 pAI（pPos）；窗统计与 winTop 用综合 pAI（p）。没给 pPos 时两者相同
  const per = wins.map((w) => axisModel.scores(w.features, w.pPos ?? w.p))
  const axes = Object.fromEntries(AXES.map((k) => [k, per.reduce((a, s) => a + s[k], 0) / per.length]))
  const band = axisModel.band(axes)
  const stats = windowStats(wins.map((w) => w.p), levelWindow)
  const openNorm = open?.admitted ? wins.reduce((a, w) => a + open.distance(w.features) / open.threshold, 0) / wins.length : 0
  const x = [...AXES.map((k) => axes[k]), ...AXES.map((k) => band[k]), stats.mean, stats.sd, stats.range, stats.osc, stats.iqr, openNorm, Math.log(Math.max(1, chars)), stats.top]
  return { x, axes, stats, openNorm }
}

/**
 * 三盏灯（SDN 设计 §4；OOD 按 v2 §3 附"有 AI 迹象"条件，这里取最可疑段 winTop ≥ 0.6，与等级同口径）。
 * conflict：判别器间 max−min > 0.4。
 *   设计原文的"轴间 max−min"只取判别集内的轴：para 是报告集、sig 只做仲裁、hurst/emo 未准入，
 *   它们与 pos 的分歧不是证据冲突。窗序列双峰也不再算冲突——人类段与 AI 段并存正是"混合"，由混合判定承担。
 */
export function lamps({ ps, chars, openNorm, discriminatorSpread = 0, levelWindow = 1 }) {
  return {
    ood: openNorm > 1 && topRun(ps, levelWindow) >= 0.6,
    conflict: discriminatorSpread > 0.4,
    short: chars < 800,
  }
}
