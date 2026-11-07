// 编排层：从样本文件夹训练画像、把目标文档与画像比对成型。
// 只做数据加工与串行调度；测量核在 meter.mjs，统计在 profile.mjs / validate.mjs，
// 可读化在 metrics.mjs，SVG 在 radar.mjs。不碰模型、不起额外进程、不写样本目录。

import { readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { readText } from '../lib/corpus/import.mjs'
import { cleanText } from './clean.mjs'
import { validate } from './validate.mjs'
import { locatePara } from './locate.mjs'
import { learnProfile, saveProfile, profileSummary } from './profile.mjs'
import { buildFindings, summarizeAdvice, clampProblemZ } from './report.mjs'
import { coverageRows, documentFeatures, profileAxes, profileCards, profileKeywords, targetAxes, tierRows } from './metrics.mjs'
import { renderRadarSVG } from './radar.mjs'
import { GROUPS, GROUP_LABELS, MIN_CHECK_CHARS, tierOf } from './catalog.mjs'

/** 面板与工具共同支持的文件类型。 */
export const TEXT_EXTS = ['.txt', '.md', '.docx', '.doc', '.pdf']
const EXT_SET = new Set(TEXT_EXTS)
export const MAX_FILES = 200
const MAX_DEPTH = 3

/** 目录必须真实存在且是目录。 */
export function assertDir(dir) {
  const raw = String(dir ?? '').trim()
  if (!raw) throw new Error('缺少样本文件夹路径')
  let st
  try { st = statSync(raw) } catch { throw new Error('目录不存在：' + raw) }
  if (!st.isDirectory()) throw new Error('不是目录：' + raw)
  return raw
}

/** 递归列出目录里可读的样本文档（深度 ≤ 3，数量 ≤ maxFiles，按名字排序保证可复现）。 */
export function scanFolder(dir, { maxFiles = MAX_FILES, maxDepth = MAX_DEPTH } = {}) {
  const root = assertDir(dir)
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
      files.push({ name, path: p, rel: relative(root, p), ext, size: st.size })
    }
  }
  walk(root, 0)
  return { dir: root, files, total: seen.total, unsupported: seen.unsupported, truncated: files.length >= maxFiles, limit: maxFiles }
}

/** 训练前的快速判断：至少要有一份可读文档。 */
export function assertHasFiles(scan) {
  if (!scan.files.length) {
    throw new Error(`样本文件夹里没有可读文档（支持 ${TEXT_EXTS.join(' / ')}，深度 ≤ ${MAX_DEPTH}）`)
  }
  return scan
}

/**
 * 逐文件测段，收集可校验段落单元。
 * @param {object} args { files, meter, onProgress, cancel }
 * @returns {Promise<{units, paragraphs, chars, perFile, cancelled}>}
 */
export async function collectUnits({ files, meter, onProgress = () => {}, cancel = null }) {
  const units = []
  const perFile = []
  let paragraphs = 0
  let chars = 0
  let cancelled = false
  for (let i = 0; i < files.length; i++) {
    if (cancel?.()) { cancelled = true; break }
    const f = files[i]
    onProgress({ phase: 'measure', done: i, total: files.length, current: f.rel })
    try {
      const text = readText(f.path)
      const doc = await meter.document(text)
      const ok = doc.paras.filter((p) => p.checkable)
      for (const p of ok) units.push({ han: p.han, features: p.features })
      perFile.push({ rel: f.rel, name: f.name, paragraphs: doc.paras.length, checkable: ok.length, chars: doc.hanTotal, error: null })
      paragraphs += ok.length
      chars += doc.hanTotal
    } catch (e) {
      // 单文件读不了（加密 doc、扫描版 pdf 等）不中断训练：记录后继续。
      perFile.push({ rel: f.rel, name: f.name, paragraphs: 0, checkable: 0, chars: 0, error: String(e?.message ?? e) })
    }
    onProgress({ phase: 'measure', done: i + 1, total: files.length, current: f.rel, paragraphs })
  }
  return { units, paragraphs, chars, perFile, cancelled }
}

/**
 * 用样本文件夹训练一位作者的画像并存档。
 * @returns {Promise<object>} 面板/工具共用的训练结果
 */
export async function trainFromFolder({
  dir, author, alpha = 0.1, minN = 30, exclude = [], profileDir,
  meter, onProgress = () => {}, cancel = null, maxFiles = MAX_FILES,
}) {
  const scan = assertHasFiles(scanFolder(dir, { maxFiles }))
  onProgress({ phase: 'measure', done: 0, total: scan.files.length, current: null })
  const { units, paragraphs, chars, perFile, cancelled } = await collectUnits({ files: scan.files, meter, onProgress, cancel })
  if (cancelled) return { cancelled: true, files: scan.files.length, paragraphs, perFile }
  if (units.length < minN) {
    throw new Error(`可校验段落只有 ${units.length} 段（下限 ${minN}）：样本太少，分位带会偏噪。请补充更多参考文本（同类文体、单段 ≥ ${MIN_CHECK_CHARS} 字），或调低 minN。`)
  }
  const who = String(author || '').trim() || basename(scan.dir) || '未命名作者'
  const stats = learnProfile(units, {
    alpha, minN, exclude, author: who,
    source: { files: scan.files.length, paragraphs: units.length, chars, folder: basename(scan.dir) },
  })
  const id = profileIdOf(who)
  const profile = { ...stats, id }
  if (!Object.keys(profile.bands).length) {
    // 有段落但没有任何档达到 minN：说清缺什么，而不是留下一个空画像。
    const per = units.reduce((m, u) => {
      const t = tierOf(u.han)
      m[t] = (m[t] ?? 0) + 1
      return m
    }, {})
    const detail = Object.entries(per).map(([t, n]) => `${t} 档 ${n} 段`).join('、')
    throw new Error(`没有特征能建立分位带：每个段长档至少需要 ${minN} 个可校验段落，当前只有 ${detail}。请补充同文体的参考文本（单段 ≥ ${MIN_CHECK_CHARS} 汉字），或调低 minN（插件配置 minN / 工具参数 minN）。`)
  }
  const { file, replaced } = saveProfile(profile, profileDir, id)
  const saved = { ...profile, id }

  const axes = profileAxes(saved)
  const keywords = profileKeywords(saved)
  const cards = profileCards(saved)
  return {
    ok: true,
    cancelled: false,
    id,
    author: saved.author,
    profileDir,
    savedPath: file,
    replaced,
    files: scan.files.length,
    paragraphs: units.length,
    chars,
    minN,
    alpha: saved.alpha,
    summary: profileSummary(saved),
    coverage: saved.coverage,
    tiers: tierRows(saved),
    cards,
    keywords,
    axes,
    rows: coverageRows(saved, 24),
    perFile: perFile.slice(0, 60),
    skipped: perFile.filter((f) => f.error).slice(0, 20),
    svg: renderRadarSVG({
      axes: axes.map((a) => ({ key: a.key, label: a.label })),
      series: [{ key: 'profile', label: saved.author, tone: 'profile', values: Object.fromEntries(axes.map((a) => [a.key, a.value])), raw: Object.fromEntries(axes.map((a) => [a.key, a.raw])) }],
    }),
  }
}

/** 作者名 → 画像 id（与 profile.slugify 同规则；此处内联避免重复导入语义）。 */
function profileIdOf(name) {
  const s = String(name ?? '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 48)
  return s || 'author-' + Date.now().toString(36)
}

/**
 * 目标文档 × 画像：逐段校验 + 九轴对比 + 修改意见。
 * @param {object} args
 * @param {number} [args.problemZ=2] 问题段落阈值：段落最深越带 z ≥ 该值即列入（记录下限 z=1）
 * @returns {Promise<object>} 面板/工具共用的比对结果
 */
export async function compareDocument({ profile, profileId, text, source, meter, problemZ = 2 }) {
  const body = cleanText(text)
  if (!body.trim()) throw new Error('目标文档是空的')
  const doc = await meter.document(body)
  if (!doc.paras.length) throw new Error('目标文档没有可读段落')
  const validation = validate(doc.paras, profile)
  if (!validation.checked) {
    // 短段（如逐行短句、诗歌排版）对分档指标没有统计意义，宁可明确拒绝，也不给出空的「全部在带内」。
    throw new Error(`目标文档没有足量段落可供比对：每段至少 ${MIN_CHECK_CHARS} 汉字，当前 ${doc.paras.length} 段全部过短。请提供成篇正文（按空行分段，每段 ≥ ${MIN_CHECK_CHARS} 字）。`)
  }
  const z = clampProblemZ(problemZ)
  const evidences = []
  for (const r of validation.results) {
    if (!(r.zMax >= z)) continue // 定位只做「够得上阈值」的段落，省掉无关的分词
    const para = doc.paras[r.idx - 1]
    const ev = await locatePara(para, r.findings.filter((f) => f.severity !== 'mild'), meter)
    for (const e of ev) evidences.push({ idx: r.idx, evidence: e })
  }
  const findings = buildFindings({ source, doc, validation, evidences, profile, profileId, problemZ: z })
  const pAxes = profileAxes(profile)
  const feat = documentFeatures(doc)
  const tAxes = targetAxes(feat, pAxes)
  const groups = validation.rollup.groups
  const axes = pAxes.map((p, i) => {
    const t = tAxes[i]
    const g = groups[p.key]
    return {
      key: p.key,
      label: p.label,
      note: p.note,
      unit: p.unit,
      fmt: p.fmt,
      profile: p.value,
      target: t.value,
      rawProfile: p.raw,
      rawTarget: t.raw,
      band: p.band,
      deviation: t.deviation,
      n: g?.n ?? 0,
      zMean: g?.zMean ?? 0,
      zMax: g?.zMax ?? 0,
    }
  })
  // 问题段落 = 最深 z ≥ 阈值 的全部段落，不做条数配额：作品问题多就多列，少就少列。
  const problems = findings.paragraphs
  const svg = renderRadarSVG({
    axes: axes.map((a) => ({ key: a.key, label: a.label })),
    series: [
      { key: 'profile', label: `画像 · ${profile.author ?? profileId}`, tone: 'profile', values: Object.fromEntries(axes.map((a) => [a.key, a.profile])), raw: Object.fromEntries(axes.map((a) => [a.key, a.rawProfile])) },
      { key: 'target', label: '目标文档', tone: 'target', values: Object.fromEntries(axes.map((a) => [a.key, a.target])), raw: Object.fromEntries(axes.map((a) => [a.key, a.rawTarget])) },
    ],
  })
  return {
    ok: true,
    profile: { id: profileId, author: profile.author ?? profileId, alpha: profile.alpha, minN: profile.minN, features: Object.keys(profile.bands).length },
    document: {
      name: source ?? null,
      hanTotal: doc.hanTotal,
      paras: doc.paras.length,
      checked: validation.checked,
      skipped: validation.skipped,
      minCheckChars: MIN_CHECK_CHARS,
      verdicts: validation.rollup.verdicts,
    },
    axes,
    svg,
    problems,
    problemCount: problems.length,
    criterion: { problemZ: z, checked: validation.checked },
    advice: summarizeAdvice(problems),
    groupRows: GROUPS.filter((g) => groups[g]).map((g) => ({ key: g, label: GROUP_LABELS[g], ...groups[g] })),
    findings,
  }
}
