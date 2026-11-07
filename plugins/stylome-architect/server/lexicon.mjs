// 大工情感词汇本体库（外部数据资源）：解析 → 就绪检测 → 缺失指引。与 embedding 模型同构。
// 仓库零出厂：不随包携带词典——官方条款为「仅供科研及教学使用」，未授予再分发权，
// 由用户自行从官方页获取后放置到用户级目录；env STYLOME_LEXICON 可直接指路。
//   官方页 https://ir.dlut.edu.cn/zyxz/qgbtk.htm ｜学术免费；商用致函 irlab@dlut.edu.cn
//   使用需引用：徐琳宏、林鸿飞、潘宇、任惠、陈建美《情感词汇本体的构造》
// 格式：官方表格的 CSV 化（词语,词性种类,词义数,词义序号,情感分类,强度,极性,辅助情感分类,…），
//       一词多义取首义、辅助情感不计——THEORY §五。兼容有无表头、CRLF、UTF-8 BOM。

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CAT7 } from './stack/registry.mjs'

export const LEXICON_FILE = 'dlut-emotion-lexicon.csv'
export const DLUT_PAGE = 'https://ir.dlut.edu.cn/zyxz/qgbtk.htm'

/** 词典路径（只解析，不读取）：env STYLOME_LEXICON > ~/.stylome/data/<file>。 */
export function resolveLexiconPath() {
  return process.env.STYLOME_LEXICON || join(homedir(), '.stylome', 'data', LEXICON_FILE)
}

export function lexiconReady(dir = resolveLexiconPath()) {
  return existsSync(dir)
}

/** 缺失/异常时的接入指引（对齐档案库空库三步指引风格）。 */
export const lexiconGuidance = (dir = resolveLexiconPath()) =>
  `未找到情感词典（${dir}）——出厂不携带该数据资源，三步接入：` +
  `① 从大连理工 IR Lab 官方页获取《情感词汇本体库》（${DLUT_PAGE}；仅供科研及教学使用，商用需致函 irlab@dlut.edu.cn） ` +
  `② 转存为 UTF-8 编码 CSV（列序按官方格式：词语,词性种类,词义数,词义序号,情感分类,强度,极性,…） ` +
  `③ 命名 ${LEXICON_FILE} 放入 ~/.stylome/data/（或 env STYLOME_LEXICON 直接指路）。` +
  `使用时请引用：徐琳宏、林鸿飞、潘宇、任惠、陈建美《情感词汇本体的构造》`

/** 装载大工词典（一词多义取首义、辅助情感不计——THEORY §五）。 */
export function loadLexicon() {
  const path = resolveLexiconPath()
  if (!lexiconReady(path)) throw new Error(lexiconGuidance(path))
  let raw = readFileSync(path, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1) // UTF-8 BOM
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.includes('词语')) lines.shift() // 有表头则跳过
  const dict = new Map()
  for (const l of lines) {
    if (!l?.trim()) continue
    const c = l.split(',')
    const w = (c[0] ?? '').trim()
    const cat = (c[4] ?? '').trim()
    const strength = Number(String(c[5] ?? '').trim())
    const pol = Number(String(c[6] ?? '').trim())
    if (!w || !CAT7[cat] || !Number.isFinite(strength) || !Number.isFinite(pol)) continue
    if (!dict.has(w)) dict.set(w, { cat7: CAT7[cat], strength, polarity: pol })
  }
  if (dict.size < 20000) throw new Error(`词典解析异常：${path} 只读出 ${dict.size} 词条（预期 ~27351）——请确认 CSV 为 UTF-8 编码且列序与官方格式一致`)
  return dict
}
