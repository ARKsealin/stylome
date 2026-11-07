// 分词服务的 Node 端。一个常驻 Python 进程，按行请求、按行返回。
// 进程由调用方持有，测试结束时关掉。
// 解释器缺失或进程崩溃时进入失败态：后续请求立即 reject，而不是让异常冒泡到宿主进程。

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'py', 'segment_server.py')

export function startSegmenter(python = 'python') {
  const proc = spawn(python, ['-I', '-u', SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
  const rl = createInterface({ input: proc.stdout })
  const pending = []
  let stderr = ''
  let failure = null
  const fail = (err) => {
    failure = failure ?? err
    for (const job of pending.splice(0)) job.reject(err)
  }
  proc.stderr.on('data', (b) => { stderr += b.toString('utf8') })
  proc.stdin.on('error', () => {}) // 子进程死亡后的 EPIPE 吞掉，由 exit 分支与死亡守卫统一 reject
  // spawn 本身失败（解释器不存在、无执行权限）只会发 error，不会发 exit：必须接住，否则进程级未捕获异常
  proc.on('error', (e) => fail(new Error(`分词服务无法启动（${python}）：${e.message}`)))
  rl.on('line', (line) => {
    const job = pending.shift()
    if (!job) return
    try { job.resolve(JSON.parse(line).tokens) }
    catch (e) { job.reject(new Error(`分词服务返回无法解析：${line.slice(0, 200)}`)) }
  })
  proc.on('exit', (code) => {
    fail(new Error(`分词服务退出（code ${code}）：${stderr.slice(-500)}`))
  })
  return {
    /** 一段文本的词与词性。文本里的换行会被去掉，因为协议以行为单位。 */
    async segment(text) {
      const clean = String(text).replace(/[\r\n]+/g, '')
      return new Promise((resolve, reject) => {
        // 死亡守卫：子进程已退出（如 jieba 缺失）时快速失败，避免写死管道悬挂
        if (failure) { reject(failure); return }
        if (proc.exitCode !== null || proc.stdin.destroyed) {
          reject(new Error(`分词服务已退出（jieba 是否可用？）：${stderr.slice(-300)}`))
          return
        }
        pending.push({ resolve, reject })
        proc.stdin.write(clean + '\n')
      })
    },
    stop() { try { proc.stdin.end() } catch { /* 已退出时忽略 */ } },
  }
}
