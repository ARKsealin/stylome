// StylomeWeaver —— 作者风格锚定与比对（DSH 插件入口）。
//
// 定位：把「一位作者的文风」变成可保存、可回放、可比对的统计画像。
//   · 不携带任何预训练权重、不含任何内置作者画像；画像只能由用户提供的样本集训练得到。
//   · 首次运行（画像库为空）时，面板与工具都会提示先提供至少一位参考作者的样本集。
//
// 对外四个面：
//   工具 stylome_weaver_train     从样本文件夹训练一位作者的画像
//   工具 stylome_weaver_profiles  列出/确认已保存的画像（空库时说明如何开始）
//   工具 stylome_weaver_compare   目标文档 × 某位作者画像 → 逐段发现与修改意见
//   工具 stylome_weaver_doctor    运行条件体检
//   命令 /weaver                  用户侧入口（doctor | profiles | train | compare）
//   面板                          锚定风格（训练/回放/画像库）+ 比对分析（目标文档 × 画像）
//
// 判别口径、画像格式与建议词表见 README.md。

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { ParaMeter } from './server/meter.mjs'
import { readText } from './lib/corpus/import.mjs'
import { doctor, renderDoctor, defaultPython } from './server/doctor.mjs'
import { deleteProfile, listProfiles, loadProfile, profilesDir, summaryOf } from './server/profile.mjs'
import { TEXT_EXTS, assertDir, compareDocument, scanFolder, trainFromFolder } from './server/weaver.mjs'
import { coverageRows, profileAxes, profileCards, profileKeywords, tierRows } from './server/metrics.mjs'
import { renderFindings, renderTrainReport, clampProblemZ } from './server/report.mjs'
import { renderRadarSVG } from './server/radar.mjs'

export const name = 'stylome-weaver'
export const inject = ['tools']

const PANEL_API = '/stylome-weaver/api'
const MAX_UPLOAD = 64 * 1024 * 1024
const MAX_JOBS = 8

export const Config = z.object({
  python: z.string().default('').description('分词桥所用 Python 解释器；空则用环境变量 STYLOME_WEAVER_PYTHON / STYLOME_PYTHON，再缺省为 python'),
  profileDir: z.string().default('').description('画像库目录；空则用「用户主目录/.stylome-weaver/profiles」，相对路径按进程工作目录展开'),
  alpha: z.number().default(0.1).description('学习画像的带外概率预算（0.01–0.5）：每条带取 [α/2, 1-α/2] 分位'),
  minN: z.number().default(30).description('每个段长档建立分位带所需的最少段落数；不足的档不建带'),
  maxChars: z.number().default(300000).description('单次比对允许的最大字符数'),
  maxFiles: z.number().default(200).description('训练时最多读取的样本文件数（目录深度 ≤ 3）'),
  problemZ: z.number().default(2).description('问题段落阈值：段落最深越带 z ≥ 该值即列为问题段落并全部列出（记录下限 z=1；2=严重档，1=含明显档）。不做条数配额'),
  timeoutMs: z.number().default(600000).description('单次训练/比对的超时（毫秒），含全部分词'),
}).default({})

export function apply(ctx, config) {
  let meter = null
  let chain = Promise.resolve()
  const jobs = new Map()

  const dir = () => profilesDir(config.profileDir)
  const ensureMeter = () => { if (!meter) meter = new ParaMeter(config.python || defaultPython()); return meter }
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

  const profileList = () => {
    const listed = listProfiles(dir())
    return listed.profiles
  }
  const requireProfile = (profileId) => {
    const id = String(profileId ?? '').trim()
    if (!id) {
      const all = profileList()
      if (!all.length) throw new Error('画像库为空：请先提供至少一位参考作者的样本集，在「锚定风格」里启动特征提取（或调用 stylome_weaver_train）。')
      if (all.length === 1) return { profile: loadProfile(dir(), all[0].id), id: all[0].id }
      throw new Error('请指定要比对的画像：' + all.map((p) => `${p.id}（${p.author}）`).join('、'))
    }
    return { profile: loadProfile(dir(), id), id }
  }

  /** 训练：从样本文件夹学一位作者的画像并归档。 */
  const train = async ({ dir: sampleDir, author = '', alpha = null, minN = null, onProgress = null, cancel = null }) => {
    const cfgAlpha = Number.isFinite(alpha) ? alpha : config.alpha
    const cfgMinN = Number.isFinite(minN) ? minN : config.minN
    return serialize(async () => {
      const m = ensureMeter()
      try {
        return await withTimeout(trainFromFolder({
          dir: sampleDir,
          author,
          alpha: cfgAlpha,
          minN: cfgMinN,
          profileDir: dir(),
          meter: m,
          maxFiles: config.maxFiles,
          onProgress: onProgress ?? (() => {}),
          cancel,
        }), '特征提取')
      } catch (e) {
        dropMeter() // 桥可能已死：下一次重建，而不是一直复用坏进程
        throw e
      }
    })
  }

  /** 比对：目标文档 × 画像。problemZ 决定「哪些段落算问题段落」，段数不设配额。 */
  const compare = async ({ profileId, text, source, problemZ = null }) => {
    const chars = [...text].length
    if (!text.trim()) throw new Error('目标文档是空的')
    if (chars > config.maxChars) throw new Error(`文档 ${chars} 字符，超过单次上限 ${config.maxChars}；请分段比对`)
    const z = Number.isFinite(Number(problemZ)) && problemZ !== null ? clampProblemZ(problemZ) : clampProblemZ(config.problemZ)
    const picked = requireProfile(profileId)
    return serialize(async () => {
      const m = ensureMeter()
      try {
        return await withTimeout(compareDocument({ profile: picked.profile, profileId: picked.id, text, source, meter: m, problemZ: z }), '比对')
      } catch (e) {
        dropMeter()
        throw e
      }
    })
  }

  /** 一份画像的完整面板视图（回放用）：统计 + 指标 + 关键词 + 雷达。 */
  const profileView = (id) => {
    const profile = loadProfile(dir(), id)
    const summary = summaryOf(profile, id)
    const axes = profileAxes(profile)
    const cards = profileCards(profile)
    const keywords = profileKeywords(profile)
    return {
      id,
      author: profile.author ?? id,
      createdAt: profile.createdAt,
      alpha: profile.alpha,
      minN: profile.minN,
      summary,
      source: profile.source ?? {},
      coverage: profile.coverage,
      tiers: tierRows(profile),
      axes,
      cards,
      keywords,
      rows: coverageRows(profile, 24),
      svg: renderRadarSVG({
        axes: axes.map((a) => ({ key: a.key, label: a.label })),
        series: [{ key: 'profile', label: profile.author ?? id, tone: 'profile', values: Object.fromEntries(axes.map((a) => [a.key, a.value])), raw: Object.fromEntries(axes.map((a) => [a.key, a.raw])) }],
      }),
    }
  }

  const firstRunHint = '首次使用：画像库里还没有任何作者风格画像。请让用户提供至少一位参考作者的样本集（.txt / .md / .docx / .doc / .pdf 文件所在的文件夹），再用 stylome_weaver_train 训练，或在侧栏「StylomeWeaver → 锚定风格」里选择文件夹启动特征提取。'

  // ---------- 工具 ----------
  const output = (description) => ({
    schema: { type: 'object', additionalProperties: false, description, properties: { text: { type: 'string', required: true } } },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  })

  ctx.effect(() => {
    const offs = [
      ctx.tools.register(defineTool({
        name: 'stylome_weaver_train',
        description: '从一位参考作者的样本文件夹训练作者风格画像：逐段测量（分词 + 零模型特征），学出「每特征 × 每段长档」的分位带并存入画像库。不携带任何预训练权重，画像完全来自用户提供的样本。训练完成后返回风格关键词、指标卡与九轴指纹。',
        parameters: {
          dir: { type: 'string', description: '参考作者样本所在文件夹（相对路径按当前会话目录解析；递归深度 ≤ 3，最多 200 个文件）' },
          author: { type: 'string', description: '可选：作者名（画像 id 由它生成；缺省用文件夹名）' },
          alpha: { type: 'number', description: '可选：带外概率预算，缺省用插件配置（0.1）' },
          minN: { type: 'number', description: '可选：每档建带所需最少段落数，缺省用插件配置（30）' },
        },
        output: output('训练结果：样本统计、关键词、指标卡、九轴指纹与存盘位置'),
        execute: async (args) => {
          const target = String(args.dir ?? '').trim()
          if (!target) return { text: '需要 dir：参考作者样本所在的文件夹。' }
          try {
            const abs = resolveInputPath(target)
            const result = await train({ dir: abs, author: String(args.author ?? '').trim(), alpha: Number(args.alpha), minN: Number(args.minN) })
            if (result.cancelled) return { text: `训练已取消：已处理 ${result.paragraphs} 个可校验段落，未写入画像。` }
            return { text: renderTrainReport({ profile: { ...result, id: result.id, author: result.author, coverage: result.coverage, alpha: result.alpha, minN: result.minN }, keywords: result.keywords, cards: result.cards, axes: result.axes, files: result.files, paragraphs: result.paragraphs, chars: result.chars, replaced: result.replaced }) }
          } catch (e) {
            return { text: `无法训练：${e?.message ?? e}\n可先调用 stylome_weaver_doctor 检查运行环境。` }
          }
        },
      })),
      ctx.tools.register(defineTool({
        name: 'stylome_weaver_profiles',
        description: '列出画像库里已保存的作者风格画像（作者、创建时间、样本量、特征覆盖）。画像库为空时给出首次使用的操作说明。',
        parameters: {},
        output: output('画像清单或首次使用说明'),
        execute: async () => {
          try {
            const listed = listProfiles(dir())
            if (!listed.profiles.length) return { text: `画像库为空（${listed.dir}）。\n\n${firstRunHint}` }
            const rows = listed.profiles.map((p, i) => `${i + 1}. ${p.author}　id=${p.id}　特征 ${p.features} 项　样本 ${p.source.paragraphs} 段 / ${p.source.chars} 字　建于 ${p.createdAt ?? '—'}`)
            const broken = listed.broken.length ? `\n不可读的画像文件 ${listed.broken.length} 个：${listed.broken.map((b) => b.id).join('、')}` : ''
            return { text: `画像库：${listed.dir}\n\n${rows.join('\n')}${broken}\n\n比对用 stylome_weaver_compare（profileId 取上面的 id）。` }
          } catch (e) {
            return { text: `无法读取画像库：${e?.message ?? e}` }
          }
        },
      })),
      ctx.tools.register(defineTool({
        name: 'stylome_weaver_compare',
        description: '把一份目标文档与一位已训练的作者风格画像逐段比对：给出九轴差异、逐段越带发现（参考带 / 实测 / 严重度）、原文问题片段定位与方向性修改意见。只比对与建议，不改写文本。问题段落按阈值全量列出（段落最深 z ≥ problemZ），不按条数截断。',
        parameters: {
          text: { type: 'string', description: '目标文档正文；与 path 二选一' },
          path: { type: 'string', description: '.txt / .md / .docx / .doc / .pdf 文件路径（相对路径按当前会话目录解析）；与 text 二选一' },
          profileId: { type: 'string', description: '要比对的画像 id；只有一位作者时可省略' },
          problemZ: { type: 'number', description: '可选：问题段落阈值（段落最深越带 z ≥ 该值即列入）。缺省用插件配置（2 = 严重档）；1 = 连明显档一起列；记录下限为 1' },
        },
        output: output('比对报告：判读汇总、问题段落判据、逐段问题与修改意见（按严重度排序，全量）'),
        execute: async (args) => {
          const text = typeof args.text === 'string' ? args.text : ''
          const path = typeof args.path === 'string' ? args.path.trim() : ''
          if (!text && !path) return { text: '需要 text 或 path 之一：把正文放进 text，或给出文件路径。' }
          if (text && path) return { text: 'text 与 path 只能给一个。' }
          try {
            const body = path ? readText(resolveInputPath(path)) : text
            const result = await compare({ profileId: args.profileId, text: body, source: path ? basename(path) : null, problemZ: args.problemZ })
            const md = renderFindings({
              source: path ? basename(path) : null,
              doc: { hanTotal: result.document.hanTotal, paras: result.document.paras },
              validation: { checked: result.document.checked, skipped: result.document.skipped, rollup: result.findings.rollup },
              findingsJson: { profile: { ...result.profile, cells: 0 }, criterion: result.findings.criterion, paragraphs: result.problems },
            })
            const dirs = result.advice.length ? '\n\n## 优先修改方向\n\n' + result.advice.map((a, i) => `${i + 1}. ${a.label}（${a.count} 处，${a.side === 'uncovered' ? '分类判定' : `最深 z=${a.zMax}`}）：${a.advice}`).join('\n') : ''
            return { text: md + dirs }
          } catch (e) {
            return { text: `无法比对：${e?.message ?? e}\n可先调用 stylome_weaver_doctor 检查运行环境。` }
          }
        },
      })),
      ctx.tools.register(defineTool({
        name: 'stylome_weaver_doctor',
        description: '检查本插件的运行条件：node 版本、Python 解释器、jieba 分词桥、测量核、画像库与文档导入。训练或比对报错时先调用它。',
        parameters: {},
        output: output('逐项体检结果'),
        execute: async () => {
          try {
            const { checks } = await doctor({ python: config.python || defaultPython(), profilesDir: config.profileDir })
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

  // ---------- 命令 ----------
  ctx.inject(['commands'], (c) => c.commands.register({
    name: 'weaver',
    description: '作者风格锚定：体检、画像清单、从样本文件夹训练、比对一份文档',
    input: { hint: 'doctor | profiles | train <样本文件夹> [作者名] | compare <画像id> <文件路径>' },
    handler: async ({ rawInput }) => {
      const ok = (text) => ({ kind: 'success', text })
      const bad = (text) => ({ kind: 'error', text })
      const raw = String(rawInput ?? '').trim()
      const parts = raw.split(/\s+/).filter(Boolean)
      const cmd = parts[0] ?? 'help'
      try {
        if (cmd === 'help' || cmd === '') {
          return ok('用法：/weaver doctor ｜ /weaver profiles ｜ /weaver train <样本文件夹> [作者名] ｜ /weaver compare <画像id> <文件路径>\n图像与雷达在侧栏「StylomeWeaver」面板里查看。')
        }
        if (cmd === 'doctor') {
          const { ok: passed, checks } = await doctor({ python: config.python || defaultPython(), profilesDir: config.profileDir })
          return { kind: passed ? 'success' : 'error', text: renderDoctor(checks) }
        }
        if (cmd === 'profiles') {
          const all = profileList()
          if (!all.length) return bad(`画像库为空（${dir()}）。\n${firstRunHint}`)
          return ok(all.map((p) => `${p.author}　id=${p.id}　特征 ${p.features}　样本 ${p.source.paragraphs} 段`).join('\n'))
        }
        if (cmd === 'train') {
          const target = parts[1]
          if (!target) return bad('用法：/weaver train <样本文件夹> [作者名]')
          const abs = resolveInputPath(target)
          const result = await train({ dir: abs, author: parts[2] ?? '' })
          if (result.cancelled) return bad('训练已取消。')
          return ok(`画像已保存：${result.author}（id=${result.id}）\n特征 ${result.summary.features}/${result.coverage.total} 项，样本 ${result.paragraphs} 段 / ${result.chars} 字\n关键词：${result.keywords.map((k) => k.word).join('、')}`)
        }
        if (cmd === 'compare') {
          const profileId = parts[1]
          const file = parts[2]
          if (!profileId || !file) return bad('用法：/weaver compare <画像id> <文件路径>')
          const body = readText(resolveInputPath(file))
          const result = await compare({ profileId, text: body, source: basename(file) })
          return ok(`画像 ${result.profile.author} ｜ ${result.document.hanTotal} 字 / ${result.document.paras} 段\n` +
            `越带 ${result.document.verdicts['越带'] ?? 0} 段，关注 ${result.document.verdicts['关注'] ?? 0} 段，在带内 ${result.document.verdicts['在带内'] ?? 0} 段\n` +
            (result.problemCount ? `问题段 ${result.problemCount} 个；详细意见见面板「比对分析」。` : '全部段落都在画像带内。'))
        }
        return bad('未知子命令：' + cmd + '（用 /weaver help 查看用法）')
      } catch (e) {
        return bad(`失败：${e?.message ?? e}\n可先 /weaver doctor 检查运行环境。`)
      }
    },
  }))

  // ---------- 首次运行提醒（无画像时） ----------
  // 只在画像库为空时把提示写进系统提示；有画像后只剩一行状态，不占上下文。
  ctx.inject(['systemPrompt'], (s) => s.effect(() => s.systemPrompt.section({
    name: 'stylome-weaver',
    order: 80,
    text: () => {
      let all = []
      try { all = profileList() } catch { all = [] }
      if (!all.length) {
        return [
          '## StylomeWeaver（作者风格锚定）',
          '画像库为空：本插件不携带任何预训练权重或内置作者画像。',
          '在与用户讨论「像不像某位作者的文风」之前，先请用户提供至少一位参考作者的样本集（.txt / .md / .docx / .doc / .pdf 文件所在的文件夹），',
          '然后调用 stylome_weaver_train 训练画像，再用 stylome_weaver_compare 比对。没有画像时不要猜测或编造某位作者的风格结论。',
        ].join('\n')
      }
      const names = all.slice(0, 6).map((p) => `${p.author}(${p.id})`).join('、')
      return [
        '## StylomeWeaver（作者风格锚定）',
        `已有 ${all.length} 位作者的风格画像：${names}${all.length > 6 ? ' 等' : ''}。`,
        '比对目标文档时用 stylome_weaver_compare（profileId 指定画像）；新增作者用 stylome_weaver_train 从样本文件夹训练。',
      ].join('\n')
    },
  })))

  // ---------- Web 面板数据通道 ----------
  // 只服务同源的 DSH Web UI：不额外鉴权，依赖 Web 服务自身的监听范围。
  // 训练任务只存在内存里，插件重载即失效（面板会提示重新开始）。
  const sendJson = (res, status, data) => {
    try {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(data))
    } catch { /* 客户端已断开 */ }
  }
  const ok = (res, result) => sendJson(res, 200, { ok: true, result })
  // 默认按「请求不被接受」返回：本面板的全部错误都是用户侧可修正的（路径、样本、画像选择）。
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
    try { await handler(req, res) } catch (e) { fail(res, e, e?.status ?? 400) }
  }
  const queryOf = (req) => new URL(req.url ?? '/', 'http://local').searchParams
  // 面板接口清单：用于区分「未知接口」（404）与「接口存在但方法不对」（405）。
  const PANEL_ROUTES = new Set(['/state', '/doctor', '/pick-folder', '/scan', '/train/start', '/train/state', '/train/cancel', '/profiles', '/profile', '/profile/delete', '/compare', '/compare-upload'])

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

  const startTrainJob = ({ sampleDir, author, alpha, minN }) => {
    const id = randomId()
    const job = {
      id, status: 'queued', done: 0, total: 0, current: null, paragraphs: 0,
      result: null, error: null, cancelled: false, startedAt: Date.now(),
    }
    jobs.set(id, job)
    trimJobs(id)
    const cancel = () => job.cancelled === true
    ;(async () => {
      job.status = 'running'
      try {
        const result = await train({
          dir: sampleDir,
          author,
          alpha,
          minN,
          cancel,
          onProgress: (p) => {
            if (p?.phase !== 'measure') return
            job.done = p.done ?? job.done
            job.total = p.total ?? job.total
            job.current = p.current ?? null
            job.paragraphs = p.paragraphs ?? job.paragraphs
          },
        })
        job.result = result
        job.status = result?.cancelled ? 'cancelled' : 'done'
      } catch (e) {
        job.error = String(e?.message ?? e)
        job.status = 'error'
      } finally {
        job.current = null
      }
    })()
    return { jobId: id, total: 0 }
  }

  ctx.inject(['webServer'], (w) => {
    w.effect(() => {
      let off = null
      try { off = w.webServer.register({ kind: 'prefix', path: PANEL_API, handler: route(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://local')
        const sub = url.pathname.slice(PANEL_API.length) || '/'

        if (sub === '/state' && req.method === 'GET') {
          const all = profileList()
          const cm = ctx.get('clientModules')
          return ok(res, {
            plugin: 'stylome-weaver',
            firstRun: all.length === 0,
            profilesDir: dir(),
            profiles: all,
            exts: TEXT_EXTS,
            alpha: config.alpha,
            minN: config.minN,
            problemZ: clampProblemZ(config.problemZ),
            maxFiles: config.maxFiles,
            maxChars: config.maxChars,
            maxUploadBytes: MAX_UPLOAD,
            clientService: !!cm,
            clientPath: cm?.clientPath?.('stylome-weaver') ?? null,
          })
        }

        if (sub === '/doctor' && req.method === 'GET') {
          const report = await doctor({ python: config.python || defaultPython(), profilesDir: config.profileDir })
          return ok(res, report)
        }

        if (sub === '/pick-folder' && req.method === 'POST') {
          return ok(res, { path: await pickFolder() })
        }

        if (sub === '/scan' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const target = String(body.dir ?? '').trim()
          if (!target) throw new Error('缺少 dir')
          const scan = scanFolder(assertDir(target), { maxFiles: config.maxFiles })
          return ok(res, {
            dir: scan.dir,
            total: scan.total,
            unsupported: scan.unsupported,
            truncated: scan.truncated,
            limit: scan.limit,
            files: scan.files.map((f) => ({ name: f.name, rel: f.rel, ext: f.ext, size: f.size })),
          })
        }

        if (sub === '/train/start' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const target = String(body.dir ?? '').trim()
          if (!target) throw new Error('缺少 dir')
          const scan = scanFolder(assertDir(target), { maxFiles: config.maxFiles })
          if (!scan.files.length) throw new Error(`文件夹里没有可读文档（支持 ${TEXT_EXTS.join(' / ')}）`)
          const alpha = Number(body.alpha)
          const minN = Number(body.minN)
          const started = startTrainJob({
            sampleDir: scan.dir,
            author: String(body.author ?? '').trim(),
            alpha: Number.isFinite(alpha) ? alpha : config.alpha,
            minN: Number.isFinite(minN) ? minN : config.minN,
          })
          return ok(res, { ...started, total: scan.files.length, files: scan.files.length, truncated: scan.truncated, scan: { total: scan.total, unsupported: scan.unsupported } })
        }

        if (sub === '/train/state' && req.method === 'GET') {
          const job = jobs.get(String(queryOf(req).get('jobId') ?? ''))
          if (!job) throw new Error('任务不存在或已过期（插件可能已重载，请重新开始）')
          return ok(res, {
            jobId: job.id,
            status: job.status,
            done: job.done,
            total: job.total,
            current: job.current,
            paragraphs: job.paragraphs,
            error: job.error,
            result: job.status === 'done' ? job.result : null,
          })
        }

        if (sub === '/train/cancel' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const job = jobs.get(String(body.jobId ?? ''))
          if (!job) throw new Error('任务不存在或已过期')
          job.cancelled = true
          return ok(res, { cancelled: true })
        }

        if (sub === '/profiles' && req.method === 'GET') {
          const listed = listProfiles(dir())
          return ok(res, { dir: listed.dir, profiles: listed.profiles, broken: listed.broken, firstRun: listed.profiles.length === 0 })
        }

        if (sub === '/profile' && req.method === 'GET') {
          const id = String(queryOf(req).get('id') ?? '').trim()
          if (!id) throw new Error('缺少 id')
          return ok(res, profileView(id))
        }

        if (sub === '/profile/delete' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const id = String(body.id ?? '').trim()
          if (!id) throw new Error('缺少 id')
          return ok(res, deleteProfile(dir(), id))
        }

        if (sub === '/compare' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const file = String(body.path ?? '').trim()
          const profileId = String(body.profileId ?? '').trim() || null
          if (!file) throw new Error('缺少 path')
          if (!existsSync(file)) { const e = new Error('文件不存在：' + file); e.status = 404; throw e }
          if (!TEXT_EXTS.includes(extname(file).toLowerCase())) throw new Error('不支持的文件格式：' + extname(file))
          const result = await compare({ profileId, text: readText(file), source: basename(file), problemZ: body.problemZ ?? null })
          const { findings, ...rest } = result
          return ok(res, { ...rest, path: file })
        }

        if (sub === '/compare-upload' && req.method === 'POST') {
          const q = queryOf(req)
          const name = q.get('name') || 'upload.txt'
          const profileId = String(q.get('profileId') ?? '').trim() || null
          const problemZ = q.get('problemZ')
          const ext = extname(name).toLowerCase()
          if (!TEXT_EXTS.includes(ext)) throw new Error('不支持的文件格式：' + (ext || '未知'))
          const buf = await readBody(req, MAX_UPLOAD)
          if (!buf.length) throw new Error('上传内容为空')
          const tmp = join(tmpdir(), `stylome-weaver-${Date.now()}-${randomId()}${ext}`)
          writeFileSync(tmp, buf)
          try {
            const result = await compare({ profileId, text: readText(tmp), source: name, problemZ })
            const { findings, ...rest } = result
            return ok(res, { ...rest, path: null })
          } finally {
            try { rmSync(tmp, { force: true }) } catch { /* 临时文件清理失败不影响结果 */ }
          }
        }

        if (PANEL_ROUTES.has(sub)) {
          const e = new Error(`接口 ${sub} 不支持 ${req.method}`); e.status = 405; throw e
        }
        const e = new Error('未知接口：' + sub); e.status = 404; throw e
      }) }) }
      catch { /* 热重载时同一路径可能尚未释放：跳过不影响面板以外的功能 */ }
      return () => { try { off?.() } catch { /* 已卸载 */ } }
    })
  })

  // 相对路径的基准目录：优先取宿主的工作目录服务，其次退回进程目录。
  // （面板传来的路径都来自原生选择器或扫描结果，本来就是绝对路径；这里只服务工具与命令的手输路径。）
  const cwdOf = () => {
    try {
      const d = ctx.get('workingDirectory')?.defaultDirectory
      if (typeof d === 'string' && d) return d
    } catch { /* 取不到工作目录服务时退回宿主进程目录 */ }
    return process.cwd()
  }
  const resolveInputPath = (path) => {
    const abs = isAbsolute(path) ? path : resolve(cwdOf(), path)
    if (!existsSync(abs)) throw new Error('路径不存在：' + abs)
    return abs
  }
}
