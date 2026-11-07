// PDF 正文抽取的 Node 端：一次性调用 py/pdf_text.py（PyMuPDF → pypdf → pdfminer 依次尝试）。
// 与分词/句向量桥不同，PDF 只在面板打开文件时读一次，不起常驻进程。

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'py', 'pdf_text.py')

export function readPdf(file, python = process.env.LITIDENTIFY_PYTHON || 'python') {
  const r = spawnSync(python, ['-I', SCRIPT, file], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  if (r.error) throw new Error(`PDF 解析进程无法启动（${python}）：${r.error.message}`)
  const line = (r.stdout || '').trim().split(/\r?\n/).pop() || ''
  let parsed
  try { parsed = JSON.parse(line) } catch { throw new Error(`PDF 解析无有效输出：${(r.stderr || line).slice(0, 300)}`) }
  if (!parsed.ok) throw new Error('PDF 解析失败：' + parsed.error)
  return parsed.text
}
