// 作者风格画像：从参考样本的段落测量学出「每特征 × 每段长档」的分位带。
//
// 纪律（继承自 stylome 系列）：
//   1. 判定线全部来自参考分布本身（默认 α=0.10 → [5%, 95%] 分位带），代码里不手工设分数阈值；
//      用户唯一的旋钮是 α（带外概率预算）。
//   2. 画像 JSON 只含聚合统计（分位/均值/标准差/样本数）与作者元信息，
//      **永不包含任何原文、真实文件名或绝对路径**——样本目录只留最后一级名字。
//   3. 本包不携带任何预训练权重：没有任何内置画像文件，画像只能由用户提供的样本集训练得到。

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { CATALOG_KEYS, tierOf } from './catalog.mjs'

export const PROFILE_VERSION = 1
export const PROFILE_EXT = '.json'

const percentile = (sorted, q) => {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 默认画像目录：用户主目录下的 .stylome-weaver/profiles（运行期算出，不含硬编码绝对路径）。 */
export function defaultProfilesDir() {
  return join(homedir(), '.stylome-weaver', 'profiles')
}

/** 画像目录解析：空 → 默认目录；相对路径 → 按进程工作目录展开。 */
export function profilesDir(configured = '') {
  const raw = String(configured ?? '').trim()
  return raw ? resolve(raw) : defaultProfilesDir()
}

/** 作者名 → 文件名安全且稳定的 id。保留中文；只替换路径分隔符与文件系统保留字符。 */
export function slugify(name) {
  const s = String(name ?? '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 48)
  return s || 'author-' + Date.now().toString(36)
}

/** id 合法性：不允许路径分隔、点开头的隐藏文件与相对路径逃逸。 */
export function assertProfileId(id) {
  const raw = String(id ?? '')
  if (!raw) throw new Error('缺少画像 id')
  if (raw !== basename(raw) || raw.includes(sep) || raw.startsWith('.') || raw.length > 96) throw new Error('画像 id 不合法：' + raw)
  return raw
}

/**
 * 从段落测量单元学画像。
 * @param {Array<{han:number, features:object}>} units 可校验段落的测量结果
 * @param {object} opts { alpha=0.10, minN=30, exclude=[], source={}, author }
 * @returns {object} 可序列化画像（纯统计 + 元信息）
 */
export function learnProfile(units, { alpha = 0.1, minN = 30, exclude = [], source = {}, author = '', id = '' } = {}) {
  const a = Math.min(0.5, Math.max(0.01, Number(alpha) || 0.1))
  const qLo = a / 2, qHi = 1 - a / 2
  const excluded = [...exclude]
  const keys = CATALOG_KEYS.filter((k) => !excluded.includes(k))
  const byTier = new Map()
  for (const u of units) {
    if (!u?.features || !Number.isFinite(u.han)) continue
    const t = tierOf(u.han)
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t).push(u)
  }
  // 稀疏档合并：l 或 xl 任一低于 minN 时，两者池化为 'l' 档（长段文风连续，
  // 分档收益小于覆盖损失）；tierAlias 记录映射，校验端解析。
  const tierAlias = {}
  const nL = (byTier.get('l') ?? []).length, nXl = (byTier.get('xl') ?? []).length
  if ((nL > 0 || nXl > 0) && (nL < minN || nXl < minN)) {
    byTier.set('l', [...(byTier.get('l') ?? []), ...(byTier.get('xl') ?? [])])
    byTier.delete('xl')
    tierAlias.xl = 'l'
  }
  const bands = {}
  let covered = 0
  for (const key of keys) {
    const per = {}
    for (const [t, arr] of byTier) {
      const vals = arr.map((u) => u.features[key]).filter((v) => Number.isFinite(v))
      if (vals.length < minN) continue
      const sorted = [...vals].sort((x, y) => x - y)
      const mean = vals.reduce((s, x) => s + x, 0) / vals.length
      const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, vals.length - 1)) || 1e-9
      per[t] = { lo: round6(percentile(sorted, qLo)), hi: round6(percentile(sorted, qHi)), mean: round6(mean), sd: round6(sd), n: vals.length }
    }
    if (Object.keys(per).length) { bands[key] = per; covered++ }
  }
  const totalChars = units.reduce((s, u) => s + (Number.isFinite(u.han) ? u.han : 0), 0)
  return {
    version: PROFILE_VERSION,
    kind: 'author',
    id,
    author: String(author || '').trim() || id,
    createdAt: new Date().toISOString(),
    alpha: a,
    minN,
    minCheckChars: 60,
    source: { files: 0, paragraphs: units.length, chars: totalChars, ...source },
    excluded,
    tierAlias,
    bands,
    coverage: { features: covered, total: keys.length, tiers: Object.fromEntries([...byTier].map(([t, arr]) => [t, arr.length])) },
  }
}

const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : NaN)

/** 画像文件路径。 */
export function profilePath(dir, id) {
  return join(dir, assertProfileId(id) + PROFILE_EXT)
}

/** 校验画像结构；版本不符或没有可用带时抛错（调用方转成用户可见消息）。 */
export function validateProfile(p, label = '画像') {
  if (!p || typeof p !== 'object') throw new Error(`${label}内容不是对象`)
  if (p.version !== PROFILE_VERSION) throw new Error(`${label}版本不兼容（${p.version} ≠ ${PROFILE_VERSION}）`)
  if (!p.bands || typeof p.bands !== 'object' || !Object.keys(p.bands).length) throw new Error(`${label}没有可用的分位带`)
  return p
}

/** 读一份画像。 */
export function loadProfile(dir, id) {
  const file = profilePath(dir, id)
  if (!existsSync(file)) throw new Error('画像不存在：' + assertProfileId(id))
  let parsed
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { throw new Error('画像不是合法 JSON：' + (e?.message ?? e)) }
  return validateProfile(parsed, '画像')
}

/**
 * 写一份画像。同名 id 覆盖（同一位作者重训即更新），返回 { file, replaced }。
 * 先写临时文件再替换：中途失败不会留下半份画像。
 */
export function saveProfile(profile, dir, id) {
  const safe = assertProfileId(id)
  mkdirSync(dir, { recursive: true })
  const file = profilePath(dir, safe)
  const replaced = existsSync(file)
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(profile, null, 1), 'utf8')
  renameSync(tmp, file)
  return { file, replaced, id: safe }
}

/** 画像 id 列表（目录不存在时为空）。 */
export function profileIds(dir) {
  if (!existsSync(dir)) return []
  let names = []
  try { names = readdirSync(dir) } catch { return [] }
  return names
    .filter((n) => n.endsWith(PROFILE_EXT) && !n.endsWith('.tmp.json'))
    .map((n) => n.slice(0, -PROFILE_EXT.length))
    .filter((n) => n && !n.startsWith('.'))
    .sort()
}

/** 画像概要（列表页与工具输出用）。坏文件跳过并记入 broken，不让列表整体失败。 */
export function listProfiles(dir) {
  const out = []
  const broken = []
  for (const id of profileIds(dir)) {
    try {
      const p = loadProfile(dir, id)
      out.push(summaryOf(p, id))
    } catch (e) {
      broken.push({ id, error: String(e?.message ?? e) })
    }
  }
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id))
  return { dir, profiles: out, broken }
}

/** 一份画像的可列表概要（不含分位带明细）。 */
export function summaryOf(p, id = p.id) {
  const s = profileSummary(p)
  return {
    id,
    author: p.author || id,
    kind: p.kind ?? 'author',
    createdAt: p.createdAt ?? null,
    alpha: s.alpha,
    features: s.features,
    cells: s.cells,
    minN: s.minN,
    tiers: Object.keys(p.coverage?.tiers ?? {}),
    source: { files: p.source?.files ?? 0, paragraphs: p.source?.paragraphs ?? 0, chars: p.source?.chars ?? 0, folder: p.source?.folder ?? null },
  }
}

/** 画像覆盖摘要：特征数、带格数、最薄档样本数。 */
export function profileSummary(profile) {
  let cells = 0, min = Infinity
  for (const per of Object.values(profile.bands ?? {})) {
    cells += Object.keys(per).length
    for (const b of Object.values(per)) min = Math.min(min, b.n)
  }
  return {
    features: Object.keys(profile.bands ?? {}).length,
    cells,
    minN: Number.isFinite(min) ? min : 0,
    alpha: profile.alpha,
    kind: profile.kind ?? 'author',
  }
}

/** 删除一份画像，返回是否真的删掉了。 */
export function deleteProfile(dir, id) {
  const file = profilePath(dir, id)
  if (!existsSync(file)) return { id: assertProfileId(id), deleted: false }
  rmSync(file, { force: true })
  return { id: assertProfileId(id), deleted: true }
}
