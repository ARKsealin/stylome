// .docx 的正文读取（不依赖 pandoc 或 Word）。
// .docx 是 zip：找到 word/document.xml，解压后按 <w:p> 分段、取 <w:t> 里的文字。
// 只读正文：页眉页脚、脚注、批注在别的部件里，不读（概述 §5 第 1 步“去噪”）；修订里删除的文字（w:delText）不取。

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

/** zip 里一个条目的内容。只支持 stored 与 deflate，不支持 zip64（.docx 用不到）。 */
export function zipEntry(buf, name) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('不是 zip 文件（没有中央目录）')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 中央目录损坏')
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const entry = buf.toString('utf8', p + 46, p + 46 + nlen)
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const data = buf.subarray(start, start + csize)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      throw new Error(`zip 条目 ${name} 的压缩方法 ${method} 不支持`)
    }
    p += 46 + nlen + xlen + clen
  }
  return null
}

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const decode = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e]))

/** document.xml → 段落数组。 */
export function docxParagraphs(xml) {
  const out = []
  let cur = '', inText = false
  for (const m of String(xml).matchAll(/<[^>]+>|[^<]+/g)) {
    const tok = m[0]
    if (tok[0] !== '<') { if (inText) cur += decode(tok); continue }
    const name = tok.match(/^<\/?([\w:]+)/)?.[1]
    const closing = tok.startsWith('</'), selfClosing = tok.endsWith('/>')
    if (name === 'w:t') inText = !closing && !selfClosing
    else if (name === 'w:p' && (closing || selfClosing)) { out.push(cur); cur = '' }
    else if (name === 'w:tab') cur += '\t'
    else if (name === 'w:br' || name === 'w:cr') cur += '\n'
  }
  if (cur) out.push(cur)
  return out
}

/** 读一个 .docx 文件的正文，段落之间空一行（与 .txt 语料的分段约定一致）。 */
export function readDocx(file) {
  const xml = zipEntry(readFileSync(file), 'word/document.xml')
  if (!xml) throw new Error(`${file} 里没有 word/document.xml`)
  return docxParagraphs(xml.toString('utf8')).map((p) => p.trim()).filter(Boolean).join('\n\n')
}
