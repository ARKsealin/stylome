// 外部句向量模型管理：解析 → 缺失时首跑下载 → 接入。
// 模型 = Xenova/paraphrase-multilingual-MiniLM-L12-v2 的 ONNX 转换（原版冻结编码器，Apache-2.0，
// 本家族不修改其权重——自有训练产物只有 model.json 的判别头）。
// 目录解析优先级：env STYLOME_EMBED_MODEL > env LITIDENTIFY_EMBED_MODEL > ~/.stylome/models/<id>
// 插件内不再内置模型（生产仓库零大二进制）；下载端点 hf-mirror → huggingface 依序回退，
// 可用 env STYLOME_HF_ENDPOINT 覆盖。

import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const EMB_MODEL_ID = 'paraphrase-multilingual-MiniLM-L12-v2-onnx'
const HF_REPO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
// 仓库内相对路径 → 落盘名（与 py/embed_server.py 的读取约定一致）
const FILES = [
  ['onnx/model.onnx', 'model.onnx'],
  ['tokenizer.json', 'tokenizer.json'],
  ['config.json', 'config.json'],
  ['special_tokens_map.json', 'special_tokens_map.json'],
  ['tokenizer_config.json', 'tokenizer_config.json'],
]

/** 外部模型目录（只解析，不下载）。 */
export function resolveEmbedModelDir() {
  return process.env.STYLOME_EMBED_MODEL
    || process.env.LITIDENTIFY_EMBED_MODEL
    || join(homedir(), '.stylome', 'models', EMB_MODEL_ID)
}

export function embedModelReady(dir = resolveEmbedModelDir()) {
  return existsSync(join(dir, 'model.onnx')) && existsSync(join(dir, 'tokenizer.json'))
}

async function downloadOne(endpoint, repoPath, dest) {
  const url = `${endpoint}/${HF_REPO}/resolve/main/${repoPath}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return dest
}

/**
 * 确保模型就绪：已就绪直接返回目录；缺失则下载到外部缓存（幂等，并发安全）。
 * @returns {Promise<string>} 模型目录
 * @throws 下载失败（离线/端点不可达）——调用方决定降级策略
 */
export function ensureEmbedModel({ log = () => {} } = {}) {
  ensureEmbedModel._promise ??= (async () => {
    const dir = resolveEmbedModelDir()
    if (embedModelReady(dir)) { log(`句向量模型已就绪：${dir}`); return dir }
    log(`句向量模型未找到（${dir}），开始下载 ${HF_REPO}（约 470MB，仅首次）…`)
    mkdirSync(dir, { recursive: true })
    const endpoints = [process.env.STYLOME_HF_ENDPOINT, 'https://hf-mirror.com', 'https://huggingface.co'].filter(Boolean)
    for (const [repoPath, name] of FILES) {
      const dest = join(dir, name)
      if (existsSync(dest) && name !== 'model.onnx') continue // 小文件已存在则跳过
      let lastErr = null
      for (const ep of endpoints) {
        try {
          log(`  ${name} ← ${ep}`)
          await downloadOne(ep, repoPath, dest)
          lastErr = null
          break
        } catch (e) { lastErr = e }
      }
      if (lastErr) {
        try { await (await import('node:fs/promises')).rm(join(tmpdir(), '.stylome-dl'), { force: true }) } catch { /* 清理忽略 */ }
        throw new Error(`下载失败：${name}（${lastErr.message}）——可离线部署：手动放置到 ${dir}，或 env STYLOME_EMBED_MODEL 指向已有模型目录`)
      }
    }
    if (!embedModelReady(dir)) throw new Error('下载完成但校验失败（缺 model.onnx/tokenizer.json）')
    log(`✓ 句向量模型已接入：${dir}`)
    return dir
  })()
  // 失败后允许重试：下次调用重新尝试下载
  ensureEmbedModel._promise.catch(() => { ensureEmbedModel._promise = null })
  return ensureEmbedModel._promise
}
