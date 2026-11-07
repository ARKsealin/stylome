// 外部依赖自检与「用户确认」闸门（与 stylome 家族同款约定）。
//
//   · 句向量模型（约 470MB，可自动取回）缺失时**不静默降级**、也不在体检里偷偷下载：
//     面板弹窗列出来，等用户点「现在下载」才联网；
//   · onnxruntime / tokenizers 缺失给可复制的安装命令，用户装完点「重新检查」；
//   · 判别模型 model.json 随包分发，缺失属安装不完整——给出确切路径让用户重装。
//   · 工具、CLI、doctor 只读：报告状态与接入方式，不替用户做决定。

import { existsSync, statSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEmbedModelDir, embedModelReady, ensureEmbedModel, EMB_MODEL_ID } from './embedModel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_MODEL = join(HERE, 'model.json')
export const EMBED_BYTES = 492830720
const EMBED_FILES = ['model.onnx', 'tokenizer.json', 'config.json', 'special_tokens_map.json', 'tokenizer_config.json']

export const embedModelPath = () => resolveEmbedModelDir()

const pythonOf = () => process.env.LITIDENTIFY_PYTHON || 'python'

function onnxStatus(python) {
  try {
    const v = spawnSync(python, ['-I', '-c', 'import onnxruntime, tokenizers; print("ok")'], { encoding: 'utf8', timeout: 30000 })
    const ok = v.status === 0 && String(v.stdout || '').includes('ok')
    return { ok, detail: ok ? 'onnxruntime + tokenizers 可用' : String(v.stderr || '未安装').trim().slice(0, 160) }
  } catch (e) {
    return { ok: false, detail: '探测失败：' + (e?.message ?? e) }
  }
}

function modelStatus(modelPath) {
  if (!existsSync(modelPath)) return { ok: false, detail: '文件不存在' }
  try {
    const bytes = statSync(modelPath).size
    const model = JSON.parse(readFileSync(modelPath, 'utf8'))
    return { ok: true, detail: `${model.version ?? '?'} · ${(bytes / 1024 / 1024).toFixed(1)} MB`, bytes }
  } catch (e) {
    return { ok: false, detail: '无法解析：' + (e?.message ?? e) }
  }
}

/**
 * @returns {{items:Array, needsUser:string[], blocking:string[]}}
 * items[]: { id, label, required, ok, detail, path?, bytes?, fix }
 * fix.kind: 'download' | 'install' | 'manual' | null
 */
export async function depReport({ python = pythonOf(), modelPath = DEFAULT_MODEL } = {}) {
  const items = []

  const embPath = embedModelPath()
  let embOk = false
  try { embOk = embedModelReady(embPath) } catch { embOk = false }
  items.push({
    id: 'embedModel',
    label: '句向量模型',
    required: false,
    ok: embOk,
    detail: embOk ? '已就绪' : '未下载',
    path: embPath,
    bytes: EMBED_BYTES,
    fix: embOk ? null : { kind: 'download', id: EMB_MODEL_ID, bytes: EMBED_BYTES, path: embPath },
  })

  const onnx = onnxStatus(python)
  items.push({
    id: 'onnxruntime',
    label: 'onnxruntime + tokenizers（Python 包）',
    required: false,
    ok: onnx.ok,
    detail: onnx.detail,
    fix: onnx.ok ? null : { kind: 'install', command: 'pip install onnxruntime tokenizers', url: 'https://onnxruntime.ai/' },
  })

  const model = modelStatus(modelPath)
  items.push({
    id: 'model',
    label: '判别模型 model.json',
    required: true,
    ok: model.ok,
    detail: model.detail,
    path: modelPath,
    bytes: model.bytes ?? null,
    fix: model.ok ? null : { kind: 'manual', path: modelPath, note: '随包模型文件缺失或损坏，属安装不完整：重新安装本插件（或从发行包里取回 model.json 放回该路径）。' },
  })

  return {
    items,
    needsUser: items.filter((i) => !i.ok && i.fix).map((i) => i.id),
    blocking: items.filter((i) => !i.ok && i.required).map((i) => i.id),
  }
}

// ---------------- 句向量模型下载（仅经用户确认后调用） ----------------

let fetchJob = null
const stepPct = (msg) => {
  const idx = EMBED_FILES.findIndex((f) => String(msg).includes(f))
  return idx < 0 ? null : Math.round(((idx + 0.5) / (EMBED_FILES.length + 1)) * 100)
}

export function startEmbedFetch() {
  if (fetchJob && (fetchJob.status === 'running' || fetchJob.status === 'queued')) {
    return { jobId: fetchJob.id, status: fetchJob.status, bytes: EMBED_BYTES, reused: true }
  }
  const id = Math.random().toString(36).slice(2, 10)
  fetchJob = { id, status: 'running', pct: 0, step: '准备下载', error: null, path: embedModelPath(), bytes: EMBED_BYTES, startedAt: Date.now() }
  ;(async () => {
    try {
      const dir = await ensureEmbedModel({
        log: (m) => {
          fetchJob.step = String(m)
          const p = stepPct(m)
          if (p != null) fetchJob.pct = p
        },
      })
      fetchJob.path = dir
      fetchJob.pct = 100
      fetchJob.step = '已接入'
      fetchJob.status = 'done'
    } catch (e) {
      fetchJob.error = String(e?.message ?? e)
      fetchJob.status = 'error'
    }
  })()
  return { jobId: id, status: 'running', bytes: EMBED_BYTES }
}

export function embedFetchState(jobId = null) {
  if (!fetchJob) return { status: 'idle', error: null }
  if (jobId && jobId !== fetchJob.id) return { status: 'idle', error: null }
  return {
    jobId: fetchJob.id, status: fetchJob.status, pct: fetchJob.pct, step: fetchJob.step,
    error: fetchJob.error, path: fetchJob.path, bytes: fetchJob.bytes,
  }
}
