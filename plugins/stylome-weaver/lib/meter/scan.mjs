// 字面扫描：虚词与词表共用的计数规则。长词优先，命中处不再计数。
// 单字词条另有遮蔽表：遮蔽词里的这个字不算命中，比如“地球”里的“地”不算虚词，“几乎”里的“乎”不算文言。
// 遮蔽只挡住这一个字，同一个遮蔽词里的其他字照常计数（“地上”遮蔽了“地”，“上”仍算方位词）。

/**
 * 每个词条的命中位置（起点），按 words 的顺序。
 * @param {string} text
 * @param {string[]} words
 * @param {Record<string, string[]>} [masks] 单字词条 → 遮蔽词
 */
export function scanHits(text, words, masks = {}) {
  const t = String(text)
  const covered = new Uint8Array(t.length)
  const hits = new Map(words.map((w) => [w, []]))
  for (const w of [...new Set(words)].sort((a, b) => b.length - a.length)) {
    const blocked = w.length === 1 && masks[w]?.length ? maskedPositions(t, w, masks[w]) : null
    for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) {
      if (blocked?.has(i)) continue
      let free = true
      for (let k = 0; k < w.length; k++) if (covered[i + k]) { free = false; break }
      if (!free) continue
      hits.get(w).push(i)
      for (let k = 0; k < w.length; k++) covered[i + k] = 1
    }
  }
  return hits
}

/** 文本里落在遮蔽词内的这个字的位置。 */
function maskedPositions(t, ch, maskWords) {
  const out = new Set()
  for (const m of maskWords) {
    const offs = []
    for (let k = 0; k < m.length; k++) if (m[k] === ch) offs.push(k)
    if (!offs.length) continue
    for (let i = t.indexOf(m); i >= 0; i = t.indexOf(m, i + 1)) for (const k of offs) out.add(i + k)
  }
  return out
}
