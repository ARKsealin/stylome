// 外部依赖自检与「用户确认 → 自动取回」闸门。
//
// 设计约定（与 lexicon.mjs / embedModel.mjs 的零出厂口径一致）：
//   · 两个外部数据资源都不随包分发：句向量模型（HuggingFace，约 470MB）与大工情感词典
//     （大连理工 IR Lab 官方附件，zip 内含 xls/xlsx）。缺失时不静默降级、不自动联网，
//     而是由自检整理成"需要用户确认"的待办，面板弹窗交给用户决定。
//   · 用户点「现在下载」后代为取回：模型走 embedModel.ensureEmbedModel；词典走官方附件
//     → 解包 → 转 UTF-8 CSV（py/import_lexicon.py）→ 写入用户目录 → 解析校验。
//     插件不转存、不再分发这些数据，只做本机放置。
//   · 工具 / CLI / doctor 只读：只报告状态与处置方式，不替用户做决定、不偷偷下载。
//
// 仅下载任务在内存里，插件重载即失效。

import { existsSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveLexiconPath, lexiconReady, loadLexicon, DLUT_PAGE, LEXICON_FILE } from './lexicon.mjs'
import { resolveEmbedModelDir, embedModelReady, ensureEmbedModel, EMB_MODEL_ID } from './embedModel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(HERE, '..')
export const LEXICON_IMPORT_SCRIPT = join(PKG_ROOT, 'py', 'import_lexicon.py')

/** 官方附件（情感词汇本体.zip，来自 ir.dlut.edu.cn 的下载页）；可用 env STYLOME_LEXICON_URL 覆盖。 */
export const LEXICON_ATTACHMENT_URL = 'https://ir.dlut.edu.cn/system/_content/download.jsp?urltype=news.DownloadAttachUrl&owner=1689718869&wbfileid=87CE2EA73EE62963B9AADA05CD3C60F8'
export const LEXICON_DETAIL_PAGE = 'https://ir.dlut.edu.cn/info/1013/1142.htm'

/** 句向量模型体积（下载前如实告知；取自 HF 仓库 model.onnx 的近似大小）。 */
export const EMBED_BYTES = 492830720
const EMBED_FILES = ['model.onnx', 'tokenizer.json', 'config.json', 'special_tokens_map.json', 'tokenizer_config.json']

export const embedModelPath = () => resolveEmbedModelDir()

const pyPath = () => process.env.STYLOME_ARCHITECT_PYTHON || process.env.STYLOME_PYTHON || process.env.LITIDENTIFY_PYTHON || 'python'

/** 词典状态：存在 + 体量合理 + 能装出 20000 条以上。 */
function lexiconStatus() {
  const path = resolveLexiconPath()
  if (!lexiconReady(path)) return { ok: false, detail: '未找到文件', path, entries: 0, bytes: 0 }
  let bytes = 0
  try { bytes = statSync(path).size } catch { /* 读不到按 0 处理 */ }
  if (bytes < 100_000) return { ok: false, detail: `文件过小（${bytes} 字节），疑似只放了一部分`, path, entries: 0, bytes }
  try {
    const dict = loadLexicon()
    return { ok: dict.size > 20000, detail: `${dict.size} 词条`, path, entries: dict.size, bytes }
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e), path, entries: 0, bytes }
  }
}

/**
 * 依赖清点。
 *   items[]   = { id, label, required, ok, detail, path, bytes, fix }
 *   needsUser = 需要用户确认/处理的 id（面板据此弹窗）
 *   blocking  = 缺失且阻断主功能的 id
 * fix.kind: 'download'（确认后代为取回） | 'manual'（须用户自行放置） | null
 */
export async function depReport() {
  const items = []

  const lex = lexiconStatus()
  items.push({
    id: 'lexicon',
    label: '大工情感词典',
    required: true,
    ok: lex.ok,
    detail: lex.detail,
    path: lex.path,
    bytes: lex.bytes || null,
    fix: lex.ok ? null : {
      kind: 'download',
      id: 'lexicon',
      path: lex.path,
      fileName: LEXICON_FILE,
      url: DLUT_PAGE,
      page: LEXICON_DETAIL_PAGE,
      note: '官方附件（情感词汇本体.zip）在你确认后代为取回并转成 UTF-8 CSV；也可自行下载后放到上面的路径。仅供科研及教学使用，使用请引用徐琳宏等《情感词汇本体的构造》。',
    },
  })

  const embPath = embedModelPath()
  let embOk = false
  try { embOk = embedModelReady(embPath) } catch { embOk = false }
  items.push({
    id: 'embedModel',
    label: '句向量模型（神经轨）',
    required: false,
    ok: embOk,
    detail: embOk ? '已就绪' : '未下载',
    path: embPath,
    bytes: EMBED_BYTES,
    fix: embOk ? null : { kind: 'download', id: EMB_MODEL_ID, bytes: EMBED_BYTES, path: embPath },
  })

  return {
    items,
    needsUser: items.filter((i) => !i.ok && i.fix).map((i) => i.id),
    blocking: items.filter((i) => !i.ok && i.required).map((i) => i.id),
  }
}

// ---------------- 下载任务（仅经用户确认后调用） ----------------

let job = null

const newJob = (kind) => {
  job = {
    id: Math.random().toString(36).slice(2, 10),
    kind, status: 'running', pct: 0, step: '准备下载',
    error: null, startedAt: Date.now(),
  }
  return job
}

const stepPctOf = (msg) => {
  const idx = EMBED_FILES.findIndex((f) => String(msg).includes(f))
  return idx < 0 ? null : Math.round(((idx + 0.5) / (EMBED_FILES.length + 1)) * 100)
}

function runPython(args, { timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(pyPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { try { p.kill() } catch { /* 已退出 */ } reject(new Error(`Python 转换超时（${timeoutMs} ms）`)) }, timeoutMs)
    p.stdout.on('data', (b) => { out += b.toString() })
    p.stderr.on('data', (b) => { err += b.toString() })
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`无法启动 Python（${pyPath()}）：${e.message}`)) })
    p.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(out.trim())
      reject(new Error((err || out || `exit ${code}`).trim().split('\n').slice(-3).join(' ')))
    })
  })
}

async function fetchLexiconInto(dest, { log }) {
  const url = process.env.STYLOME_LEXICON_URL || LEXICON_ATTACHMENT_URL
  log({ pct: 5, step: '连接官方附件' })
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (stylome-architect lexicon import)', referer: LEXICON_DETAIL_PAGE },
  })
  if (!res.ok) throw new Error(`官方附件下载失败：HTTP ${res.status}（可自行下载后放到期望路径）`)
  const total = Number(res.headers.get('content-length')) || 0
  const chunks = []
  let got = 0
  for await (const chunk of res.body) {
    chunks.push(chunk)
    got += chunk.length
    const mb = (got / 1048576).toFixed(1)
    log({ pct: total ? 5 + Math.round((got / total) * 65) : 40, step: `下载中 ${mb} MB` })
    if (got > 128 * 1024 * 1024) throw new Error('附件超过 128 MB，疑似地址不对（可用 env STYLOME_LEXICON_URL 指向正确附件）')
  }
  if (!got) throw new Error('官方附件为空')
  const buf = Buffer.concat(chunks)
  const tmp = join(tmpdir(), `stylome-lexicon-${Date.now()}.bin`)
  writeFileSync(tmp, buf)
  try {
    log({ pct: 75, step: '解包并转换为 UTF-8 CSV' })
    mkdirSync(dirname(dest), { recursive: true })
    const out = await runPython([LEXICON_IMPORT_SCRIPT, tmp, dest])
    let meta = null
    try { meta = JSON.parse(out) } catch { /* 脚本无输出也只影响日志 */ }
    log({ pct: 92, step: meta ? `已转换 ${meta.rows} 行` : '已转换' })
    return meta
  } finally {
    try { rmSync(tmp, { force: true }) } catch { /* 临时文件清理失败不影响结果 */ }
  }
}

/**
 * 用户确认后启动下载。id: 'lexicon' | 'embedModel'。
 * @returns {{jobId:string, kind:string, status:string, reused?:boolean, bytes?:number}}
 */
export function startDepsFetch(id) {
  if (id !== 'lexicon' && id !== 'embedModel') throw new Error('未知依赖：' + id)
  if (job && (job.status === 'running' || job.status === 'queued')) {
    if (job.kind === id) return { jobId: job.id, kind: job.kind, status: job.status, reused: true }
    throw new Error('已有另一个依赖正在下载，等它结束再试')
  }
  const j = newJob(id)
  const log = ({ pct, step }) => { if (pct != null) j.pct = Math.max(j.pct, Math.min(99, pct)); if (step) j.step = String(step) }
  ;(async () => {
    try {
      if (id === 'embedModel') {
        const dir = await ensureEmbedModel({ log: (m) => { const p = stepPctOf(m); log({ pct: p ?? j.pct, step: m }) } })
        j.path = dir
      } else {
        const dest = resolveLexiconPath()
        const meta = await fetchLexiconInto(dest, { log })
        const dict = loadLexicon()
        if (dict.size <= 20000) throw new Error(`转换后只读出 ${dict.size} 词条（预期约 27351）`)
        j.path = dest
        j.step = meta ? `已接入 ${dict.size} 词条` : `已接入 ${dict.size} 词条`
      }
      j.pct = 100
      j.status = 'done'
    } catch (e) {
      j.error = String(e?.message ?? e)
      j.status = 'error'
    }
  })()
  return { jobId: j.id, kind: id, status: 'running', bytes: id === 'embedModel' ? EMBED_BYTES : null }
}

/** 下载任务状态（面板轮询）。 */
export function depsFetchState(jobId = null) {
  if (!job) return { status: 'idle', error: null }
  if (jobId && jobId !== job.id) return { status: 'idle', error: null }
  return {
    jobId: job.id, kind: job.kind, status: job.status, pct: job.pct, step: job.step,
    error: job.error, path: job.path ?? null,
  }
}

/** 兼容旧入口名（面板/宿主历史调用）。 */
export const startEmbedFetch = () => startDepsFetch('embedModel')
export const embedFetchState = (jobId) => depsFetchState(jobId)

export { existsSync, LEXICON_FILE }
