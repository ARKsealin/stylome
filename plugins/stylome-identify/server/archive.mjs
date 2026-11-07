// 判别档案（存档与回放）：每篇文本的完整判别结果落档，之后可原样回放。
//   存档 = 整个 judge result JSON（含四态/判别器分项/逐窗光谱/雷达轴/证据表）+ 元数据
//          （textHash=清洗文本 sha256 前 16 位、modelVersion、来源、摘引 48 字）
//   回放 = 按 textHash（文件路径反查）或档案号取出，用同一个 render() 原样重渲染当时那份报告；
//          同一篇跨模型版本的多次判别形成历史序列（结论演变可查）。
// 位置：用户级 ~/.stylome/archive/identify（env STYLOME_ARCHIVE 覆盖）——被测文本不进任何插件工作区。

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FILE = 'judgments.jsonl'
export const archiveDir = () => process.env.STYLOME_ARCHIVE || join(homedir(), '.stylome', 'archive', 'identify')
const filePath = () => join(archiveDir(), FILE)

const readAll = () => {
  if (!existsSync(filePath())) return []
  return readFileSync(filePath(), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

/**
 * 存档一条判别结果。
 * @param {object} result Stack.judge 的完整结果（route 为 main/micro 且 grade ≠ 样本不足）
 * @param {{source?: string|null, textHash: string, excerpt: string, modelVersion: string}} meta
 * @returns {{id:string, at:string}}
 */
export function append(result, { source = null, textHash, excerpt = '', modelVersion = 'unknown' } = {}) {
  if (!textHash) throw new Error('存档需要 textHash')
  if (result.grade === '样本不足' || result.route === 'short') return null // 无结论不入档
  mkdirSync(archiveDir(), { recursive: true })
  const id = `${Date.now().toString(36)}-${textHash.slice(0, 8)}`
  const record = {
    id, at: new Date().toISOString(), textHash, source: source ?? null,
    excerpt: String(excerpt).slice(0, 48), modelVersion,
    pAI: result.pAI, grade: result.grade, verdict: result.sdn?.verdict ?? result.grade, route: result.route,
    result,
  }
  appendFileSync(filePath(), JSON.stringify(record) + '\n')
  return { id, at: record.at }
}

/** 某篇的判别历史（按 textHash，新→旧）。 */
export function historyOf(textHash) {
  return readAll().filter((r) => r.textHash === textHash).sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** 按档案号取单条。 */
export function get(id) {
  return readAll().find((r) => r.id === id) ?? null
}

/** 最近档案列表（新→旧）。 */
export function list({ limit = 20 } = {}) {
  return readAll().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit)
}

/** 档案总条数（面板计数用，不返回正文）。 */
export function count() {
  return readAll().length
}

/** 存档摘要行（list 用）。 */
export const summaryLine = (r) => `${r.at.slice(0, 16).replace('T', ' ')}  ${r.id}  ${String(r.pAI ?? '—').padEnd(6)}  ${r.verdict ?? r.grade}  模型 ${r.modelVersion}  ${r.source ?? r.excerpt}`
