// 判据雷达渲染器：把判决结果的六轴分渲染为 SVG，命令行与 DSH 面板共用。
// 参照线（人类 75 分位带、0.5 人机边界环）读自模型序列化的 AxisModel（bandHi），无需任何外部数据。
//
//   renderRadarSVG({ axes, bandHi, size, palette })  → 内联 SVG 字符串（面板直接注入）
//   renderRadarHTML({ label, axes, bandHi, meta })   → 自包含 HTML 文档（命令行 --radar 用）

const TIERS = { pos: '判别', fw: '审计', para: '报告', sig: '仲裁', hurst: '候选', emo: '候选' }
export const AXES = ['pos', 'fw', 'para', 'sig', 'hurst', 'emo']
export const AXIS_LABELS = { pos: '词性构成', fw: '虚词用量', para: '段落形态', sig: '词汇签名', hurst: '时序节奏', emo: '情感密度' }
const NOTES = { pos: '主判别器空间', fw: '扩展候选层', para: '不参与判定', sig: '弃权带仲裁用', hurst: '时序结构信号', emo: '情感密度信号' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')

/** 四态判决各自的强调色（参照设计稿：红 / 橙 / 紫 / 蓝，无法判定为灰）。 */
export const VERDICT_ACCENTS = {
  '高度疑似': '#ef4b5f',
  '存在嫌疑': '#f28a2e',
  '混合可能': '#8b5cf6',
  '人工创作': '#2f7bff',
  '无法判定': '#8b949e',
}

const hexToRgba = (hex, alpha) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * 按判决状态生成雷达配色：数据多边形与顶点用该态的强调色，网格用同色的低透明度版本，
 * 人类参照带保持中性。传主题令牌即可随亮暗主题走（面板用 --dsw-alias-*）。
 * @param {string} state 四态判决（高度疑似 / 存在嫌疑 / 混合可能 / 人工创作 / 无法判定）
 * @param {object} [base] 覆盖项（text / muted / band）
 */
export function paletteForVerdict(state, base = {}) {
  const accent = VERDICT_ACCENTS[state] ?? VERDICT_ACCENTS['无法判定']
  return {
    grid: hexToRgba(accent, 0.2),
    text: base.text ?? 'var(--dsw-alias-label-secondary,#424a55)',
    muted: base.muted ?? 'var(--dsw-alias-label-tertiary,#7a828e)',
    band: base.band ?? 'var(--dsw-alias-label-tertiary,#8b949e)',
    poly: accent,
    dot: accent,
  }
}

const DEFAULT_PALETTE = {
  grid: 'var(--border,#ccc)',
  text: 'var(--fg,#222)',
  muted: 'var(--muted-fg,#888)',
  band: 'var(--blue,#39f)',
  poly: 'var(--orange,#e8903a)',
  dot: 'var(--orange,#e8903a)',
}

/**
 * 六轴判据雷达（纯 SVG，不含文档骨架）。
 * palette 里的颜色会被写进 SVG 属性；传主题令牌（var(--dsw-alias-*)）即可随亮暗主题变化。
 */
export function renderRadarSVG({ axes, bandHi, size = 340, palette = {}, boundaryLabels = true }) {
  const pal = { ...DEFAULT_PALETTE, ...palette }
  const pad = 48
  const cx = size / 2
  const cy = size / 2 + 10
  const R = size / 2 - pad
  const ang = (i) => -Math.PI / 2 + (i * Math.PI) / 3
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]
  const clamp = (v) => (Number.isFinite(v) ? Math.max(0.02, Math.min(1, v)) : null)

  const rings = [0.25, 0.5, 0.75, 1]
    .map((r) => `<polygon points="${AXES.map((_, i) => pt(i, r * R).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${pal.grid}" stroke-width="1"${r === 0.5 ? ' stroke-dasharray="4 3"' : ''}/>`)
    .join('')
  const spokes = AXES.map((_, i) => {
    const [x2, y2] = pt(i, R)
    return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${pal.grid}" stroke-width="1"/>`
  }).join('')

  // 人类 75 分位带线（模型自带 bandHi）
  const bandPts = AXES.map((a, i) => pt(i, clamp(bandHi?.[a]) * R).map((v) => v.toFixed(1)).join(',')).join(' ')
  const band = `<polygon points="${bandPts}" fill="none" stroke="${pal.band}" stroke-width="1.5" stroke-dasharray="6 3" fill-opacity="0.06"/>`

  // 工作多边形（缺轴断开：只在有值轴上画）
  const ok = AXES.map((a, i) => ({ a, i, v: clamp(axes?.[a]) })).filter((x) => x.v !== null)
  const polyPts = ok.map((x) => pt(x.i, x.v * R).map((v) => v.toFixed(1)).join(',')).join(' ')
  const poly = ok.length >= 3 ? `<polygon points="${polyPts}" fill="${pal.poly}" fill-opacity="0.16" stroke="${pal.poly}" stroke-width="2"/>` : ''
  const dots = ok.map((x) => {
    const [x1, y1] = pt(x.i, x.v * R)
    const tip = `${AXIS_LABELS[x.a]}（${TIERS[x.a]}）\n轴分 ${x.v.toFixed(2)}\n人类75分位 ${f2(bandHi?.[x.a])}\n${NOTES[x.a] ?? ''}`
    return `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4" fill="${pal.dot}"><title>${esc(tip)}</title></circle>`
  }).join('')
  const labels = AXES.map((a, i) => {
    const [x, y] = pt(i, R + 16)
    const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end'
    const strong = a === 'pos' ? '600' : '400'
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="${pal.text}" font-weight="${strong}" text-anchor="${anchor}" dominant-baseline="middle">${esc(AXIS_LABELS[a])}·${TIERS[a]}</text>`
  }).join('')

  const extras = boundaryLabels ? (() => {
    const [bx, by] = pt(0, 0.5 * R)
    const boundary = `<text x="${(bx + 6).toFixed(1)}" y="${(by - 5).toFixed(1)}" font-size="11" fill="${pal.muted}">人机边界 0.5</text>`
    const [hx, hy] = pt(2, clamp(bandHi?.para) * R)
    const bandLabel = `<text x="${(hx + 5).toFixed(1)}" y="${(hy - 4).toFixed(1)}" font-size="11" fill="${pal.band}">人类 75 分位带</text>`
    return boundary + bandLabel
  })() : ''

  // 轴标签比六边形宽：左右各留 34 的横向余量，避免长标签被 viewBox 裁掉（六边形本身尺寸不变）。
  const padX = 34
  return `<svg viewBox="${-padX} 0 ${size + padX * 2} ${size + 6}" width="100%" role="img" aria-label="六维判据雷达图">${rings}${spokes}${band}${poly}${dots}${labels}${extras}</svg>`
}

/** 单篇文本的判据雷达（自包含 HTML 文档，命令行 --radar 与快速预览用）。 */
const STATE_KEYS = ['混合可能', '高度疑似', '存在嫌疑', '人工创作']

/** 从判决词里认出四态（与 panel.mjs 的 stateOf 同口径），命令行 HTML 也按态着色。 */
function stateFromVerdict(value) {
  const text = String(value ?? '')
  for (const key of STATE_KEYS) if (text.includes(key.replace('可能', ''))) return key
  return '无法判定'
}

export function renderRadarHTML({ label, axes, bandHi, meta = {} }) {
  const p = meta ?? {}
  const state = p.state ?? stateFromVerdict(p.verdict)
  const chip = `pAI ${f2(p.pAI)} · 分级 ${esc(p.grade ?? '—')} · ${esc(p.verdict ?? '—')}${p.winTop !== undefined ? ` · winTop ${f2(p.winTop)}` : ''}`
  return `<!doctype html>
<html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>判据雷达 · ${esc(label)}</title>
<style>body{margin:0;padding:16px;background:var(--bg,#fff);color:var(--fg,#222);font:14px/1.6 system-ui,sans-serif}
.wrap{max-width:420px;margin:0 auto}h3{font-size:15px;margin:0 0 8px}
.meta{font-size:12px;color:var(--muted-fg,#888);margin-top:8px;line-height:1.7}
.legend{font-size:11px;color:var(--muted-fg,#888);margin-top:6px;line-height:1.7}</style></head>
<body><div class="wrap">
<h3>${esc(label)} · 判据雷达</h3>
${renderRadarSVG({ axes, bandHi, palette: paletteForVerdict(state) })}
<div class="legend">轴标注 · 判别（主判别器空间）/ 审计（扩展候选）/ 仲裁（弃权带用）/ 报告 / 候选 —— 仅 pos 参与主判别器，其余为诊断维度。</div>
<div class="meta">${chip} ｜ ${p.han ?? '—'} 汉字${p.nWin ? ` / ${p.nWin} 窗` : ''}<br>轴分 = 各判据按自身方向推向 AI 的平均标准化位置（0–1，越高越像 AI）；虚线环 0.5 = 人机边界；蓝虚线多边形 = 人类参照 75 分位带（模型内置 AxisModel.bandHi）。</div>
</div></body></html>`
}
