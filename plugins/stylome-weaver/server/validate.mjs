// 带校验：段落特征 × 画像分位带 → 逐特征越带判定与严重度。
//
// z 口径（分布无关）：带 [lo,hi] 是参考分布的 [α/2, 1-α/2] 分位，带半宽 hw=(hi-lo)/2。
//   带内 z=0；带上方 z=+2×(v-hi)/(hi-lo)；带下方 z=-2×(lo-v)/(hi-lo)。
//   z=1 ⇔ 越出带沿半个带宽。severity：|z|<1 轻微（不计入发现），1–2 明显，≥2 严重。
// 段落 verdict：severe>0 → 越带；notable≥2 → 关注；其余 → 在带内/轻微偏离。
// 文档 rollup：按语义组聚合严重度，排 top 问题段。

import { CATALOG, GROUPS, GROUP_LABELS, MIN_CHECK_CHARS, severityOf, TIER_LABEL, tierOf } from './catalog.mjs'

const round4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)

/** 单段校验。返回 null = 不可校验（过短/无特征）。 */
export function checkPara(para, profile) {
  if (!para.checkable || !para.features) return null
  const tierRaw = tierOf(para.han)
  const tier = profile.tierAlias?.[tierRaw] ?? tierRaw // 稀疏档合并（如 xl→l）
  const findings = []
  for (const c of CATALOG) {
    const band = profile.bands[c.key]?.[tier]
    if (!band) continue
    if (c.minChars && para.han < c.minChars) continue
    const v = para.features[c.key]
    if (!Number.isFinite(v)) continue
    if (!(band.hi - band.lo > 0)) continue
    let z = 0, side = null
    if (v > band.hi) { z = (2 * (v - band.hi)) / (band.hi - band.lo); side = 'hi' }
    else if (v < band.lo) { z = (2 * (band.lo - v)) / (band.hi - band.lo); side = 'lo' }
    if (side && Math.abs(z) >= 1) {
      findings.push({
        key: c.key, group: c.group, label: c.label,
        value: round4(v), lo: round4(band.lo), hi: round4(band.hi),
        side, z: round2(Math.abs(z)), severity: severityOf(Math.abs(z)),
        advice: c.advice,
      })
    }
  }
  // 段长档无锚定带 = 段长本身落在画像的段长分布之外：作为独立发现报告，而不是静默跳过。
  // side='uncovered' 是分类判定而非连续量，报告里不按「高于/低于带沿」措辞，也不展示带区间。
  const tierHasBand = Object.values(profile.bands).some((per) => per[tier])
  if (!tierHasBand) {
    findings.push({
      key: 'para:tierUncovered', group: 'rhythm', label: `段长档无锚定带（${TIER_LABEL[tierRaw] ?? tierRaw}）`,
      value: para.han, lo: null, hi: null, side: 'uncovered', z: 2.2, severity: 'severe', advice: 'tier-uncovered',
    })
  }
  findings.sort((a, b) => b.z - a.z)
  const nSevere = findings.filter((f) => f.severity === 'severe').length
  const nNotable = findings.filter((f) => f.severity === 'notable').length
  const verdict = nSevere > 0 ? '越带' : nNotable >= 2 ? '关注' : findings.length > 0 ? '轻微偏离' : '在带内'
  return {
    idx: para.idx, han: para.han, tier, verdict,
    zMax: findings.length ? findings[0].z : 0,
    findings,
    counts: { severe: nSevere, notable: nNotable },
  }
}

/**
 * 整篇校验。
 * @param {Array} paras ParaMeter.document 的段落单元
 * @param {object} profile 画像
 * @returns {{checked:number, skipped:number, results:object[], rollup:object}}
 */
export function validate(paras, profile) {
  const results = []
  let skipped = 0
  for (const p of paras) {
    const r = checkPara(p, profile)
    if (r) results.push(r)
    else skipped++
  }
  const groups = {}
  for (const g of GROUPS) {
    const zs = results.flatMap((r) => r.findings.filter((f) => f.group === g).map((f) => f.z))
    if (zs.length) groups[g] = { label: GROUP_LABELS[g], n: zs.length, zMean: round2(zs.reduce((s, x) => s + x, 0) / zs.length), zMax: round2(Math.max(...zs)) }
  }
  const ranked = [...results].sort((a, b) => (b.counts.severe - a.counts.severe) || (b.zMax - a.zMax))
  const verdicts = results.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] ?? 0) + 1), m), {})
  return {
    checked: results.length,
    skipped,
    results,
    rollup: {
      verdicts,
      groups,
      topParas: ranked.slice(0, 10).map((r) => ({ idx: r.idx, verdict: r.verdict, severe: r.counts.severe, notable: r.counts.notable, zMax: r.zMax, top: r.findings.slice(0, 3).map((f) => f.key) })),
    },
  }
}

export { MIN_CHECK_CHARS }
