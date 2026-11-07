// 判别服务（v2 §1 判别栈的对外接口）。
//
//   node server/server.mjs [--port 8731] [--host 127.0.0.1]
//
//   POST /judge   { "text": "..." }  → 判别结果（字段见 README）
//   GET  /model   → 模型卡与训练报告
//   GET  /health  → { ok, version }
//
// 默认只监听本机。请求体上限 2 MB。分词进程常驻，请求按到达顺序排队。
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Stack } from './stack/index.mjs'
import { Meter } from './meter.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const PORT = Number(arg('--port', 8731)), HOST = arg('--host', '127.0.0.1')
const MAX_BODY = 2 * 1024 * 1024

const stack = Stack.load(join(HERE, 'model.json'))
// train-report 是开发工作区的产物，不随插件发布；缺失时 /model 只回模型卡
const REPORT_PATH = join(HERE, 'train-report.json')
const report = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, 'utf8')) : null
const meter = new Meter()

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code } }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    // 超限时先回 413 再断开：直接 req.destroy() 会连同响应一起关掉，客户端收不到状态码
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { req.removeAllListeners('data'); req.resume(); reject(new HttpError(413, '请求体超过 2 MB')) } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...(code === 413 ? { connection: 'close' } : {}) })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, version: stack.model.version, trainedAt: stack.model.trainedAt })
    if (req.method === 'GET' && req.url === '/model') return send(200, { card: stack.model.card, report })
    if (req.method === 'POST' && req.url === '/judge') {
      let body
      try { body = JSON.parse(await readBody(req)) } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, '请求体不是合法 JSON') }
      if (typeof body?.text !== 'string' || !body.text.trim()) throw new HttpError(400, 'text 必须是非空字符串')
      return send(200, stack.judge(body.text, await meter.measure(body.text)))
    }
    throw new HttpError(404, '未知路径')
  } catch (e) {
    send(e.code ?? 500, { error: e.code ? e.message : `内部错误：${e.message}` })
  }
})

server.listen(PORT, HOST, () => console.log(`StylomeIdentify 判别服务 http://${HOST}:${PORT}（模型 ${stack.model.version}，训练于 ${stack.model.trainedAt}）`))
const shutdown = () => { meter.close(); server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
