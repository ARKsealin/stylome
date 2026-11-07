// conformal 校准（v2 §3，修正③：n≈40 时 conformal 优于 Platt）。
// 类条件 split conformal：
//   AI 侧非一致性 = 1 − pAI，人类侧 = pAI；各取 (n+1)(1−α)/n 分位。
//   预测集：含 AI ⇔ 1−p ≤ qAi；含人类 ⇔ p ≤ qHuman。
//   {AI} / {人类} 给结论；{人类, AI}（落在两带重叠处）与 ∅（两带都不收）都记弃权。
// α：AI 判定收紧 0.10，人类侧放宽 0.20。
//
// 与 v2 原文"留出按作品对半"的偏差：留出人类只有 6 部（块数 39/29/11/5/4/1），
// 任何按作品的对半都会让一部作品占校准半的大多数（实测某单部作品曾占一个校准半的大多数），
// 分位数由一部作品决定。这里改为在训练集的按作品 5 折折外分数上取分位（27 部人类作品、约 37 个 AI 批次），
// 留出 174 块原封不动只测覆盖率。折外分数来自略小的训练集，保证是近似的，覆盖率实测随报告落盘。

import { quantile } from './util.mjs'

/**
 * @param {object[]} cal 校准行：pAI（折外）、side
 * @param {object[]} test 测试行：pAI、side
 */
export function fitConformal(cal, test, { alphaAi = 0.10, alphaHuman = 0.20 } = {}) {
  const q = (scores, alpha) => quantile(scores, Math.min(1, Math.ceil((scores.length + 1) * (1 - alpha)) / scores.length))
  const aiCal = cal.filter((r) => r.side === 'ai'), humanCal = cal.filter((r) => r.side === 'human')
  const qAi = q(aiCal.map((r) => 1 - r.pAI), alphaAi)
  const qHuman = q(humanCal.map((r) => r.pAI), alphaHuman)
  const cover = (side, label) => {
    const rs = test.filter((r) => r.side === side)
    return rs.length ? rs.filter((r) => predictSet(r.pAI, qAi, qHuman).includes(label)).length / rs.length : null
  }
  const setSizes = { single: 0, both: 0, empty: 0 }
  for (const r of test) { const n = predictSet(r.pAI, qAi, qHuman).length; setSizes[n === 1 ? 'single' : n === 2 ? 'both' : 'empty']++ }
  return {
    alphaAi, alphaHuman, qAi, qHuman,
    nCal: { ai: aiCal.length, human: humanCal.length },
    nTest: { ai: test.filter((r) => r.side === 'ai').length, human: test.filter((r) => r.side === 'human').length },
    coverage: { ai: cover('ai', 'AI'), human: cover('human', '人类'), targetAi: 1 - alphaAi, targetHuman: 1 - alphaHuman },
    setSizes,
  }
}

/**
 * 在一组行（pAI、side）上按 (qAi, qHuman) 统计：两侧覆盖率、AI 判成人类（预测集恰为 {人类}）、人类判成 AI（恰为 {AI}）、预测集大小。
 */
export function coverageOf(rows, qAi, qHuman) {
  const sets = rows.map((r) => ({ r, set: predictSet(r.pAI, qAi, qHuman) }))
  const ai = sets.filter((x) => x.r.side === 'ai'), hu = sets.filter((x) => x.r.side === 'human')
  const only = (set, lab) => set.length === 1 && set[0] === lab
  const rate = (xs, f) => xs.length ? xs.filter(f).length / xs.length : null
  return {
    n: { ai: ai.length, human: hu.length },
    coverage: { ai: rate(ai, (x) => x.set.includes('AI')), human: rate(hu, (x) => x.set.includes('人类')) },
    aiJudgedHuman: rate(ai, (x) => only(x.set, '人类')), aiJudgedHumanN: ai.filter((x) => only(x.set, '人类')).length,
    humanJudgedAi: rate(hu, (x) => only(x.set, 'AI')), humanJudgedAiN: hu.filter((x) => only(x.set, 'AI')).length,
    setSizes: { single: sets.filter((x) => x.set.length === 1).length, both: sets.filter((x) => x.set.length === 2).length, empty: sets.filter((x) => x.set.length === 0).length },
  }
}

/** 预测集。可能为空（两带都不收）。 */
export function predictSet(pAI, qAi, qHuman) {
  const set = []
  if (1 - pAI <= qAi) set.push('AI')
  if (pAI <= qHuman) set.push('人类')
  return set
}

/**
 * Platt 诊断（次要，v2 修正③：不作主校准）。p = σ(a·logit + b)。样本不足返回 null。
 */
export function fitPlatt(rows, { minN = 30 } = {}) {
  rows = rows.filter((r) => Number.isFinite(r.pAI))
  if (rows.length < minN) return null
  const lg = (p) => { const q = Math.max(1e-6, Math.min(1 - 1e-6, p)); return Math.log(q / (1 - q)) }
  let a = 1, b = 0
  for (let ep = 0; ep < 100; ep++) {
    let ga = 0, gb = 0, haa = 1e-3, hbb = 1e-3, hab = 0
    for (const r of rows) {
      const x = lg(r.pAI), p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, a * x + b)))), y = r.side === 'ai' ? 1 : 0, w = p * (1 - p)
      ga += (p - y) * x; gb += p - y; haa += w * x * x; hbb += w; hab += w * x
    }
    const det = haa * hbb - hab * hab || 1e-9
    a -= (hbb * ga - hab * gb) / det; b -= (haa * gb - hab * ga) / det
  }
  return { a, b }
}
