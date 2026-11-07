// 状态判别机（SDN，《四态状态判别机-SDN设计.md》）。
// L4 聚合层：上游判据 → 判决 + 三盏灯。不做特征级判别，逐特征归因永远指向 L1。
//
// 判决不是四选一：
//   等级  高度疑似 / 存在嫌疑 / 人工创作，三档按区间划分，彼此互斥（头A，序回归）
//   混合  是否为人类与 AI 段落拼合（头B）。只与"人工创作"互斥，可与高度疑似、存在嫌疑同时成立
// 所以混合只在等级 ≥ 存在嫌疑时才亮；等级由文本里最可疑的一段决定（docs.mjs 的 winTop），
// 不用全文均值——否则一篇插了 AI 段的文本会被人类段稀释成"人工创作"，混合就无处安放。
//
// 网络：20 →(标准化)→ Dense 32 GELU → Dense 16 GELU
//   头A：CORAL 序回归，共享权重 + 两个阈值偏置 → P(≥存在嫌疑)、P(≥高度疑似)（取 min 保序）
//   头B：sigmoid → P(混合)
// 规则表：设计 §6 准入 1 的基线（pAI + 窗 sd 双阈值表），也是网络退役后的替身。
// 两者都输出 {pSusp, pHigh, pMix}，经同一个 mapVerdict 出判决：接口不变，上下游无感。

import { mulberry32 } from '../../lib/net/rng.mjs'
import { DIM, IDX } from './docs.mjs'

export const LEVELS = ['人工创作', '存在嫌疑', '高度疑似']
/** 等级序（剂量-响应、留一检验用）。混合是另一根轴，不在这个序里。 */
export const LEVEL_RANK = { '人工创作': 0, '存在嫌疑': 1, '高度疑似': 2 }

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))))
const logit = (p) => Math.log(p / (1 - p))
const K = Math.sqrt(2 / Math.PI)
const gelu = (x) => 0.5 * x * (1 + Math.tanh(K * (x + 0.044715 * x ** 3)))
function dgelu(x) {
  const t = Math.tanh(K * (x + 0.044715 * x ** 3))
  return 0.5 * (1 + t) + 0.5 * x * (1 - t * t) * K * (1 + 3 * 0.044715 * x * x)
}

/**
 * 判决映射（SDN 设计 §4，按"三档互斥 + 混合独立"重排）。灯不占判决。
 *   等级  高度疑似：pHigh ≥ cuts.high ∧ OOD 灭 ∧ 冲突灭；存在嫌疑：pSusp ≥ cuts.susp；其余人工创作
 *         cuts 由模型给（规则表 0.6 / 0.7；网络的 susp 在校准文档上按误判代价政策辨识）
 *         设计表未定义"OOD 亮且 pSusp ≥ cuts.susp"的格：生成源可能不在覆盖内时不给高度疑似，记存在嫌疑
 *         样本不足灯：高度疑似降为存在嫌疑；存在嫌疑不再往下降——降到人工创作就是把有 AI 迹象的文本判成人类，
 *         违反误判代价政策（registry.mjs 的 POLICY）
 *   混合  pMix ≥ τ 且等级不是人工创作
 */
export function mapVerdict(p, lamp, { tau = 0.5, cuts = { susp: 0.6, high: 0.7 } } = {}) {
  let level = p.pHigh >= cuts.high && !lamp.ood && !lamp.conflict ? '高度疑似' : p.pSusp >= cuts.susp ? '存在嫌疑' : '人工创作'
  if (lamp.short && level === '高度疑似') level = '存在嫌疑'
  const mixed = p.pMix >= tau && level !== '人工创作'
  return { level, mixed, verdict: mixed ? `${level}＋混合可能` : level, probs: levelProbs(p), pMix: Math.round(p.pMix * 1e4) / 1e4 }
}

/** 等级三档的概率（和为 1）。混合概率另报，不与三档相加。 */
export function levelProbs({ pSusp, pHigh }) {
  const r = (v) => Math.round(v * 1e4) / 1e4
  return { '高度疑似': r(pHigh), '存在嫌疑': r(pSusp - pHigh), '人工创作': r(1 - pSusp) }
}

/**
 * 规则表：最可疑段 pAI（winTop）≥ highLine → 高度疑似、≥ tSusp → 存在嫌疑；窗 sd ≥ sdStar → 混合（等级 ≥ 存在嫌疑时才亮）。
 * tSusp 按误判代价政策辨识（跨家族 AI 块综合 pAI 的 aiMiss 分位，sdn-train.mjs），与分级层的 AI 判定线同一口径；
 * highLine 取设计原值 0.8（POLICY.highLine）。
 * 写成软阈值，使 winTop = highLine 时 pHigh 恰为 0.7、= tSusp 时 pSusp 恰为 0.6、sd = sdStar 时 pMix 恰为 τ=0.5，
 * 经 mapVerdict（cuts 0.6 / 0.7）后与硬阈值表等价。sdStar 在训练文档上按混合 F1 选。
 */
export class RuleTable {
  constructor({ sdStar = 0.15, tSusp = 0.6, highLine = 0.8 } = {}) { this.sdStar = sdStar; this.tSusp = tSusp; this.highLine = highLine }
  forward(x) {
    // 等级看最可疑的一段（winTop），不看全文均值；混合看窗间离散
    const p = x[IDX.winTop], sd = x[IDX.winSd]
    const pSusp = sigmoid((p - this.tSusp) / 0.05 + logit(0.6))
    const pHigh = Math.min(pSusp, sigmoid((p - this.highLine) / 0.05 + logit(0.7)))
    return { pSusp, pHigh, pMix: sigmoid((sd - this.sdStar) / 0.02) }
  }
  cuts() { return { susp: 0.6, high: 0.7 } }
  toJSON() { return { kind: 'rule', sdStar: this.sdStar, tSusp: this.tSusp, highLine: this.highLine } }
  static fromJSON(j) { return new RuleTable({ sdStar: j.sdStar, tSusp: j.tSusp ?? 0.6, highLine: j.highLine ?? 0.8 }) }
}

export class SdnNet {
  constructor({ seed = 20261105, dropout = 0.15 } = {}) {
    this.seed = seed
    this.dropout = dropout
    this.T = 1
    const rng = mulberry32(seed)
    const init = (n, fan) => Float64Array.from({ length: n }, () => (rng() * 2 - 1) * Math.sqrt(3 / fan))
    this.W1 = init(32 * DIM, DIM); this.b1 = new Float64Array(32)
    this.W2 = init(16 * 32, 32); this.b2 = new Float64Array(16)
    this.wA = init(16, 16); this.bA = Float64Array.of(0.5, -0.5)
    this.wB = init(16, 16); this.bB = 0
    this.mu = new Float64Array(DIM); this.sd = new Float64Array(DIM).fill(1)
  }

  /** 前向。train=true 时加 dropout 并返回反向所需的中间量。 */
  forward(x, { train = false, rng = null } = {}) {
    const z = Float64Array.from(x, (v, i) => (v - this.mu[i]) / this.sd[i])
    const a1 = new Float64Array(32), h1 = new Float64Array(32), m1 = new Float64Array(32).fill(1)
    for (let r = 0; r < 32; r++) { let s = this.b1[r]; for (let c = 0; c < DIM; c++) s += this.W1[r * DIM + c] * z[c]; a1[r] = s; h1[r] = gelu(s) }
    if (train) for (let r = 0; r < 32; r++) if (rng() < this.dropout) { m1[r] = 0; h1[r] = 0 } else { m1[r] = 1 / (1 - this.dropout); h1[r] *= m1[r] }
    const a2 = new Float64Array(16), h2 = new Float64Array(16), m2 = new Float64Array(16).fill(1)
    for (let r = 0; r < 16; r++) { let s = this.b2[r]; for (let c = 0; c < 32; c++) s += this.W2[r * 32 + c] * h1[c]; a2[r] = s; h2[r] = gelu(s) }
    if (train) for (let r = 0; r < 16; r++) if (rng() < this.dropout) { m2[r] = 0; h2[r] = 0 } else { m2[r] = 1 / (1 - this.dropout); h2[r] *= m2[r] }
    let g = 0, gb = this.bB
    for (let i = 0; i < 16; i++) { g += this.wA[i] * h2[i]; gb += this.wB[i] * h2[i] }
    // 三个输出的原始 logit。推理时各用自己的温度（calibrate 拟合）；没有校准参数时退回单一温度
    const zS = g + this.bA[0], zH = g + this.bA[1], zM = gb
    const cal = !train && this.cal
    const T = train ? 1 : this.T
    const pSusp = cal ? sigmoid(cal.susp.a * zS + cal.susp.c) : sigmoid(zS / T)
    const pHighRaw = cal ? sigmoid(cal.high.a * zH + cal.high.c) : sigmoid(zH / T)
    const out = { pSusp, pHigh: Math.min(pSusp, pHighRaw), pMix: cal ? sigmoid(cal.mix.a * zM + cal.mix.c) : sigmoid(zM / T), raw: { susp: zS, high: zH, mix: zM } }
    if (train) Object.assign(out, { z, a1, h1, m1, a2, h2, m2, pHighRaw })
    return out
  }

  /** 三个输出的原始 logit（校准用，不受校准参数与温度影响）。 */
  logits(x) { return this.forward(x).raw }

  /**
   * samples: [{x, rank: 0|1|2|null, mix: 0|1, w?}]。rank=null 时头A不计损失。
   * 损失：头A 两个累积 BCE + 头B BCE。含 AI 的文档（rank ≥ 1）权重 × aiWeight：
   * 误判代价政策是 AI 尽量 0 错判为人类（registry.mjs 的 POLICY；设计 §5 原为人工创作类 ×2，方向相反）。
   * 精确的运营点不靠这个权重定，而由 identifyCut 在校准文档上辨识。
   */
  // lr 0.01 + 动量 0.9 的逐样本更新会发散（W1 涨到 12 以上、GELU 饱和、输出塌成常数），默认取 0.003 并裁剪梯度
  fit(samples, { epochs = 40, lr = 0.003, momentum = 0.9, l2 = 1e-4, aiWeight = 2, clip = 5 } = {}) {
    for (let j = 0; j < DIM; j++) {
      const v = samples.map((s) => s.x[j])
      const m = v.reduce((a, b) => a + b, 0) / v.length
      const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length)
      this.mu[j] = m; this.sd[j] = sd > 1e-9 ? sd : 1
    }
    const rng = mulberry32(this.seed + 1)
    const params = ['W1', 'b1', 'W2', 'b2', 'wA', 'bA', 'wB']
    const vel = Object.fromEntries(params.map((k) => [k, new Float64Array(this[k].length)]))
    let vbB = 0
    const order = samples.map((_, i) => i)
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      for (const k of order) {
        const s = samples[k]
        const o = this.forward(s.x, { train: true, rng })
        const w = (s.w ?? 1) * (s.rank >= 1 ? aiWeight : 1)
        // 对各 logit 的梯度（BCE + sigmoid）
        let dA0 = 0, dA1 = 0
        if (s.rank !== null && s.rank !== undefined) { dA0 = w * (o.pSusp - (s.rank >= 1 ? 1 : 0)); dA1 = w * (o.pHighRaw - (s.rank >= 2 ? 1 : 0)) }
        const dB = w * (o.pMix - s.mix)
        const g = Object.fromEntries(params.map((p) => [p, new Float64Array(this[p].length)]))
        const dh2 = new Float64Array(16)
        for (let i = 0; i < 16; i++) {
          g.wA[i] = (dA0 + dA1) * o.h2[i]; g.wB[i] = dB * o.h2[i]
          dh2[i] = (dA0 + dA1) * this.wA[i] + dB * this.wB[i]
        }
        g.bA[0] = dA0; g.bA[1] = dA1
        const da2 = Float64Array.from(dh2, (v, i) => v * o.m2[i] * dgelu(o.a2[i]))
        const dh1 = new Float64Array(32)
        for (let r = 0; r < 16; r++) { g.b2[r] = da2[r]; for (let c = 0; c < 32; c++) { g.W2[r * 32 + c] = da2[r] * o.h1[c]; dh1[c] += da2[r] * this.W2[r * 32 + c] } }
        for (let r = 0; r < 32; r++) {
          const da1 = dh1[r] * o.m1[r] * dgelu(o.a1[r])
          g.b1[r] = da1
          for (let c = 0; c < DIM; c++) g.W1[r * DIM + c] = da1 * o.z[c]
        }
        let norm = dB * dB
        for (const p of params) for (const v of g[p]) norm += v * v
        norm = Math.sqrt(norm)
        if (norm > clip) { const s = clip / norm; for (const p of params) for (let i = 0; i < g[p].length; i++) g[p][i] *= s }
        const dBc = norm > clip ? dB * clip / norm : dB
        for (const p of params) {
          const P = this[p], V = vel[p], G = g[p], decay = p[0] === 'W' || p[0] === 'w' ? l2 : 0
          for (let i = 0; i < P.length; i++) { V[i] = momentum * V[i] + G[i] + decay * P[i]; P[i] -= lr * V[i] }
        }
        vbB = momentum * vbB + dBc; this.bB -= lr * vbB
      }
    }
    return this
  }

  /**
   * 概率校准（设计 §6 准入 6）：三个输出各用一个温度 p = σ(z / T_k)，在校准文档上最小化各自的 log-loss。
   * 原始 logit 达 ±40，必须校准；原先三个输出共用一个温度。
   * 不带截距：试过逐头 Platt（p = σ(a·z + c)），截距学到了校准折的类别先验——"高度疑似 vs 存在嫌疑"这一档在训练折外文档里
   * 只占含 AI 文档的 9%，在留出文档里占 28%——留出等级 ECE 从 0.061 升到 0.166。温度只修正过度自信，不改先验。
   * 以 {a: 1/T, c: 0} 存，前向与 Platt 同一条代码路径。标签全同的输出保持 T = 1。
   */
  calibrate(samples) {
    const raw = samples.map((s) => this.logits(s.x))
    const fitT = (zs, ys) => {
      if (!zs.length || ys.every((y) => y === ys[0])) return { a: 1, c: 0 }
      const loss = (T) => {
        let L = 0
        for (let i = 0; i < zs.length; i++) { const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(zs[i] / T))); L -= ys[i] * Math.log(p) + (1 - ys[i]) * Math.log(1 - p) }
        return L
      }
      let best = { T: 1, L: Infinity }
      for (let k = 0; k <= 80; k++) { const T = 0.25 * Math.pow(800, k / 80), L = loss(T); if (L < best.L) best = { T, L } }
      return { a: 1 / best.T, c: 0 }
    }
    const withRank = samples.map((s, i) => [s, raw[i]]).filter(([s]) => s.rank !== null && s.rank !== undefined)
    this.cal = {
      susp: fitT(withRank.map(([, r]) => r.susp), withRank.map(([s]) => s.rank >= 1 ? 1 : 0)),
      high: fitT(withRank.map(([, r]) => r.high), withRank.map(([s]) => s.rank >= 2 ? 1 : 0)),
      mix: fitT(raw.map((r) => r.mix), samples.map((s) => s.mix)),
    }
    return this.cal
  }

  /**
   * 存在嫌疑线的辨识（误判代价政策）：给定文档里含 AI 的（rank ≥ 1），pSusp 的 aiMiss 分位。
   * 在概率校准之后调用；sdn-train.mjs 传的是跨域文档（模型没见过该家族 / 作者时的窗 pAI），线里含新家族带来的偏移。
   * 高度疑似线保持 0.7。
   */
  identifyCut(samples, aiMiss) {
    const ps = samples.filter((s) => s.rank >= 1).map((s) => this.forward(s.x).pSusp).sort((a, b) => a - b)
    if (!ps.length) return this.cutSusp = 0.6
    const h = (ps.length - 1) * aiMiss, lo = Math.floor(h), hi = Math.ceil(h)
    this.cutSusp = Math.min(0.6, ps[lo] + (ps[hi] - ps[lo]) * (h - lo))
    return this.cutSusp
  }

  // T2 高度疑似概率线的双边辨识：AI 侧 highMiss 分位，人类侧 pHigh max + 边距取大
  identifyCutHigh(aiPHigh, humanPHigh, { highMiss = 0.10, margin = 0.03 } = {}) {
    const a = [...aiPHigh].sort((x, y) => x - y), h = [...humanPHigh].sort((x, y) => x - y)
    const qA = a.length ? a[Math.min(a.length - 1, Math.floor((a.length - 1) * (1 - highMiss)))] : 0.7
    const floor = h.length ? Math.min(0.95, h[h.length - 1] + margin) : 0.7
    this.cutHigh = Math.min(0.95, Math.max(qA, floor))
    return this.cutHigh
  }
  cuts() { return { susp: this.cutSusp ?? 0.6, high: this.cutHigh ?? 0.7 } }

  toJSON() {
    const a = (v) => Array.from(v)
    return { kind: 'net', seed: this.seed, dropout: this.dropout, T: this.T, cal: this.cal ?? null, cutSusp: this.cutSusp ?? 0.6, cutHigh: this.cutHigh ?? 0.7, W1: a(this.W1), b1: a(this.b1), W2: a(this.W2), b2: a(this.b2), wA: a(this.wA), bA: a(this.bA), wB: a(this.wB), bB: this.bB, mu: a(this.mu), sd: a(this.sd) }
  }

  static fromJSON(j) {
    const n = new SdnNet({ seed: j.seed, dropout: j.dropout })
    for (const k of ['W1', 'b1', 'W2', 'b2', 'wA', 'bA', 'wB', 'mu', 'sd']) n[k] = Float64Array.from(j[k])
    n.bB = j.bB; n.T = j.T; n.cal = j.cal ?? null; n.cutSusp = j.cutSusp ?? 0.6; n.cutHigh = j.cutHigh ?? 0.7
    return n
  }
}

/** 按 model.json 里的 kind 还原。 */
export function sdnFromJSON(j) { return j.kind === 'net' ? SdnNet.fromJSON(j) : RuleTable.fromJSON(j) }
