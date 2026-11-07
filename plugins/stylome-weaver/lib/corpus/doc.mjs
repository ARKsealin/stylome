// 旧版 Word 二进制格式（.doc）的正文读取，不依赖 Word 或其他程序：
//   [MS-CFB] 复合文档 → WordDocument 流与表流；[MS-DOC] 的 FIB → piece table（Clx）→ 正文字符。
// 只取主文档正文（字符位置 0 到 ccpText），脚注、页眉页脚、批注不取，与 .docx 的读取一致。
// 域代码（0x13 与 0x14 之间）去掉、域结果保留；图片与对象占位符、脚注与批注引用标记去掉。
// 加密文档读不了，抛错。

import { readFileSync } from 'node:fs'

const MAXREG = 0xFFFFFFFA
const latin = new TextDecoder('windows-1252')

/** 复合文档里的全部流：名字 → Buffer。 */
export function cfbStreams(buf) {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xE011CFD0 || buf.readUInt32LE(4) !== 0xE11AB1A1) throw new Error('不是 OLE 复合文档')
  const ss = 1 << buf.readUInt16LE(0x1E), ms = 1 << buf.readUInt16LE(0x20)
  const sector = (n) => buf.subarray((n + 1) * ss, (n + 2) * ss)
  // FAT 扇区表：头部 109 项，之后沿 DIFAT 链
  const fatSectors = []
  for (let i = 0; i < 109; i++) { const s = buf.readUInt32LE(0x4C + i * 4); if (s < MAXREG) fatSectors.push(s) }
  for (let d = buf.readUInt32LE(0x44), nd = buf.readUInt32LE(0x48); nd > 0 && d < MAXREG; nd--) {
    const sec = sector(d), per = ss / 4 - 1
    for (let i = 0; i < per; i++) { const s = sec.readUInt32LE(i * 4); if (s < MAXREG) fatSectors.push(s) }
    d = sec.readUInt32LE(per * 4)
  }
  const per = ss / 4
  const fat = new Uint32Array(fatSectors.length * per)
  fatSectors.forEach((s, k) => { const sec = sector(s); for (let i = 0; i < per; i++) fat[k * per + i] = sec.readUInt32LE(i * 4) })
  // 链长不超过表长：损坏的文件不会让这里死循环
  const chain = (start, table) => { const out = []; for (let s = start; s < MAXREG && out.length <= table.length; s = table[s]) out.push(s); return out }
  const readChain = (start) => Buffer.concat(chain(start, fat).map(sector))
  const dir = readChain(buf.readUInt32LE(0x30))
  const entries = []
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const type = dir[off + 0x42]
    if (type === 0) continue
    const nlen = dir.readUInt16LE(off + 0x40)
    entries.push({ name: dir.toString('utf16le', off, off + Math.max(0, nlen - 2)), type, start: dir.readUInt32LE(off + 0x74), size: dir.readUInt32LE(off + 0x78) })
  }
  const root = entries.find((e) => e.type === 5)
  const miniStream = root && root.start < MAXREG ? readChain(root.start).subarray(0, root.size) : Buffer.alloc(0)
  const mfBuf = buf.readUInt32LE(0x40) > 0 ? readChain(buf.readUInt32LE(0x3C)) : Buffer.alloc(0)
  const miniFat = new Uint32Array(mfBuf.length / 4)
  for (let i = 0; i < miniFat.length; i++) miniFat[i] = mfBuf.readUInt32LE(i * 4)
  const cutoff = buf.readUInt32LE(0x38)
  const out = new Map()
  for (const e of entries) {
    if (e.type !== 2) continue
    const data = e.size < cutoff ? Buffer.concat(chain(e.start, miniFat).map((m) => miniStream.subarray(m * ms, (m + 1) * ms))) : readChain(e.start)
    out.set(e.name, data.subarray(0, e.size))
  }
  return out
}

/** 去掉域代码与控制字符，按段落标记分段，段落之间空一行。 */
export function cleanSpecial(raw) {
  const stack = []
  let out = ''
  for (const ch of raw) {
    const c = ch.charCodeAt(0)
    if (c === 0x13) { stack.push('code'); continue }
    if (c === 0x14) { if (stack.length) stack[stack.length - 1] = 'result'; continue }
    if (c === 0x15) { stack.pop(); continue }
    if (stack.includes('code')) continue
    if (c === 0x0D || c === 0x07 || c === 0x0C) out += '\n'
    else if (c === 0x0B || c === 0xA0) out += ' '
    else if (c === 0x1E) out += '-'
    else if (c >= 0x20 || c === 0x09) out += ch
  }
  return out.split('\n').map((s) => s.trim()).filter(Boolean).join('\n\n')
}

/** 读一个 .doc 文件的正文。 */
export function readDoc(file) {
  const streams = cfbStreams(readFileSync(file))
  const wd = streams.get('WordDocument')
  if (!wd || wd.readUInt16LE(0) !== 0xA5EC) throw new Error(`${file} 不是 Word 文档（没有 WordDocument 流）`)
  const flags = wd.readUInt16LE(0x0A)
  if (flags & 0x0100) throw new Error(`${file} 已加密，无法读取`)
  const table = streams.get(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new Error(`${file} 缺少表流`)
  // FIB：FibBase 32 字节，之后依次是 csw、fibRgW、cslw、fibRgLw、cbRgFcLcb、fibRgFcLcb
  const csw = wd.readUInt16LE(32), cslwAt = 34 + csw * 2, lw = cslwAt + 2, blob = lw + wd.readUInt16LE(cslwAt) * 4 + 2
  const ccpText = wd.readInt32LE(lw + 12)
  const fcClx = wd.readUInt32LE(blob + 33 * 8), lcbClx = wd.readUInt32LE(blob + 33 * 8 + 4)
  let p = fcClx
  while (p < fcClx + lcbClx && table[p] === 0x01) p += 3 + table.readUInt16LE(p + 1)
  if (table[p] !== 0x02) throw new Error(`${file} 的 piece table 格式不对`)
  const plc = p + 5, n = (table.readUInt32LE(p + 1) - 4) / 12
  let raw = ''
  for (let i = 0; i < n; i++) {
    const a = table.readUInt32LE(plc + i * 4), b = table.readUInt32LE(plc + (i + 1) * 4)
    if (a >= ccpText) break
    const len = Math.min(b, ccpText) - a
    const v = table.readUInt32LE(plc + (n + 1) * 4 + i * 8 + 2), fc = v & 0x3FFFFFFF
    raw += v & 0x40000000 ? latin.decode(wd.subarray(fc / 2, fc / 2 + len)) : wd.toString('utf16le', fc, fc + 2 * len)
  }
  return cleanSpecial(raw)
}
