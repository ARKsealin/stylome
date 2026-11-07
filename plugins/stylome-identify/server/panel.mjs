// 面板的数据编排：扫描文件夹、把一次判决整形给前端、按四态生成批处理分布与参考意见。
// 判别本身由 index.js 的 judge 闭包完成（与工具、命令共用同一个串行链路与度量进程），
// 这里只做纯数据加工，不碰模型、不起进程。

import { readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { renderRadarSVG, paletteForVerdict, AXES, AXIS_LABELS } from './radar.mjs'

export const PANEL_EXTS = ['.txt', '.md', '.docx', '.doc', '.pdf']
const EXT_SET = new Set(PANEL_EXTS)

// 面板里的雷达按判决状态着色（红 / 橙 / 紫 / 蓝，见 radar.mjs 的 VERDICT_ACCENTS），
// 文字与参照带仍用主题令牌，随亮暗主题走。

export const STATES = ['高度疑似', '存在嫌疑', '混合可能', '人工创作', '无法判定']

/** 递归列出目录里可分析的文件（深度 ≤ maxDepth，数量 ≤ maxFiles）。 */
export function scanFolder(dir, { maxFiles = 200, maxDepth = 3 } = {}) {
  let rootStat
  try { rootStat = statSync(dir) } catch { throw new Error('目录不存在：' + dir) }
  if (!rootStat.isDirectory()) throw new Error('不是目录：' + dir)
  const files = []
  const seen = { total: 0, unsupported: 0 }
  const walk = (d, depth) => {
    let names
    try { names = readdirSync(d) } catch { return }
    for (const name of names.sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const p = join(d, name)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { if (depth < maxDepth) walk(p, depth + 1); continue }
      if (!st.isFile()) continue
      seen.total++
      const ext = extname(name).toLowerCase()
      if (!EXT_SET.has(ext)) { seen.unsupported++; continue }
      if (files.length >= maxFiles) continue
      files.push({ name, path: p, rel: relative(dir, p), ext, size: st.size })
    }
  }
  walk(dir, 0)
  return {
    dir,
    files,
    total: seen.total,
    unsupported: seen.unsupported,
    truncated: files.length >= maxFiles,
    limit: maxFiles,
  }
}

/** 判决的主状态：混合优先（混合文本一定不是人工创作），其余按 SDN 等级。 */
export function stateOf(result) {
  if (!result) return '无法判定'
  const verdict = result.sdn?.verdict ?? result.verdict ?? null
  if (verdict) {
    if (verdict.includes('混合')) return '混合可能'
    if (verdict.includes('高度疑似')) return '高度疑似'
    if (verdict.includes('存在嫌疑')) return '存在嫌疑'
    if (verdict.includes('人工创作')) return '人工创作'
  }
  if (result.route === 'micro') {
    if (result.grade === '高' || result.grade === '中') return '存在嫌疑'
    if (result.grade === '低') return '人工创作'
  }
  return '无法判定'
}

/** 判别区间中位数：嫌疑线（tSusp）与高置信线（highLine）的中点。 */
export function intervalMid(thresholds) {
  const tSusp = Number(thresholds?.tSusp)
  const highLine = Number(thresholds?.highLine)
  if (!Number.isFinite(tSusp) || !Number.isFinite(highLine)) return null
  return Math.round(((tSusp + highLine) / 2) * 1000) / 1000
}

/** 单篇/单文件的一份结果：给面板够用即可，不塞整份 JSON。 */
export function shapeResult(result, { name, rel, path } = {}) {
  const axes = result.sdn?.axes ?? {}
  const bandHi = result.sdn?.bandHi ?? null
  const state = stateOf(result)
  return {
    ok: true,
    state,
    name: name ?? basename(path ?? ''),
    rel: rel ?? name ?? null,
    path: path ?? null,
    han: result.han,
    chars: result.chars,
    route: result.route,
    pAI: result.pAI,
    grade: result.grade,
    verdict: result.sdn?.verdict ?? null,
    level: result.sdn?.level ?? null,
    levelProbs: result.sdn?.levelProbs ?? null,
    winTop: result.sdn?.winTop ?? null,
    mixed: !!result.sdn?.mixed,
    lamps: result.sdn?.lamps ?? { ood: false, conflict: false, short: false },
    zoneDowngrade: !!result.sdn?.zoneDowngrade,
    by: result.sdn?.by ?? null,
    axes: Object.fromEntries(AXES.map((k) => [k, Number.isFinite(axes[k]) ? axes[k] : null])),
    bandHi,
    evidence: (result.evidence ?? []).slice(0, 8).map((e) => ({
      name: e.name, value: e.value, humanBand: e.humanBand, z: e.z, push: e.push, direction: e.direction, role: e.role,
    })),
    note: result.note ?? null,
    spectrum: result.spectrum ? { segments: result.spectrum.segments, highWindows: result.spectrum.highWindows, note: result.spectrum.note } : null,
    disclaimer: result.disclaimer ?? [],
    radarSvg: result.route === 'short' ? null : renderRadarSVG({ axes, bandHi, palette: paletteForVerdict(state) }),
    axisMeta: AXES.map((k) => ({ key: k, label: AXIS_LABELS[k] })),
  }
}

export function shapeError(error, { name, rel, path } = {}) {
  return { ok: false, name: name ?? basename(path ?? ''), rel: rel ?? name ?? null, path: path ?? null, error: String(error?.message ?? error) }
}

/** 单文件参考意见：阈值为模型数据（tSusp / highLine），中位数按两者中点取。 */
export function recommend(item, thresholds) {
  const mid = intervalMid(thresholds)
  const score = Number.isFinite(item.winTop) ? item.winTop : item.pAI
  const state = stateOf(item)
  if (!item.ok) return { kind: 'error', state: '无法判定', text: '未能分析：' + (item.error ?? '未知错误') }
  if (state === '高度疑似') return { kind: 'high', state, text: '高度可疑，极有可能为 AI 生成' }
  if (state === '混合可能') return { kind: 'review', state, text: '人机拼合/段落级混合，建议人工复核' }
  if (state === '存在嫌疑') {
    if (mid !== null && Number.isFinite(score) && score >= mid) {
      return { kind: 'review', state, text: `特征值 ${score.toFixed(2)} ≥ 判别区间中位数 ${mid.toFixed(2)}，建议人工复核` }
    }
    return { kind: 'watch', state, text: '有 AI 迹象但强度低于中位线，建议抽查' }
  }
  if (state === '人工创作') return { kind: 'low', state, text: '低 AIGC 风险文本' }
  return { kind: 'unknown', state, text: '样本不足或弃权，无法判定' }
}

/** 批处理汇总：四态分布 + 参考意见（数量与文案都由结果算出，不写死）。 */
export function summarize(results, thresholds) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]))
  const records = results.map((item) => {
    const rec = recommend(item, thresholds)
    counts[rec.state] = (counts[rec.state] ?? 0) + 1
    return { ...item, state: rec.state, recommendation: rec }
  })
  const mid = intervalMid(thresholds)
  const reviewSuspect = records.filter((r) => r.state === '存在嫌疑' && r.recommendation.kind === 'review').length
  const watchSuspect = records.filter((r) => r.state === '存在嫌疑' && r.recommendation.kind === 'watch').length
  const mixedHigh = records.filter((r) => r.state === '混合可能' && r.level === '高度疑似').length
  const advice = []
  if (counts['高度疑似']) advice.push(`${counts['高度疑似']} 篇高度疑似：极有可能为 AI，按高风险处理。`)
  if (counts['混合可能']) advice.push(`${counts['混合可能']} 篇混合可能${mixedHigh ? `（含高度疑似 ${mixedHigh} 篇）` : ''}：人机拼合或段落级混合，建议人工复核。`)
  if (counts['存在嫌疑']) advice.push(`${counts['存在嫌疑']} 篇存在嫌疑：其中 ${reviewSuspect} 篇特征值超过判别区间中位数${mid !== null ? `（≥ ${mid}）` : ''}，建议人工复核；其余 ${watchSuspect} 篇建议抽查。`)
  if (counts['人工创作']) advice.push(`${counts['人工创作']} 篇人工创作：低 AIGC 风险文本。`)
  if (counts['无法判定']) advice.push(`${counts['无法判定']} 篇无法判定：样本不足、弃权或解析失败，需更长的正文。`)
  return {
    total: results.length,
    counts,
    records,
    review: counts['高度疑似'] + counts['混合可能'] + reviewSuspect,
    mid,
    advice,
  }
}

export function thresholdSnapshot(model) {
  const th = model?.thresholds ?? {}
  return {
    tSusp: th.tSusp ?? null,
    highLine: th.highLine ?? null,
    gradeHigh: th.gradeHigh ?? null,
    conflictSpread: th.conflictSpread ?? null,
  }
}
