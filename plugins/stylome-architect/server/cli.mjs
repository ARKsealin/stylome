// stylomeArchitect 命令行：
//   node server/cli.mjs --doctor
//   node server/cli.mjs --lib-add <作者> <文件/目录...>      收录作品 → 作者分区档案（dossier+正文副本）
//   node server/cli.mjs --lib-mark <作者>                    标注锚定风格（唯一）
//   node server/cli.mjs --lib-list                           查看档案库
//   node server/cli.mjs --weave <文件> [--library library] [--json out.weave.json]
// 零模型零网络；测量可复现；语义解释与改写参考归 agent。

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRaw, readText } from '../lib/corpus/import.mjs'
import { loadLexicon } from './lexicon.mjs'
import { StreamMeter, pythonPath } from './stream.mjs'
import { workProfile, learnRepertoire, locate } from './architect.mjs'
import { defaultLibraryRoot, resolveLibraryRoot, loadLibrary, saveLibrary, ingestWorks, markAnchor, librarySummary, loadDossiers, allDossiers, filesOf } from './library.mjs'
import { annotate, readAnnotations, annotatedCount } from './annotation.mjs'
import { neuralTrack, trajectoryNeighbors, defaultNeuralModelDir } from './neural.mjs'
import { renderWeave, buildWeaveJson, renderCharts } from './report.mjs'
import { buildSuggestions } from './advice.mjs'
import { selfAssessment } from './fidelity.mjs'
import { transferSuggestions } from './transfer.mjs'
import { doctor, renderDoctor, defaultPython } from './doctor.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const TEXT_EXT = new Set(['.txt', '.md', '.docx', '.doc', '.pdf'])

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(name)
  if (i < 0 || i + 1 >= process.argv.length) return dflt
  const v = process.argv[i + 1]
  return v != null && !String(v).startsWith('--') ? v : dflt
}
const has = (name) => process.argv.includes(name)
const valuesAfter = (name) => {
  const i = process.argv.indexOf(name)
  if (i < 0) return []
  const out = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j])
  return out
}
const log = (m) => console.log(m)

async function main() {
  if (has('--doctor')) {
    const { checks } = await doctor({ python: arg('--python') || defaultPython(), libraryPath: arg('--library') })
    log(renderDoctor(checks))
    process.exit(checks.every((c) => c.ok) ? 0 : 1)
  }

  const libRoot = resolveLibraryRoot(arg('--library'))

  if (has('--lib-list')) {
    const lib = loadLibrary(libRoot)
    const s = librarySummary(lib)
    log(`锚定作者：${s.anchor ?? '（未标注——--lib-mark <作者>）'}`)
    for (const a of s.authors) log(`  ${a.name === s.anchor ? '★' : ' '} ${a.name}：${a.works} 部 / ${a.han} 字`)
    log(`合计 ${s.totalWorks} 部`)
    process.exit(0)
  }

  if (has('--lib-mark')) {
    const author = arg('--lib-mark')
    markAnchor(libRoot, author)
    log(`✓ 锚定风格已标注：${author}`)
    process.exit(0)
  }

  if (has('--lib-add')) {
    const vals = valuesAfter('--lib-add')
    if (vals.length < 2) { log('用法：--lib-add <作者> <文件/目录...>'); process.exit(1) }
    const author = vals[0]
    const files = []
    for (const p of vals.slice(1)) {
      const abs = resolve(p)
      if (!existsSync(abs)) { log(`✗ 路径不存在：${p}`); process.exit(1) }
      try { files.push(...filesOf(abs)) } catch { files.push(abs) }
    }
    if (!files.length) { log('✗ 没有可读文本'); process.exit(1) }
    const dict = loadLexicon()
    const meter = new StreamMeter(pythonPath())
    try {
      const items = []
      for (let i = 0; i < files.length; i++) {
        const name = basename(files[i], extname(files[i]))
        items.push({ name, text: readText(files[i]) })
        log(`  读入 [${i + 1}/${files.length}] ${name}`)
      }
      const { added } = await ingestWorks(libRoot, author, items, {
        measure: async (text, name) => {
          const stream = await meter.document(text, dict)
          const profile = workProfile(stream, { name })
          if (has('--neural')) {
            const nt = await neuralTrack(stream.paras, stream.hanTotal, pythonPath())
            if (nt.unavailable) log(`    ⚠ ${name} 神经轨缺席：${nt.unavailable}`)
            else { profile.neural = nt; log(`    神经轨 ✓（smooth=${nt.smooth}）`) }
          }
          return profile
        },
      })
      log(`✓ 已收录 ${author}：新增 ${added} 部（共 ${loadLibrary(libRoot).authors[author].works.length}）`)
    } finally { meter.close() }
    process.exit(0)
  }

  if (has('--annotate')) {
    const vals = valuesAfter('--annotate')
    if (vals.length < 3) { log('用法：--annotate <作者> <作品> <annotations.json>'); process.exit(1) }
    const [author, work, file] = vals
    const patch = JSON.parse(readFileSync(resolve(file), 'utf8'))
    // 场景特征入档：从库内正文副本重算段落流；--neural 时逐场景嵌入
    const txtPath = join(libRoot, author, work + '.txt')
    let stream = null
    if (existsSync(txtPath)) stream = await new StreamMeter(pythonPath()).document(readFileSync(txtPath, 'utf8'), loadLexicon())
    let emb = null
    if (has('--neural') && stream) {
      try {
        const { startEmbedder } = await import('./embedder.mjs')
        const e = startEmbedder(pythonPath(), arg('--neural-model') ?? defaultNeuralModelDir())
        emb = async (text) => { try { const r = await e.embed(text); if (!r.mean) return null; const n2 = Math.hypot(...r.mean) || 1; return r.mean.map((x) => x / n2) } catch { return null } }
      } catch { emb = null }
    }
    const result = await annotate(libRoot, author, work, patch, { stream, emb })
    log(`✓ 标注已回填 ${author}/${work}：${Object.entries(result).filter(([k]) => k !== 'annotatedAt' && k !== 'source').map(([k, v]) => `${k}×${v.length}`).join('，')}${stream && result.scene?.length ? '（sceneFeat 已入档）' : ''}`)
    process.exit(0)
  }

  if (has('--weave')) {
    const file = resolve(arg('--weave'))
    if (!existsSync(file)) { log(`✗ 文件不存在：${file}`); process.exit(1) }
    const lib = loadLibrary(libRoot)
    if (!lib.anchor) { log(Object.keys(lib.authors??{}).length ? '✗ 未标注锚定作者：--lib-mark <作者>' : '✗ 档案库为空（出厂态）：① --lib-add <作者> <目录> 收录锚定作者作品 ② --lib-mark <作者> 标注锚定'); process.exit(1) }
    const anchorDossiers = loadDossiers(libRoot, lib.anchor)
    if (!anchorDossiers.length) { log('✗ 锚定作者档案为空'); process.exit(1) }
    const rep = learnRepertoire(anchorDossiers, { author: lib.anchor })
    const dict = loadLexicon()
    const meter = new StreamMeter(pythonPath())
    try {
      const stream = await meter.document(readRaw(file), dict)
      const profile = workProfile(stream, { name: basename(file) })
      // 神经轨（opt-in）：库内多数 dossier 有 neural 时自动启用；查询作现算，失败优雅降级
      const libNeural = allDossiers(libRoot).filter((d) => d?.neural?.binEmb).length
      if (libNeural >= 2 || has('--neural')) {
        const nt = await neuralTrack(stream.paras, stream.hanTotal, pythonPath(), arg('--neural-model') ?? defaultNeuralModelDir())
        if (nt.unavailable) log(`⚠ 神经轨缺席（${nt.unavailable}），回落纯统计轨`)
        else profile.neural = nt
      }
      const loc = locate(profile, rep)
      const suggestions = buildSuggestions(profile, rep, loc)
      const self = selfAssessment(profile, anchorDossiers)
      const transfer = transferSuggestions(profile, lib, libRoot, lib.anchor, loadDossiers)
      if (profile.neural?.binEmb) {
        const tn = trajectoryNeighbors(profile, lib, libRoot, lib.anchor, loadDossiers).slice(0, 2)
          .map((n) => ({ work: n.dossier.name, author: n.author, distance: Math.round(n.d * 10000) / 10000,
            replay: { metric: 'novelty', self: profile.neural.novelty, neighbor: n.dossier.neural?.novelty },
            advice: `语义轨迹最接近《${n.dossier.name}》（${n.author}，轨迹距离 ${Math.round(n.d * 1000) / 1000}）——可参考该作的段落间新信息释放节奏；逐 bin 新信息速率已回放` }))
        transfer.aspects.push({ id: 'semantic-trajectory', label: '语义轨迹（神经）', neighbors: tn })
      }
      // ── 场景轨：边界来源三选一（--scenes 文件 / 库内同名标注 / 候选+L2 请求）──
      const { buildSceneTrack, sceneCraftDistance } = await import('./scenes.mjs')
      const sceneTrack = await buildSceneTrack({
        profile, stream, libRoot,
        scenesFile: arg('--scenes'), neural: has('--neural'), python: pythonPath(),
        modelDir: arg('--neural-model') ?? defaultNeuralModelDir(),
      })
      if (sceneTrack?.sceneFeat) {
        const qName = profile.name.replace(/\.[^.]+$/, '')
        const scn = allDossiers(libRoot).filter((d) => d.sceneFeat && d.name !== qName)
          .map((d) => ({ name: d.name, author: d.author ?? '库内', d: sceneCraftDistance({ sceneFeat: sceneTrack.sceneFeat }, d) }))
          .filter((x) => Number.isFinite(x.d)).sort((a, b) => a.d - b.d).slice(0, 2)
          .map((n) => ({ work: n.name, author: n.author, distance: Math.round(n.d * 10000) / 10000,
            replay: { metric: '场景节奏', self: `${sceneTrack.sceneFeat.nScenes}场｜CV=${sceneTrack.sceneFeat.sceneLen.cv}｜σ=${sceneTrack.sceneFeat.valenceSwing}`, neighbor: '见该作 dossier.sceneFeat' },
            advice: `场景手艺最接近《${n.name}》（${n.author}）——可参考其场景切分粒度与场景间情绪落差；逐场景比对见场景轨` }))
        transfer.aspects.push({ id: 'scene-craft-query', label: '场景手艺', neighbors: scn })
      }
      const charts = renderCharts(profile)
      const json = buildWeaveJson({ profile, rep, loc, source: basename(file), suggestions, self, transfer, sceneTrack })
      if (has('--json')) writeFileSync(arg('--json'), JSON.stringify(json, null, 1))
      log(renderWeave({ profile, rep, loc, charts, suggestions, self, transfer, sceneTrack }))
      process.exit(0)
    } finally { meter.close() }
  }

  log(`stylomeArchitect —— 宏观织体校验器（档案库 + 双输出，非作者归属）
  --doctor                                    运行环境体检
  --lib-add <作者> <文件/目录...>              收录作品到作者分区档案（dossier+正文副本）
  --lib-mark <作者>                           标注锚定风格（唯一）
  --lib-list                                  查看档案库
  --annotate <作者> <作品> <annotations.json>  L2 标注回填 dossier（scene/foreshadow/attribution/blindspot）
  --lib-add ... [--neural]                     收录时同算神经轨（需句向量桥与模型目录）
  --weave <文件> [--library library] [--json out.weave.json] [--neural]
                                              双输出：①自我忠实与进步变化（锚定档案对比）
                                              ②迁移参考（跨作者相似信号回放）+ 修改建议 + L2 契约
建议为方向性（对齐意图为主，附突破意图确认）；语义标注与改写参考由 agent 完成。`)
  process.exit(0)
}

main().catch((e) => { console.error('✗ ' + (e?.message ?? e)); process.exit(1) })
