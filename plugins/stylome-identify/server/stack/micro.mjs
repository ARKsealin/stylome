// 微段管线（v2 §4.1，350–800 字）。
// 自有特征：三稳定子类（白话/文言/转折虚字）+ 十单虚词，共 13 维（子类清单取总账 v5 §2.1，句尾子类翻号弃用）。
// 另把长块上训好的 L3 与 EMB 迁移到微段（零样本与先验中心微调，见 transferMicro），候选里按数据选。
// 现状 AUC 0.919 来自块级 80/20 切分（修正②：块级泄漏）；这里一律作品分组。
// 准入：作品分组留出 ≥ 0.85 且四家族留一格 ≥ 0.80（逐格重训，源模型与微段模型都去掉该家族）；
// 没有候选过准入则 <800 字一律降级"样本不足"。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LinearHead } from './linear.mjs'
import { HashHead } from './hash.mjs'
import { EmbedHead } from './embed.mjs'
import { sampleWeights, humanLine } from './transfer.mjs'
import { FAMILIES, POLICY } from './registry.mjs'
import { auc, quantile } from './util.mjs'
import { cleanText } from './clean.mjs'
import { charCount } from '../../lib/meter/segment.mjs'

export const MICRO_SUBCLASSES = {
  '白话虚字': ['的', '得', '地', '着', '过', '是', '在', '和', '就', '都'],
  '文言虚字': ['之', '乎', '者', '也', '矣', '焉', '哉', '其', '于', '以'],
  '转折程度': ['但是', '然而', '却', '不过', '虽然', '尽管', '竟', '居然', '更', '最', '太', '很'],
}
export const MICRO_WORDS = ['的', '了', '这', '把', '中', '而', '与', '着', '到', '和']
export const MICRO_NAMES = [...Object.keys(MICRO_SUBCLASSES).map((k) => `micro:${k}`), ...MICRO_WORDS.map((w) => `micro:${w}`)]

/** 350–800 汉字的微段：按自然段累积，满 600 字或再加一段会超 800 字时切开；不在 350–800 的丢弃。 */
export function microSegments(raw) {
  const paras = cleanText(raw).split(/\n\s*\n/).map((x) => x.trim()).filter((p) => p && !p.startsWith('[选段]'))
  const out = []
  let cur = '', n = 0
  const flush = () => { if (n >= 350 && n <= 800) out.push({ text: cur, han: n }); cur = ''; n = 0 }
  for (const p of paras) {
    const c = charCount(p)
    if (n + c > 800) flush()
    cur += p; n += c
    if (n >= 600) flush()
  }
  flush()
  return out
}

/** 微段行：每个源文件按 microSegments 切，继承该文件主管线块的划分（hold）、作品、作者、家族、题材。 */
export function buildMicroRows(root, mainRows) {
  const byFile = new Map()
  for (const r of mainRows) if (!byFile.has(`${r.side}|${r.file}`)) byFile.set(`${r.side}|${r.file}`, r)
  const out = []
  for (const r of byFile.values()) {
    const raw = readFileSync(join(root, 'corpus', r.side === 'ai' ? 'ai' : 'human-capped', r.file), 'utf8')
    microSegments(raw).forEach((s, i) => out.push({
      side: r.side, file: r.file, segIdx: i, work: r.work, author: r.author ?? null, family: r.family ?? null,
      tier: r.tier ?? null, topicKey: r.topicKey ?? null, hold: r.hold, text: s.text, han: s.han, chars: [...s.text].length,
      features: microFeatures(s.text),
    }))
  }
  return out
}

const HAN = /\p{Script=Han}/u

/** 长词优先、命中处不重复计数的字面扫描。 */
function countAll(src, words) {
  const covered = new Uint8Array(src.length)
  let c = 0
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    for (let i = src.indexOf(w); i >= 0; i = src.indexOf(w, i + 1)) {
      let free = true
      for (let k = 0; k < w.length; k++) if (covered[i + k]) { free = false; break }
      if (!free) continue
      c++
      for (let k = 0; k < w.length; k++) covered[i + k] = 1
    }
  }
  return c
}

/** 一段文本的微段特征（每千字）。不依赖分词。 */
export function microFeatures(text) {
  const src = [...String(text)].filter((c) => HAN.test(c)).join('')
  const per = 1000 / Math.max(1, src.length)
  const out = {}
  for (const [name, words] of Object.entries(MICRO_SUBCLASSES)) out[`micro:${name}`] = countAll(src, words) * per
  for (const w of MICRO_WORDS) out[`micro:${w}`] = countAll(src, [w]) * per
  return out
}

/**
 * 微段的长块 → 短段迁移。五个组件，候选 = 单个组件、两两等权融合、五个全融合（16 个）：
 *   A 微段自有 LR（13 维虚字特征，只用微段训）
 *   B 长块 L3 零样本   C 长块 L3 为先验中心、在微段上微调（HashHead 的 prior）
 *   D 长块 EMB 零样本  E 长块 EMB 为先验中心、在微段上微调（EmbedHead 的 prior）
 * 每一格都同步排除：留一家族时长块源模型与微段模型都去掉该家族，留一作者、留一题材同理。
 * 准入：作品分组留出 AUC ≥ 0.85，留一家族各格 ≥ 0.80（v2 §4.1），留一题材各格 ≥ 0.70（L3 / EMB 题材耦合的检验）。
 * 准入的候选里按误判代价政策选：跨家族 AI 分数取 ε 分位为判定线时跨作者人类越线比例最小的；
 * 运营点同主管线：tAi = 跨家族 AI 分数的 aiMiss 分位，tH = 跨作者人类分数的 1 − humanFlag 分位且低于跨域 AI 最低分（transfer.mjs 的 humanLine）。
 */
export const MICRO_COMPONENTS = ['A', 'B', 'C', 'D', 'E']
const TOPIC_MIN = 15

function microCandidates(comps) {
  const out = comps.map((c) => [c])
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) out.push([comps[i], comps[j]])
  if (comps.length > 2) out.push([...comps])
  return out
}

/** 在给定的长块训练行与微段训练行上拟合五个组件（cfg = 主管线的 tuning 配置）。 */
function fitComponents(mainTr, microTr, cfg, withEmb) {
  const l3 = cfg.l3 ?? { lr: 4, l2: 0.1, epochs: 12, weights: 'none' }
  const emb = cfg.emb ?? { lr: 1, l2: 0.1, epochs: 40, weights: 'none' }
  const A = new LinearHead(microTr, { names: MICRO_NAMES, l2: 1e-2 })
  const B = new HashHead(mainTr, { lr: l3.lr, l2: l3.l2, epochs: l3.epochs, weights: sampleWeights(mainTr, l3.weights) })
  const C = new HashHead(microTr, { lr: l3.lr, l2: 1, epochs: 6, prior: B })
  const D = withEmb ? new EmbedHead(mainTr, { lr: emb.lr, l2: emb.l2, epochs: emb.epochs, weights: sampleWeights(mainTr, emb.weights) }) : null
  const E = withEmb ? new EmbedHead(microTr, { lr: emb.lr, l2: 1, epochs: 20, prior: D }) : null
  const score = { A: (r) => A.p(r.features), B: (r) => B.p(r.text), C: (r) => C.p(r.text), D: (r) => D.p(r.emb), E: (r) => E.p(r.emb) }
  return { models: { A, B, C, D, E }, score }
}
/**
 * @param {object[]} microRows buildMicroRows 的结果（已挂句向量）
 * @param {object[]} mainRows 主管线的块（已挂句向量）
 * @param {object} cfg 主管线的 tuning 配置（l3、emb 的超参与权重方案）
 * @param {object} opt withEmb：句向量齐全时为 true；log
 */
export function transferMicro(microRows, mainRows, cfg, { withEmb = true, log = () => {} } = {}) {
  const r3 = (v) => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000
  const comps = withEmb ? MICRO_COMPONENTS : ['A', 'B', 'C']
  const mTr = mainRows.filter((r) => !r.hold), uTr = microRows.filter((r) => !r.hold), uHo = microRows.filter((r) => r.hold)
  const uHoH = uHo.filter((r) => r.side === 'human')
  const vec = (fit, rs) => new Map(rs.map((r) => [r, Object.fromEntries(comps.map((c) => [c, fit.score[c](r)]))]))
  const without = (pred) => [mTr.filter((r) => !pred(r)), uTr.filter((r) => !pred(r))]
  const cells = { hold: null, family: {}, topic: {} }, cdAi = new Map(), cdHu = new Map()
  cells.hold = vec(fitComponents(mTr, uTr, cfg, withEmb), uHo)
  for (const f of FAMILIES) {
    const fit = fitComponents(...without((r) => r.side === 'ai' && r.family === f), cfg, withEmb)
    cells.family[f] = vec(fit, [...uHoH, ...microRows.filter((r) => r.side === 'ai' && r.family === f)])
    for (const [r, v] of vec(fit, uTr.filter((r) => r.side === 'ai' && r.family === f))) cdAi.set(r, v)
  }
  for (const a of [...new Set(uTr.filter((r) => r.side === 'human').map((r) => r.author))].sort()) {
    const fit = fitComponents(...without((r) => r.author === a), cfg, withEmb)
    for (const [r, v] of vec(fit, uTr.filter((r) => r.side === 'human' && r.author === a))) cdHu.set(r, v)
  }
  const tc = {}
  for (const r of microRows) if (r.side === 'ai' && r.topicKey) tc[r.topicKey] = (tc[r.topicKey] ?? 0) + 1
  for (const t of Object.keys(tc).filter((t) => tc[t] >= TOPIC_MIN).sort()) {
    const fit = fitComponents(...without((r) => r.side === 'ai' && r.topicKey === t), cfg, withEmb)
    cells.topic[t] = vec(fit, [...uHoH, ...microRows.filter((r) => r.side === 'ai' && r.topicKey === t)])
  }
  log(`微段迁移：组件 ${comps.join('')}；格数 留出 1 / 家族 ${FAMILIES.length} / 作者 ${new Set([...cdHu.keys()].map((r) => r.author)).size} / 题材 ${Object.keys(cells.topic).length}`)

  // 候选打分与准入
  const EPS = [0.005, 0.01, 0.02]
  const sc = (v, cand) => cand.reduce((a, c) => a + v[c], 0) / cand.length
  const aucOn = (m, cand) => { const e = [...m]; return auc(e.filter(([r]) => r.side === 'ai').map(([, v]) => sc(v, cand)), e.filter(([r]) => r.side === 'human').map(([, v]) => sc(v, cand))) }
  const table = microCandidates(comps).map((cand) => {
    const ai = [...cdAi.values()].map((v) => sc(v, cand)), hu = [...cdHu.values()].map((v) => sc(v, cand))
    const fprs = EPS.map((e) => { const t = quantile(ai, e); return hu.filter((s) => s >= t).length / hu.length })
    const row = {
      cand: cand.join('+'), holdAuc: r3(aucOn(cells.hold, cand)),
      family: Object.fromEntries(FAMILIES.map((f) => [f, r3(aucOn(cells.family[f], cand))])),
      topicMin: Object.keys(cells.topic).length ? r3(Math.min(...Object.values(cells.topic).map((m) => aucOn(m, cand)))) : null,
      cost: r3(fprs.reduce((a, b) => a + b, 0) / fprs.length), cdAuc: r3(auc(ai, hu)),
      tAi: quantile(ai, POLICY.aiMiss), ...(() => {
        // 跨域误判：预测集恰为 {人类} / 恰为 {AI}。微段的 tH 分位常高于 tAi，压线后原先两者都含（弃权）的人类段会变成 {AI}
        const hl = humanLine(ai, hu), tAi = quantile(ai, POLICY.aiMiss)
        const rate = (xs, f) => r3(xs.filter(f).length / xs.length)
        return {
          tH: hl.tH, tHQuantile: hl.tHQuantile,
          cdAiJudgedHuman: rate(ai, (s) => s <= hl.tH && s < tAi), cdHumanJudgedAi: rate(hu, (s) => s >= tAi && s > hl.tH),
          cdHumanJudgedAiUncapped: rate(hu, (s) => s >= tAi && s > hl.tHQuantile), cdAiJudgedHumanUncapped: rate(ai, (s) => s <= hl.tHQuantile && s < tAi),
        }
      })(),
    }
    row.admitted = row.holdAuc >= 0.85 && FAMILIES.every((f) => row.family[f] >= 0.80) && (row.topicMin === null || row.topicMin >= 0.70)
    return row
  }).sort((a, b) => a.cost - b.cost || b.holdAuc - a.holdAuc)
  const pick = table.find((t) => t.admitted) ?? null
  for (const t of table.slice(0, 6)) log(`  ${t.cand.padEnd(9)} 留出 ${t.holdAuc}，家族 ${FAMILIES.map((f) => t.family[f]).join('/')}，题材最低 ${t.topicMin}，代价 ${t.cost}${t.admitted ? '' : '（未过准入）'}`)
  const n = { train: uTr.length, hold: uHo.length }
  if (!pick) return { admitted: false, table, n, reason: `没有候选过准入（最好的 ${table[0].cand}：留出 ${table[0].holdAuc}，家族 ${FAMILIES.map((f) => table[0].family[f]).join('/')}），<800 字降级为样本不足` }

  // 部署：选中的候选在全部训练数据上重训，只存用到的组件
  const cand = pick.cand.split('+')
  const fit = fitComponents(mTr, uTr, cfg, withEmb)
  return {
    admitted: true, pick, table, n,
    model: { cand, components: Object.fromEntries(cand.map((c) => [c, fit.models[c].toJSON()])), conformal: { qAi: 1 - pick.tAi, qHuman: pick.tH } },
    reason: `选 ${pick.cand}（留出 AUC ${pick.holdAuc}，家族格 ${FAMILIES.map((f) => pick.family[f]).join('/')}，代价 ${pick.cost}）`,
  }
}

/** 推理：按部署的候选给微段打分（缺句向量时只用其余组件）。 */
export function microScorer(model) {
  const h = {}
  for (const [c, j] of Object.entries(model.components)) h[c] = c === 'A' ? LinearHead.fromJSON(j) : c === 'B' || c === 'C' ? HashHead.fromJSON(j) : EmbedHead.fromJSON(j)
  return (row) => {
    const s = model.cand.map((c) => c === 'A' ? h.A.p(row.features) : c === 'B' || c === 'C' ? h[c].p(row.text) : h[c].p(row.emb)).filter(Number.isFinite)
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN
  }
}
