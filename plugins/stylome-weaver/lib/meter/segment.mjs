// 文本切分：章、段、句、小句。确定性，不依赖分词。
// 中文句号句内部由逗号切成小句，节奏主要在小句层（设计 14.6）。

const SENT_END = /[。！？!?…]+/u
const CLAUSE_SPLIT = /[，、；;,]/u

// 小号与兼容形式的标点（WPS、旧排版软件导出时常见）→ 通用的全角标点，否则句读与标点计数认不出它们
const COMPAT = { '﹐': '，', '﹑': '、', '﹒': '。', '﹔': '；', '﹕': '：', '﹖': '？', '﹗': '！', '﹙': '（', '﹚': '）', '﹝': '〔', '﹞': '〕', '︰': '：' }
const COMPAT_RE = new RegExp(`[${Object.keys(COMPAT).join('')}]`, 'gu')
// 省略号的各种写法（"..."、"。。。"、"···"、单个 "…"）统一成 "……"：测量只关心有没有省略，不关心写法；
// 写法本身是作者的表面习惯，由 corpus/habits.mjs 从原文单独统计，风格清洗时再还原
const ELLIPSIS_RE = /\.{3,}|。{3,}|·{3,}|…+/gu

/** 去掉 BOM、统一换行、把兼容形式的标点换成通用标点、统一省略号。 */
export function normalize(text) {
  return normalizeBase(text).replace(COMPAT_RE, (c) => COMPAT[c]).replace(ELLIPSIS_RE, '……')
}

function normalizeBase(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/** 按空行分段；段内换行合并为空格，空白段丢弃。 */
export function paragraphs(text) {
  return normalize(text)
    .split(/\n\s*\n/u)
    .map((p) => p.replace(/\s+/gu, '').trim())
    .filter((p) => p.length > 0)
}

/** 句子：以句末标点切分，标点归入前一句。没有句末标点的整段算一句。 */
export function sentences(text) {
  const src = typeof text === 'string' ? paragraphs(text).join('') : text
  const out = []
  let buf = ''
  for (const ch of src) {
    buf += ch
    if (SENT_END.test(ch)) { out.push(buf); buf = '' }
  }
  if (buf.trim()) out.push(buf)
  return out.filter((s) => s.length > 0)
}

/** 小句：逗号、顿号、分号切分。 */
export function clauses(sentence) {
  const out = []
  let buf = ''
  for (const ch of sentence) {
    if (CLAUSE_SPLIT.test(ch)) { if (buf) out.push(buf); buf = '' }
    else buf += ch
  }
  if (buf) out.push(buf)
  return out
}

/** 汉字数（不含标点与空白），所有“字数”口径都用它。 */
export function charCount(text) {
  const m = String(text).match(/\p{Script=Han}/gu)
  return m ? m.length : 0
}

/** 等长切块，按汉字计。末块不足 minKeep 时并入前一块。 */
export function blocks(text, size = 10000, minKeep = 0.5) {
  const paras = paragraphs(text)
  const out = []
  let cur = [], n = 0
  const flush = () => { if (cur.length) out.push(cur.join('\n\n')); cur = []; n = 0 }
  for (const p of paras) {
    cur.push(p)
    n += charCount(p)
    if (n >= size) flush()
  }
  if (cur.length) {
    if (out.length && n < size * minKeep) out[out.length - 1] += '\n\n' + cur.join('\n\n')
    else flush()
  }
  return out
}
