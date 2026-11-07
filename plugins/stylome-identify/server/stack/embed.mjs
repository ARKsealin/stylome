// EMB-LR：冻结句向量编码器上的线性判别头（迁移学习的线性探针）。
// 编码器：paraphrase-multilingual-MiniLM-L12-v2（ONNX，py/embed_server.py），只取表示、不微调、不打困惑度分。
// 块表示 = 块内句向量（L2 归一化）的均值，384 维；另出三个句间动态量（emb:adj / emb:adjSd / emb:disp），作 L1 扩展候选。
// 句子按 lib/meter/segment.mjs 的 sentences() 切；超过 120 字的句子按 120 字切段（编码器截断在 128 token）。

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { sentences } from '../../lib/meter/segment.mjs'
import { LogReg } from './util.mjs'

export const EMB_DIM = 384
export const EMB_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2-onnx'
export const EMB_FEATURES = ['emb:adj', 'emb:adjSd', 'emb:disp']
const MAX_CHARS = 120

/** 送进编码器的句子序列。 */
export function embedSentences(text) {
  const out = []
  for (const s of sentences(String(text))) {
    const t = s.trim()
    if (!t) continue
    for (let i = 0; i < t.length; i += MAX_CHARS) out.push(t.slice(i, i + MAX_CHARS))
  }
  return out
}

export const embedKey = (text) => createHash('sha256').update(String(text)).digest('hex')
export const embedCachePath = (root) => join(root, 'runs', 'embed', `${EMB_MODEL}.jsonl`)

/** 读句向量缓存（scripts/embed-corpus.mjs 写）。 */
export function readEmbedCache(root) {
  const p = embedCachePath(root)
  const m = new Map()
  if (!existsSync(p)) return m
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const e = JSON.parse(line)
    m.set(e.key, e)
  }
  return m
}

/** 服务返回 → 行字段：r.emb（Float32Array 或 null）与三个动态量。 */
export function applyEmbedding(row, e) {
  row.emb = e?.mean ? Float32Array.from(e.mean) : null
  row.features['emb:adj'] = e?.adj ?? NaN
  row.features['emb:adjSd'] = e?.adjSd ?? NaN
  row.features['emb:disp'] = e?.disp ?? NaN
  return row
}

/** 线性探针。lr 按维数缩放（标准化后 ‖z‖² ≈ 384），l2/epochs 由 scripts/tune.mjs 辨识。 */
export class EmbedHead {
  /** prior：源 EmbedHead（长块上训的头），给了就在其权重附近微调（先验中心正则）。 */
  constructor(train, { l2 = 0.1, lr = 1, epochs = 40, weights = null, seed = 20261105, prior = null } = {}) {
    const ok = train.map((r, i) => r.emb ? i : -1).filter((i) => i >= 0)
    const xs = ok.map((i) => train[i].emb), ys = ok.map((i) => train[i].side === 'ai' ? 1 : 0)
    this.model = new LogReg(EMB_DIM).fit(xs, ys, { lr: lr / EMB_DIM, l2, epochs, seed, weights: weights ? ok.map((i) => weights[i]) : null, prior: prior?.model ?? null })
  }
  p(emb) { return emb ? this.model.p(emb) : NaN }
  toJSON() { return this.model.toJSON() }
  static fromJSON(j) { const h = Object.create(EmbedHead.prototype); h.model = LogReg.fromJSON(j); return h }
}
