// 场景类型（设计第 4 节“场景条件化”）：对话、动作、描写、叙述、心理五类。
// 规则判定，不用模型，也不依赖分词：同一段文字在哪里判定都得到同一个类型（单位、段落骨架、写作节拍）。
//   对话：引号内字数占比 ≥ 0.4；
//   心理、动作：心理动词、动作动词每百字的命中数；
//   描写：感官词每百字的命中数，或“的”字的密度；
//   其余为叙述。
// 这是启发式规则，准确率没有标注数据可以核对；它只用于分组（按场景的目标区间、范例检索），
// 分错的代价是分组变粗，而不是改变测量本身。

import { dialogueRatio } from './surface.mjs'
import { charCount } from './segment.mjs'
import { countLexicon, LEXICONS } from './lexicons.mjs'

export const SCENES = ['对话', '动作', '描写', '叙述', '心理']
export const NARRATION = SCENES.indexOf('叙述')

const SENSORY = [...LEXICONS.visual, ...LEXICONS.auditory, ...LEXICONS.tactile, ...LEXICONS.olfactory]

/** 一段文字的场景类型下标（SCENES 的下标）。 */
export function sceneOf(text) {
  const t = String(text)
  const chars = charCount(t)
  if (chars === 0) return NARRATION
  if (dialogueRatio(t) >= 0.4) return 0
  const per100 = (words) => (countLexicon(t, words) * 100) / chars
  // 阈值按实际语料定：11 篇、11 万字的中文小说里，动作词与心理动词每百字命中数的第 90 百分位都在 1 左右，
  // 取 1 时大约一成的单位被判为动作或心理；原来的 2.5 一个也判不出来
  const mental = per100(LEXICONS.mental), action = per100(LEXICONS.action)
  if (mental >= 1 && mental >= action) return 4
  if (action >= 1) return 1
  const de = ((t.match(/的/g) ?? []).length * 100) / chars
  if (per100(SENSORY) >= 3 || de >= 7) return 2
  return NARRATION
}
