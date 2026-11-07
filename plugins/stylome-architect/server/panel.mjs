// DSH 面板数据层：档案库扫描、织体校验结果裁剪、已入档作品回放。
// 只做形状整理（正文与语料不出面板），不重复任何测量逻辑。

import { readdirSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { renderCharts } from './report.mjs'
import { L2_TASKS } from './stack/registry.mjs'

export const TEXT_EXTS = ['.txt', '.md', '.docx', '.doc', '.pdf']
const TEXT_SET = new Set(TEXT_EXTS)
export const MAX_SCAN_FILES = 200
export const SCAN_DEPTH = 3

/** 目录或文件列表 → 待收录的文本文件（递归深度 ≤ 3，结果可复现）。 */
export function scanFolder(target, { maxFiles = MAX_SCAN_FILES } = {}) {
  const root = resolve(target)
  const st = statSync(root)
  if (!st.isDirectory()) {
    if (!TEXT_SET.has(extname(root).toLowerCase())) throw new Error('不支持的文件格式：' + extname(root))
    const one = { path: root, name: basename(root), rel: basename(root), ext: extname(root).toLowerCase(), size: st.size }
    return { dir: root, isDir: false, files: [one], total: 1, unsupported: 0, truncated: false, limit: maxFiles }
  }
  const files = []
  let unsupported = 0
  let total = 0
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) { if (depth < SCAN_DEPTH) walk(p, depth + 1); continue }
      total++
      if (!TEXT_SET.has(extname(name).toLowerCase())) { unsupported++; continue }
      files.push({ path: p, name, rel: p.slice(root.length + 1), ext: extname(name).toLowerCase(), size: s.size })
    }
  }
  walk(root, 1)
  return { dir: root, isDir: true, files: files.slice(0, maxFiles), total, unsupported, truncated: files.length > maxFiles, limit: maxFiles }
}

/** 输入（目录或若干文件路径）→ 待收录文件列表。 */
export function collectInputs(inputs, { maxFiles = MAX_SCAN_FILES } = {}) {
  const out = []
  const seen = new Set()
  let truncated = false
  for (const input of inputs) {
    const abs = isAbsolute(input) ? input : resolve(input)
    const scan = scanFolder(abs, { maxFiles })
    truncated = truncated || scan.truncated
    for (const f of scan.files) {
      if (seen.has(f.path)) continue
      seen.add(f.path)
      out.push(f)
      if (out.length >= maxFiles) return { files: out, truncated: true }
    }
  }
  return { files: out, truncated }
}

/** weave 结果 → 面板载荷（正文不入面板；只留信号、证据与意见）。 */
export function weaveView(result, { name = null } = {}) {
  const { profile, rep, loc, self, transfer, suggestions, sceneTrack, charts } = result
  return {
    meta: {
      name: name ?? profile.name,
      han: profile.han, nPara: profile.nPara, nSent: profile.nSent,
      chapters: profile.chapters?.length ?? 0,
      anchor: rep.author, nWorks: rep.nWorks,
      pool: transfer?.pool ?? 0,
      neural: !!profile.neural?.binEmb,
    },
    self,
    loc: { nearest: loc.nearest, shape: loc.shape },
    suggestions,
    transfer,
    threads: {
      topEntities: (profile.topEntities ?? []).map((t) => ({ entity: t.entity, count: t.count, bins: t.bins })),
      echo: profile.echo, echoMiss: profile.echoMiss ?? [], gaps: profile.gaps ?? [],
      chapters: profile.chapters ?? [], minCount: profile.minCount,
    },
    arcs: { valence: profile.valenceArc, classes: profile.classArcs },
    rhythm: { H: profile.H, alphaSpan: profile.alphaSpan, altRate: profile.altRate, dialMean: profile.dialMean, dialCurve: profile.dialCurve },
    charts,
    sceneTrack,
    l2Tasks: L2_TASKS,
  }
}

/** 已入档作品 → 面板回放载荷（读 dossier，不重算）。 */
export function workView(dossier, { author = null } = {}) {
  const profile = dossier
  return {
    meta: {
      name: profile.name, author, han: profile.han, nPara: profile.nPara, nSent: profile.nSent,
      chapters: profile.chapters?.length ?? 0,
      scenes: profile.sceneFeat?.nScenes ?? 0,
      annotated: !!profile.annotations?.annotatedAt,
      neural: !!profile.neural?.binEmb,
    },
    threads: {
      topEntities: (profile.topEntities ?? []).map((t) => ({ entity: t.entity, count: t.count, bins: t.bins })),
      echo: profile.echo, echoMiss: profile.echoMiss ?? [], gaps: profile.gaps ?? [],
      chapters: profile.chapters ?? [], minCount: profile.minCount,
    },
    arcs: { valence: profile.valenceArc, classes: profile.classArcs },
    rhythm: { H: profile.H, alphaSpan: profile.alphaSpan, altRate: profile.altRate, dialMean: profile.dialMean, dialCurve: profile.dialCurve },
    charts: renderCharts(profile),
    sceneTrack: profile.sceneFeat ? { source: '库内标注', sceneFeat: profile.sceneFeat, entityTrack: profile.annotations?.entityTrack ?? null } : null,
    annotations: profile.annotations ?? null,
    l2Tasks: L2_TASKS,
  }
}
