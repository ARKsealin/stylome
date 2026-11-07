// stylomeArchitect 标注飞轮（Phase 1）：agent 的 L2 语义标注回填 dossier。
//   scene       场景边界（段落号数组）——修复 E4 缺口：浅统计证伪的场景切分由语义标注补齐
//   foreshadow  伏笔 F/T/P 对（{foreshadow, trigger?, payoff, binF, binP}）
//   attribution 情绪归因（{bin, character, note}）
//   blindspot   白描/反衬审计（{bin, note}）
// 回填 scene 时自动计算场景级特征（sceneFeat）与逐场景语义向量（神经轨可用时）存入 dossier——
// 场景迁移检索与逐场景比对的数据基座。迁移学习的种子：这些标注是未来本地模型（S6）的训练数据。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { libPaths, loadLibrary } from './library.mjs'
import { sceneFeatures } from './scenes.mjs'

const SCHEMA = {
  scene: { type: 'array', desc: '场景边界段落号（升序整数数组）' },
  foreshadow: { type: 'array', desc: '伏笔对 [{foreshadow, trigger?, payoff, binF, binP}]' },
  attribution: { type: 'array', desc: '情绪归因 [{bin, character, note}]' },
  blindspot: { type: 'array', desc: '白描/反衬审计 [{bin, note}]' },
  sceneFunc: { type: 'array', desc: '场景功能修正 [{scene, label, note?}]——覆盖规则引擎标签' },
  entityTrack: { type: 'array', desc: '实体轨迹标注（L2 语义层）——schema 见 README「实体轨迹标注」' },
}

/**
 * 校验并合并标注到 dossier。patch._replace=true 时整体替换同名键（默认合并）。
 * @param {object} opts { source, stream?: {paras}, emb?: async(text)=>vector|null }
 *   提供 stream（被标注作品的段落流）且 patch 含 scene 时，自动算 sceneFeat 存档；
 *   提供 emb 时逐场景算语义向量（场景 = 边界内段落文本拼接）。
 */
export async function annotate(root, author, work, patch, { source = 'agent', stream = null, emb = null } = {}) {
  const paths = libPaths(root)
  const p = paths.dossier(author, work)
  if (!existsSync(p)) throw new Error(`dossier 不存在：${author}/${work}`)
  const replace = patch?._replace === true
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k === '_replace') continue
    if (!(k in SCHEMA)) throw new Error(`未知标注键：${k}（允许：${Object.keys(SCHEMA).join('/')}）`)
    if (!Array.isArray(v)) throw new Error(`${k} 应为数组（${SCHEMA[k].desc}）`)
  }
  const dossier = JSON.parse(readFileSync(p, 'utf8'))
  dossier.annotations = dossier.annotations ?? {}
  for (const [k, v] of Object.entries(patch)) {
    if (k === '_replace') continue
    if (k === 'scene' && !replace) dossier.annotations.scene = [...new Set([...(dossier.annotations.scene ?? []), ...v])].sort((a, b) => a - b)
    else if (replace) dossier.annotations[k] = v
    else dossier.annotations[k] = [...(dossier.annotations[k] ?? []), ...v]
  }
  // 场景特征入档（标注驱动，供迁移检索与逐场景比对）
  if (stream && dossier.annotations.scene?.length) {
    const sf = sceneFeatures(stream.paras, dossier.annotations.scene)
    if (sf) {
      if (emb) {
        for (const s of sf.perScene) {
          const [a, b] = s.paras.split('–').map(Number)
          const text = stream.paras.slice(a - 1, b).map((q) => q.text).join('\n')
          const v = await emb(text)
          s.emb = v ? v.map((x) => Math.round(x * 1e4) / 1e4) : null
        }
      }
      if (sf) {
        // sceneFunc 覆盖：agent 的功能标签修正
        for (const f of patch.sceneFunc ?? []) {
          const target = sf.perScene.find((x) => x.scene === f.scene)
          if (target && f.label) { target.funcLabel = f.label; target.funcNote = f.note ?? null }
        }
        dossier.sceneFeat = sf
      }
    }
  }
  dossier.annotations.annotatedAt = new Date().toISOString()
  dossier.annotations.source = source
  writeFileSync(p, JSON.stringify(dossier, null, 1))
  return dossier.annotations
}

/** 读标注（不存在返回 null）。 */
export function readAnnotations(root, author, work) {
  const p = libPaths(root).dossier(author, work)
  if (!existsSync(p)) return null
  const d = JSON.parse(readFileSync(p, 'utf8'))
  return d.annotations ?? null
}

/** 全库已标注作品数（doctor/统计用）。 */
export function annotatedCount(root) {
  const lib = loadLibrary(root)
  let n = 0
  for (const [author, a] of Object.entries(lib.authors ?? {})) {
    for (const w of a.works) if (readAnnotations(root, author, w.name)) n++
  }
  return n
}

/** 全库场景池：有 sceneFeat 的 dossier → 逐场景条目（含作品/作者/场景语义向量）。 */
export function scenePool(root) {
  const lib = loadLibrary(root)
  const out = []
  for (const [author, a] of Object.entries(lib.authors ?? {})) {
    for (const w of a.works) {
      const p = libPaths(root).dossier(author, w.name)
      if (!existsSync(p)) continue
      const d = JSON.parse(readFileSync(p, 'utf8'))
      if (!d.sceneFeat?.perScene?.length) continue
      for (const s of d.sceneFeat.perScene) out.push({ work: w.name, author, ...s })
    }
  }
  return out
}
