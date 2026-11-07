// stylomeArchitect 核心层：作品档案（L1 测量 → 宏观特征）+ 经验库（repertoire）学习/装载 + 定位。
//
// 理论定位（THEORY.md §一）：情感弧线类特征是作品级表达信号；经验库刻画一位作者
// "如何用情绪节奏呈现叙事效果"的曲目范围；定位输出的是"这部作品落在作者经验空间的
// 哪个位置、复用哪些手法、哪些在曲目之外"，不是作者归属判定。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hurstDFA } from '../lib/meter/stats.mjs'
import { CHAPTER_RE, EMOTIONS7, BINS, PROFILE_KEYS, entityMinCount } from './stack/registry.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PROFILE_VERSION = 1
const DEFAULT_PROFILE = join(HERE, '..', 'models', 'repertoire.json')

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)) }
const pct = (sorted, q) => { const pos = (sorted.length - 1) * q; const lo = Math.floor(pos), hi = Math.ceil(pos); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo) }

// ── 作品档案 ──

/** 段落流 → bins（按汉字位置十分位）。 */
function binStream(paras, hanTotal, nBins = BINS) {
  const bins = Array.from({ length: nBins }, () => ({ han: 0, emo: Object.fromEntries(EMOTIONS7.map((m) => [m, 0])), pos: 0, neg: 0, dial: 0 }))
  let acc = 0
  for (const p of paras) {
    if (p.skip) continue
    const bi = Math.min(nBins - 1, Math.floor((acc / hanTotal) * nBins))
    bins[bi].han += p.han
    for (const m of EMOTIONS7) bins[bi].emo[m] += p.emo[m]
    bins[bi].pos += p.pos
    bins[bi].neg += p.neg
    bins[bi].dial += p.dial * p.han
    acc += p.han
  }
  return bins.map((b) => ({
    han: b.han,
    strength: EMOTIONS7.map((m) => (b.han ? b.emo[m] * 1000 / b.han : 0)),
    valence: b.han ? (b.pos - b.neg) * 1000 / b.han : 0,
    dial: b.han ? b.dial / b.han : 0,
  }))
}

/**
 * 作品档案（全部 L1 宏观特征）。
 * @param {{paras, hanTotal, sentLens}} stream StreamMeter.document 结果
 * @param {object} opts { name }
 */
export function workProfile(stream, { name = null } = {}) {
  const { paras, hanTotal, sentLens } = stream
  const checked = paras.filter((p) => !p.skip)
  const bins = binStream(paras, hanTotal)
  const S = bins.map((b) => b.strength)
  const R = S.flat().reduce((a, b) => a + b, 0)
  let Q = 0
  for (let k = 0; k + 1 < S.length; k++) for (let m = 0; m < 7; m++) Q += Math.abs(S[k + 1][m] - S[k][m])
  // 节奏：对白交替率 + 曲线
  const binFlag = checked.map((p) => (p.dial > 0 ? 1 : 0))
  let runs = binFlag.length ? 1 : 0
  for (let i = 1; i < binFlag.length; i++) if (binFlag[i] !== binFlag[i - 1]) runs++
  const altRate = binFlag.length ? runs / binFlag.length : null
  const dialCurve = bins.map((b) => r4(b.dial))
  const dialMean = r4(mean(bins.map((b) => b.dial)))
  // 宏观赫斯特 + α 跨度
  const H = r4(hurstDFA(sentLens))
  const chunk = Math.floor(sentLens.length / 8)
  const locals = []
  for (let c = 0; c < 8; c++) { const h = hurstDFA(sentLens.slice(c * chunk, (c + 1) * chunk)); if (Number.isFinite(h)) locals.push(h) }
  const alphaSpan = locals.length ? r4(Math.max(...locals) - Math.min(...locals)) : null
  // 线索：实体时间线 + 首尾呼应 + gap-return（次数下限按长度自适应）
  const minCount = entityMinCount(hanTotal)
  const total = {}
  for (const p of checked) for (const [e, c] of Object.entries(p.ents)) total[e] = (total[e] ?? 0) + c
  const top = Object.entries(total).filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]).map(([e]) => e)
  const presence = Object.fromEntries(top.map((e) => [e, Array(BINS).fill(0)]))
  let acc2 = 0
  for (const p of checked) {
    const bi = Math.min(BINS - 1, Math.floor((acc2 / hanTotal) * BINS))
    for (const [e, c] of Object.entries(p.ents)) if (presence[e]) presence[e][bi] += c
    acc2 += p.han
  }
  let echoHit = 0, echoElig = 0
  const gaps = []
  const echoMiss = [] // 开篇活跃、结尾未回归的实体——作者环式习惯下的未回收线索（修改建议靶点）
  for (const e of top.slice(0, 10)) {
    const b = presence[e].map((v) => v > 0)
    if (b.slice(0, 3).some(Boolean)) {
      echoElig++
      if (b.slice(7).some(Boolean)) echoHit++
      else {
        let last = 0
        for (let i = 0; i < BINS; i++) if (b[i]) last = i
        echoMiss.push({ entity: e, lastBin: last })
      }
    }
    let i = 0
    while (i < BINS) {
      if (!b[i]) { i++; continue }
      let j = i + 1
      while (j < BINS && !b[j]) j++
      if (j < BINS && j - i - 1 >= 2) gaps.push({ entity: e, from: i, to: j, gapBins: j - i - 1 })
      i = j
    }
  }
  const echo = echoElig ? r4(echoHit / echoElig) : null
  // 章节硬边界（L2 场景切分的输入）：短标题行本身会被 skip（可测段落 <20 汉字），
  // 所以判据不能用 !p.skip——只要「够短且形如章节标题」即为硬边界。
  const chapters = paras.filter((p) => p.han < 30 && CHAPTER_RE.test(String(p.text ?? '').trim())).map((p) => p.idx)
  return {
    name, han: hanTotal, nPara: paras.length, nSent: sentLens.length, minCount,
    R: r4(R), Q: r4(Q), H, alphaSpan, altRate: r4(altRate), dialMean, dialCurve,
    valenceArc: bins.map((b) => r4(b.valence)),
    classArcs: Object.fromEntries(EMOTIONS7.map((m, mi) => [m, bins.map((b) => r4(b.strength[mi]))])),
    echo, echoMiss, gaps, topEntities: top.slice(0, 15).map((e) => ({ entity: e, count: total[e], bins: presence[e] })),
    chapters,
  }
}

// ── 经验库（repertoire）──

const FLAT_KEYS = PROFILE_KEYS // [{key,label,band}]

/**
 * 从一位作者的多部作品学经验库。
 * @param {object[]} profiles workProfile[]
 * @param {object} opts { author, alpha=0.2 }
 * 少样本纪律：作品数 <6 时 band 用 [min,max] 全幅（不装分位——n 太小分位是假精确）。
 */
export function learnRepertoire(profiles, { author = 'anchor', alpha = 0.2 } = {}) {
  const works = profiles.filter((p) => Number.isFinite(p.R))
  const bands = {}
  for (const { key } of PROFILE_KEYS) {
    const vals = works.map((p) => p[key]).filter(Number.isFinite).sort((a, b) => a - b)
    if (!vals.length) continue
    bands[key] = works.length >= 6
      ? { lo: r4(pct(vals, alpha / 2)), hi: r4(pct(vals, 1 - alpha / 2)), min: r4(vals[0]), max: r4(vals[vals.length - 1]), n: vals.length, mode: 'percentile' }
      : { lo: r4(vals[0]), hi: r4(vals[vals.length - 1]), min: r4(vals[0]), max: r4(vals[vals.length - 1]), n: vals.length, mode: 'minmax' }
  }
  // 弧线形状簇：valence z 弧层次聚类 ≤4 簇，存簇心均值弧 + 成员作品名
  const zed = [] // { name, arc }
  for (const p of works) {
    const a = p.valenceArc ?? []
    if (a.length === BINS && a.some((v) => v !== null)) {
      const m = mean(a), s = sdOf(a) || 1
      zed.push({ name: p.name, arc: a.map((v) => (v - m) / s) })
    }
  }
  const k = Math.min(4, Math.max(1, Math.floor(zed.length / 3)))
  const clusters = kClusters(zed.map((z) => z.arc), k)
  // 把簇还原为成员名（kClusters 返回向量组；按引用找回名字）
  const nameOf = new Map(zed.map((z) => [z.arc, z.name]))
  const shapeClusters = clusters.map((members, ci) => ({
    id: ci,
    meanArc: Array.from({ length: BINS }, (_, bi) => r4(mean(members.map((a) => a[bi])))),
    members: members.map((a) => nameOf.get(a) ?? '?'),
  }))
  return {
    version: PROFILE_VERSION, kind: 'repertoire', author, createdAt: new Date().toISOString(), alpha,
    nWorks: works.length,
    bands,
    shapeClusters,
    // 定位用作品档案（聚合统计与弧线，无正文）
    works: works.map((p) => ({ name: p.name, han: p.han, R: p.R, Q: p.Q, H: p.H, alphaSpan: p.alphaSpan, altRate: p.altRate, echo: p.echo, dialMean: p.dialMean, dialCurve: p.dialCurve, valenceArc: p.valenceArc })),
  }
}

/** 平均连接层次聚类（返回簇的数组，每簇是向量数组）。 */
function kClusters(pts, k) {
  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0))
  const clusters = pts.map((p) => [p])
  while (clusters.length > k) {
    let bi = 0, bj = 1, bd = Infinity
    for (let a = 0; a < clusters.length; a++) for (let b = a + 1; b < clusters.length; b++) {
      let d = 0
      for (const x of clusters[a]) for (const y of clusters[b]) d += dist(x, y)
      d /= clusters[a].length * clusters[b].length
      if (d < bd) { bd = d; bi = a; bj = b }
    }
    clusters[bi] = clusters[bi].concat(clusters.splice(bj, 1)[0])
  }
  return clusters
}

/** 读经验库。 */
export function loadRepertoire(path = DEFAULT_PROFILE) {
  if (!existsSync(path)) throw new Error(`经验库不存在：${path}（先 --learn 学习作者曲目）`)
  const p = JSON.parse(readFileSync(path, 'utf8'))
  if (p.version !== PROFILE_VERSION) throw new Error(`经验库版本不兼容（${p.version} ≠ ${PROFILE_VERSION}）`)
  return p
}

/** 写经验库。 */
export function saveRepertoire(rep, path = DEFAULT_PROFILE) {
  writeFileSync(path, JSON.stringify(rep, null, 1))
  return path
}

// ── 定位 ──

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na * nb) || 1e-9)
}

/** 定位向量（按经验库带标准化：标量 z 到全幅 [0,1]，dialCurve 已是 0-1 直拼）。
 *  不标准化会被 R 的量纲支配（余弦全部≈1）——匹配失效。 */
function locVecOf(p, bands) {
  const scalars = FLAT_KEYS.map(({ key }) => {
    const band = bands[key]
    const v = p[key]
    if (!band || !Number.isFinite(v)) return 0.5
    const span = (band.max - band.min) || 1
    return Math.max(0, Math.min(1, (v - band.min) / span))
  })
  return scalars.concat(p.dialCurve ?? [])
}

/**
 * 在经验库中定位一部新作品：逐指标带内位置 + 最近曲目作品 + 弧线形状簇归属。
 * 返回定位证据（非隶属分）。
 */
export function locate(profile, rep) {
  const positions = {}
  for (const { key, label } of PROFILE_KEYS) {
    const band = rep.bands[key]
    const v = profile[key]
    if (!band || !Number.isFinite(v)) { positions[key] = { key, label, value: v ?? null, band: null, within: null, pos: null }; continue }
    const span = band.max - band.min
    const within = v >= band.lo && v <= band.hi
    positions[key] = {
      key, label, value: v, band: [band.lo, band.hi], range: [band.min, band.max], within,
      pos: span > 0 ? Math.round(Math.max(0, Math.min(1, (v - band.min) / span)) * 100) / 100 : 0.5,
      mode: band.mode,
    }
  }
  // 最近曲目作品（带标准化向量余弦，曲线与标量拼向量）
  const vec = locVecOf(profile, rep.bands)
  const nearest = rep.works
    .map((w) => ({ name: w.name, sim: r4(cosine(vec, locVecOf(w, rep.bands))) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
  // 弧线形状：与各簇心的距离
  const zSelf = (() => { const a = profile.valenceArc ?? []; if (a.length !== BINS || !a.some((v) => v !== null)) return null; const m = mean(a), s = sdOf(a) || 1; return a.map((v) => (v - m) / s) })()
  const shape = zSelf
    ? rep.shapeClusters.map((c) => ({ id: c.id, dist: r4(Math.sqrt(zSelf.reduce((s, v, i) => s + (v - c.meanArc[i]) ** 2, 0))) })).sort((a, b) => a.dist - b.dist)
    : null
  return { positions, nearest, shape }
}
