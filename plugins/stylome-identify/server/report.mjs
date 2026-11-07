// 判别结果的文本渲染。命令行（server/cli.mjs）与 DSH 工具（index.js）共用同一份格式，
// 保证用户在两个入口看到的证据表、判决与声明完全一致。

const round = (v) => Math.round(v * 100) / 100

/**
 * 把 Stack.judge 的结果渲染成给人读的报告。
 * 字段来源见 server/stack/index.mjs 的 judgeMain / judgeMicro / 短文本分支。
 */
export function render(r) {
  const L = []
  L.push(`【路由】${{ main: '主管线', micro: '微段管线', short: '样本不足' }[r.route]} ｜ ${r.han} 汉字`)
  L.push(`【综合】${r.pAI === null ? '不给数值' : `pAI = ${r.pAI}`}（${r.grade}）${r.predictionSet.length ? ` ｜ 预测集 {${r.predictionSet.join(', ')}}` : ''}`)
  if (Object.keys(r.parts).length) {
    const w = { 'L1-LR': 'l1', 'L3-HASH': 'l3', 'EMB-LR': 'emb' }
    L.push(`        判别器：${Object.entries(r.parts).map(([k, v]) => `${k} ${v}${r.fusion && w[k] ? `（权重 ${round(r.fusion[w[k]])}${r.fusion[w[k]] > 0 ? '' : '，只作第二意见'}）` : ''}`).join(' ｜ ')}${r.microModel ? `（微段模型 ${r.microModel}）` : ''}`)
  }
  if (r.note) L.push(`        ${r.note}`)
  if (r.sdn) {
    const lit = Object.entries(r.sdn.lamps).filter(([, v]) => v).map(([k]) => ({ ood: 'OOD', conflict: '冲突', short: '样本不足' }[k]))
    L.push(`【判决】${r.sdn.verdict}（${r.sdn.by === 'net' ? 'SDN 网络' : '规则表'}${lit.length ? '；灯：' + lit.join('、') : ''}${r.sdn.zoneDowngrade ? '；重叠区降级' : ''}）`)
    L.push(`        等级 ${r.sdn.level}（最可疑连续 ${r.sdn.levelWindow} 窗 pAI ${r.sdn.winTop}；${Object.entries(r.sdn.levelProbs).map(([k, v]) => `${k} ${v}`).join(' / ')}） ｜ 混合 ${r.sdn.mixed ? '是' : '否'}（P = ${r.sdn.pMix}）`)
    L.push(`        六轴：${Object.entries(r.sdn.axes).map(([k, v]) => `${k} ${v}`).join(' ')}`)
  }
  if (r.evidence.length) {
    L.push('【证据表】按 |贡献| 排序：')
    for (const e of r.evidence) {
      const tail = e.spanRatio ? `  跨度比 ${e.spanRatio}${e.nearAiAuthors.length ? '，落入 AI 区间：' + e.nearAiAuthors.join('、') : ''}` : ''
      L.push(`  ${e.name.padEnd(12)} 人类区间 [${e.humanBand.join(', ')}]  本文 ${e.value}  z=${e.z}  贡献=${e.push}  → ${e.direction}（${e.role}）${tail}`)
    }
    for (const e of r.report) L.push(`  ${e.name.padEnd(12)} 本文 ${e.value}  （报告项，不参与判别）`)
  }
  if (r.spectrum) {
    L.push(`【光谱】${r.spectrum.segments.map((s) => `窗 ${s.from + 1}–${s.to + 1}：${s.mean}`).join(' ｜ ')}${r.spectrum.oscillation ? ' ｜ 尾部振荡' : ''}`)
    if (r.spectrum.highWindows.length) L.push(`        高可疑窗：${r.spectrum.highWindows.map((i) => i + 1).join('、')}`)
    L.push(`        ${r.spectrum.note}`)
  }
  L.push('【声明】' + r.disclaimer.join('\n        '))
  return L.join('\n')
}

/** 模型卡摘要（命令 /identify model 用）：只陈述版本、覆盖与判定线，不重复声明全文。 */
export function renderModel(model) {
  const c = model.card ?? {}
  const th = model.thresholds ?? {}
  const L = [`判别模型 ${model.version}（${model.trainedAt}）`]
  if (c.families) L.push(`训练覆盖：${c.families.join('、')} × 温度 ${(c.temps ?? []).join('/')}；人类参照 ${c.humanAuthors} 位作者 ${c.humanWorks} 部（${c.domain}）`)
  const lines = [['tSusp', th.tSusp], ['highLine', th.highLine], ['gradeHigh', th.gradeHigh], ['conflictSpread', th.conflictSpread]].filter(([, v]) => v !== undefined)
  if (lines.length) L.push(`判定线：${lines.map(([k, v]) => `${k} ${v}`).join('、')}`)
  if (c.highFprAuthors?.length) L.push(`已知高误报作者：${c.highFprAuthors.join('、')}`)
  if (c.insufficientAuthors?.length) L.push(`覆盖不足作者：${c.insufficientAuthors.join('、')}`)
  if (c.errorRates) L.push(`估计错误率：AI 判成人类 ${(c.errorRates.aiJudgedHuman * 100).toFixed(1)}%，人类判成 AI ${(c.errorRates.humanJudgedAi * 100).toFixed(1)}%`)
  return L.join('\n')
}
