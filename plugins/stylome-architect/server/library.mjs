// stylomeArchitect 档案库（library）：按作者分区存储作品集 + 每篇作品的信号档案（dossier）。
//
// 结构：
//   library/library.json                    注册表 { version, anchor, authors: {名: {works:[{name,file,han,addedAt}]}} }
//   library/<作者>/<作品>.dossier.json      workProfile 全量信号（零正文）
//   library/<作者>/<作品>.txt               清洗后正文副本（L2 回放/摘引用）
//
// 锚定：library.json.anchor = 唯一锚定作者名（用户标注，--lib-mark）。
// 迁移学习基座：输出 B 在"全部作者（除锚定）"的 dossier 信号空间里检索相似样本并回放。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename, extname, isAbsolute, resolve } from 'node:path'

export const LIB_VERSION = 1

/**
 * 档案库根目录（默认放在用户级数据目录，不写进安装目录）：
 *   env STYLOME_ARCHITECT_LIBRARY > ~/.stylome-architect/library
 * 插件 Config.libraryPath 与 --library 优先于此函数。
 */
export const defaultLibraryRoot = () => {
  const env = process.env.STYLOME_ARCHITECT_LIBRARY
  if (env && env.trim()) return resolve(env.trim())
  return join(homedir(), '.stylome-architect', 'library')
}

/** 配置/参数里的库目录 → 绝对路径（相对路径按进程工作目录展开；空值退回默认根）。 */
export const resolveLibraryRoot = (root) => {
  const v = typeof root === 'string' ? root.trim() : ''
  if (!v) return defaultLibraryRoot()
  return isAbsolute(v) ? v : resolve(v)
}

const TEXT_EXT = new Set(['.txt', '.md', '.docx', '.doc', '.pdf'])

export function libPaths(root) {
  return {
    registry: join(root, 'library.json'),
    authorDir: (a) => join(root, a),
    dossier: (a, w) => join(root, a, w + '.dossier.json'),
    text: (a, w) => join(root, a, w + '.txt'),
  }
}

export function loadLibrary(root = defaultLibraryRoot()) {
  const p = libPaths(root).registry
  if (!existsSync(p)) return { version: LIB_VERSION, anchor: null, authors: {} }
  const lib = JSON.parse(readFileSync(p, 'utf8'))
  if (lib.version !== LIB_VERSION) throw new Error(`档案库版本不兼容（${lib.version} ≠ ${LIB_VERSION}）`)
  return lib
}

export function saveLibrary(lib, root = defaultLibraryRoot()) {
  mkdirSync(root, { recursive: true })
  writeFileSync(libPaths(root).registry, JSON.stringify(lib, null, 1))
  return libPaths(root).registry
}

/** 摘要（doctor/list 用）。 */
export function librarySummary(lib) {
  const authors = Object.entries(lib.authors ?? {}).map(([name, a]) => ({ name, works: a.works.length, han: a.works.reduce((s, w) => s + (w.han ?? 0), 0) }))
  return { anchor: lib.anchor, authors, totalWorks: authors.reduce((s, a) => s + a.works, 0) }
}

/**
 * 收录作品：测量 → dossier + 正文副本 → 注册表更新。
 * @param {object[]} items [{name, text}]（text 已清洗）
 * @returns {{added:number, profiles:object[]}}
 */
export async function ingestWorks(root, author, items, { measure } = {}) {
  if (!measure) throw new Error('ingestWorks 需要 measure(text,name) 异步函数（返回 workProfile）')
  const paths = libPaths(root)
  mkdirSync(paths.authorDir(author), { recursive: true })
  const lib = loadLibrary(root)
  lib.authors[author] = lib.authors[author] ?? { works: [] }
  const known = new Set(lib.authors[author].works.map((w) => w.name))
  const profiles = []
  let added = 0
  for (const it of items) {
    const profile = await measure(it.text, it.name)
    // 重建 dossier 时保留已有回填数据：annotations（标注飞轮）与 neural（若本次未重算）
    const oldPath = paths.dossier(author, it.name)
    if (existsSync(oldPath)) {
      try {
        const old = JSON.parse(readFileSync(oldPath, 'utf8'))
        if (old.annotations) profile.annotations = old.annotations
        if (old.neural && !profile.neural) profile.neural = old.neural
      } catch { /* 旧 dossier 损坏则不保留 */ }
    }
    writeFileSync(paths.dossier(author, it.name), JSON.stringify(profile, null, 1))
    writeFileSync(paths.text(author, it.name), it.text)
    if (known.has(it.name)) {
      const w = lib.authors[author].works.find((x) => x.name === it.name)
      w.han = profile.han
      w.addedAt = w.addedAt ?? new Date().toISOString()
    } else {
      lib.authors[author].works.push({ name: it.name, han: profile.han, addedAt: new Date().toISOString() })
      added++
    }
    profiles.push(profile)
  }
  saveLibrary(lib, root)
  return { added, profiles }
}

/** 标注锚定作者（唯一；换标自动取消旧标）。 */
export function markAnchor(root, author) {
  const lib = loadLibrary(root)
  if (!lib.authors[author]) throw new Error(`档案库中没有作者「${author}」；先收录其作品`)
  lib.anchor = author
  saveLibrary(lib, root)
  return author
}

/** 读一个作者的全部 dossier（workProfile[]）。 */
export function loadDossiers(root, author) {
  const paths = libPaths(root)
  const lib = loadLibrary(root)
  const a = lib.authors[author]
  if (!a) return []
  return a.works
    .map((w) => {
      const p = paths.dossier(author, w.name)
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
    })
    .filter(Boolean)
}

/** 读全部作者的 dossier（扁平化，附 author 字段）。 */
export function allDossiers(root) {
  const lib = loadLibrary(root)
  const out = []
  for (const author of Object.keys(lib.authors ?? {})) {
    for (const d of loadDossiers(root, author)) out.push({ ...d, author })
  }
  return out
}

/** 目录直收（批量导入一个目录为一个作者的作品集）。 */
export function filesOf(dir) {
  return readdirSync(dir).filter((f) => TEXT_EXT.has(extname(f).toLowerCase())).map((f) => join(dir, f))
}
export { basename }
