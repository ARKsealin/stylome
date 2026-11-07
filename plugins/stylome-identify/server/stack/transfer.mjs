// 跨域迁移与运营点辨识。只在本项目自己的模型（L1 词性逻辑回归、L3 字符哈希）内做，不用外部预训练模型。
//
// 迁移学习：
//   跨生成家族  判定线在"跨家族"折外分数上辨识：每个 AI 家族的分数来自没见过该家族的模型，
//              线里已经含了新家族带来的分数偏移（留一 gemini 时该家族分数整体偏低，固定线会漏判）。
//              人类侧同理用"跨作者"折外分数（训练去掉该作者的人类块与模仿该作者的 AI 块）。
//   域重加权    family：四个 AI 家族在损失里等权（deepseek 占 AI 块 71%）；family+author：人类作者也等权（刘慈欣占人类块 18%）。
//              两侧各自的总权重保持原样本数，只改侧内分配；权重只缩放损失梯度。
//   长块→短段   见 micro.mjs：以长块 L3 为先验中心在微段上微调（HashHead 的 prior 选项）。
// 参数辨识：判定线 = 跨域折外分数的分位数；权重方案、L1/L3 正则、融合权重 β 由 scripts/tune.mjs 辨识。

import { LinearHead } from './linear.mjs'
import { HashHead } from './hash.mjs'
import { EmbedHead } from './embed.mjs'
import { quantile, auc } from './util.mjs'
import { POLICY, FAMILIES } from './registry.mjs'

/** 逐样本权重。scheme：'none' | 'family' | 'family+author'。 */
export function sampleWeights(rows, scheme = 'none') {
  if (!scheme || scheme === 'none') return null
  const key = (r) => r.side === 'ai' ? `ai|${r.family}` : scheme === 'family+author' ? `h|${r.author}` : 'h'
  const size = new Map()
  for (const r of rows) size.set(key(r), (size.get(key(r)) ?? 0) + 1)
  const groupsOf = (pre) => [...size.keys()].filter((k) => k.startsWith(pre)).length
  const nAi = rows.filter((r) => r.side === 'ai').length, nH = rows.length - nAi
  const gAi = groupsOf('ai|'), gH = groupsOf('h')
  return rows.map((r) => (r.side === 'ai' ? nAi / gAi : nH / gH) / size.get(key(r)))
}

/**
 * 融合打分器。cfg：{ names, l1: {l2, weights}, l3: {lr, l2, epochs, weights} | null, emb: {l2, lr, epochs, weights} | null,
 *                    fusion: {l1, l3, emb} }（融合权重和为 1，权重为 0 的判别器不训练）。
 * 综合 pAI = Σ 权重 × 各判别器 pAI（概率空间加权平均；两个判别器各半即其中位数）。
 * 返回 p（综合）与 p1（L1，pos 轴用）及各判别器的分数函数。
 */
export function fitScorer(trainRows, cfg) {
  const f = cfg.fusion
  const h1 = new LinearHead(trainRows, { names: cfg.names, l2: cfg.l1.l2, weights: sampleWeights(trainRows, cfg.l1.weights) })
  const h3 = f.l3 > 0 && cfg.l3 ? new HashHead(trainRows, { lr: cfg.l3.lr, l2: cfg.l3.l2, epochs: cfg.l3.epochs, weights: sampleWeights(trainRows, cfg.l3.weights) }) : null
  const he = f.emb > 0 && cfg.emb ? new EmbedHead(trainRows, { l2: cfg.emb.l2, lr: cfg.emb.lr, epochs: cfg.emb.epochs, weights: sampleWeights(trainRows, cfg.emb.weights) }) : null
  const parts = (r) => ({ l1: h1.p(r.features), l3: h3 ? h3.p(r.text) : null, emb: he ? he.p(r.emb) : null })
  return { h1, h3, he, parts, p1: (r) => h1.p(r.features), p: (r) => fuse(parts(r), f) }
}

/** 按融合权重合并；某个判别器给不出分（缺句向量）时按其余权重重新归一。 */
export function fuse(parts, fusion) {
  let s = 0, w = 0
  for (const k of ['l1', 'l3', 'emb']) if (fusion[k] > 0 && Number.isFinite(parts[k])) { s += fusion[k] * parts[k]; w += fusion[k] }
  return w > 0 ? s / w : parts.l1
}

/**
 * 跨域折外分数。AI 块按家族留一，人类块按作者留一。
 * fit(trainRows, spec) → (row) => 分数；spec = {family} 或 {author}，供需要同步排除其他数据的调用方用（微段迁移）。
 * 迭代顺序固定（家族、作者按字典序），不同配置的结果可按下标对齐。
 */
export function crossDomainScores(rows, fit, { sides = ['ai', 'human'] } = {}) {
  const out = { ai: [], human: [] }
  if (sides.includes('ai')) for (const f of FAMILIES) {
    const test = rows.filter((r) => r.side === 'ai' && r.family === f)
    const tr = rows.filter((r) => r.side === 'human' || r.family !== f)
    if (!test.length || !tr.some((r) => r.side === 'ai')) continue
    const s = fit(tr, { family: f })
    for (const r of test) out.ai.push({ row: r, s: s(r) })
  }
  if (sides.includes('human')) for (const a of [...new Set(rows.filter((r) => r.side === 'human').map((r) => r.author))].sort()) {
    const tr = rows.filter((r) => r.author !== a)
    const s = fit(tr, { author: a })
    for (const r of rows.filter((x) => x.side === 'human' && x.author === a)) out.human.push({ row: r, s: s(r) })
  }
  return out
}

/**
 * 人类判定线：跨作者人类分数的 1 − humanFlag 分位，再压到跨域 AI 分数的最低分之下（2026-11-05 决定）。
 * 前者只管人类覆盖，不看 AI 分数落在哪；人类判定线高过最低的 AI 块时，那些块会被判成人类。
 * 压线只让多出的人类块落进弃权，不产生新的误判。
 * @returns {{tH:number, tHQuantile:number, aiFloor:number|null, capped:boolean}}
 */
export function humanLine(aiScores, humanScores, humanFlag = POLICY.humanFlag) {
  const tHQuantile = quantile(humanScores, 1 - humanFlag)
  const aiFloor = aiScores.length ? Math.min(...aiScores) : null
  // predictSet 用 p ≤ tH，线要严格低于最低的 AI 分
  const cap = aiFloor === null ? Infinity : aiFloor - 1e-9
  return { tH: Math.min(tHQuantile, cap), tHQuantile, aiFloor, capped: tHQuantile > cap }
}

/**
 * 运营点辨识（政策见 registry.mjs 的 POLICY）：
 *   AI 判定线 tAi = 跨家族 AI 分数的 aiMiss 分位（只取 ≥ minHan 汉字的块：更短的不进这条管线）
 *   人类判定线 tH = humanLine：跨作者人类分数的 1 − humanFlag 分位，且低于跨域 AI 分数的最低分
 * p ≥ tAi 含 AI，p ≤ tH 含人类；两者都含或都不含记弃权。以 conformal 的 (qAi = 1 − tAi, qHuman = tH) 返回。
 */
export function operatingPoint(cd, { aiMiss = POLICY.aiMiss, humanFlag = POLICY.humanFlag, minHan = 800 } = {}) {
  const ai = cd.ai.filter((x) => (x.row.han ?? Infinity) >= minHan).map((x) => x.s)
  const hu = cd.human.map((x) => x.s)
  const hl = humanLine(ai, hu, humanFlag)
  const tAi = quantile(ai, aiMiss), tH = hl.tH
  const rate = (xs, f) => xs.length ? xs.filter(f).length / xs.length : null
  return {
    qAi: 1 - tAi, qHuman: tH, tAi, tH, tHQuantile: hl.tHQuantile, aiFloor: hl.aiFloor, tHCapped: hl.capped, aiMiss, humanFlag, minHan,
    crossDomain: {
      nAi: ai.length, nHuman: hu.length, auc: auc(ai, hu),
      aiJudgedHuman: rate(ai, (s) => s <= tH && s < tAi),
      humanJudgedAi: rate(hu, (s) => s >= tAi && s > tH),
      humanCoverage: rate(hu, (s) => s <= tH),
    },
  }
}
