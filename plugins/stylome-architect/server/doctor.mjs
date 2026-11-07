// stylomeArchitect 体检：node 版本 / Python / jieba 桥 / 词典 / 经验库 / 测量核。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { resolveEmbedModelDir, embedModelReady } from './embedModel.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const defaultPython = () => process.env.LITISTRUCTURE_PYTHON || process.env.STYLOME_PYTHON || process.env.LITIDENTIFY_PYTHON || 'python'

const run = (cmd, args, timeoutMs = 15000) => new Promise((resolve) => {
  let out = '', err = '', done = false
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const timer = setTimeout(() => { if (!done) { done = true; try { p.kill() } catch { /* 已退出 */ } resolve({ ok: false, msg: '超时' }) } }, timeoutMs)
  p.stdout.on('data', (b) => (out += b.toString()))
  p.stderr.on('data', (b) => (err += b.toString()))
  p.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, msg: e.message }) } })
  p.on('exit', (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: code === 0, msg: (out || err).trim().split('\n')[0] || `code ${code}` }) } })
})

export async function doctor(opts = {}) {
  const checks = []
  const add = (name, ok, msg) => checks.push({ name, ok, msg })
  const nv = process.versions.node.split('.').map(Number)
  add('node ≥ 22', nv[0] >= 22, `当前 ${process.versions.node}`)
  const py = opts.python || defaultPython()
  const pv = await run(py, ['--version'])
  add('Python 解释器', pv.ok, pv.ok ? pv.msg : `${py}：${pv.msg}`)
  if (pv.ok) {
    try {
      const { startSegmenter } = await import(pathToFileURL(join(HERE, '..', 'lib', 'corpus', 'segmenter.mjs')).href)
      const seg = startSegmenter(py)
      const toks = await seg.segment('她推开门，听见穹顶的回声。')
      seg.stop()
      add('jieba 分词桥', Array.isArray(toks) && toks.length >= 4, `${toks?.length ?? 0} tokens`)
    } catch (e) { add('jieba 分词桥', false, e?.message ?? String(e)) }
  } else add('jieba 分词桥', false, 'Python 不可用')
  try {
    const { loadLexicon, resolveLexiconPath } = await import(pathToFileURL(join(HERE, 'lexicon.mjs')).href)
    const dict = loadLexicon()
    add('大工情感词典（外部数据）', dict.size > 20000, `${dict.size} 词条（${resolveLexiconPath()}；大连理工 IR Lab，学术免费）`)
  } catch (e) { add('大工情感词典（外部数据）', false, `${e?.message ?? e}\n    → 面板「依赖」会弹窗给出官方页与期望路径；放置后点「重新检查」`) }
  try {
    const { workProfile } = await import(pathToFileURL(join(HERE, 'architect.mjs')).href)
    const { hurstDFA } = await import(pathToFileURL(join(HERE, '..', 'lib', 'meter', 'stats.mjs')).href)
    void workProfile
    const h = hurstDFA(Array.from({ length: 64 }, (_, i) => 5 + Math.sin(i / 3) * 3))
    add('宏观测量核（DFA 等）', Number.isFinite(h), `试算 H=${h.toFixed(3)}`)
  } catch (e) { add('宏观测量核（DFA 等）', false, e?.message ?? String(e)) }
  // 神经轨模型（外部，opt-in）：体检只报就绪状态，不下载；是否下载由面板「依赖」弹窗交用户确认
  try {
    const nDir = resolveEmbedModelDir()
    add('神经轨模型（外部，opt-in）', true, embedModelReady(nDir)
      ? `已就绪：${nDir}`
      : `未就绪：${nDir}——面板「依赖」会弹窗让你确认是否现在下载（约 470 MB）；不下载时神经轨缺席，纯统计三轨不受影响`)
  } catch (e) {
    add('神经轨模型（外部，opt-in）', true, `不可用（${e?.message ?? e}）——神经轨优雅降级，纯统计三轨不受影响`)
  }

  try {
    const { loadLibrary, librarySummary, defaultLibraryRoot, resolveLibraryRoot } = await import(pathToFileURL(join(HERE, 'library.mjs')).href)
    const libRoot = resolveLibraryRoot(opts.libraryPath || defaultLibraryRoot())
    const lib = loadLibrary(libRoot)
    const s = librarySummary(lib)
    if (!s.totalWorks) {
      add('档案库（首次使用）', false, `空库：${libRoot}——出厂不携带任何样本与参数，三步初始化：① 收录锚定作者作品（工具 stylome_architect mode=ingest / 侧栏面板「档案库」） ② 标注锚定作者（mode=mark） ③（可选）收录其他作者作品以启用迁移参考`)
    } else if (!s.anchor) {
      add('档案库', false, `${libRoot}：已有 ${s.totalWorks} 部作品但未标注锚定（mode=mark <作者>）`)
    } else {
      add('档案库', true, `${libRoot}｜锚定=${s.anchor}｜作者 ${s.authors.length} 个｜作品 ${s.totalWorks} 部`)
    }
  } catch (e) {
    add('档案库', false, `${e?.message ?? e}（先收录作品）`)
  }
  return { ok: checks.every((c) => c.ok), checks }
}

export function renderDoctor(checks) {
  const lines = checks.map((c) => (c.ok ? '✓ ' : '✗ ') + c.name + ' —— ' + c.msg)
  const bad = checks.filter((c) => !c.ok).length
  lines.push(bad === 0 ? '全部通过，可以织体校验。' : `${bad} 项未过，先处理再使用。`)
  return lines.join('\n')
}
