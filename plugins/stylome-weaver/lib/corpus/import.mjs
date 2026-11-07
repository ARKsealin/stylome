// 正文导入：按扩展名选解析器，统一换行与标点形式。
// 只读不改：原文不动，解析结果交给测量层。
// （目录递归列举在 server/weaver.mjs 里做——那里还要统计文件大小与相对路径。）

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { normalize } from '../meter/segment.mjs'
import { readDoc } from './doc.mjs'
import { readDocx } from './docx.mjs'
import { readPdf } from './pdf.mjs'

/**
 * 读一个文件的正文原样（不统一标点）。
 * .txt / .md 按 UTF-8 读；.docx 读 word/document.xml；.doc 读 WordDocument 流；.pdf 抽文字层。
 */
export function readRaw(file) {
  const ext = extname(file).toLowerCase()
  if (ext === '.doc') return readDoc(file)
  if (ext === '.docx') return readDocx(file)
  if (ext === '.pdf') return readPdf(file)
  return readPlain(file)
}

/** 读一个文件的正文，统一换行、兼容标点与省略号写法（测量用）。 */
export function readText(file) {
  return normalize(readRaw(file))
}

function readPlain(file) {
  return readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
}
