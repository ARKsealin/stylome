// 句向量服务的 Node 端：py/embed_server.py 常驻进程，按行请求、按行返回，请求按到达顺序排队。
// 模型目录取 LITIDENTIFY_EMBED_MODEL，缺省为插件内 models/paraphrase-multilingual-MiniLM-L12-v2-onnx（随插件打包移植）
// （模型与语料一样留在项目根，不入插件包）；解释器取 LITIDENTIFY_PYTHON，缺省 python（须装 onnxruntime、tokenizers）。
// 服务起不来（缺解释器/缺依赖/缺模型）时进入失败态，调用方据此降级为插补模式，不影响主判别。

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embedSentences } from './stack/embed.mjs'
import { resolveEmbedModelDir } from './embedModel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'py', 'embed_server.py')

/** 模型目录：外部提供（env 或 ~/.stylome 缓存）；插件内不再内置。首跑下载见 embedModel.mjs。 */
export const embedModelDir = () => resolveEmbedModelDir()

export function startEmbedder(python = process.env.LITIDENTIFY_PYTHON || 'python', dir = embedModelDir()) {
  const proc = spawn(python, ['-I', '-u', SCRIPT, dir], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = createInterface({ input: proc.stdout })
  const pending = []
  let stderr = ''
  let failure = null
  const fail = (err) => {
    failure = failure ?? err
    for (const job of pending.splice(0)) job.reject(err)
  }
  proc.stderr.on('data', (b) => { stderr += b.toString('utf8') })
  proc.stdin.on('error', () => {}) // 子进程死亡后的 EPIPE 吞掉，由 exit 分支统一 reject
  proc.on('error', (e) => fail(new Error(`句向量服务无法启动（${python}）：${e.message}`)))
  rl.on('line', (line) => {
    const job = pending.shift()
    if (!job) return
    try {
      const r = JSON.parse(line)
      if (r.error) job.reject(new Error(`句向量服务出错：${r.error}`))
      else job.resolve(r)
    } catch { job.reject(new Error(`句向量服务返回无法解析：${line.slice(0, 200)}`)) }
  })
  proc.on('exit', (code) => {
    fail(new Error(`句向量服务退出（code ${code}）：${stderr.slice(-500)}`))
  })
  return {
    /** 一段文本的块表示与句间动态量（{mean, adj, adjSd, disp, n}）。 */
    embed(text) {
      return new Promise((resolve, reject) => {
        // 死亡守卫：子进程已退出（如缺模型目录）时快速失败，由调用方回落插补模式
        if (failure) { reject(failure); return }
        if (proc.exitCode !== null || proc.stdin.destroyed) {
          reject(new Error(`句向量服务已退出：${stderr.slice(-300)}`))
          return
        }
        pending.push({ resolve, reject })
        proc.stdin.write(JSON.stringify({ sents: embedSentences(text) }) + '\n')
      })
    },
    stop() { try { proc.stdin.end() } catch { /* 已退出时忽略 */ } },
  }
}
