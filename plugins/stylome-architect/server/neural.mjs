// stylomeArchitect 神经轨（opt-in）：预训练句向量表示迁移到作品级信号（S4 预注册）。
//   binEmb      十分位 bin 段向量均值（10×384）——语义轨迹（Rathje 2026 plot-curve 的作品级形态）
//   novelty     相邻段余弦距离（1−cos）按十分位聚合——新信息速率曲线（叙事节奏的语义版）
//   smooth      轨迹相邻 bin 余弦均值（标量）
// 编码器冻结、只取表示；嵌入桥失败时本轨整体缺席（优雅降级），纯统计三轨不受影响。

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startEmbedder } from './embedder.mjs'
import { resolveEmbedModelDir } from './embedModel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const NEURAL_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2-onnx'
export const defaultNeuralModelDir = () => resolveEmbedModelDir()

const cos = (a, b) => {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / (Math.sqrt(na * nb) || 1e-9)
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)

/**
 * 计算一部作品的神经轨。paras 为 StreamMeter.document 的段落流（需 text）。
 * @returns {{binEmb:number[][], novelty:number[], smooth:number}|{unavailable:string}}
 */
export async function neuralTrack(paras, hanTotal, python, modelDir = defaultNeuralModelDir()) {
  let emb = null
  try { emb = startEmbedder(python, modelDir) } catch (e) { return { unavailable: `嵌入桥启动失败：${e?.message ?? e}` } }
  try {
    const checked = paras.filter((p) => !p.skip && p.text)
    if (checked.length < 10) return { unavailable: '可测段落不足' }
    // 段向量 = emb.embed(段).mean（段内句切片向量均值，384 维；客户端再 L2 归一化）
    const paraVecs = []
    for (const p of checked) {
      const r = await emb.embed(p.text)
      if (!r.mean) continue
      const norm = Math.hypot(...r.mean) || 1
      paraVecs.push(r.mean.map((x) => x / norm))
    }
    if (paraVecs.length < 10) return { unavailable: '有效段向量不足' }
    // 十分位聚合
    const B = 10
    const bins = Array.from({ length: B }, () => [])
    let hanAcc = 0
    let idx = 0
    for (const p of checked) {
      const bi = Math.min(B - 1, Math.floor((hanAcc / hanTotal) * B))
      if (paraVecs[idx]) bins[bi].push(paraVecs[idx])
      hanAcc += p.han
      idx++
    }
    const binEmb = bins.map((list) => {
      if (!list.length) return null
      const acc = new Array(list[0].length).fill(0)
      for (const v of list) for (let i = 0; i < acc.length; i++) acc[i] += v[i]
      const norm = Math.hypot(...acc) || 1
      return acc.map((x) => Math.round((x / norm) * 1e4) / 1e4)
    })
    // 新信息速率：相邻段 1−cos，按 bin 聚合
    const segDist = []
    for (let i = 1; i < paraVecs.length; i++) segDist.push({ bin: Math.min(B - 1, Math.floor(((i - 0.5) / paraVecs.length) * B)), d: 1 - cos(paraVecs[i - 1], paraVecs[i]) })
    const novelty = Array.from({ length: B }, (_, b) => {
      const ds = segDist.filter((x) => x.bin === b).map((x) => x.d)
      return ds.length ? Math.round(mean(ds) * 1e4) / 1e4 : null
    })
    // 轨迹平滑度：相邻 bin 余弦均值（跳过空 bin）
    const present = binEmb.map((v, i) => ({ v, i })).filter((x) => x.v)
    const smooth = present.length >= 2 ? Math.round(mean(present.slice(1).map((x, k) => cos(present[k].v, x.v))) * 1e4) / 1e4 : null
    return { binEmb, novelty, smooth }
  } catch (e) {
    return { unavailable: `神经轨计算失败：${e?.message ?? e}` }
  } finally {
    try { emb.stop() } catch { /* 已退出 */ }
  }
}

/** 轨迹距离（迁移检索第六侧面）：双方 binEmb 逐 bin 余弦均值（空 bin 跳过）。 */
export function trajectoryDistance(a, b) {
  const pairs = []
  for (let i = 0; i < 10; i++) if (a?.[i] && b?.[i]) pairs.push(1 - cos(a[i], b[i]))
  return pairs.length ? mean(pairs) : Infinity
}

/** 跨作者轨迹近邻（档案库内，排除锚定作者；仅双方都有神经轨者参检）。 */
export function trajectoryNeighbors(profile, library, root, anchorAuthor, loadDossiers) {
  if (!profile?.neural?.binEmb) return []
  const pool = []
  for (const [author, a] of Object.entries(library.authors ?? {})) {
    if (author === anchorAuthor) continue
    for (const w of a.works) {
      const p = loadDossiers(root, author).find((d) => d && d.name === w.name)
      if (p?.neural?.binEmb) pool.push({ author, dossier: p, d: trajectoryDistance(profile.neural.binEmb, p.neural.binEmb) })
    }
  }
  return pool.filter((x) => Number.isFinite(x.d)).sort((a, b) => a.d - b.d)
}
