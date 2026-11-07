// 测量扁平化：把 measure() 的分层结果压成「特征名 → 数值」的平表。
// 画像学习、段落校验、文档比对都读这一张表，因此口径只有一处。
// 只保留可 JSON 序列化的标量；分词序列（decontent）与非标量族（posBigrams 等）不进表。

/**
 * @param {object} m measure() 的返回值
 * @returns {Record<string, number>} 扁平特征
 */
export function flatten(m) {
  const out = {}
  for (const [w, v] of Object.entries(m.functionWords ?? {})) out[`fw:${w}`] = v
  for (const [k, v] of Object.entries(m.punctuation ?? {})) out[`punct:${k}`] = v
  for (const k of ['sentLenMean', 'sentLenCv', 'shortSentRatio', 'longSentRatio', 'clauseLenMean', 'clausesPerSent', 'fragmentation']) out[`sent:${k}`] = m.sentence?.[k]
  for (const k of ['paraLenMean', 'paraLenCv', 'singleSentParaRatio', 'adjacentLenRatioMean']) out[`para:${k}`] = m.paragraph?.[k]
  out['dialogue:ratio'] = m.dialogueRatio
  for (const k of ['mattr', 'yuleK', 'honoreR', 'hapaxRatio']) out[`lex:${k}`] = m.lexical?.[k]
  for (const [k, v] of Object.entries(m.lexicon ?? {})) out[`lexicon:${k}`] = v
  for (const [k, v] of Object.entries(m.pronoun ?? {})) out[`pron:${k}`] = v
  for (const [k, v] of Object.entries(m.words ?? {})) out[`word:${k}`] = v
  for (const [k, v] of Object.entries(m.reuse ?? {})) out[k] = v
  for (const [k, v] of Object.entries(m.frame ?? {})) out[k] = v
  return out
}
