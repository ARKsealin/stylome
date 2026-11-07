// 画像的「可读化」：把分位带折成面板与报告要用的几样东西——
//   ① 九轴风格指纹（雷达）：每轴取 1–4 个代表特征，按固定的展示刻度折成 0–1；
//   ② 指标卡：句长、段长、对白、虚词、词汇、情绪等可读数值；
//   ③ 概括关键词：由数值触发的风格短语（规则表，可解释、无预训练）；
//   ④ 覆盖表：哪些特征在哪些段长档上真的学到了带。
//
// 重要边界：STYLE_AXES 的 lo/hi 只是**画图刻度**，不是判定线。判定只发生在 validate.mjs，
// 用的是画像自身的分位带。这里没有任何模型权重、没有内置作者画像。

import { CATALOG, GROUP_LABELS, GROUPS, TIER_LABEL } from './catalog.mjs'

export const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)

/**
 * 九轴风格指纹。轴键与语义组同名，故可与 validate 的组汇总直接对齐。
 * features：代表特征；sum=true 表示该轴取几个特征之和。
 * lo/hi：展示刻度（0–1 映射的端点），注释里写明单位。
 */
export const STYLE_AXES = [
  { key: 'lexdiv', label: GROUP_LABELS.lexdiv, features: ['lex:mattr'], lo: 0.30, hi: 0.80, unit: 'MATTR', fmt: 3, note: 'MATTR 词汇丰富度（500 词窗）' },
  { key: 'lexmix', label: GROUP_LABELS.lexmix, features: ['word:descriptiveRatio'], lo: 0.02, hi: 0.35, unit: '修饰词占比', fmt: 3, note: '修饰性占比（形容词 + 「的」）' },
  { key: 'fw', label: GROUP_LABELS.fw, features: ['fw:的', 'fw:了', 'fw:在', 'fw:是'], sum: true, lo: 150, hi: 1400, unit: '每万字合计', fmt: 0, note: '「的 / 了 / 在 / 是」每万字合计' },
  { key: 'punct', label: GROUP_LABELS.punct, features: ['punct:comma', 'punct:period'], sum: true, lo: 15, hi: 200, unit: '每千字合计', fmt: 0, note: '逗号 + 句号每千字合计' },
  { key: 'rhythm', label: GROUP_LABELS.rhythm, features: ['sent:sentLenMean'], lo: 6, hi: 50, unit: '字/句', fmt: 1, note: '平均句长（字）' },
  { key: 'pron', label: GROUP_LABELS.pron, features: ['pron:firstPer1k'], lo: 0, hi: 60, unit: '每千字', fmt: 1, note: '第一人称代词每千字（叙述部分）' },
  { key: 'dialog', label: GROUP_LABELS.dialog, features: ['dialogue:ratio'], lo: 0, hi: 0.5, unit: '占比', fmt: 3, note: '引号内文字占全文字数比' },
  { key: 'emo', label: GROUP_LABELS.emo, features: ['emo:R'], lo: 0, hi: 20, unit: '每千字', fmt: 1, note: '七类情绪词每千字合计' },
  { key: 'frame', label: GROUP_LABELS.frame, features: ['frame:total'], lo: 0, hi: 12, unit: '每千字', fmt: 2, note: '框架句式（关联词对举）每千字' },
]

/** 画像某特征的典型值：各段长档 band.mean 按样本数加权。 */
export function bandValue(profile, key) {
  const per = profile?.bands?.[key]
  if (!per) return null
  let w = 0, s = 0
  for (const b of Object.values(per)) {
    if (!Number.isFinite(b?.mean) || !(b?.n > 0)) continue
    s += b.mean * b.n
    w += b.n
  }
  return w > 0 ? s / w : null
}

/** 画像某特征的带包络：各档 [lo,hi] 的并集。 */
export function bandSpan(profile, key) {
  const per = profile?.bands?.[key]
  if (!per) return null
  let lo = Infinity, hi = -Infinity, n = 0
  for (const b of Object.values(per)) {
    if (Number.isFinite(b?.lo)) lo = Math.min(lo, b.lo)
    if (Number.isFinite(b?.hi)) hi = Math.max(hi, b.hi)
    if (Number.isFinite(b?.n)) n += b.n
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi, n } : null
}

/** 一轴的画像原始值（sum 轴求和；任一成员缺失即视为该轴无值）。 */
export function axisRaw(profile, axis) {
  let total = 0
  for (const f of axis.features) {
    const v = bandValue(profile, f)
    if (!Number.isFinite(v)) return null
    total += v
  }
  return total
}

/** 一轴的画像带包络（sum 轴求和）。 */
export function axisSpan(profile, axis) {
  let lo = 0, hi = 0, n = 0, any = false
  for (const f of axis.features) {
    const s = bandSpan(profile, f)
    if (!s) continue
    any = true
    lo += s.lo
    hi += s.hi
    n += s.n
  }
  return any ? { lo, hi, n } : null
}

/** 原始值 → 展示刻度上的 0–1 位置。 */
export function toDisplay(axis, raw) {
  if (!Number.isFinite(raw)) return null
  return clamp01((raw - axis.lo) / (axis.hi - axis.lo))
}

/** 带外程度：0–1（=1 表示越出带沿一个带宽，按 z/4 折）。 */
export function outsideScore(span, raw) {
  if (!span || !Number.isFinite(raw)) return 0
  const width = span.hi - span.lo
  if (!(width > 0)) return 0
  if (raw > span.hi) return clamp01((raw - span.hi) / width)
  if (raw < span.lo) return clamp01((span.lo - raw) / width)
  return 0
}

/**
 * 画像九轴指纹。
 * @returns {Array<{key,label,note,unit,fmt,value:number|null,raw:number|null,display:[number,number],band:{lo,hi,n}|null,coverage:number}>}
 */
export function profileAxes(profile) {
  return STYLE_AXES.map((axis) => {
    const raw = axisRaw(profile, axis)
    const span = axisSpan(profile, axis)
    const present = axis.features.filter((f) => profile?.bands?.[f]).length
    return {
      key: axis.key,
      label: axis.label,
      note: axis.note,
      unit: axis.unit,
      fmt: axis.fmt,
      value: toDisplay(axis, raw),
      raw: Number.isFinite(raw) ? round(raw, 3) : null,
      display: [axis.lo, axis.hi],
      band: span ? { lo: round(span.lo, 3), hi: round(span.hi, 3), n: span.n } : null,
      coverage: present / axis.features.length,
    }
  })
}

/** 段落测量结果的均值聚合（只收可校验段落）。 */
export function documentFeatures(doc) {
  const paras = (doc?.paras ?? []).filter((p) => p?.checkable && p.features)
  const out = {}
  if (!paras.length) return out
  const keys = new Set()
  for (const p of paras) for (const k of Object.keys(p.features)) if (Number.isFinite(p.features[k])) keys.add(k)
  for (const k of keys) {
    let s = 0, n = 0
    for (const p of paras) {
      const v = p.features[k]
      if (!Number.isFinite(v)) continue
      s += v
      n++
    }
    if (n) out[k] = s / n
  }
  return out
}

/** 目标文档在九轴上的原始值。 */
export function docAxisRaw(feat, axis) {
  let total = 0
  for (const f of axis.features) {
    const v = feat[f]
    if (!Number.isFinite(v)) return null
    total += v
  }
  return total
}

/**
 * 目标文档九轴读数：同一条展示刻度上的位置 + 与画像带的偏离。
 * @param {object} feat documentFeatures(doc) 的结果
 * @param {Array} axes profileAxes(profile) 的结果
 */
export function targetAxes(feat, axes) {
  const byKey = new Map(axes.map((a) => [a.key, a]))
  return STYLE_AXES.map((axis) => {
    const p = byKey.get(axis.key) ?? null
    const raw = docAxisRaw(feat, axis)
    const span = p?.band ? { lo: p.band.lo, hi: p.band.hi } : null
    return {
      key: axis.key,
      label: axis.label,
      unit: axis.unit,
      fmt: axis.fmt,
      value: toDisplay(axis, raw),
      raw: Number.isFinite(raw) ? round(raw, 3) : null,
      band: span,
      deviation: outsideScore(span, raw),
    }
  })
}

/** 归纳：可读的指标卡（面板顶部一排）。 */
export function profileCards(profile) {
  const cards = []
  const add = (key, label, raw, unit, fmt, note) => {
    if (!Number.isFinite(raw)) return
    cards.push({ key, label, value: round(raw, fmt === 0 ? 0 : 3), unit, note })
  }
  add('sentLen', '平均句长', bandValue(profile, 'sent:sentLenMean'), '字', 1, '每句汉字数')
  add('paraLen', '平均段长', bandValue(profile, 'para:paraLenMean'), '字', 0, '每段汉字数')
  add('dialog', '对白占比', (bandValue(profile, 'dialogue:ratio') ?? NaN) * 100, '%', 1, '引号内字数占比')
  add('fwsum', '虚词合计', axisRaw(profile, STYLE_AXES[2]), '每万字', 0, '「的了在是」合计')
  add('mattr', '词汇丰富度', bandValue(profile, 'lex:mattr'), 'MATTR', 3, '越高词面越繁复')
  add('emov', '情绪词密度', bandValue(profile, 'emo:R'), '每千字', 1, '七类情绪词合计')
  add('shortSent', '短句占比', (bandValue(profile, 'sent:shortSentRatio') ?? NaN) * 100, '%', 1, '≤8 字的句子')
  add('hurst', '节奏赫斯特', bandValue(profile, 'sent:hurst'), 'H', 2, '句长序列长程相关')
  return cards
}

/**
 * 风格关键词。规则表全在下面：每条规则读一个聚合量，命中就产出一个短语。
 * 这是**描述性**的概括，不是判决：阈值取自然语言里的常识边界，并在 detail 里带上实测值。
 */
const KEYWORD_RULES = [
  (s) => s.sentLen <= 16 && kw('短句疾行', `平均句长 ${f(s.sentLen, 1)} 字：句子短促，推进快`, 'sent:sentLenMean', s.sentLen),
  (s) => s.sentLen >= 42 && kw('长句回旋', `平均句长 ${f(s.sentLen, 1)} 字：长句层叠，气口长`, 'sent:sentLenMean', s.sentLen),
  (s) => s.sentLen > 16 && s.sentLen < 42 && s.sentLen >= 26 && kw('中长句叙述', `平均句长 ${f(s.sentLen, 1)} 字：叙述句偏长`, 'sent:sentLenMean', s.sentLen),
  (s) => s.sentCv >= 0.75 && kw('长短激荡', `句长变异系数 ${f(s.sentCv, 2)}：长短落差大`, 'sent:sentLenCv', s.sentCv),
  (s) => s.sentCv > 0 && s.sentCv <= 0.35 && kw('句长齐整', `句长变异系数 ${f(s.sentCv, 2)}：句式均匀`, 'sent:sentLenCv', s.sentCv),
  (s) => s.dialogue >= 0.3 && kw('对白驱动', `对白占 ${f(s.dialogue * 100, 0)}%：戏在嘴上`, 'dialogue:ratio', s.dialogue),
  (s) => s.dialogue >= 0 && s.dialogue <= 0.03 && kw('以叙代白', '对白近乎为零：全靠叙述推进', 'dialogue:ratio', s.dialogue),
  (s) => s.mattr >= 0.6 && kw('词面繁复', `MATTR ${f(s.mattr, 3)}：用词少重复`, 'lex:mattr', s.mattr),
  (s) => s.mattr > 0 && s.mattr <= 0.42 && kw('用词清简', `MATTR ${f(s.mattr, 3)}：常用词复现多`, 'lex:mattr', s.mattr),
  (s) => s.emo >= 12 && kw('情绪直陈', `情绪词 ${f(s.emo, 1)}/千字：情绪写在字面上`, 'emo:R', s.emo),
  (s) => s.emo >= 0 && s.emo <= 2.5 && kw('情绪敛抑', `情绪词 ${f(s.emo, 1)}/千字：几乎不直写情绪`, 'emo:R', s.emo),
  (s) => s.first >= 12 && kw('第一人称', `「我」${f(s.first, 1)}/千字：近身视角`, 'pron:firstPer1k', s.first),
  (s) => s.third >= 25 && kw('第三人称远视', `他/她 ${f(s.third, 1)}/千字：旁观机位`, 'pron:thirdPer1k', s.third),
  (s) => s.ellipsis >= 8 && kw('省略留白', `省略号 ${f(s.ellipsis, 1)}/千字：爱用未尽之意`, 'punct:ellipsis', s.ellipsis),
  (s) => s.dash >= 6 && kw('插入语跳跃', `破折号 ${f(s.dash, 1)}/千字：插入语密集`, 'punct:dash', s.dash),
  (s) => s.question >= 6 && kw('设问频仍', `问号 ${f(s.question, 1)}/千字：疑问句多`, 'punct:question', s.question),
  (s) => s.frame >= 4.5 && kw('衔接框架密', `框架句式 ${f(s.frame, 2)}/千字：关联词驱动的句子多`, 'frame:total', s.frame),
  (s) => s.descriptive >= 0.27 && kw('定语绵密', `修饰性占比 ${f(s.descriptive, 3)}：修饰层厚`, 'word:descriptiveRatio', s.descriptive),
  (s) => s.descriptive > 0 && s.descriptive <= 0.12 && kw('少事雕琢', `修饰性占比 ${f(s.descriptive, 3)}：修饰极省`, 'word:descriptiveRatio', s.descriptive),
  (s) => s.paraLen >= 350 && kw('长段推进', `平均段长 ${f(s.paraLen, 0)} 字：段落厚`, 'para:paraLenMean', s.paraLen),
  (s) => s.paraLen > 0 && s.paraLen <= 60 && kw('短段分行', `平均段长 ${f(s.paraLen, 0)} 字：段落碎`, 'para:paraLenMean', s.paraLen),
  (s) => s.shortSent >= 0.45 && kw('碎句多', `短句占 ${f(s.shortSent * 100, 0)}%：节奏跳`, 'sent:shortSentRatio', s.shortSent),
  (s) => s.metaphor >= 4 && kw('比喻外露', `比喻标记 ${f(s.metaphor, 1)}/千字：明喻常现`, 'lexicon:metaphor', s.metaphor),
  (s) => s.visual >= 8 && s.visual >= s.auditory * 2 && kw('视觉主导', `视觉词 ${f(s.visual, 1)}/千字：以看写景`, 'lexicon:visual', s.visual),
  (s) => s.auditory >= 4 && s.auditory >= s.visual * 2 && kw('听觉主导', `听觉词 ${f(s.auditory, 1)}/千字：以听写场`, 'lexicon:auditory', s.auditory),
]

const kw = (word, detail, metric, value) => ({ word, detail, metric, value: Number.isFinite(value) ? round(value, 3) : null })
const f = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—')

/** 从画像折出关键词用的聚合量。 */
export function styleSignals(profile) {
  const g = (k) => bandValue(profile, k)
  return {
    sentLen: g('sent:sentLenMean'),
    sentCv: g('sent:sentLenCv'),
    shortSent: g('sent:shortSentRatio'),
    paraLen: g('para:paraLenMean'),
    dialogue: g('dialogue:ratio'),
    mattr: g('lex:mattr'),
    emo: g('emo:R'),
    first: g('pron:firstPer1k'),
    third: g('pron:thirdPer1k'),
    ellipsis: g('punct:ellipsis'),
    dash: g('punct:dash'),
    question: g('punct:question'),
    frame: g('frame:total'),
    descriptive: g('word:descriptiveRatio'),
    metaphor: g('lexicon:metaphor'),
    visual: g('lexicon:visual'),
    auditory: g('lexicon:auditory'),
  }
}

/**
 * 生成 3–6 个风格概括关键词。
 * @returns {Array<{word:string, detail:string, metric:string|null, value:number|null}>}
 */
export function profileKeywords(profile) {
  const s = styleSignals(profile)
  const out = []
  const seen = new Set()
  for (const rule of KEYWORD_RULES) {
    const hit = rule(s)
    if (!hit || seen.has(hit.word)) continue
    seen.add(hit.word)
    out.push(hit)
    if (out.length >= 6) break
  }
  if (out.length < 3) out.push({ word: '底色均衡', detail: '各项特征都落在常见区间，没有哪一项特别突出', metric: null, value: null })
  return out
}

/** 覆盖表：哪些特征学到了哪些档的带（面板明细用，按组排序）。 */
export function coverageRows(profile, limit = 60) {
  const rows = []
  for (const c of CATALOG) {
    const per = profile?.bands?.[c.key]
    if (!per) continue
    const tiers = Object.keys(per)
    const total = tiers.reduce((s, t) => s + (per[t].n ?? 0), 0)
    if (!total) continue
    let lo = Infinity, hi = -Infinity, mean = 0
    for (const t of tiers) {
      lo = Math.min(lo, per[t].lo)
      hi = Math.max(hi, per[t].hi)
      mean += per[t].mean * (per[t].n ?? 0)
    }
    rows.push({
      key: c.key,
      label: c.label,
      group: c.group,
      groupLabel: GROUP_LABELS[c.group],
      tiers: tiers.map((t) => TIER_LABEL[t] ?? t),
      lo: round(lo, 3),
      hi: round(hi, 3),
      mean: round(mean / total, 3),
      n: total,
    })
  }
  rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || b.n - a.n)
  return rows.slice(0, limit)
}

/** 档样本数（画像学习时各段长档收到多少段）。 */
export function tierRows(profile) {
  const tiers = profile?.coverage?.tiers ?? {}
  return Object.keys(tiers).map((id) => ({ id, label: TIER_LABEL[id] ?? id, n: tiers[id] }))
}

const round = (v, d = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null)
export { round }
