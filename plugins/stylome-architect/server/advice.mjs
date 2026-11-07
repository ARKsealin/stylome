// stylomeArchitect 建议层：基于已学经验库（repertoire）对输入文本给方向性修改建议。
//
// 语义纪律（THEORY §一）：情绪节奏是作品级表达信号，建议不构成"必须改"——每条都写成双读法：
//   对齐意图（想贴近作者曲目时的调整方向）＋ 突破意图（有意差异的确认与命名）。
// agent 消费 suggestions[] 生成修改参考；本插件不代写。

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)

/** 指标带建议：side=lo/hi × 每指标。主句 = 对齐意图；破折号后 = 突破意图的确认。 */
export const BAND_ADVICE = {
  R: {
    lo: '情绪词密度低于作者曲目范围：若对齐作者习惯，可在关键情绪节点增加直接显影（情绪词、生理反应、评价词）——作者的情绪显影度整体偏高；若追求冷叙克制，这是有效的个人化差异，建议保持一致而非补齐',
    hi: '情绪词密度高于作者曲目范围：作者的情绪显影更收敛，若对齐可把部分直陈情绪改为动作/感官暗示；若本作需要浓烈质感，这构成对曲目的有意扩展',
  },
  Q: {
    lo: '情绪曲线比作者惯例更平：若对齐，可在中段安排一次明显的情绪起伏（转折、冲突升级或揭示）——作者的弧线普遍有主起伏；平稳本身若是有意的叙事策略（如渐进式压抑），建议全程贯彻以形成对比',
    hi: '情绪曲线比作者惯例更曲折：作者的情绪节奏更平滑克制，若对齐可削平次级波动、保留主起伏；多波峰若是题材需要（如多线危机），建议统一各波的幅度梯度',
  },
  H: {
    lo: '句长自相似低于曲目范围（句长更随机或更碎）：作者的句流更平滑连贯，若对齐可匀化句长、减少极端短句的连续堆叠；碎片化若服务于意识流或紧张感，建议限定在特定场景而非全篇',
    hi: '句长自相似高于曲目范围（句流过于平滑/周期化）：作者的句长有更多起伏对比，若对齐可插入短句制造顿挫，打破周期感',
  },
  alphaSpan: {
    lo: '前后节奏块差异小于作者习惯（全篇节奏过于均匀）：作者的作品通常有可辨识的节奏分区，若对齐可让不同场景段落承担不同句长策略',
    hi: '前后节奏块差异大于作者习惯（风格断裂感）：若非有意的时间跳跃/视角切换，可检查前后半的句长策略是否失控漂移',
  },
  altRate: {
    lo: '对白-叙述交替低于曲目（连续块更长）：作者倾向高频短交替，若对齐可拆分长对白块、在对白间插入动作拍；长独白段若是场景需要，可视为该场景的节奏特例',
    hi: '交替高于曲目（切换过碎）：作者的对白块更长更整，若对齐可合并相邻对白、给对话留出完整往复',
  },
  echo: {
    lo: '首尾呼应低于作者习惯：作者惯用环式结构（开篇实体/意象在结尾回归），建议检查开篇埋设是否有意留白——未回收项已单列；有意开放结局时此为有效差异',
    hi: '首尾呼应高于曲目上沿：呼应更满更工整，若担心过于闭合，可留一条不回收的支线维持余味',
  },
  dialMean: {
    lo: '对白占比低于曲目范围：作者的叙事通常包含对白场景，若对齐可让关键人物开口推动情节；纯叙述/书信体若是一作的形式选择，建议全篇统一（可参考曲目中信流体作品的先例）',
    hi: '对白占比高于曲目范围：作者的对白更节制，若对齐可将对白部分转为叙述或自由间接引语；对白驱动若是本作的引擎，建议保持场景间的占比一致',
  },
}

/** severity：带外距离相对带宽（≥0.5 严重 / ≥0.2 明显 / 其余轻微）。 */
function bandSeverity(v, band) {
  if (v == null || !band) return 'mild'
  const span = band[1] - band[0] || 1e-9
  const dev = v < band[0] ? (band[0] - v) / span : v > band[1] ? (v - band[1]) / span : 0
  return dev >= 0.5 ? 'severe' : dev >= 0.2 ? 'notable' : 'mild'
}

/**
 * 组装建议列表。
 * @returns {Array<{kind:'band'|'shape'|'thread', ...}>}
 */
export function buildSuggestions(profile, rep, loc) {
  const out = []
  // ① 指标带越带
  for (const p of Object.values(loc.positions)) {
    if (!p.band || p.within !== false) continue
    const side = p.value < p.band[0] ? 'lo' : 'hi'
    const label = { R: '情绪词密度 R', Q: '情绪曲折度 Q', H: '句长赫斯特 H', alphaSpan: '节奏块差异 α', altRate: '对白交替率', echo: '首尾呼应率', dialMean: '对白占比' }[p.key] ?? p.key
    out.push({
      kind: 'band', key: p.key, label, side,
      value: p.value, band: p.band, range: p.range, severity: bandSeverity(p.value, p.range ?? p.band),
      advice: BAND_ADVICE[p.key]?.[side] ?? `该指标在作者曲目之外（${side === 'lo' ? '低于' : '高于'}曲目范围），可对照曲目内作品调整。`,
    })
  }
  // ② 弧线形状：归属簇的逐 bin 偏差
  if (loc.shape && profile.valenceArc?.some((v) => v != null)) {
    const cluster = rep.shapeClusters.find((c) => c.id === loc.shape[0].id)
    if (cluster?.meanArc) {
      const devs = profile.valenceArc
        .map((v, i) => ({ bin: i, self: v, cluster: cluster.meanArc[i], dev: v != null ? Math.abs(v - cluster.meanArc[i]) : 0 }))
        .sort((a, b) => b.dev - a.dev)
      const worst = devs.slice(0, 2).filter((d) => d.self != null)
      out.push({
        kind: 'shape', clusterId: cluster.id, dist: loc.shape[0].dist,
        members: cluster.members.slice(0, 4),
        worstBins: worst.map((d) => ({ bin: d.bin, self: r4(d.self), clusterMean: r4(d.cluster), dev: r4(d.dev) })),
        advice: worst.length && worst[0].dev >= 15
          ? `弧线形状属簇${cluster.id}（同簇：${cluster.members.slice(0, 3).join('、')}），但 bin${worst[0].bin}（全文 ${Math.round((worst[0].bin + 0.5) * 10)}% 处）与本簇惯例偏差最大（本作 ${Math.round(worst[0].self)}，簇均值 ${Math.round(worst[0].cluster)}）：若对齐同簇手法，可调整该段前后的情绪走向；该偏差也可能是本作的高潮/转折设计，属有效个人化`
          : `弧线形状与簇${cluster.id}（同簇：${cluster.members.slice(0, 3).join('、')}）吻合良好，形状级无需调整`,
      })
    }
  }
  // ③ 线索：未回收实体（echoMiss）
  for (const m of (profile.echoMiss ?? []).slice(0, 5)) {
    out.push({
      kind: 'thread', entity: m.entity, lastBin: m.lastBin,
      advice: `开篇出现的「${m.entity}」至结尾未回归（最后出现在全文 ${Math.round((m.lastBin + 0.5) * 10)}% 处）：作者的环式习惯下这是典型的未回收线索——若非有意留白，建议在结尾段安排其回归或明确交代；若有意开放，建议确认其消失本身有叙事功能`,
      severity: 'notable',
    })
  }
  // ④ 长程回收（gap ≥4 bin）——已有回收的给正向确认
  for (const g of (profile.gaps ?? []).filter((g) => g.gapBins >= 4).slice(0, 3)) {
    out.push({
      kind: 'thread', entity: g.entity, from: g.from, to: g.to, gapBins: g.gapBins, positive: true,
      advice: `「${g.entity}」沉寂 ${g.gapBins} 个十分位后在 bin${g.to} 回归（跨越全文 ${Math.round(g.gapBins * 10)}%）：长程回收符合作者的伏笔习惯，建议核对回收处是否回应了埋设时的承诺`,
      severity: 'mild',
    })
  }
  // 排序：severe > notable > mild；同severity内 band > shape > thread
  const sevRank = { severe: 0, notable: 1, mild: 2 }, kindRank = { band: 0, shape: 1, thread: 2 }
  out.sort((a, b) => (sevRank[a.severity ?? 'mild'] - sevRank[b.severity ?? 'mild']) || (kindRank[a.kind] - kindRank[b.kind]))
  return out
}

/** 建议的 markdown 渲染块。 */
export function renderSuggestions(suggestions) {
  if (!suggestions.length) return ['## 修改建议', '', '全部指标在作者曲目带内，无未回收线索；弧线形状与所属簇吻合——无需对齐性修改。若本作有意突破曲目，当前所有差异都在"技术差异"而非"失控"一侧。'].join('\n')
  const L = ['## 修改建议（对齐意图读法为主；每条附突破意图确认）', '']
  const sevLabel = { severe: '严重偏离', notable: '明显偏离', mild: '轻微' }
  for (const s of suggestions) {
    if (s.kind === 'band') {
      L.push(`- **[${sevLabel[s.severity]}] ${s.label}**：实测 ${s.value}，作者曲目带 [${s.band[0]}, ${s.band[1]}]（${s.side === 'lo' ? '低于下沿' : '高于上沿'}）`)
      L.push(`  - ${s.advice}`)
    } else if (s.kind === 'shape') {
      L.push(`- **[弧线形状]** 与最近簇${s.clusterId}（${s.members.join('、')}）距离 ${s.dist}`)
      L.push(`  - ${s.advice}`)
    } else if (s.kind === 'thread' && !s.positive) {
      L.push(`- **[未回收线索]** 「${s.entity}」（最后出现于 bin${s.lastBin}）`)
      L.push(`  - ${s.advice}`)
    } else if (s.kind === 'thread' && s.positive) {
      L.push(`- **[长程回收·正向确认]** 「${s.entity}」bin${s.from}→bin${s.to}（${s.gapBins} bin）`)
      L.push(`  - ${s.advice}`)
    }
  }
  return L.join('\n')
}
