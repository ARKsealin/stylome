// 九轴风格雷达渲染器（纯 SVG 字符串，面板直接注入；命令行与报告复用）。
//
// 单序列 = 作者风格指纹（训练结果）或画像覆盖；
// 双序列 = 比对分析（画像预期 vs 目标文档）。
// 轴长一律是 0–1 的展示刻度（见 metrics.STYLE_AXES），与判定无关；
// 颜色用主题令牌（var(--dsw-alias-*)），随亮暗主题切换。

export const RADAR_PALETTE = {
  grid: 'var(--dsw-alias-border-l3,#c9ced6)',
  text: 'var(--dsw-alias-label-secondary,#424a55)',
  muted: 'var(--dsw-alias-label-tertiary,#7a828e)',
  profile: 'var(--dsw-alias-brand-primary,#4e6ef2)',
  target: 'var(--dsw-alias-state-warn-primary,#e5a03c)',
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clampAxis = (v) => (Number.isFinite(v) ? Math.max(0.02, Math.min(1, v)) : null)

/**
 * @param {object} args
 * @param {Array<{key:string,label:string}>} args.axes 轴（顺序即绘制顺序）
 * @param {Array<{key:string,label:string,tone:'profile'|'target',values:Record<string,number|null>}>} args.series 序列
 * @param {number} [args.size]
 * @param {object} [args.palette]
 * @param {boolean} [args.ticks] 是否画 0.5 与 1.0 的刻度标注
 * @returns {string} 内联 SVG；轴不足 3 根时返回 ''
 */
export function renderRadarSVG({ axes, series, size = 340, palette = {}, ticks = true }) {
  if (!Array.isArray(axes) || axes.length < 3) return ''
  const pal = { ...RADAR_PALETTE, ...palette }
  const n = axes.length
  const pad = 54
  const cx = size / 2
  const cy = size / 2 + 8
  const R = size / 2 - pad
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]

  const rings = [0.25, 0.5, 0.75, 1].map((r) => {
    const pts = axes.map((_, i) => pt(i, r * R).map((v) => v.toFixed(1)).join(',')).join(' ')
    return `<polygon points="${pts}" fill="none" stroke="${pal.grid}" stroke-width="1"${r === 0.5 ? ' stroke-dasharray="4 3"' : ''}/>`
  }).join('')
  const spokes = axes.map((_, i) => {
    const [x2, y2] = pt(i, R)
    return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${pal.grid}" stroke-width="1"/>`
  }).join('')

  const polys = (series ?? []).map((s) => {
    const color = pal[s.tone] ?? pal.profile
    const ok = axes.map((a, i) => ({ a, i, v: clampAxis(s.values?.[a.key]) })).filter((x) => x.v !== null)
    if (ok.length < 3) return ''
    const pts = ok.map((x) => pt(x.i, x.v * R).map((v) => v.toFixed(1)).join(',')).join(' ')
    const dash = s.tone === 'target' ? ' stroke-dasharray="6 4"' : ''
    const poly = `<polygon points="${pts}" fill="${color}" fill-opacity="${s.tone === 'target' ? '0.10' : '0.16'}" stroke="${color}" stroke-width="2"${dash}/>`
    const dots = ok.map((x) => {
      const [x1, y1] = pt(x.i, x.v * R)
      const raw = Number.isFinite(s.raw?.[x.a.key]) ? `实测 ${s.raw[x.a.key]}` : ''
      const tip = `${s.label} · ${x.a.label}\n展示位置 ${x.v.toFixed(2)}${raw ? '\n' + raw : ''}`
      return `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="3.5" fill="${color}"><title>${esc(tip)}</title></circle>`
    }).join('')
    return poly + dots
  }).join('')

  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, R + 16)
    const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end'
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="${pal.text}" text-anchor="${anchor}" dominant-baseline="middle">${esc(a.label)}</text>`
  }).join('')

  const scaleNote = ticks
    ? `<text x="${(cx + 4).toFixed(1)}" y="${(cy - R * 0.5 + 4).toFixed(1)}" font-size="10" fill="${pal.muted}">0.5</text>`
    : ''

  const legend = (series ?? []).length > 1
    ? `<g>${(series ?? []).map((s, k) => {
      const color = pal[s.tone] ?? pal.profile
      const y = 12 + k * 14
      return `<rect x="4" y="${y - 6}" width="10" height="3" rx="1.5" fill="${color}"/><text x="18" y="${y}" font-size="10.5" fill="${pal.text}" dominant-baseline="middle">${esc(s.label)}</text>`
    }).join('')}</g>`
    : ''

  return `<svg viewBox="0 0 ${size} ${size + 8}" width="100%" role="img" aria-label="九轴风格雷达">${rings}${spokes}${polys}${labels}${scaleNote}${legend}</svg>`
}
