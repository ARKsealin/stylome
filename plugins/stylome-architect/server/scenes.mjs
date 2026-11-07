// stylomeArchitect 场景轨（神经标注轨的首次落地）：
//   ① 候选边界生成（sceneCandidates）：章节硬边界 + 段级嵌入语义不连续点（局部极小余弦）
//      + 对白结构突变——只产候选，终判归 agent（E4 教训：浅信号可当候选，不可当判定）
//   ② 场景级特征（sceneFeatures）：dossier.annotations.scene 存在时计算
//      全部零模型：长度分布 / 对白织体 / 场景开头类型 / 情绪强度分布 / 首尾场景对比

import { charCount } from '../lib/meter/segment.mjs'
import { startEmbedder } from './embedder.mjs'
import { defaultNeuralModelDir } from './neural.mjs'

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)) || 1e-9 }
const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] } return d / (Math.sqrt(na * nb) || 1e-9) }

/**
 * 场景候选边界（段号，即"边界前的最后一段"）。
 * @param {object[]} paras StreamMeter 段落流（含 text/dial/skip）
 * @param {number[]} chapters 已知章节硬边界
 * @param {object} opts { embed: async(paras)=>vector[]|null } 提供段向量则加语义候选
 * @returns {{candidates:number[], reasons:Map<number,string[]>}}
 */
export function sceneCandidates(paras, chapters = [], { embed = null } = {}) {
  const checked = paras.map((p, i) => ({ ...p, i })).filter((p) => !p.skip)
  const reasons = new Map()
  const add = (i, why) => { if (!reasons.has(i)) reasons.set(i, []); reasons.get(i).push(why) }
  for (const c of chapters) add(c, '章节标记')
  // ① 对白结构突变：dial 的 z 分数在 ±2 处
  const dials = checked.map((p) => p.dial ?? 0)
  const dmu = mean(dials), dsd = sdOf(dials)
  for (let k = 0; k + 1 < checked.length; k++) {
    const z1 = (dials[k] - dmu) / dsd, z2 = (dials[k + 1] - dmu) / dsd
    if (Math.abs(z1 - z2) >= 2) add(checked[k].i, `对白结构突变（dial ${Math.round(z1 * 100) / 100}→${Math.round(z2 * 100) / 100}σ）`)
  }
  // ② 语义不连续点：相邻段向量余弦的显著低谷（低于均值−1.5σ）
  if (embed) {
    // 同步注入：调用方先算好段向量
  }
  return { candidates: [...reasons.keys()].sort((a, b) => a - b), reasons }
}

/** 语义候选：段向量相邻余弦低谷（独立函数——需要嵌入桥，失败返回空）。 */
export async function semanticCandidates(paraVecs, paras) {
  if (!paraVecs || paraVecs.length < 8) return []
  const checkedIdx = paras.map((p, i) => ({ ...p, i })).filter((p) => !p.skip).map((p) => p.i)
  const sims = []
  for (let k = 1; k < paraVecs.length; k++) sims.push({ i: checkedIdx[k] - 1, d: 1 - cos(paraVecs[k - 1], paraVecs[k]) })
  const mu = mean(sims.map((x) => x.d)), sd = sdOf(sims.map((x) => x.d))
  return sims.filter((x) => x.d > mu + 1.5 * sd).map((x) => ({ idx: x.i, d: r4(x.d) }))
}

/**
 * 场景级特征（需 annotations.scene 升序段号数组；无标注返回 null）。
 * 段号语义 = 场景边界前的最后一段（与 annotate schema 一致）。
 * v2：逐场景 + 场景内轨迹（文学计算方法微缩版）+ 功能映射向量空间。
 *   trajectory  5 子块 valence 子弧 / 对白子弧 / 句长统计 / 新实体数 / 逐段对白条纹串 / 弧形标签
 *   funcVec     7 维功能向量 [位置, 情绪水平, 情绪斜率, 入跳变, 出跳变, 对白强度, 张力]
 *   funcLabel   10 类标准功能标签（规则引擎映射；agent 可经 sceneFunc 标注修正）
 */
export function sceneFeatures(paras, sceneBounds) {
  if (!sceneBounds?.length) return null
  const checked = paras.map((p, i) => ({ ...p, i })).filter((p) => !p.skip)
  const cuts = [...new Set(sceneBounds)].sort((a, b) => a - b)
  const scenes = []
  let cur = []
  for (const p of checked) {
    cur.push(p)
    if (cuts.includes(p.i)) { scenes.push(cur); cur = [] }
  }
  if (cur.length) scenes.push(cur)
  if (scenes.length < 2) return null
  const lens = scenes.map((s) => s.reduce((a, p) => a + p.han, 0))
  const valenceOf = (s) => { const pos = s.reduce((a, p) => a + p.pos, 0), neg = s.reduce((a, p) => a + p.neg, 0), han = s.reduce((a, p) => a + p.han, 0); return han ? (pos - neg) * 1000 / han : 0 }
  const dialOf = (s) => { const han = s.reduce((a, p) => a + p.han, 0); return han ? s.reduce((a, p) => a + (p.dial ?? 0) * p.han, 0) / han : 0 }
  const openers = scenes.map((s) => (s[0].dial > 0 ? '对白开场' : '叙述开场'))
  const scVal = scenes.map(valenceOf)
  // 场景内 5 子块轨迹 + 条纹
  const SUB = 5
  const subSplit = (s) => {
    const groups = Array.from({ length: SUB }, () => [])
    const total = s.reduce((a, p) => a + p.han, 0)
    let acc = 0
    for (const p of s) { groups[Math.min(SUB - 1, Math.floor((acc / total) * SUB))].push(p); acc += p.han }
    return groups
  }
  const perScene = scenes.map((s, i) => {
    const groups = subSplit(s)
    const v5 = groups.map((g) => r4(valenceOf(g)))
    const d5 = groups.map((g) => r4(dialOf(g)))
    const lensIn = s.map((p) => p.han)
    const stripes = s.map((p) => ((p.dial ?? 0) > 0 ? '1' : '0')).join('')
    let newEnt = 0
    for (const p of s) newEnt += Object.keys(p.ents ?? {}).length
    const numeric = v5.filter(Number.isFinite)
    const head = numeric[0] ?? 0, tail = numeric[numeric.length - 1] ?? 0
    const range = Math.max(...numeric) - Math.min(...numeric)
    const maxI = numeric.indexOf(Math.max(...numeric)), minI = numeric.indexOf(Math.min(...numeric))
    let shape = 'flat'
    if (range >= 25) {
      if (maxI === 0) shape = 'falling'
      else if (minI === 0) shape = 'rising'
      else if (maxI > 0 && maxI < numeric.length - 1) shape = 'peak'
      else if (minI > 0 && minI < numeric.length - 1) shape = 'valley'
      else shape = tail > head ? 'rising' : 'falling'
    }
    return {
      scene: i + 1, paras: `${s[0].i + 1}–${s[s.length - 1].i + 1}`, han: lens[i], dial: r4(dialOf(s)), valence: r4(scVal[i]), opener: openers[i],
      trajectory: { valence5: v5, dial5: d5, stripes, sentLenMean: r4(mean(lensIn)), sentLenCv: r4(sdOf(lensIn) / (mean(lensIn) || 1e-9)), newEnt, shape },
    }
  })
  // ── 功能映射向量空间（规则引擎，映射表预注册于 THEORY S8）──
  const vMean = mean(scVal)
  const funcOf = (i) => {
    const n = scenes.length
    const prev = i > 0 ? scVal[i - 1] : scVal[i]
    const next = i < n - 1 ? scVal[i + 1] : scVal[i]
    const slope = scVal[i] - prev
    const jumpOut = next - scVal[i]
    const traj = perScene[i].trajectory
    const intensity = (() => { const v = traj.valence5.filter(Number.isFinite); return v.length >= 2 ? sdOf(v) : 0 })()
    const vec = [r4((i + 0.5) / n), r4(scVal[i] / 100), r4(slope / 60), r4((scVal[i] - prev) / 60), r4(jumpOut / 60), r4(dialOf(scenes[i])), r4(intensity / 30)]
    const nv = traj.valence5.filter(Number.isFinite)
    const head = nv[0] ?? 0, tail = nv[nv.length - 1] ?? 0
    let label = 'DEVELOPMENT'
    if (i === 0) label = 'SETUP'
    else if (i === n - 1) label = 'CLOSING'
    else if (Math.abs(slope) >= 60) label = 'TURN'
    else if (scVal[i] >= Math.max(...scVal) - 1e-9 && intensity >= 15) label = 'CLIMAX'
    else if (scVal[i] <= Math.min(...scVal) + 1e-9 && i > 0 && i < n - 1) label = 'CRISIS'
    else if (Math.abs(jumpOut) >= 60) label = 'BRIDGE'
    else if (dialOf(scenes[i]) >= 0.3) label = 'EXCHANGE'
    else if (lens[i] < 0.5 * mean(lens)) label = 'INTERLUDE'
    else if (tail - head >= 30) label = 'ESCALATION'
    else if (head - tail >= 30) label = 'RELEASE'
    return { vec, label }
  }
  // ── 叙事动力学读者动力代理（Sternberg 三动力）──
  // 悬念 SUS：出口下钩（出跳变为负）越强越悬；好奇 CUR：新实体引入率；惊奇 SUR：入跳变绝对值
  const clamp01 = (v) => Math.max(0, Math.min(1, v))
  const newEntRate = (i) => { const s = scenes[i]; const han = s.reduce((a, p) => a + p.han, 0); const ne = s.reduce((a, p) => a + Object.keys(p.ents ?? {}).length, 0); return han ? (ne * 1000) / han : 0 }
  const dynOf = (i) => {
    const prev = i > 0 ? scVal[i - 1] : scVal[i]
    const jumpIn = scVal[i] - prev
    const jumpOut = (i < scenes.length - 1 ? scVal[i + 1] : scVal[i]) - scVal[i]
    const susp = clamp01(0.5 - jumpOut / 120)
    const cur = clamp01(newEntRate(i) / 10)
    const sur = clamp01(Math.abs(jumpIn) / 120)
    const tags = [['SUS', susp], ['CUR', cur], ['SUR', sur]].sort((a, b) => b[1] - a[1])
    return { susp: r4(susp), cur: r4(cur), sur: r4(sur), tag: tags[0][1] >= 0.55 ? tags[0][0] : null }
  }
  const eqOf = (label) => (label === 'SETUP' ? 'EQ' : label === 'CLOSING' ? 'NEWEQ' : (label === 'TURN' || label === 'CRISIS' || label === 'CLIMAX') ? 'DIST' : 'STRUGGLE')
  const funcs = perScene.map((_, i) => {
    const f = funcOf(i)
    const dyn = dynOf(i)
    // 功能向量 v2（10 维）：[位置, 情绪水平, 情绪斜率, 入跳变, 出跳变, 对白强度, 张力, 悬念, 好奇, 惊奇]
    const vec = [...f.vec, dyn.susp, dyn.cur, dyn.sur]
    return { vec, label: f.label, eq: eqOf(f.label), dyn }
  })
  perScene.forEach((s, i) => { s.funcVec = funcs[i].vec; s.funcLabel = funcs[i].label; s.dynLabel = `${funcs[i].eq}${funcs[i].dyn.tag ? '·' + funcs[i].dyn.tag : ''}`; s.dynamics = funcs[i].dyn })
  return {
    nScenes: scenes.length,
    sceneLen: { mean: r4(mean(lens)), cv: r4(sdOf(lens) / (mean(lens) || 1e-9)), max: Math.max(...lens), min: Math.min(...lens) },
    perScene,
    openerMix: { dialogue: openers.filter((o) => o === '对白开场').length, narration: openers.filter((o) => o === '叙述开场').length },
    valenceArcScene: scVal.map(r4),
    valenceSwing: r4(sdOf(scVal)),
    headTail: { head: r4(scVal[0]), tail: r4(scVal[scVal.length - 1]) },
    funcLegend: { SETUP: '开篇铺垫', DEVELOPMENT: '发展', ESCALATION: '推进', EXCHANGE: '交锋（对白场）', TURN: '转折', CLIMAX: '高潮', CRISIS: '低谷', BRIDGE: '桥段（出口跳变）', RELEASE: '释放/缓和', INTERLUDE: '插曲/过渡', CLOSING: '收束' },
    dynLegend: { EQ: '均衡（Todorov 日常态）', DIST: '失衡（事件打破）', STRUGGLE: '对抗/探究', NEWEQ: '新均衡（收束）', SUS: '悬念（Sternberg：知今未知果）', CUR: '好奇（知果未知因）', SUR: '惊奇（突揭）' },
  }
}

// ── 功能检索：按功能向量找"同功能"场景（标签一致加权；v2 十维含读者动力）──
const FUNC_SCALES = [0.35, 1.2, 1.0, 1.0, 1.0, 0.35, 0.8, 0.45, 0.45, 0.45]
export function funcDistance(qv, pv) {
  let s = 0
  for (let i = 0; i < qv.length; i++) s += ((qv[i] - pv[i]) / FUNC_SCALES[i]) ** 2
  return Math.sqrt(s)
}
export function sceneFunctionSearch(queryScene, pool, { excludeWork = null, topK = 2 } = {}) {
  return pool
    .filter((p) => !excludeWork || p.work !== excludeWork)
    .map((p) => ({
      work: p.work, author: p.author, scene: p.scene, paras: p.paras, han: p.han, valence: p.valence, dial: p.dial,
      funcLabel: p.funcLabel, distance: Math.round(funcDistance(queryScene.funcVec, p.funcVec) * 10000) / 10000,
      sameLabel: p.funcLabel === queryScene.funcLabel,
    }))
    .map((x) => ({ ...x, d: x.distance - (x.sameLabel ? 0.15 : 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, topK)
}
/** 功能差异 → 修改方向（取差异最大的两维给方向性意见）。 */
export function functionAdvice(queryScene, ref) {
  const NAMES = ['位置', '情绪水平', '情绪斜率', '入跳变', '出跳变', '对白强度', '场景内张力', '悬念维', '好奇维', '惊奇维']
  const diffs = queryScene.funcVec.map((v, i) => ({ i, d: v - (ref.funcVec?.[i] ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 2)
  const DIR = {
    1: (d) => d > 0 ? '本场景情绪浓度高于参考：可酌情收敛直陈情绪' : '本场景情绪浓度低于参考：可补情绪显影',
    5: (d) => d > 0 ? '对白密度高于参考：可部分转叙述' : '对白密度低于参考：可让人物开口',
    6: (d) => d > 0 ? '场景内波动高于参考：可匀化子块起伏' : '场景内波动低于参考：可在子块间制造起伏',
    2: (d) => d > 0 ? '相对前场的爬升快于参考：可放缓铺垫坡度' : '相对前场的爬升慢于参考：可提前埋转折引信',
    4: (d) => d > 0 ? '向后场的跳变强于参考：出口更陡，注意承接' : '向后场的跳变弱于参考：可加强出口钩子',
  }
  return diffs.map(({ i, d }) => (DIR[i] ? DIR[i](d) : `${NAMES[i]}维度差异（${d > 0 ? '+' : ''}${Math.round(d * 100) / 100}）`)).join('；')
}

/** 便捷：起嵌入桥算段向量（weave/候选生成用）。失败返回 null（优雅降级）。 */
export async function paraVectors(paras, python, modelDir = defaultNeuralModelDir()) {
  let emb = null
  try { emb = startEmbedder(python, modelDir) } catch { return null }
  try {
    const checked = paras.filter((p) => !p.skip && p.text)
    const vecs = []
    for (const p of checked) {
      const r = await emb.embed(p.text)
      if (!r.mean) continue
      const norm = Math.hypot(...r.mean) || 1
      vecs.push(r.mean.map((x) => x / norm))
    }
    return vecs.length >= 8 ? vecs : null
  } catch { return null } finally { try { emb.stop() } catch { /* 已退出 */ } }
}

// ── 逐场景比对与作品级场景距离 ──

const clamp2 = (v) => Math.min(2, v)

/**
 * 两个场景的距离：语义（嵌入余弦，双方都有时）+ 表面（valence/dial/长度）。
 * 无嵌入时退化为纯表面距离。
 */
export function sceneDistance(q, p) {
  const dv = Math.abs((q.valence ?? 0) - (p.valence ?? 0)) / 150
  const dd = Math.abs((q.dial ?? 0) - (p.dial ?? 0)) / 0.3
  const dl = Math.abs(Math.log(Math.max(1, q.han ?? 1)) - Math.log(Math.max(1, p.han ?? 1))) / 1.5
  if (q.emb && p.emb) {
    const sem = 1 - cos(q.emb, p.emb)
    return 0.55 * sem + 0.25 * clamp2(dv) + 0.12 * clamp2(dd) + 0.08 * clamp2(dl)
  }
  return 0.6 * clamp2(dv) + 0.25 * clamp2(dd) + 0.15 * clamp2(dl)
}

/**
 * 逐场景比对：被测文本的每个场景 → 全场景池中最近参考（跨作者）。
 * @param {object[]} queryScenes sceneFeatures().perScene（含 emb 则语义参检）
 * @param {object[]} pool scenePool() 输出
 * @param {object} opts { excludeWork } 排除自身作品
 * @returns {Array<{scene:number, matches:[{work,author,scene,paras,han,dial,valence,distance,emb?}]}>}
 */
export function perSceneCompare(queryScenes, pool, { excludeWork = null } = {}) {
  return queryScenes.map((q, i) => ({
    scene: i + 1,
    matches: pool
      .filter((p) => !excludeWork || p.work !== excludeWork)
      .map((p) => ({ work: p.work, author: p.author, scene: p.scene, paras: p.paras, han: p.han, dial: p.dial, valence: p.valence, distance: Math.round(sceneDistance(q, p) * 10000) / 10000 }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2),
  }))
}

/** 作品级场景手艺距离（迁移侧面用；任一方无 sceneFeat → Infinity 自动出局）。 */
export function sceneCraftDistance(a, b) {
  const fa = a.sceneFeat, fb = b.sceneFeat
  if (!fa || !fb) return Infinity
  const keys = [
    [fa.nScenes, fb.nScenes, 8],
    [fa.sceneLen.cv, fb.sceneLen.cv, 0.5],
    [fa.valenceSwing, fb.valenceSwing, 60],
    [(fa.openerMix?.dialogue ?? 0) / Math.max(1, fa.nScenes), (fb.openerMix?.dialogue ?? 0) / Math.max(1, fb.nScenes), 0.4],
  ]
  let s = 0
  for (const [x, y, scale] of keys) s += ((x - y) / scale) ** 2
  return Math.sqrt(s)
}

/**
 * 场景轨组装（weave 共用）：边界来源三选一——--scenes 文件 / 库内同名标注 / 候选+L2 请求。
 * 有边界时算 query 场景特征（神经轨可用则逐场景嵌入）并做全库逐场景比对。
 */
export async function buildSceneTrack({ profile, stream, libRoot, scenesFile = null, neural = false, python, modelDir = null }) {
  const { CHAPTER_RE } = await import('./stack/registry.mjs')
  const { scenePool } = await import('./annotation.mjs')
  const all = await import('./library.mjs')
  const own = all.allDossiers(libRoot).find((d) => d.name === profile.name.replace(/\.[^.]+$/, '') && d.sceneFeat)
  let bounds = null, boundsFrom = null
  if (scenesFile) { bounds = JSON.parse((await import('node:fs')).readFileSync(scenesFile, 'utf8')).scene; boundsFrom = '指定文件' }
  if (own && !bounds) {
    const pool = scenePool(libRoot)
    const matches = perSceneCompare(own.sceneFeat.perScene, pool, { excludeWork: own.name })
    const funcMatches = own.sceneFeat.perScene.map((q) => ({ scene: q.scene, label: q.funcLabel, matches: sceneFunctionSearch(q, pool, { excludeWork: own.name }) }))
    return { source: '库内标注', sceneFeat: own.sceneFeat, matches, funcMatches, entityTrack: own.annotations?.entityTrack ?? null }
  }
  if (!bounds) {
    const chapters = stream.paras.filter((p) => p.han < 30 && CHAPTER_RE.test(String(p.text ?? '').trim())).map((p) => p.idx)
    const cand = sceneCandidates(stream.paras, chapters)
    let sem = []
    if (neural || profile.neural) {
      const vecs = await paraVectors(stream.paras, python, modelDir)
      if (vecs) sem = await semanticCandidates(vecs, stream.paras)
    }
    return { source: '无标注——候选待 agent 确认', candidates: [...new Set([...cand.candidates, ...sem.map((s) => s.idx)])].sort((a, b) => a - b), reasons: Object.fromEntries(cand.reasons), semantic: sem }
  }
  const qFeat = sceneFeatures(stream.paras, bounds)
  if (!qFeat) return { source: boundsFrom, sceneFeat: null, note: '场景边界未产生有效场景（段流过短？）' }
  if (neural || profile.neural) {
    try {
      const { startEmbedder } = await import('./embedder.mjs')
      const e = startEmbedder(python, modelDir)
      for (const s of qFeat.perScene) {
        const [a, b] = s.paras.split('–').map(Number)
        const txt = stream.paras.slice(a - 1, b).map((q) => q.text).join('\n')
        try { const r = await e.embed(txt); if (r.mean) { const n2 = Math.hypot(...r.mean) || 1; s.emb = r.mean.map((x) => x / n2) } } catch { s.emb = null }
      }
      try { e.stop() } catch { /* 已退出 */ }
    } catch { /* 优雅降级 */ }
  }
  const matches = perSceneCompare(qFeat.perScene, scenePool(libRoot), { excludeWork: own?.name ?? null })
  const funcMatches = qFeat.perScene.map((q) => ({ scene: q.scene, label: q.funcLabel, matches: sceneFunctionSearch(q, scenePool(libRoot), { excludeWork: own?.name ?? null }) }))
  return { source: boundsFrom, sceneFeat: qFeat, matches, funcMatches }
}
