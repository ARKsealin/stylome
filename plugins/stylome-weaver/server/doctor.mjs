// 运行条件体检：node 版本 / Python 解释器 / jieba 分词桥 / 测量核 / 画像库 / 文档导入。
// 零模型零网络：本插件不随包携带任何权重或画像，体检也只看本机条件。

import { spawn } from 'node:child_process'
import { mkdirSync, accessSync, constants } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { listProfiles, profilesDir as resolveProfilesDir } from './profile.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

export const defaultPython = () => process.env.STYLOME_WEAVER_PYTHON || process.env.STYLOME_PYTHON || 'python'

const run = (cmd, args, timeoutMs = 15000) => new Promise((resolve) => {
  let out = '', err = '', done = false
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const timer = setTimeout(() => { if (!done) { done = true; try { p.kill() } catch { /* 已退出 */ } resolve({ ok: false, msg: '超时' }) } }, timeoutMs)
  p.stdout.on('data', (b) => (out += b.toString()))
  p.stderr.on('data', (b) => (err += b.toString()))
  p.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, msg: e.message }) } })
  p.on('exit', (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: code === 0, msg: (out || err).trim().split('\n')[0] || `code ${code}` }) } })
})

/**
 * @param {object} opts { python, profilesDir }
 * @returns {Promise<{ok:boolean, checks:Array<{name:string,ok:boolean,msg:string}>, profiles:number, profilesDir:string}>}
 */
export async function doctor(opts = {}) {
  const checks = []
  const add = (name, ok, msg) => checks.push({ name, ok, msg })
  const dir = resolveProfilesDir(opts.profilesDir ?? opts.dir ?? '')

  // ① node
  const nv = process.versions.node.split('.').map(Number)
  add('node ≥ 22', nv[0] >= 22, `当前 ${process.versions.node}`)

  // ② python 解释器
  const py = opts.python || defaultPython()
  const pv = await run(py, ['--version'])
  add('Python 解释器', pv.ok, pv.ok ? pv.msg : `${py}：${pv.msg}`)

  // ③ jieba 分词桥（起桥 + 试切）
  if (pv.ok) {
    try {
      const { startSegmenter } = await import(pathToFileURL(join(HERE, '..', 'lib', 'corpus', 'segmenter.mjs')).href)
      const seg = startSegmenter(py)
      const toks = await seg.segment('他推开门，走进声学圣堂。')
      seg.stop()
      const ok = Array.isArray(toks) && toks.length >= 4 && toks.every((t) => t.w !== undefined && t.p !== undefined)
      add('jieba 分词桥', ok, ok ? `${toks.length} tokens，词性齐全` : '返回结构异常（缺 w/p 字段）')
    } catch (e) {
      add('jieba 分词桥', false, e?.message ?? String(e))
    }
  } else add('jieba 分词桥', false, 'Python 不可用，跳过')

  // ④ 测量核自检（假 tokens 走一遍 measure + flatten + extraFeatures）
  try {
    const { measure } = await import(pathToFileURL(join(HERE, '..', 'lib', 'meter', 'measure.mjs')).href)
    const { flatten } = await import(pathToFileURL(join(HERE, '..', 'lib', 'profile', 'flatten.mjs')).href)
    const { extraFeatures } = await import(pathToFileURL(join(HERE, 'features.mjs')).href)
    const text = '他推开门，走进声学圣堂。穹顶的回声层层叠叠，仿佛整座建筑在呼吸。'
    const toks = [{ w: '他', p: 'r' }, { w: '推开', p: 'v' }, { w: '门', p: 'n' }, { w: '，', p: 'w' }, { w: '走进', p: 'v' }, { w: '声学', p: 'n' }, { w: '圣堂', p: 'n' }, { w: '，', p: 'w' }, { w: '穹顶', p: 'n' }, { w: '的', p: 'uj' }, { w: '回声', p: 'n' }, { w: '。', p: 'w' }]
    const flat = flatten(measure(text, toks))
    Object.assign(flat, extraFeatures(text, flat, toks))
    const ok = Number.isFinite(flat['fw:的']) && Number.isFinite(flat['lex:mattr']) && Number.isFinite(flat['emo:R']) && Number.isFinite(flat['bigramDiv'])
    add('测量核（measure+flatten+extra）', ok, ok ? `${Object.keys(flat).filter((k) => Number.isFinite(flat[k])).length} 个可测特征` : '特征缺失')
  } catch (e) {
    add('测量核（measure+flatten）', false, e?.message ?? String(e))
  }

  // ⑤ 画像库（可创建可列举；空库不是故障，是首次使用的待办状态）
  let profiles = 0
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.R_OK | constants.W_OK)
    profiles = listProfiles(dir).profiles.length
    add('画像库', true, profiles ? `${dir}：${profiles} 位作者` : `${dir}：尚无画像——首次使用需先提供参考作者样本集训练`)
  } catch (e) {
    add('画像库', false, `${dir}：${e?.message ?? e}`)
  }

  // ⑥ 文档导入依赖（docx/pdf 都用 zlib）
  try {
    const { inflateRawSync } = await import('node:zlib')
    const ok = typeof inflateRawSync === 'function'
    add('docx/pdf 导入（zlib）', ok, ok ? 'inflateRawSync 可用' : '缺失')
  } catch (e) {
    add('docx/pdf 导入（zlib）', false, e?.message ?? String(e))
  }

  return { ok: checks.every((c) => c.ok), checks, profiles, profilesDir: dir }
}

export function renderDoctor(checks) {
  const lines = checks.map((c) => (c.ok ? '✓ ' : '✗ ') + c.name + ' —— ' + c.msg)
  const bad = checks.filter((c) => !c.ok).length
  lines.push(bad === 0 ? '全部通过：可以训练画像与比对文档。' : `${bad} 项未过，先处理再使用。`)
  return lines.join('\n')
}
