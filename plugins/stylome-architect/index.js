// StylomeArchitect —— 宏观织体校验器（DSH 插件入口）。
//
// 家族第三插件（StylomeIdentify 判 AI 参与 → StylomeWeaver 锚定文风比对 →
// StylomeArchitect 宏观织体）。以**整篇作品**为单位，基于**多作者档案库**给出双输出：
//   ① 自我忠实与进步变化：新作相对锚定作者自身作品历史的分布（稳态核心/自我边缘/超出自身历史）
//   ② 迁移参考：按信号侧面在档案库全部他作者作品中检索最相似样本并回放其信号曲线（案例式迁移）
// 理论定位：情感弧线/情节温度是**作品级表达信号**，不是作者指纹——输出语义是定位与描述，
// 不做作者归属判定。
//
// 出厂态：不携带任何锚定样本与学习参数（零 dossier、空注册表；神经轨模型亦外部化）。
// 首次运行三步：收录锚定作者作品 → 标注锚定作者 → 校验一篇新作。
//
// 对外五个面：
//   工具 stylome_architect           mode: weave | ingest | mark | list | annotate
//   工具 stylome_architect_doctor    运行条件体检
//   命令 /architect                  doctor | list | ingest | mark | weave
//   系统提示段                       只在空库时给首次运行指引，有库时只报一行状态
//   侧栏面板 StylomeArchitect        档案库 / 织体校验 / 环境体检（数据走 /stylome-architect/api）

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { readRaw, readText } from './lib/corpus/import.mjs'
import { loadLexicon } from './server/lexicon.mjs'
import { StreamMeter, pythonPath } from './server/stream.mjs'
import { workProfile } from './server/architect.mjs'
import {
  defaultLibraryRoot, resolveLibraryRoot, loadLibrary, loadDossiers, ingestWorks, markAnchor, librarySummary,
} from './server/library.mjs'
import { annotate } from './server/annotation.mjs'
import { analyzeWork, libraryState, replayWork } from './server/pipeline.mjs'
import { doctor, renderDoctor, defaultPython } from './server/doctor.mjs'
import { depReport, startDepsFetch, depsFetchState } from './server/deps.mjs'
import { renderWeave } from './server/report.mjs'
import { TEXT_EXTS, scanFolder, weaveView, workView, MAX_SCAN_FILES } from './server/panel.mjs'

export const name = 'stylome-architect'
export const inject = ['tools']

const PANEL_ID = 'stylome-architect'
const PANEL_API = '/stylome-architect/api'
const MAX_UPLOAD = 64 * 1024 * 1024
const MAX_JOBS = 8

export const Config = z.object({
  python: z.string().default('').description('分词桥所用 Python 解释器；空则用环境变量 STYLOME_ARCHITECT_PYTHON / STYLOME_PYTHON / LITIDENTIFY_PYTHON，再缺省为 python'),
  libraryPath: z.string().default('').description('档案库目录；空则用 env STYLOME_ARCHITECT_LIBRARY 或「用户主目录/.stylome-architect/library」，相对路径按进程工作目录展开'),
  maxChars: z.number().default(600000).description('单篇作品允许的最大汉字数（超过请分部处理）'),
  maxFiles: z.number().default(200).description('一次收录最多读取的样本文件数（目录深度 ≤ 3）'),
  timeoutMs: z.number().default(900000).description('单次测量/校验的超时（毫秒），含全部分词'),
  neural: z.boolean().default(false).description('缺省是否开启神经轨（预训练句向量，需要外部模型；失败自动回落纯统计三轨）'),
}).default({})

export function apply(ctx, config) {
  let meter = null
  let chain = Promise.resolve()
  let libPathOverride = ''
  const jobs = new Map()

  const libRoot = () => resolveLibraryRoot(libPathOverride || config.libraryPath || defaultLibraryRoot())
  const ensureMeter = () => { if (!meter) meter = new StreamMeter(config.python || pythonPath() || defaultPython()); return meter }
  const dropMeter = () => { const m = meter; meter = null; try { m?.close() } catch { /* 桥已退出时忽略 */ } }
  const serialize = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run }
  const withTimeout = (promise, label) => {
    const ms = Number(config.timeoutMs)
    if (!Number.isFinite(ms) || ms <= 0) return promise
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}超时（${ms} ms）`)), ms) })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }
  const randomId = () => Math.random().toString(36).slice(2, 10)

  // 相对路径的基准目录：优先会话自己的工作目录，其次宿主默认目录，最后进程目录。
  const cwdOf = () => {
    try {
      const agent = ctx.get('agents')?.currentInitiator?.()
      if (agent) {
        const d = ctx.get('workingDirectory')?.get(agent.session)
        if (typeof d === 'string' && d) return d
      }
    } catch { /* 取不到会话目录 */ }
    try {
      const d = ctx.get('workingDirectory')?.defaultDirectory
      if (typeof d === 'string' && d) return d
    } catch { /* 取不到工作目录服务 */ }
    return process.cwd()
  }
  const resolveInputPath = (path) => {
    const abs = isAbsolute(path) ? path : resolve(cwdOf(), path)
    if (!existsSync(abs)) throw new Error('路径不存在：' + abs)
    return abs
  }

  const firstRunHint = '首次使用：档案库里还没有任何作品。本插件出厂不携带锚定样本与学习参数——先收录锚定作者的作品（工具 stylome_architect mode=ingest，或侧栏「StylomeArchitect → 档案库」选文件夹），再标注锚定作者（mode=mark），然后才能校验新作。'

  // ══════════════════════════ 校验 / 收录 的实现 ══════════════════════════

  /** 校验一篇正文（复用常驻分词桥；串行）。 */
  const weave = async ({ text, name, neural = null, neuralModel = null, onProgress = null, cancel = null }) => {
    const chars = text.length
    if (!text.trim()) throw new Error('正文是空的')
    if (chars > config.maxChars) throw new Error(`文本 ${chars} 字符，超过单次上限 ${config.maxChars}；请分部处理`)
    if (cancel?.()) throw new Error('已取消')
    return serialize(async () => {
      const m = ensureMeter()
      try {
        return await withTimeout(analyzeWork({
          meter: m, text, name, libRoot: libRoot(),
          neural: neural ?? !!config.neural, neuralModel,
          onProgress: onProgress ?? (() => {}),
        }), '织体校验')
      } catch (e) {
        dropMeter() // 桥可能已死：下一次重建，而不是一直复用坏进程
        throw e
      }
    })
  }

  /** 收录作品（作者分区）：读文本 → 逐篇测量 → dossier + 正文副本。 */
  const ingest = async ({ author, files, neural = false, onProgress = null, cancel = null }) => {
    if (!files.length) throw new Error(`没有可读文档（支持 ${TEXT_EXTS.join(' / ')}）`)
    const dict = loadLexicon()
    return serialize(async () => {
      const m = ensureMeter()
      const items = []
      for (const f of files) items.push({ name: basename(f).replace(/\.[^.]+$/, ''), text: readText(f) })
      try {
        return await withTimeout(ingestWorks(libRoot(), author, items, {
          measure: async (text, itemName) => {
            if (cancel?.()) throw new Error('已取消')
            const stream = await m.document(text, dict)
            const profile = workProfile(stream, { name: itemName })
            if (neural) {
              const { neuralTrack, defaultNeuralModelDir } = await import('./server/neural.mjs')
              const nt = await neuralTrack(stream.paras, stream.hanTotal, pythonPath(), defaultNeuralModelDir())
              if (!nt.unavailable) profile.neural = nt
            }
            onProgress?.({ phase: 'measure', current: itemName })
            return profile
          },
        }), '收录')
      } catch (e) {
        dropMeter()
        throw e
      }
    })
  }

  const requireAnchor = () => {
    const lib = loadLibrary(libRoot())
    if (!lib.anchor) throw new Error('档案库未标注锚定作者：先用 mark 模式（author=作者名）指定。')
    return lib
  }

  // ══════════════════════════ 工具 ══════════════════════════

  const output = (description) => ({
    schema: { type: 'object', additionalProperties: false, description, properties: { text: { type: 'string', required: true } } },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  })

  ctx.effect(() => {
    const offs = [
      ctx.tools.register(defineTool({
        name: 'stylome_architect',
        description: '宏观织体校验（档案库版）：把一部中文叙事作品放进多作者档案库做双输出——①自我忠实与进步变化：新作相对锚定作者自身作品历史的位置（稳态核心/自我边缘/超出自身历史）；②迁移参考：按情绪浓度/弧形状/句流节奏/对白织体/线索手法/场景手艺等侧面，在全部他作者作品中检索最相似样本并回放其信号曲线，给出可参考的改进方向（案例式迁移）。附线索轨证据（实体时间线、首尾呼应、gap-return 伏笔候选、未回收线索）、修改建议、场景轨与 L2 语义任务清单（场景切分/伏笔FTP/情绪归因/白描审计/实体轨迹），由你（agent）依据契约完成语义标注。先建库：ingest 收录作品，mark 标注锚定作者。',
        parameters: {
          mode: { type: 'string', description: 'weave（默认）：双输出校验；ingest：收录作品入档案库；mark：标注锚定作者；list：查看档案库；annotate：L2 标注回填', required: true },
          path: { type: 'string', description: 'weave：作品文件路径（或给 text）；ingest：作者作品目录或文件列表（空格分隔）；annotate：标注 JSON 文件' },
          text: { type: 'string', description: 'weave：直接给正文（与 path 二选一）' },
          author: { type: 'string', description: 'ingest：作者名；mark：要标注为锚定的作者名；annotate：作品所属作者' },
          work: { type: 'string', description: 'annotate：作品名' },
          neural: { type: 'boolean', description: 'ingest/weave 时启用神经轨（需外部句向量模型；失败自动回落纯统计三轨）' },
          neuralModel: { type: 'string', description: '神经轨模型目录；缺省 env STYLOME_EMBED_MODEL / LITIDENTIFY_EMBED_MODEL 或 ~/.stylome/models/' },
          libraryPath: { type: 'string', description: '档案库目录；缺省用插件配置或用户目录下的默认库' },
        },
        output: output('织体双输出报告（自我忠实/迁移参考/线索轨/建议/场景轨+L2契约） / 档案库操作结果'),
        execute: async (args) => {
          const mode = ['weave', 'ingest', 'mark', 'list', 'annotate'].includes(args.mode) ? args.mode : 'weave'
          const path = typeof args.path === 'string' ? args.path.trim() : ''
          const body = typeof args.text === 'string' ? args.text : ''
          const rootOverride = typeof args.libraryPath === 'string' ? args.libraryPath.trim() : ''
          if (rootOverride) libPathOverride = rootOverride
          try {
            if (mode === 'list') {
              const s = libraryState(libRoot())
              const lines = s.authors.map((a) => `${a.name === s.anchor ? '★' : ' '} ${a.name}：${a.totalWorks} 部 / ${a.han} 字`)
              return { text: `档案库：${s.dir}\n锚定作者：${s.anchor ?? '（未标注——用 mark 模式指定）'}\n${lines.join('\n') || '（空库：先 ingest 收录作品）'}\n合计 ${s.totalWorks} 部` }
            }
            if (mode === 'mark') {
              const author = String(args.author ?? '').trim()
              if (!author) return { text: 'mark 需要 author（要标注为锚定的作者名）。' }
              markAnchor(libRoot(), author)
              return { text: `✓ 锚定风格已标注：${author}（校验时以该作者的作品历史为「自我」基线）` }
            }
            if (mode === 'annotate') {
              const author = String(args.author ?? '').trim()
              const work = String(args.work ?? '').trim()
              if (!author || !work || !path) return { text: 'annotate 需要 author、work 与 path（标注 JSON 文件）。' }
              const abs = isAbsolute(path) ? path : resolve(cwdOf(), path)
              const patch = JSON.parse(readFileSync(abs, 'utf8'))
              // 有正文副本时重算段落流，让 scene 标注顺带算出场景特征入档
              const txt = join(libRoot(), author, work + '.txt')
              let stream = null
              if (existsSync(txt)) {
                const m = ensureMeter()
                stream = await withTimeout(m.document(readFileSync(txt, 'utf8'), loadLexicon()), '标注重算')
              }
              const r = await annotate(libRoot(), author, work, patch, { stream })
              return { text: `✓ 标注已回填 ${author}/${work}：` + Object.entries(r).filter(([k]) => k !== 'annotatedAt' && k !== 'source').map(([k, v]) => `${k}×${v.length}`).join('，') + (stream ? '（场景特征已随标注入档）' : '') }
            }
            if (mode === 'ingest') {
              const author = String(args.author ?? '').trim() || '未署名'
              if (!path) return { text: 'ingest 需要 path（作者作品目录或文件列表）。' }
              const files = []
              for (const p of path.split(/\s+/).filter(Boolean)) {
                const scan = scanFolder(resolveInputPath(p), { maxFiles: config.maxFiles })
                for (const f of scan.files) files.push(f.path)
              }
              if (!files.length) return { text: `目录下没有可读文本（支持 ${TEXT_EXTS.join(' / ')}）。` }
              const { added } = await ingest({ author, files, neural: !!args.neural })
              const s = libraryState(libRoot())
              return { text: `✓ 已收录 ${author}：新增 ${added} 部（档案库共 ${s.totalWorks} 部）。${s.anchor ? '' : '锚定作者未标注——用 mark 模式指定。'}` }
            }
            // weave
            if (!body && !path) return { text: 'weave 需要 path 或 text（作品正文）。' }
            if (body && path) return { text: 'text 与 path 只能给一个。' }
            const abs = path ? resolveInputPath(path) : null
            const text = body || readRaw(abs)
            const workName = abs ? basename(abs) : '正文'
            if (text.length > config.maxChars) return { text: `文本 ${text.length} 字符，超过单次上限 ${config.maxChars}；请分部处理。` }
            requireAnchor()
            const r = await weave({ text, name: workName, neural: args.neural === true ? true : (args.neural === false ? false : null), neuralModel: args.neuralModel })
            const md = renderWeave({
              profile: r.profile, rep: r.rep, loc: r.loc, charts: r.charts,
              suggestions: r.suggestions, self: r.self, transfer: r.transfer, sceneTrack: r.sceneTrack,
            })
            const nSug = r.suggestions.length
            return { text: md
              + `\n\n【修改参考生成提示】①读 selfFidelity.progression（自我推进点）与 suggestions（${nSug} 条）逐条生成方向性修改参考，保持情节内容不动；②transfer 各侧面最像的他作者作品（正文副本在档案库 library/<作者>/<作品>.txt），生成参考意见时可摘引其对应段落回放。`
              + `\n【L2 语义标注提示】依据 l2Tasks 完成语义层：场景切分（章节标记 ${r.profile.chapters.length} 处为硬边界）、伏笔 F/T/P（gap-return 候选 ${r.profile.gaps.length} 个为锚点）、情绪归因（弧线峰值 bin 的代表段）、白描/反衬审计（词典低谷 bin）。标注经 annotate 模式回填。` }
          } catch (e) {
            return { text: `无法处理：${e?.message ?? e}\n可先调用 stylome_architect_doctor 检查运行环境。` }
          }
        },
      })),
      ctx.tools.register(defineTool({
        name: 'stylome_architect_doctor',
        description: '检查织体校验在本机的运行条件：node 版本、Python、jieba 分词桥、大工情感词典、宏观测量核（DFA）、神经轨模型（opt-in）、档案库。报错或首次使用前先调用它。',
        parameters: {},
        output: output('逐项体检结果'),
        execute: async () => {
          try {
            const { checks } = await doctor({ python: config.python || defaultPython(), libraryPath: libRoot() })
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

  // ══════════════════════════ 命令 ══════════════════════════

  ctx.inject(['commands'], (c) => c.commands.register({
    name: 'architect',
    description: '宏观织体校验：体检 / 档案库（收录/标注/查看）/ 双输出校验',
    input: { hint: 'doctor | list | ingest <作者> <目录> | mark <作者> | weave <文件>' },
    handler: async ({ rawInput }) => {
      const ok = (text) => ({ kind: 'success', text })
      const bad = (text) => ({ kind: 'error', text })
      const parts = String(rawInput ?? '').trim().split(/\s+/).filter(Boolean)
      const cmd = parts[0] ?? 'help'
      try {
        if (!parts.length || cmd === 'help') {
          return ok('用法：/architect doctor ｜ /architect list ｜ /architect ingest <作者> <目录> ｜ /architect mark <作者> ｜ /architect weave <文件>\n详细报告与弧线图在侧栏「StylomeArchitect」面板里查看。')
        }
        if (cmd === 'doctor') {
          const { ok: passed, checks } = await doctor({ python: config.python || defaultPython(), libraryPath: libRoot() })
          return { kind: passed ? 'success' : 'error', text: renderDoctor(checks) }
        }
        if (cmd === 'list') {
          const s = libraryState(libRoot())
          if (!s.totalWorks) return bad(`档案库为空（${s.dir}）。\n${firstRunHint}`)
          return ok(`档案库：${s.dir}\n锚定：${s.anchor ?? '（未标注）'}\n` + s.authors.map((a) => `${a.name === s.anchor ? '★' : ' '} ${a.name}：${a.totalWorks} 部 / ${a.han} 字`).join('\n'))
        }
        if (cmd === 'mark') {
          if (!parts[1]) return bad('用法：/architect mark <作者>')
          markAnchor(libRoot(), parts[1])
          return ok(`✓ 锚定风格已标注：${parts[1]}`)
        }
        if (cmd === 'ingest') {
          const author = parts[1]
          const target = parts[2]
          if (!author || !target) return bad('用法：/architect ingest <作者> <目录>')
          const scan = scanFolder(resolveInputPath(target), { maxFiles: config.maxFiles })
          const { added } = await ingest({ author, files: scan.files.map((f) => f.path) })
          return ok(`✓ 已收录 ${author}：新增 ${added} 部（档案库共 ${libraryState(libRoot()).totalWorks} 部）`)
        }
        if (cmd === 'weave') {
          if (!parts[1]) return bad('用法：/architect weave <文件>')
          requireAnchor()
          const abs = resolveInputPath(parts[1])
          const r = await weave({ text: readRaw(abs), name: basename(abs) })
          return ok(`织体校验完成：${r.profile.name}｜${r.profile.han} 字 / ${r.profile.nPara} 段\n` +
            `锚定「${r.rep.author}」（${r.rep.nWorks} 部）｜自我推进点 ${r.self.progression.length} 项｜建议 ${r.suggestions.length} 条｜迁移池 ${r.transfer?.pool ?? 0} 部\n` +
            '完整双输出、线索轨、场景轨与弧线图见侧栏「StylomeArchitect → 织体校验」。')
        }
        return bad('未知子命令：' + cmd + '（用 /architect help 查看用法）')
      } catch (e) {
        return bad(`失败：${e?.message ?? e}\n可先 /architect doctor 检查运行环境。`)
      }
    },
  }))

  // ══════════════════════════ 系统提示段 ══════════════════════════
  // 只在空库时写进提示；有库后只剩一行状态，不占上下文。
  ctx.inject(['systemPrompt'], (s) => s.effect(() => s.systemPrompt.section({
    name: 'stylome-architect',
    order: 82,
    text: () => {
      let state = null
      try { state = libraryState(libRoot()) } catch { state = null }
      if (!state || !state.totalWorks) {
        return [
          '## StylomeArchitect（宏观织体校验）',
          '档案库为空：本插件出厂不携带任何锚定样本与学习参数。',
          '在讨论叙事结构、情绪节奏、线索伏笔是否「像这位作者」之前，先请用户提供锚定作者的作品集（.txt / .md / .docx / .doc / .pdf 所在文件夹），',
          '用 stylome_architect mode=ingest 收录、mode=mark 标注锚定作者，再用 mode=weave 校验新作。没有档案库时不要编造织体结论。',
        ].join('\n')
      }
      const names = state.authors.slice(0, 6).map((a) => `${a.name}(${a.totalWorks})`).join('、')
      const anchor = state.anchor ? `锚定作者 ${state.anchor}` : '尚未标注锚定作者（mode=mark）'
      return [
        '## StylomeArchitect（宏观织体校验）',
        `档案库 ${state.totalWorks} 部作品：${names}${state.authors.length > 6 ? ' 等' : ''}｜${anchor}。`,
        '校验新作用 stylome_architect mode=weave；收录用 mode=ingest；L2 语义标注经 mode=annotate 回填。输出是定位与描述，不做作者归属。',
      ].join('\n')
    },
  })))

  // ══════════════════════════ 面板数据通道 ══════════════════════════
  // 只服务同源的 DSH Web UI：不额外鉴权，依赖 Web 服务自身的监听范围。
  // 任务（收录/校验）只存在内存里，插件重载即失效（面板会提示重新开始）。
  const sendJson = (res, status, data) => {
    try {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(data))
    } catch { /* 客户端已断开 */ }
  }
  const okJson = (res, result) => sendJson(res, 200, { ok: true, result })
  const failJson = (res, error, status = 400) => sendJson(res, status, { ok: false, error: String(error?.message ?? error) })

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
    try { await handler(req, res) } catch (e) { failJson(res, e, e?.status ?? 400) }
  }
  const queryOf = (req) => new URL(req.url ?? '/', 'http://local').searchParams

  const PANEL_ROUTES = new Set([
    '/state', '/doctor', '/pick-folder', '/scan', '/mark',
    '/ingest/start', '/ingest/state', '/ingest/cancel',
    '/weave/start', '/weave/upload', '/weave/state', '/weave/cancel',
    '/work',
    '/deps', '/deps/recheck', '/deps/download', '/deps/download/state',
  ])

  const pickFolder = async () => {
    const signal = AbortSignal.timeout(180000)
    const controller = ctx.get('directoryPickerController')
    if (controller?.pick) return await controller.pick(signal)
    const cap = ctx.get('directoryPicker')?.capability?.()
    if (cap?.pick) return await cap.pick(signal)
    throw new Error('当前部署没有可用的目录选择器：可直接在输入框里填文件夹路径')
  }

  const trimJobs = (keepId) => {
    if (jobs.size <= MAX_JOBS) return
    for (const key of jobs.keys()) {
      if (key === keepId) continue
      const j = jobs.get(key)
      if (j && j.status !== 'running' && j.status !== 'queued') { jobs.delete(key); break }
    }
  }

  const startJob = (kind, run) => {
    const id = randomId()
    const job = { id, kind, status: 'queued', done: 0, total: 0, current: null, label: '', result: null, error: null, cancelled: false, startedAt: Date.now() }
    jobs.set(id, job)
    trimJobs(id)
    job.status = 'running'
    ;(async () => {
      try {
        const result = await run({
          cancel: () => job.cancelled === true,
          progress: (p) => {
            if (!p) return
            if (p.done != null) job.done = p.done
            if (p.total != null) job.total = p.total
            if (p.current != null) job.current = p.current
            if (p.label) job.label = p.label
          },
        })
        job.result = result
        job.status = job.cancelled ? 'cancelled' : 'done'
      } catch (e) {
        job.error = String(e?.message ?? e)
        job.status = job.cancelled ? 'cancelled' : 'error'
      } finally {
        job.current = null
        job.label = ''
      }
    })()
    return { jobId: id, kind }
  }

  const startIngestJob = ({ author, files, neural }) => {
    const id = startJob('ingest', async ({ cancel, progress }) => {
      let done = 0
      progress({ done, total: files.length })
      const { added, profiles } = await ingest({
        author, files, neural, cancel,
        onProgress: (p) => { done++; progress({ done: Math.min(done, files.length), current: p.current }) },
      })
      return { added, works: profiles.map((p) => ({ name: p.name, han: p.han })), author }
    })
    return { ...id, files: files.length }
  }

  const startWeaveJob = ({ text, name: workName, neural, tempFile = null }) => {
    const jobId = startJob('weave', async ({ cancel, progress }) => {
      try {
        const r = await weave({
          text, name: workName, neural, cancel,
          onProgress: (p) => progress({ label: p.label }),
        })
        return weaveView(r, { name: workName })
      } finally {
        if (tempFile) { try { rmSync(tempFile, { force: true }) } catch { /* 临时文件清理失败不影响结果 */ } }
      }
    })
    return jobId
  }

  ctx.inject(['webServer'], (w) => {
    w.effect(() => {
      let off = null
      try {
        off = w.webServer.register({ kind: 'prefix', path: PANEL_API, handler: route(async (req, res) => {
          const url = new URL(req.url ?? '/', 'http://local')
          const sub = url.pathname.slice(PANEL_API.length) || '/'

          if (sub === '/state' && req.method === 'GET') {
            const s = libraryState(libRoot())
            return okJson(res, {
              plugin: PANEL_ID,
              firstRun: s.totalWorks === 0,
              libraryDir: s.dir,
              anchor: s.anchor,
              authors: s.authors,
              totalWorks: s.totalWorks,
              exts: TEXT_EXTS,
              maxFiles: config.maxFiles,
              maxChars: config.maxChars,
              timeoutMs: config.timeoutMs,
              neural: !!config.neural,
              maxUploadBytes: MAX_UPLOAD,
            })
          }

          if (sub === '/doctor' && req.method === 'GET') {
            return okJson(res, await doctor({ python: config.python || defaultPython(), libraryPath: libRoot() }))
          }

          // ---- 外部依赖自检与确认（缺失时面板弹窗，用户点过才联网） ----
          if (sub === '/deps' && req.method === 'GET') {
            return okJson(res, await depReport())
          }

          if (sub === '/deps/recheck' && req.method === 'POST') {
            return okJson(res, await depReport())
          }

          if (sub === '/deps/download' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const id = String(body.id ?? '').trim()
            if (!id) throw new Error('缺少 id')
            if (id !== 'lexicon' && id !== 'embedModel') {
              const e = new Error(`未知依赖：${id}`)
              e.status = 400
              throw e
            }
            // 只有用户点过「现在下载」才会走到这里；取回失败的原因会原样回给弹窗
            return okJson(res, startDepsFetch(id))
          }

          if (sub === '/deps/download/state' && req.method === 'GET') {
            return okJson(res, depsFetchState(queryOf(req).get('jobId')))
          }

          if (sub === '/pick-folder' && req.method === 'POST') {
            return okJson(res, { path: await pickFolder() })
          }

          if (sub === '/scan' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const target = String(body.dir ?? '').trim()
            if (!target) throw new Error('缺少 dir')
            const scan = scanFolder(resolveInputPath(target), { maxFiles: config.maxFiles })
            return okJson(res, {
              dir: scan.dir, isDir: scan.isDir, total: scan.total, unsupported: scan.unsupported,
              truncated: scan.truncated, limit: scan.limit,
              files: scan.files.map((f) => ({ name: f.name, rel: f.rel, ext: f.ext, size: f.size })),
            })
          }

          if (sub === '/mark' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const author = String(body.author ?? '').trim()
            if (!author) throw new Error('缺少 author')
            markAnchor(libRoot(), author)
            return okJson(res, { anchor: author, library: libraryState(libRoot()) })
          }

          if (sub === '/ingest/start' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const author = String(body.author ?? '').trim()
            if (!author) throw new Error('缺少 author（作者名）')
            const inputs = Array.isArray(body.paths) && body.paths.length ? body.paths : [String(body.dir ?? '').trim()].filter(Boolean)
            if (!inputs.length) throw new Error('缺少 dir 或 paths')
            const files = []
            const seen = new Set()
            for (const p of inputs) {
              const scan = scanFolder(resolveInputPath(String(p)), { maxFiles: config.maxFiles })
              for (const f of scan.files) if (!seen.has(f.path)) { seen.add(f.path); files.push(f.path) }
            }
            if (!files.length) throw new Error(`没有可读文档（支持 ${TEXT_EXTS.join(' / ')}）`)
            const started = startIngestJob({ author, files, neural: !!body.neural })
            return okJson(res, { ...started, total: files.length, author })
          }

          if (sub === '/ingest/state' && req.method === 'GET') {
            const job = jobs.get(String(queryOf(req).get('jobId') ?? ''))
            if (!job) throw new Error('任务不存在或已过期（插件可能已重载，请重新开始）')
            return okJson(res, {
              jobId: job.id, status: job.status, done: job.done, total: job.total,
              current: job.current, label: job.label, error: job.error,
              result: job.status === 'done' ? job.result : null,
            })
          }

          if (sub === '/ingest/cancel' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const job = jobs.get(String(body.jobId ?? ''))
            if (!job) throw new Error('任务不存在或已过期')
            job.cancelled = true
            return okJson(res, { cancelled: true })
          }

          if (sub === '/weave/start' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const file = String(body.path ?? '').trim()
            if (!file) throw new Error('缺少 path（作品文件路径）')
            const abs = resolveInputPath(file)
            if (!TEXT_EXTS.includes(extname(abs).toLowerCase())) throw new Error('不支持的文件格式：' + extname(abs))
            requireAnchor()
            const started = startWeaveJob({
              text: readRaw(abs), name: basename(abs),
              neural: body.neural === true ? true : (body.neural === false ? false : null),
            })
            return okJson(res, { ...started, name: basename(abs), path: abs })
          }

          if (sub === '/weave/upload' && req.method === 'POST') {
            const q = queryOf(req)
            const name = q.get('name') || 'upload.txt'
            const ext = extname(name).toLowerCase()
            if (!TEXT_EXTS.includes(ext)) throw new Error('不支持的文件格式：' + (ext || '未知'))
            requireAnchor()
            const buf = await readBody(req, MAX_UPLOAD)
            if (!buf.length) throw new Error('上传内容为空')
            const tmp = join(tmpdir(), `stylome-architect-${Date.now()}-${randomId()}${ext}`)
            writeFileSync(tmp, buf)
            const neural = q.get('neural') === '1' ? true : (q.get('neural') === '0' ? false : null)
            const started = startWeaveJob({ text: readRaw(tmp), name, neural, tempFile: tmp })
            return okJson(res, { ...started, name, path: null })
          }

          if (sub === '/weave/state' && req.method === 'GET') {
            const job = jobs.get(String(queryOf(req).get('jobId') ?? ''))
            if (!job) throw new Error('任务不存在或已过期（插件可能已重载，请重新开始）')
            return okJson(res, {
              jobId: job.id, status: job.status, label: job.label, error: job.error,
              result: job.status === 'done' ? job.result : null,
            })
          }

          if (sub === '/weave/cancel' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const job = jobs.get(String(body.jobId ?? ''))
            if (!job) throw new Error('任务不存在或已过期')
            job.cancelled = true
            return okJson(res, { cancelled: true })
          }

          if (sub === '/work' && req.method === 'GET') {
            const q = queryOf(req)
            const author = String(q.get('author') ?? '').trim()
            const work = String(q.get('work') ?? '').trim()
            if (!author || !work) throw new Error('缺少 author / work')
            return okJson(res, workView(replayWork(libRoot(), author, work), { author }))
          }

          if (PANEL_ROUTES.has(sub)) {
            const e = new Error(`接口 ${sub} 不支持 ${req.method}`); e.status = 405; throw e
          }
          const e = new Error('未知接口：' + sub); e.status = 404; throw e
        }) })
      } catch { /* 热重载时同一路径可能尚未释放：跳过不影响面板以外的功能 */ }
      return () => { try { off?.() } catch { /* 已卸载 */ } }
    })
  })
}
