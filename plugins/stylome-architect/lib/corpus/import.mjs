// 语料导入。读一个目录里的纯文本，按空行分段、按字数切块，算每块的哈希。
// 语料只读不改：导入结果是一份清单，原文不动。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { blocks, charCount, paragraphs, normalize } from '../meter/segment.mjs'
import { readDoc } from './doc.mjs'
import { readDocx } from './docx.mjs'
import { readPdf } from './pdf.mjs'

// .docx 与 .doc 只读正文（脚注、页眉页脚不读）；.pdf 抽取文字层（扫描版无文字层会报错）
const TEXT_EXT = new Set(['.txt', '.md', '.docx', '.doc', '.pdf'])
// 目录里常见、但读不了的格式：导入时列出来，提醒用户另存为上面几种
const UNSUPPORTED = new Set(['.wps', '.pdf', '.rtf', '.odt', '.epub', '.pages'])

/** 读一个语料文件的正文原样（不统一标点）。.txt / .md 按 UTF-8 读，.docx 读 word/document.xml，.doc 读 WordDocument 流，.pdf 抽文字层。 */
export function readRaw(file) {
  const ext = extname(file).toLowerCase()
  if (ext === '.doc') return readDoc(file)
  if (ext === '.docx') return readDocx(file)
  if (ext === '.pdf') return readPdf(file)
  return readPlain(file)
}

/** 读一个语料文件的正文，统一换行与标点形式（测量用）。 */
export function readText(file) {
  return normalize(readRaw(file))
}

function readPlain(file) {
  return readFileSync(file, 'utf8').replace(/^﻿/, '')
}

/** 目录里有但读不了的文件，导入时报告给用户。 */
export function unsupportedFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (UNSUPPORTED.has(extname(name).toLowerCase())) out.push(relative(dir, p))
    }
  }
  walk(dir)
  return out
}

/** 递归列出目录下的文本文件，路径按字典序，结果可复现。 */
export function listTexts(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (TEXT_EXT.has(extname(name).toLowerCase())) out.push(p)
    }
  }
  walk(dir)
  return out
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/**
 * 导入一个作者的目录。
 * blockChars：每块的汉字数，默认 5000（设计 14 末：万字块不足 100 块时改用 5 千字）。
 * 返回 { author, files, blocks }。每个块带 source（相对路径）、index、text、chars、sha256。
 */
export function importCorpus(dir, { author, blockChars = 5000 } = {}) {
  const files = listTexts(dir)
  const out = []
  for (const f of files) {
    const text = readText(f)
    const rel = relative(dir, f)
    blocks(text, blockChars).forEach((b, i) => {
      out.push({ source: rel, index: i, text: b, chars: charCount(b), paragraphs: paragraphs(b).length, sha256: sha256(b) })
    })
  }
  return {
    author: author ?? dir,
    importedAt: null,
    totalChars: out.reduce((a, b) => a + b.chars, 0),
    blockChars,
    files: files.map((f) => relative(dir, f)),
    skipped: unsupportedFiles(dir),
    blocks: out,
    corpusSha256: sha256(out.map((b) => b.sha256).join('\n')),
  }
}
