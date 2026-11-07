// stylomeArchitect 织体校验流水线（工具 / 命令 / 面板共用的唯一实现）。
//
// 输入：一篇正文 + 档案库。输出：双输出（自我忠实与进步变化 / 跨作者迁移参考）、
// 线索轨、修改建议、场景轨、弧线图与 L2 契约 JSON。
//
// 零模型零网络（神经轨为显式 opt-in 且失败优雅降级）；测量可复现；
// 输出语义是"定位与描述"，不做作者归属判定。

import { basename } from 'node:path'
import { loadLibrary, loadDossiers, allDossiers, librarySummary } from './library.mjs'
import { workProfile, learnRepertoire, locate } from './architect.mjs'
import { buildSuggestions } from './advice.mjs'
import { selfAssessment } from './fidelity.mjs'
import { transferSuggestions } from './transfer.mjs'
import { neuralTrack, trajectoryNeighbors, defaultNeuralModelDir } from './neural.mjs'
import { buildSceneTrack, sceneCraftDistance } from './scenes.mjs'
import { renderCharts, buildWeaveJson } from './report.mjs'
import { loadLexicon } from './lexicon.mjs'
import { pythonPath } from './stream.mjs'

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)

/** 锚定作者缺失/样本不足时的统一错误（面板与工具都据此给下一步指引）。 */
export const ANCHOR_MISSING = '档案库未标注锚定作者：先收录作品，再标注锚定（工具 stylome_architect mode=mark，或面板「档案库」）。'

/**
 * 跑一次织体校验。
 * @param {object} opts
 * @param {object} opts.meter        StreamMeter（复用常驻分词桥）
 * @param {string} opts.text         正文（已清洗或原始均可，document 内会再清洗）
 * @param {string} opts.name         作品名（用于与库内同名作品互斥比较）
 * @param {string} opts.libRoot      档案库根目录
 * @param {boolean} [opts.neural]    强制开启神经轨
 * @param {string} [opts.neuralModel] 神经轨模型目录
 * @param {string} [opts.scenesFile]  指定场景边界文件（JSON {scene:[段号]}）
 * @param {Map} [opts.lexicon]       已装载的大工词典（缺省现装）
 * @param {(p:object)=>void} [opts.onProgress] 进度回调（仅阶段提示）
 */
export async function analyzeWork({
  meter, text, name, libRoot,
  neural = false, neuralModel = null, scenesFile = null,
  lexicon = null, onProgress = () => {},
}) {
  const dict = lexicon ?? loadLexicon()
  const lib = loadLibrary(libRoot)
  if (!lib.anchor) throw new Error(ANCHOR_MISSING)
  const anchorDossiers = loadDossiers(libRoot, lib.anchor)
  if (!anchorDossiers.length) throw new Error(`锚定作者「${lib.anchor}」的档案为空：先用 ingest 收录其作品。`)
  const rep = learnRepertoire(anchorDossiers, { author: lib.anchor })

  onProgress({ phase: 'measure', label: '逐段测量' })
  const stream = await meter.document(text, dict)
  const profile = workProfile(stream, { name })

  // 神经轨（opt-in）：库内已有 ≥2 部带轨迹的作品时自动参检，失败优雅降级
  const libNeural = allDossiers(libRoot).filter((d) => d?.neural?.binEmb).length
  if (libNeural >= 2 || neural) {
    onProgress({ phase: 'neural', label: '神经轨（语义轨迹）' })
    const nt = await neuralTrack(stream.paras, stream.hanTotal, pythonPath(), neuralModel || defaultNeuralModelDir())
    if (!nt.unavailable) profile.neural = nt
  }

  const loc = locate(profile, rep)
  const suggestions = buildSuggestions(profile, rep, loc)
  const self = selfAssessment(profile, anchorDossiers)

  onProgress({ phase: 'transfer', label: '跨作者迁移检索' })
  const transfer = transferSuggestions(profile, lib, libRoot, lib.anchor, loadDossiers)

  if (profile.neural?.binEmb) {
    const tn = trajectoryNeighbors(profile, lib, libRoot, lib.anchor, loadDossiers).slice(0, 2)
      .map((n) => ({
        work: n.dossier.name, author: n.author, distance: r4(n.d),
        replay: { metric: 'novelty', self: profile.neural.novelty, neighbor: n.dossier.neural?.novelty },
        advice: `语义轨迹最接近《${n.dossier.name}》（${n.author}，轨迹距离 ${r4(n.d)}）——可参考该作的段落间新信息释放节奏；逐 bin 新信息速率已回放`,
      }))
    transfer.aspects.push({ id: 'semantic-trajectory', label: '语义轨迹（神经）', neighbors: tn })
  }

  onProgress({ phase: 'scenes', label: '场景轨' })
  const sceneTrack = await buildSceneTrack({
    profile, stream, libRoot,
    scenesFile, neural: neural || !!profile.neural,
    python: pythonPath(), modelDir: neuralModel || defaultNeuralModelDir(),
  })

  if (sceneTrack?.sceneFeat) {
    const qName = profile.name.replace(/\.[^.]+$/, '')
    const scn = allDossiers(libRoot)
      .filter((d) => d.sceneFeat && d.name !== qName)
      .map((d) => ({ name: d.name, author: d.author ?? '库内', d: sceneCraftDistance({ sceneFeat: sceneTrack.sceneFeat }, d) }))
      .filter((x) => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d).slice(0, 2)
      .map((n) => ({
        work: n.name, author: n.author, distance: r4(n.d),
        replay: { metric: '场景节奏', self: `${sceneTrack.sceneFeat.nScenes}场｜CV=${sceneTrack.sceneFeat.sceneLen.cv}｜σ=${sceneTrack.sceneFeat.valenceSwing}`, neighbor: '见该作 dossier.sceneFeat' },
        advice: `场景手艺最接近《${n.name}》（${n.author}）——可参考其场景切分粒度与场景间情绪落差；逐场景比对见场景轨`,
      }))
    transfer.aspects.push({ id: 'scene-craft-query', label: '场景手艺', neighbors: scn })
  }

  const charts = renderCharts(profile)
  const json = buildWeaveJson({ profile, rep, loc, source: name, suggestions, self, transfer, sceneTrack })
  return { profile, rep, loc, self, transfer, suggestions, sceneTrack, charts, json, lib, anchorDossiers, stream }
}

/** 一个已入档作品的回放视图（面板用：不重算，读 dossier 与其场景特征）。 */
export function replayWork(libRoot, author, work) {
  const lib = loadLibrary(libRoot)
  if (!lib.authors?.[author]) throw new Error(`档案库中没有作者「${author}」`)
  const dossier = loadDossiers(libRoot, author).find((d) => d && d.name === work)
  if (!dossier) throw new Error(`作者「${author}」下没有作品「${work}」`)
  return dossier
}

/** 档案库视图（面板「档案库」页与工具 list 共用）。 */
export function libraryState(libRoot) {
  const lib = loadLibrary(libRoot)
  const sum = librarySummary(lib)
  const authors = sum.authors.map((a) => {
    const dossiers = loadDossiers(libRoot, a.name)
    const byName = new Map(dossiers.map((d) => [d.name, d]))
    const works = (lib.authors[a.name]?.works ?? []).map((w) => {
      const d = byName.get(w.name)
      return {
        name: w.name, han: w.han ?? d?.han ?? 0, addedAt: w.addedAt ?? null,
        nPara: d?.nPara ?? null, scenes: d?.sceneFeat?.nScenes ?? null,
        annotated: !!d?.annotations?.annotatedAt, neural: !!d?.neural?.binEmb,
      }
    })
    return { name: a.name, works, totalWorks: a.works, han: a.han, dossiers: dossiers.length, broken: works.length - dossiers.length }
  })
  return { anchor: sum.anchor, authors, totalWorks: sum.totalWorks, dir: libRoot }
}

export { basename }
