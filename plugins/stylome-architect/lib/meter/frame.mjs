// 关联词/对举框架密度特征（设计 §2.8 H3b，决策 D13）。
// 框架句式清单有限且语言学（"不是…而是""与其…不如"），计数它们有语言学依据。
// 固定清单是可解释锚点；可扩展的发现由 sig: 语料级挖掘负责（设计分工）。

import { charCount } from './segment.mjs'

/** 对举/关联框架清单。每个框架 = [前件, 后件]（正则，字面优先）；密度按每千字。 */
export const FRAMES = {
  '不是而是': ['不是', '而是'],
  '不是就是': ['不是', '就是'],
  '与其不如': ['与其', '不如'],
  '与其宁可': ['与其', '宁可'],
  '既又': ['既', '又'],
  '既也': ['既', '也'],
  '一方面另一方面': ['一方面', '另一方面'],
  '无论还是': ['无论', '还是'],
  '不论还是': ['不论', '还是'],
  '如果那么': ['如果', '那么'],
  '如果就': ['如果', '就'],
  '只要就': ['只要', '就'],
  '只有才': ['只有', '才'],
  '尽管但是': ['尽管', '但'],
  '虽然但是': ['虽然', '但'],
  '虽然却': ['虽然', '却'],
  '不但而且': ['不但', '而且'],
  '不仅而且': ['不仅', '而且'],
  '不仅还': ['不仅', '还'],
  '甚至': ['甚至'],
  '然而': ['然而'],
  '却': ['却'],
  '其实': ['其实'],
  '仿佛': ['仿佛'],
  '似乎': ['似乎'],
  '显然': ['显然'],
  '当然': ['当然'],
  '或许': ['或许'],
  '也许': ['也许'],
  '必然': ['必然'],
  '注定': ['注定'],
}

/**
 * 框架密度：每千字各框架的完成次数（前件与后件在同一句内配对）与单项出现次数。
 * 完成配对（前件+后件同句）权重更高——它才是"框架句式"；单项出现只是弱信号。
 */
export function frameDensity(text, frames = FRAMES) {
  const chars = Math.max(1, charCount(text))
  const per = 1000 / chars
  const out = {}
  for (const [name, [pre, post]] of Object.entries(frames)) {
    const preRe = new RegExp(pre, 'gu')
    const nPre = (text.match(preRe) ?? []).length
    if (!post || post === pre) {
      // 单项框架（语气副词类）：只计一次
      out[`frame:${name}`] = nPre * per
      continue
    }
    const postRe = new RegExp(post, 'gu')
    const nPost = (text.match(postRe) ?? []).length
    // 完成配对数 = min(前件, 后件) 的保守估计（同句配对的近似）
    out[`frame:${name}`] = Math.min(nPre, nPost) * per
  }
  return out
}

/** 框架总密度（全部框架配对与单项之和，每千字）——单一可排序的汇总特征。 */
export function frameTotal(text, frames = FRAMES) {
  const d = frameDensity(text, frames)
  const total = Object.values(d).reduce((s, x) => s + x, 0)
  return { 'frame:total': total }
}
