// stylomeArchitect 自我评估（输出 A 的核心）：新作相对锚定作者自身作品集的
// 自我忠实（稳态核心吻合）与进步变化（在自身历史边缘的推进）。
//
// 与 stylomeWeaver 的区分：Weaver 回答"微观计量特征是否合规于风格带"；
// 本模块回答"宏观织体在作者自己的生涯分布里站在哪"——忠实核心 / 自我边缘 / 超出自身历史。

import { PROFILE_KEYS } from './stack/registry.mjs'

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)) || 1e-9 }

const VAL = {
  R: (p) => p.R, Q: (p) => p.Q, H: (p) => p.H, alphaSpan: (p) => p.alphaSpan,
  altRate: (p) => p.altRate, echo: (p) => p.echo, dialMean: (p) => p.dialMean,
}
const LABEL = { R: '情绪显影浓度 R', Q: '情绪曲折度 Q', H: '句流赫斯特 H', alphaSpan: '节奏块差异 α', altRate: '对白交替率', echo: '首尾呼应率', dialMean: '对白占比' }

/**
 * @param {object} profile 新作档案
 * @param {object[]} dossiers 锚定作者全部作品档案（含新作同名则排除，避免自比）
 * @returns {{rows:Array, progression:Array, n:number}}
 */
export function selfAssessment(profile, dossiers) {
  const hist = dossiers.filter((d) => d.name !== profile.name)
  const n = hist.length
  const rows = []
  for (const { key, label } of PROFILE_KEYS) {
    const vals = hist.map(VAL[key]).filter(Number.isFinite).sort((a, b) => a - b)
    const v = VAL[key](profile)
    if (!vals.length || !Number.isFinite(v)) { rows.push({ key, label, value: v ?? null, n: vals.length, klass: 'unavailable' }); continue }
    const mu = mean(vals), sd = sdOf(vals), z = (v - mu) / sd
    const lo = vals[0], hi = vals[vals.length - 1]
    const pct = Math.round((vals.filter((x) => x <= v).length / vals.length) * 100)
    let klass, note
    if (n < 4) { klass = 'small-sample'; note = `作者样本仅 ${n} 部，只报位置：自身第 ${pct}% 百分位` }
    else if (v < lo || v > hi) { klass = 'beyond'; note = `超出作者自身历史全幅 [${r4(lo)}, ${r4(hi)}]——全新的自我领域${v < lo ? '（更低）' : '（更高）'}` }
    else if (Math.abs(z) <= 1) { klass = 'faithful'; note = `稳态核心之内（作者 μ=${r4(mu)}±${r4(sd)}），自我忠实处` }
    else { klass = 'edge'; note = `自身历史边缘（z=${r4(z)}，第 ${pct}% 百分位）——相对自身习惯的推进点${z > 0 ? '（向更高）' : '（向更低）'}` }
    rows.push({ key, label: LABEL[key] ?? label, value: r4(v), core: [r4(mu - sd), r4(mu + sd)], range: [r4(lo), r4(hi)], z: r4(z), pct, klass, note, n })
  }
  const progression = rows.filter((r) => r.klass === 'beyond' || r.klass === 'edge').map((r) => ({ key: r.key, label: r.label, klass: r.klass, note: r.note }))
  return { rows, progression, n }
}
