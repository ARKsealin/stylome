// sig 仲裁（v2 §2 仲裁集规则）。
// sig 标志永不进判别器；只在 conformal 弃权带做二级证据：
// AI 侧 Top-20 密度（每千字）≥ 1.5 → 弃权样本升"中"级，证据表标注"词汇签名佐证"。
// 标志清单与参照值在 registry.mjs（取自 corpus/sig-mined.json，去掉格式残留 % 与 **）。

import { SIG_MARKERS, SIG_REF } from './registry.mjs'

export const SIG_THRESHOLD = SIG_REF.promoteAt

const HAN = /\p{Script=Han}/u

/** AI 侧签名密度（每千字命中数）。 */
export function sigDensity(text, markers = SIG_MARKERS) {
  const src = String(text)
  const chars = [...src].filter((c) => HAN.test(c)).length || 1
  let hits = 0
  for (const m of markers) hits += src.split(m).length - 1
  return hits * 1000 / chars
}
