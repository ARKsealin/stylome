// stylomeIdentify 的 DSH 插件入口。
//
// 判别栈在本进程内运行：模型随包（server/model.json），分词与句向量走 py/ 下的常驻桥进程。
// 桥进程按需拉起（第一次判别时），插件卸载时关闭；解释器缺失或桥死亡只让这一次判别失败，
// 不会把异常抛进宿主进程。
//
// 对外三个面：
//   工具 stylome_identify —— 模型侧判别入口（文本或文件，返回完整证据报告）
//   工具 stylome_identify_doctor —— 运行环境体检，判别失败时先查这个
//   命令 /identify —— 用户侧入口（doctor / model / <文件路径>）
//
// 判别口径、特征与阈值说明见 README.md；模型是唯一随版本更新的资产。

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { Stack } from './server/stack/index.mjs'
import { Meter } from './server/meter.mjs'
import { readRaw } from './lib/corpus/import.mjs'
import { cleanText } from './server/stack/clean.mjs'
import { render, renderModel } from './server/report.mjs'
import { doctor, renderDoctor, DEFAULT_MODEL, defaultPython } from './server/doctor.mjs'
import * as archive from './server/archive.mjs'
import { depReport, startEmbedFetch, embedFetchState } from './server/deps.mjs'
import { PANEL_EXTS, scanFolder, shapeError, shapeResult, summarize, thresholdSnapshot, stateOf } from './server/panel.mjs'

export const name = 'stylome-identify'
export const inject = ['tools']

export const Config = z.object({
  python: z.string().default('').description('分词与句向量所用的 Python 解释器；空则用环境变量 LITIDENTIFY_PYTHON，再缺省为 python'),
  modelPath: z.string().default('').description('判别模型 model.json 的路径；空则用插件自带的 server/model.json'),
  maxChars: z.number().default(200000).description('单次判别允许的最大字符数；超过直接报错，不做截断判别'),
  timeoutMs: z.number().default(600000).description('单次判别的超时（毫秒），含分词与句向量'),
  archive: z.boolean().default(true).description('判别结果自动存档（用户级 ~/.stylome/archive/identify，可回放）'),
}).default({})

export function apply(ctx, config) {
  let stack = null
  let stackPath = null
  let meter = null
  // 判别串行执行：分词桥与句向量桥都是单管道，且失败时整条链路要一起重建。
  let chain = Promise.resolve()

  const loadStack = () => {
    const path = config.modelPath || DEFAULT_MODEL
    if (!stack || stackPath !== path) {
      stack = Stack.load(path)
      stackPath = path
    }
    return stack
  }
  const ensureMeter = () => {
    if (!meter) meter = new Meter(config.python || defaultPython())
    return meter
  }
  const dropMeter = () => {
    const m = meter
    meter = null
    try { m?.close() } catch { /* 桥已退出时忽略 */ }
  }
  const serialize = (fn) => {
    const run = chain.then(fn)
    chain = run.catch(() => {})
    return run
  }
  const withTimeout = (promise, label) => {
    const ms = Number(config.timeoutMs)
    if (!Number.isFinite(ms) || ms <= 0) return promise
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}超时（${ms} ms）`)), ms) })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }
  const cwdOf = () => {
    try {
      const agent = ctx.get('agents')?.currentInitiator?.()
      const dir = agent ? ctx.get('workingDirectory')?.get(agent.session) : null
      if (typeof dir === 'string' && dir) return dir
    } catch { /* 取不到会话目录时退回宿主进程目录 */ }
    return process.cwd()
  }
  const resolveInputPath = (path) => {
    const abs = isAbsolute(path) ? path : resolve(cwdOf(), path)
    if (!existsSync(abs)) throw new Error('文件不存在：' + abs)
    return abs
  }

  /** 判别一段正文，返回渲染好的报告文本；失败时抛错，由调用方转成用户可见的消息。 */
  const judge = async (text, source) => {
    const chars = [...text].length
    if (!text.trim()) throw new Error('文本为空')
    if (chars > config.maxChars) throw new Error(`文本 ${chars} 字符，超过单次上限 ${config.maxChars}；请分章判别`)
    return serialize(async () => {
      const m = ensureMeter()
      try {
        const measured = await withTimeout(m.measure(text), '测量')
        const result = loadStack().judge(text, measured)
        let archiveNote = null
        if (config.archive) {
          try {
            const rec = archive.append(result, {
              source, textHash: result.textHash,
              excerpt: String(text).replace(/\s+/gu, '').slice(0, 48),
              modelVersion: loadStack().model?.card?.version ?? loadStack().model?.trainedAt?.slice(0, 10) ?? 'unknown',
            })
            archiveNote = rec ? `已存档（档案号 ${rec.id}）` : '样本不足，不入档'
          } catch (e) { archiveNote = `存档失败：${e?.message ?? e}` }
        } else archiveNote = '自动存档已关闭'
        return { result, header: source ? `【来源】${source} ｜ ${chars} 字符` : null, archiveNote }
      } catch (e) {
        dropMeter() // 桥可能已死：下一次判别重建，而不是一直复用坏进程
        throw e
      }
    })
  }

  const failHint = '可先运行 /identify doctor 或调用 stylome_identify_doctor 检查运行环境。'
  const output = (description) => ({
    schema: { type: 'object', additionalProperties: false, description, properties: { text: { type: 'string', required: true } } },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  })
  const report = (r, header) => (header ? header + '\n' : '') + render(r)

  ctx.effect(() => {
    const offs = [
      ctx.tools.register(defineTool({
        name: 'stylome_identify',
        description: '判别中文文本的 AI 参与程度：返回四态判决（高度疑似 / 存在嫌疑 / 混合可能 / 人工创作）、conformal 置信分层、逐特征证据表；长文本另给逐窗光谱与变点定位。适用口径是中文科幻叙事（含译文），领域外文本不在工况内。判决是统计证据排序，不是对作者的认定。',
        parameters: {
          text: { type: 'string', description: '要判别的正文；与 path 二选一。少于 350 汉字只出报告、不给结论；长文本自动分窗' },
          path: { type: 'string', description: '.txt / .md / .docx / .doc / .pdf 文件路径（相对路径按当前会话目录解析）；与 text 二选一' },
        },
        output: output('判别报告：判决、置信分层、逐特征证据表与边界声明'),
        execute: async (args) => {
          const text = typeof args.text === 'string' ? args.text : ''
          const path = typeof args.path === 'string' ? args.path.trim() : ''
          if (!text && !path) return { text: '需要 text 或 path 之一：把正文放进 text，或给出文件路径。' }
          if (text && path) return { text: 'text 与 path 只能给一个：正文和文件路径不必同时提供。' }
          try {
            const body = path ? readRaw(resolveInputPath(path)) : text
            const { result, header, archiveNote } = await judge(body, path || null)
            return { text: report(result, header) + (archiveNote ? `

—— ${archiveNote}；回放：/identify archive ${path ? path : '<原文>'}（或 stylome_identify_archive 工具）` : '') }
          } catch (e) {
            return { text: `无法判别：${e?.message ?? e}\n${failHint}` }
          }
        },
      })),

      ctx.tools.register(defineTool({
        name: 'stylome_identify_archive',
        description: '判别档案：列出最近的判别记录，或回放某篇的完整历史判别报告（按文件路径反查清洗文本哈希，或按档案号）。同一篇文本跨模型版本的多次判别形成历史序列，可查结论演变。存档位于用户级 ~/.stylome/archive/identify，判别时自动写入。',
        parameters: {
          mode: { type: 'string', description: 'list（默认）：最近记录；replay：回放一篇的判别历史', required: true },
          path: { type: 'string', description: 'replay：被测文件路径（相对按会话目录解析）' },
          id: { type: 'string', description: 'replay：按档案号回放单条' },
          limit: { type: 'number', description: 'list 条数，默认 20' },
        },
        output: output('判别档案列表 / 历史判别报告回放'),
        execute: async (args) => {
          try {
            if (args.mode === 'replay') {
              let hist = []
              if (args.id) {
                const rec = archive.get(args.id)
                if (!rec) return { text: `档案号不存在：${args.id}` }
                hist = [rec]
              } else if (args.path) {
                const body = readRaw(resolveInputPath(args.path))
                const { cleanText } = await import('./server/stack/clean.mjs')
                const { createHash } = await import('node:crypto')
                const hash = createHash('sha256').update(cleanText(body)).digest('hex').slice(0, 16)
                hist = archive.historyOf(hash)
                if (!hist.length) return { text: `该文件没有判别档案（可能从未判别，或判别早于存档系统上线）。
对它做一次判别即可自动入档：/identify ${args.path}` }
              } else return { text: 'replay 需要 path 或 id 之一。' }
              const latest = hist[0]
              const L = [`—— 【档案回放】${latest.source ?? latest.excerpt ?? '(未署名)'} 共 ${hist.length} 条记录 ——`]
              for (const h of hist) L.push(`  · ${h.at.slice(0, 16).replace('T', ' ')}  模型 ${h.modelVersion}  pAI=${h.pAI}  ${h.verdict}  （档案号 ${h.id}）`)
              L.push('')
              L.push(`以下为最新一次判别的原样报告（${latest.at.slice(0, 16).replace('T', ' ')}，模型 ${latest.modelVersion}）：`)
              L.push('')
              L.push(render(latest.result))
              return { text: L.join('\n') }
            }
            const rows = archive.list({ limit: args.limit ?? 20 })
            if (!rows.length) return { text: '档案为空：判别过的文本会自动入档（~/.stylome/archive/identify）。' }
            return { text: ['—— 判别档案（最近 ' + rows.length + ' 条）——', ...rows.map((r) => archive.summaryLine(r)), '', '回放：mode=replay + path（文件）或 id（档案号）'].join('\n') }
          } catch (e) {
            return { text: `档案操作失败：${e?.message ?? e}` }
          }
        },
      })),
      ctx.tools.register(defineTool({
        name: 'stylome_identify_doctor',
        description: '检查判别功能在本机的运行条件：node 版本、Python 解释器、jieba 分词桥、句向量模型（外部，首跑自动下载）、onnxruntime 与判别模型文件。判别工具报错或首次使用前调用。',
        parameters: {},
        output: output('逐项体检结果'),
        execute: async () => {
          try {
            const { checks } = await doctor({ python: config.python || defaultPython(), modelPath: config.modelPath || DEFAULT_MODEL })
            return { text: renderDoctor(checks) }
          } catch (e) {
            return { text: `体检失败：${e?.message ?? e}` }
          }
        },
      })),
    ]
    return () => {
      for (const off of offs) { try { off?.() } catch { /* 已随上下文卸载 */ } }
      dropMeter()
    }
  })

  ctx.inject(['commands'], (c) => c.commands.register({
    name: 'identify',
    description: 'AI 参与判别：检查环境、查看模型卡、判别一个文本文件',
    input: { hint: 'doctor | model | archive [文件路径|档案号] | <文件路径>' },
    handler: async ({ rawInput }) => {
      const ok = (text) => ({ kind: 'success', text })
      const bad = (text) => ({ kind: 'error', text })
      const raw = String(rawInput ?? '').trim()
      try {
        if (!raw || raw === 'help') {
          return ok('用法：/identify doctor | /identify model | /identify <文件路径>\n文件支持 .txt / .md / .docx / .doc；短文本（<350 汉字）只出报告。')
        }
        if (raw === 'doctor') {
          const { ok: passed, checks } = await doctor({ python: config.python || defaultPython(), modelPath: config.modelPath || DEFAULT_MODEL })
          return { kind: passed ? 'success' : 'error', text: renderDoctor(checks) }
        }
        if (raw === 'model') return ok(renderModel(loadStack().model))
        if (raw === 'archive' || raw.startsWith('archive ')) {
          const arg = raw === 'archive' ? '' : raw.slice('archive'.length).trim()
          if (!arg) {
            const rows = archive.list({ limit: 20 })
            if (!rows.length) return ok('档案为空：判别过的文本会自动入档（~/.stylome/archive/identify）。')
            return ok(['—— 判别档案（最近 ' + rows.length + ' 条）——', ...rows.map((r) => archive.summaryLine(r)), '', '回放：/identify archive <文件路径|档案号>'].join('\n'))
          }
          let hist = []
          if (existsSync(resolveInputPath(arg))) {
            const { cleanText } = await import('./server/stack/clean.mjs')
            const { createHash } = await import('node:crypto')
            const hash = createHash('sha256').update(cleanText(readRaw(resolveInputPath(arg)))).digest('hex').slice(0, 16)
            hist = archive.historyOf(hash)
            if (!hist.length) return ok('该文件没有判别档案——对它做一次判别即可自动入档。')
          } else {
            const rec = archive.get(arg)
            if (!rec) return bad(`既不是文件路径也不是档案号：${arg}`)
            hist = [rec]
          }
          const latest = hist[0]
          const L = [`—— 【档案回放】${latest.source ?? latest.excerpt} 共 ${hist.length} 条记录 ——`]
          for (const h of hist) L.push(`  · ${h.at.slice(0, 16).replace('T', ' ')}  模型 ${h.modelVersion}  pAI=${h.pAI}  ${h.verdict}  （${h.id}）`)
          L.push('')
          L.push(`以下为最新一次判别的原样报告（${latest.at.slice(0, 16).replace('T', ' ')}，模型 ${latest.modelVersion}）：`)
          L.push('')
          L.push(render(latest.result))
          return ok(L.join('\n'))
        }
        const abs = resolveInputPath(raw)
        const { result } = await judge(readRaw(abs), null)
        return ok(`【来源】${abs}\n` + render(result))
      } catch (e) {
        return bad(`无法判别：${e?.message ?? e}\n${failHint}`)
      }
    },
  }))

  // ---------- Web 面板（单篇分析 / 批处理）的数据通道 ----------
  // 只服务同源的 DSH Web UI：不鉴权（webServer 路由与宿主同源），不做写盘之外的副作用；
  // 批量任务在内存里排队，插件重载即失效（面板会提示重新开始）。
  const PANEL_API = '/stylome-identify/api'
  const MAX_UPLOAD = 64 * 1024 * 1024
  const MAX_BATCH_FILES = 200
  const jobs = new Map()

  const sendJson = (res, status, data) => {
    try {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(data))
    } catch { /* 客户端已断开 */ }
  }
  const ok = (res, result) => sendJson(res, 200, { ok: true, result })
  // 默认按「请求不被接受」返回：面板的全部错误都是用户侧可修正的（路径、格式、档案号）。
  // 需要 404 / 405 / 413 的地方由抛错处显式带 status。
  const fail = (res, error, status = 400) => sendJson(res, status, { ok: false, error: String(error?.message ?? error) })

  const readBody = async (req, limit) => {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) { const e = new Error('请求体过大'); e.status = 413; throw e }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  const readJsonBody = async (req) => {
    const buf = await readBody(req, 1024 * 1024)
    if (!buf.length) return {}
    try { return JSON.parse(buf.toString('utf8')) } catch { const e = new Error('请求体不是合法 JSON'); e.status = 400; throw e }
  }
  const route = (handler) => async (req, res) => {
    try { await handler(req, res) } catch (e) { fail(res, e, e?.status ?? 500) }
  }
  const queryOf = (req) => new URL(req.url ?? '/', 'http://local').searchParams
  const onlyMethod = (req, method) => { if (req.method !== method) { const e = new Error(`仅支持 ${method}`); e.status = 405; throw e } }

  // 判别档案（存档与回放）：面板只读，写入由 judge() 自动完成。
  const archiveState = () => {
    try { return { dir: archive.archiveDir(), enabled: config.archive !== false, total: archive.count() } }
    catch (e) { return { dir: archive.archiveDir(), enabled: config.archive !== false, total: 0, error: String(e?.message ?? e) } }
  }
  const archiveRow = (r) => ({
    id: r.id, at: r.at, source: r.source, excerpt: r.excerpt, textHash: r.textHash,
    modelVersion: r.modelVersion, pAI: r.pAI, grade: r.grade, verdict: r.verdict, route: r.route,
    state: stateOf(r),
  })

  // 选目录走宿主原生对话框；不同部署的 provider 不同，两种入口都试。
  const pickFolder = async () => {
    const signal = AbortSignal.timeout(180000)
    const controller = ctx.get('directoryPickerController')
    if (controller?.pick) return await controller.pick(signal)
    const cap = ctx.get('directoryPicker')?.capability?.()
    if (cap?.pick) return await cap.pick(signal)
    throw new Error('当前部署没有可用的目录选择器')
  }

  ctx.inject(['webServer'], (w) => {
    w.effect(() => {
      const offs = []
      const add = (path, handler) => {
        try { offs.push(w.webServer.register({ kind: 'exact', path, handler })) }
        catch (e) { /* 热重载时同一路径可能尚未释放；跳过不影响其余路由 */ }
      }

      add(PANEL_API + '/state', route(async (req, res) => {
        onlyMethod(req, 'GET')
        const model = loadStack().model
        const cm = ctx.get('clientModules')
        ok(res, {
          model: { version: model.version, trainedAt: model.trainedAt },
          thresholds: thresholdSnapshot(model),
          exts: PANEL_EXTS,
          maxChars: config.maxChars,
          maxUploadBytes: MAX_UPLOAD,
          maxBatchFiles: MAX_BATCH_FILES,
          archive: archiveState(),
          // 自检：面板 UI 的浏览器模块是否已被宿主登记（客户端拿不到也不影响分析路由）
          clientService: !!cm,
          clientPath: cm?.clientPath?.('stylome-identify') ?? null,
        })
      }))

      // 存档列表：最近若干条（只读）
      add(PANEL_API + '/archive/list', route(async (req, res) => {
        onlyMethod(req, 'GET')
        const limit = Math.max(1, Math.min(200, Number(queryOf(req).get('limit')) || 30))
        ok(res, { ...archiveState(), limit, rows: archive.list({ limit }).map(archiveRow) })
      }))

      // 存档回放：按档案号，或按文件路径反查同一篇的判别历史（跨模型版本）
      add(PANEL_API + '/archive/replay', route(async (req, res) => {
        onlyMethod(req, 'GET')
        const q = queryOf(req)
        const id = String(q.get('id') ?? '').trim()
        const file = String(q.get('path') ?? '').trim()
        if (!id && !file) throw new Error('缺少 id 或 path')
        let selected = null
        let hist = []
        let shownPath = null
        if (file) {
          const abs = resolveInputPath(file)
          if (!PANEL_EXTS.includes(extname(abs).toLowerCase())) throw new Error('不支持的文件格式：' + extname(abs))
          shownPath = abs
          const hash = createHash('sha256').update(cleanText(readRaw(abs))).digest('hex').slice(0, 16)
          hist = archive.historyOf(hash)
          if (!hist.length) { const e = new Error('该文件还没有判别档案——对它做一次判别即可自动入档。'); e.status = 404; throw e }
          selected = hist[0]
        } else {
          selected = archive.get(id)
          if (!selected) { const e = new Error('档案不存在：' + id); e.status = 404; throw e }
          hist = archive.historyOf(selected.textHash)
          if (!hist.some((h) => h.id === selected.id)) hist = [selected]
        }
        const latest = hist[0]
        ok(res, {
          meta: {
            id: selected.id, at: selected.at, source: shownPath ?? selected.source, excerpt: selected.excerpt,
            textHash: selected.textHash, modelVersion: selected.modelVersion,
            pAI: selected.pAI, verdict: selected.verdict, count: hist.length,
            isLatest: selected.id === latest.id,
          },
          history: hist.map((h) => ({ id: h.id, at: h.at, modelVersion: h.modelVersion, pAI: h.pAI, verdict: h.verdict, grade: h.grade })),
          item: shapeResult(selected.result, {
            name: shownPath ? basename(shownPath) : (selected.source ? basename(selected.source) : (selected.excerpt || selected.id)),
            path: shownPath ?? selected.source ?? null,
          }),
        })
      }))

      // 外部依赖自检与确认：缺失项由面板弹窗交给用户处理（只有「现在下载」会联网）
      add(PANEL_API + '/deps', route(async (req, res) => {
        onlyMethod(req, 'GET')
        ok(res, await depReport({ python: config.python || defaultPython() }))
      }))

      add(PANEL_API + '/deps/recheck', route(async (req, res) => {
        onlyMethod(req, 'POST')
        ok(res, await depReport({ python: config.python || defaultPython() }))
      }))

      add(PANEL_API + '/deps/download', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const body = await readJsonBody(req)
        const id = String(body.id ?? '').trim()
        if (!id) throw new Error('缺少 id')
        if (id !== 'embedModel') {
          const e = new Error(`依赖 ${id} 需要你手动处理：按弹窗给出的命令或路径处理后点「重新检查」`)
          e.status = 400
          throw e
        }
        ok(res, startEmbedFetch())
      }))

      add(PANEL_API + '/deps/download/state', route(async (req, res) => {
        onlyMethod(req, 'GET')
        ok(res, embedFetchState(queryOf(req).get('jobId')))
      }))

      add(PANEL_API + '/pick-folder', route(async (req, res) => {
        onlyMethod(req, 'POST')
        ok(res, { path: await pickFolder() })
      }))

      add(PANEL_API + '/scan', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const body = await readJsonBody(req)
        const dir = String(body.dir ?? '').trim()
        if (!dir) throw new Error('缺少 dir')
        const scan = scanFolder(dir, { maxFiles: MAX_BATCH_FILES })
        ok(res, {
          dir: scan.dir,
          total: scan.total,
          unsupported: scan.unsupported,
          truncated: scan.truncated,
          limit: scan.limit,
          files: scan.files.map((f) => ({ name: f.name, rel: f.rel, ext: f.ext, size: f.size })),
        })
      }))

      add(PANEL_API + '/analyze', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const body = await readJsonBody(req)
        const file = String(body.path ?? '').trim()
        if (!file) throw new Error('缺少 path')
        if (!existsSync(file)) { const e = new Error('文件不存在：' + file); e.status = 404; throw e }
        if (!PANEL_EXTS.includes(extname(file).toLowerCase())) throw new Error('不支持的文件格式：' + extname(file))
        const { result } = await judge(readRaw(file), null)
        ok(res, shapeResult(result, { name: basename(file), path: file }))
      }))

      // 浏览器文件选择器上传的字节：落临时文件再走同一套解析（.pdf 需要真实路径给 Python）。
      add(PANEL_API + '/analyze-upload', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const name = queryOf(req).get('name') || 'upload.txt'
        const ext = extname(name).toLowerCase()
        if (!PANEL_EXTS.includes(ext)) throw new Error('不支持的文件格式：' + (ext || '未知'))
        const buf = await readBody(req, MAX_UPLOAD)
        if (!buf.length) throw new Error('上传内容为空')
        const tmp = join(tmpdir(), `stylome-identify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
        writeFileSync(tmp, buf)
        try {
          const { result } = await judge(readRaw(tmp), null)
          ok(res, shapeResult(result, { name, path: null }))
        } finally {
          try { rmSync(tmp, { force: true }) } catch { /* 临时文件清理失败不影响结果 */ }
        }
      }))

      add(PANEL_API + '/batch/start', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const body = await readJsonBody(req)
        const dir = String(body.dir ?? '').trim()
        if (!dir) throw new Error('缺少 dir')
        const scan = scanFolder(dir, { maxFiles: MAX_BATCH_FILES })
        if (!scan.files.length) {
          return ok(res, {
            started: false,
            total: 0,
            scanned: { total: scan.total, unsupported: scan.unsupported },
            message: '文件夹内没有可分析的文件',
          })
        }
        const thresholds = thresholdSnapshot(loadStack().model)
        const job = {
          id: Math.random().toString(36).slice(2, 10),
          dir,
          files: scan.files,
          total: scan.files.length,
          done: 0,
          current: null,
          results: [],
          errors: 0,
          status: 'running',
          cancelled: false,
          thresholds,
          startedAt: Date.now(),
        }
        jobs.set(job.id, job)
        if (jobs.size > 8) {
          for (const key of jobs.keys()) { if (key !== job.id) { jobs.delete(key); break } }
        }
        ;(async () => {
          for (const file of job.files) {
            if (job.cancelled) break
            job.current = file.rel
            try {
              const { result } = await judge(readRaw(file.path), null)
              const shaped = shapeResult(result, file)
              // 批处理只要判定与轴分：雷达、证据表与声明在单篇里看
              delete shaped.radarSvg
              delete shaped.evidence
              delete shaped.disclaimer
              delete shaped.spectrum
              delete shaped.axisMeta
              job.results.push(shaped)
            } catch (e) {
              job.errors++
              job.results.push(shapeError(e, file))
            }
            job.done++
            await new Promise((r) => setImmediate(r))
          }
          job.status = job.cancelled ? 'cancelled' : 'done'
          job.current = null
        })()
        ok(res, { started: true, jobId: job.id, total: job.total, truncated: scan.truncated })
      }))

      add(PANEL_API + '/batch/state', route(async (req, res) => {
        onlyMethod(req, 'GET')
        const job = jobs.get(String(queryOf(req).get('jobId') ?? ''))
        if (!job) throw new Error('任务不存在或已过期（插件可能已重载，请重新开始）')
        const running = job.status === 'running'
        const base = { jobId: job.id, status: job.status, done: job.done, total: job.total, current: job.current, errors: job.errors }
        if (running) return ok(res, base)
        const summary = summarize(job.results, job.thresholds)
        ok(res, {
          ...base,
          records: summary.records,
          counts: summary.counts,
          advice: summary.advice,
          review: summary.review,
          mid: summary.mid,
          thresholds: job.thresholds,
        })
      }))

      add(PANEL_API + '/batch/cancel', route(async (req, res) => {
        onlyMethod(req, 'POST')
        const body = await readJsonBody(req)
        const job = jobs.get(String(body.jobId ?? ''))
        if (!job) throw new Error('任务不存在或已过期')
        job.cancelled = true
        ok(res, { cancelled: true })
      }))

      return () => { for (const off of offs.splice(0)) { try { off() } catch { /* 已卸载 */ } } }
    })
  })
}
