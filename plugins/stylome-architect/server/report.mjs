// stylomeArchitect 报告面：weave 报告（markdown + SVG 弧线组图）+ weave JSON（L2 契约）。
// 输出语义：定位与描述，非作者归属。L2 任务清单交给 agent。

import { EMOTIONS7, BINS, L2_TASKS } from './stack/registry.mjs'
import { renderSuggestions } from './advice.mjs'
import { functionAdvice } from './scenes.mjs'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const f2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—')
const f4 = (v) => (Number.isFinite(v) ? (Math.round(v * 10000) / 10000).toString() : '—')
const KLASS_LABEL = { faithful: '忠实核心', edge: '自我边缘', beyond: '超出自身历史', 'small-sample': '样本少·仅位置', unavailable: '不可估' }

/** 简单折线 SVG（多条序列，横轴 0..n-1）。 */
export function lineChart({ series, labels, width = 640, height = 200, yLabel = '', palette = ['#e8903a', '#39f', '#3a9', '#c5f', '#f6c', '#88f', '#fa0'] }) {
  const pad = 36
  const all = series.flat().filter(Number.isFinite)
  if (!all.length) return ''
  const lo = Math.min(...all, 0), hi = Math.max(...all, 0)
  const sx = (i) => pad + (i / (series[0].length - 1 || 1)) * (width - 2 * pad)
  const sy = (v) => height - pad - ((v - lo) / ((hi - lo) || 1)) * (height - 2 * pad)
  const grid = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${pad}" y1="${sy(v).toFixed(1)}" x2="${width - pad}" y2="${sy(v).toFixed(1)}" stroke="#ddd" stroke-width="1"/><text x="${4}" y="${(sy(v) + 4).toFixed(1)}" font-size="10" fill="#888">${f2(v)}</text>`).join('')
  const paths = series.map((s, si) => {
    const pts = s.map((v, i) => (Number.isFinite(v) ? `${sx(i).toFixed(1)},${sy(v).toFixed(1)}` : null)).filter(Boolean)
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${palette[si % palette.length]}" stroke-width="1.8"/>`
  }).join('')
  const legend = labels.map((l, i) => `<text x="${(pad + i * 76)}" y="${12}" font-size="10" fill="${palette[i % palette.length]}">${esc(l)}</text>`).join('')
  return `<svg viewBox="0 0 ${width} ${height + 4}" width="100%">${grid}${paths}<text x="${width - pad}" y="${height - 6}" font-size="10" fill="#888" text-anchor="end">文本位置 0→100%（${esc(yLabel)}）</text>${legend}</svg>`
}

/** L1 报告的 SVG 组图。 */
export function renderCharts(profile) {
  const val = lineChart({ series: [profile.valenceArc], labels: ['valence（褒−贬/千字）'], yLabel: '情感弧' })
  const dial = lineChart({ series: [profile.dialCurve], labels: ['对白占比'], yLabel: '叙事形态' })
  const classes = EMOTIONS7.map((m, i) => ({ s: profile.classArcs[m], l: m })).filter((x) => x.s.some((v) => v > 0))
  const emo = classes.length ? lineChart({ series: classes.map((x) => x.s), labels: classes.map((x) => x.l), yLabel: '7 大类情绪强度/千字' }) : ''
  return { val, dial, emo }
}

/** weave 报告（markdown）：双输出 = ①自我忠实与进步变化（锚定档案对比）②迁移参考（跨作者回放）。
 * 自我/suggestions/transfer 由调用方组装。 */
export function renderWeave({ profile, rep, loc, charts, suggestions = [], self = null, transfer = null, sceneTrack = null }) {
  const L = []
  L.push(`# stylomeArchitect 织体报告 —— ${profile.name ?? '(正文)'}`)
  L.push('')
  L.push(`- 文档：${profile.han} 汉字 / ${profile.nPara} 段 / ${profile.nSent} 句；章节标记 ${profile.chapters.length} 处`)
  L.push(`- 档案库：锚定作者「${rep.author}」（${rep.nWorks} 部）${transfer ? `｜迁移池 ${transfer.pool} 部他作者作品` : ''}`)
  L.push(`- 语义：双输出——①相对锚定作者**自身历史**的忠实与变化（非合规判定）；②跨作者相似信号**迁移参考**。情绪节奏=作品级表达信号，非作者指纹（THEORY §一）`)
  L.push('')
  // ── 输出 A：自我忠实与进步变化 ──
  L.push('## 输出 A · 自我忠实与进步变化（锚定作者档案对比）')
  L.push('')
  if (self) {
    L.push('| 指标 | 本作 | 作者核心 μ±σ | 自身全幅 | 判读 |')
    L.push('|---|---|---|---|---|')
    for (const r of self.rows) {
      L.push(`| ${r.label} | ${f4(r.value)} | ${r.core ? `[${f4(r.core[0])}, ${f4(r.core[1])}]` : '—'} | ${r.range ? `[${f4(r.range[0])}, ${f4(r.range[1])}]` : '—'} | **${KLASS_LABEL[r.klass] ?? r.klass}**${r.note ? `：${r.note}` : ''} |`)
    }
    L.push('')
    if (self.progression.length) {
      L.push(`**本作的自我推进点**：${self.progression.map((p) => `${p.label}（${KLASS_LABEL[p.klass]}）`).join('、')}——这些是相对作者自身历史的边缘/新领域，若有意突破建议保持全篇一致；若非有意，建议对照自身核心作品回检。`)
    } else {
      L.push('**本作全部指标处于作者稳态核心之内**——高自我忠实；变化空间在于曲线形状与线索设计（见下）。')
    }
    L.push('')
    L.push(`最近自身作品（信号余弦）：${loc.nearest.map((n) => `${n.name}（${f2(n.sim)}）`).join('、')}`)
    if (loc.shape) L.push(`弧线形状：簇${loc.shape[0].id}（距离 ${f2(loc.shape[0].dist)}；同簇：${(rep.shapeClusters.find((c) => c.id === loc.shape[0].id)?.members ?? []).slice(0, 4).join('、') || '—'}）`)
    L.push('')
  }
  // ── 输出 B：迁移参考 ──
  if (transfer) {
    L.push('## 输出 B · 迁移参考（跨作者相似信号回放）')
    L.push('')
    if (transfer.note) { L.push(transfer.note); L.push('') } else {
      L.push('| 侧面 | 最相似（他作者） | 信号回放 |')
      L.push('|---|---|---|')
      for (const a of transfer.aspects) {
        const n = a.neighbors[0]
        if (!n) continue
        const rp = n.replay
        const replayTxt = rp.metric === 'valenceArc'
          ? `本作[${(rp.self ?? []).map((v) => Math.round(v)).join(',')}] vs 《${n.work}》[${(rp.neighbor ?? []).map((v) => Math.round(v)).join(',')}]`
          : rp.metric === 'dialCurve'
            ? `对白曲线 本作[${(rp.self ?? []).map((v) => f2(v)).join(',')}] vs 《${n.work}》[${(rp.neighbor ?? []).map((v) => f2(v)).join(',')}]`
            : `${rp.metric}：本作 ${rp.self} vs 《${n.work}》${rp.neighbor}`
        L.push(`| ${a.label} | 《${n.work}》（${n.author}）d=${n.distance} | ${replayTxt} |`)
      }
      L.push('')
      for (const a of transfer.aspects) {
        for (const n of a.neighbors.slice(0, 1)) L.push(`- **${a.label}**：${n.advice}`)
      }
      L.push('')
      L.push('> 迁移方法：案例式迁移——标准化信号子空间近邻检索 + 信号回放；相似作品的正文副本在档案库 `library/<作者>/<作品>.txt`，agent 生成修改参考时可直接摘引其对应段落。')
      L.push('')
    }
  }
  // ── 线索轨 + 建议 ──
  L.push('## 线索轨')
  L.push('')
  L.push(`- 实体入选（≥${profile.minCount} 次）：${profile.topEntities.slice(0, 8).map((t) => t.entity).join('、') || '—'}`)
  L.push(`- 首尾呼应率：${f2(profile.echo)}（开头出现的主流实体在结尾回归的比例）`)
  L.push(`- gap-return 候选（沉寂≥2 bin 后回归，伏笔线索代理）：`)
  for (const g of profile.gaps.slice(0, 8)) L.push(`  - ${g.entity}：bin${g.from} 后沉寂 ${g.gapBins} bin，bin${g.to} 回归`)
  if (!profile.gaps.length) L.push('  - 无')
  if (profile.echoMiss?.length) L.push(`- 未回收线索（开篇出现、结尾未回归）：${profile.echoMiss.map((m) => `${m.entity}(bin${m.lastBin})`).join('、')}`)
  L.push('')
  L.push(renderSuggestions(suggestions))
  L.push('')
  // ── 场景轨 ──
  if (sceneTrack) {
    L.push('## 场景轨（神经标注轨）')
    L.push('')
    if (sceneTrack.sceneFeat) {
      const sf = sceneTrack.sceneFeat
      const LEG = sf.funcLegend ?? {}
      L.push(`边界来源：${sceneTrack.source}｜**${sf.nScenes} 个场景**｜长度 均值 ${sf.sceneLen.mean} 字（CV ${sf.sceneLen.cv}）｜开场 mix：对白 ${sf.openerMix?.dialogue ?? 0}/叙述 ${sf.openerMix?.narration ?? 0}｜场景情绪波动 σ=${sf.valenceSwing}`)
      L.push('')
      L.push(`场景 valence 弧：${sf.valenceArcScene.join(' → ')}`)
      L.push('')
      L.push('| 场景 | 段落 | 字数 | 对白 | valence | 开场 | 功能 | 动力 | 场景内轨迹 |')
      L.push('|---|---|---|---|---|---|---|---|---|')
      for (const s of sf.perScene) {
        const t = s.trajectory
        const shape = { rising: '升', falling: '降', peak: '峰', valley: '谷', flat: '平' }[t?.shape] ?? '—'
        L.push(`| ${s.scene} | ${s.paras} | ${s.han} | ${s.dial} | ${s.valence} | ${s.opener} | **${s.funcLabel}**${LEG[s.funcLabel] ? `(${LEG[s.funcLabel]})` : ''} | ${s.dynLabel ?? '—'} | ${t ? `${shape}｜v5[${t.valence5.join(',')}]｜纹 ${t.stripes}` : '—'} |`)
      }
      if (sceneTrack.matches?.length) {
        L.push('')
        L.push('### 逐场景比对（全库场景池最近参考，跨作者）')
        L.push('')
        L.push('| 本作场景 | 最近参考 | 次近 |')
        L.push('|---|---|---|')
        for (const m of sceneTrack.matches) {
          const [a, b] = m.matches
          const fmt = (x) => x ? `《${x.work}》场景${x.scene}（${x.author}，d=${x.distance}，val=${x.valence}）` : '—'
          L.push(`| 场景${m.scene}（val=${sf.perScene[m.scene - 1]?.valence}） | ${fmt(a)} | ${fmt(b)} |`)
        }
      }
      if (sceneTrack.funcMatches?.length) {
        L.push('')
        L.push('### 逐场景功能比对（功能向量空间检索"同功能"参考）')
        L.push('')
        for (const m of sceneTrack.funcMatches) {
          const top = m.matches[0]
          if (!top) continue
          const q = sf.perScene[m.scene - 1]
          const advice = functionAdvice(q, top)
          L.push(`- 场景${m.scene} **${m.label}**${LEG[m.label] ? `(${LEG[m.label]})` : ''} → 同功能参考：《${top.work}》场景${top.scene}（${top.author}，${top.funcLabel}${top.sameLabel ? '，同标签' : ''}，d=${top.distance}）`)
          L.push(`  - 方向：${advice}`)
        }
        L.push('')
        L.push('> 功能空间 7 维 [位置, 情绪水平, 情绪斜率, 入跳变, 出跳变, 对白强度, 张力]；同标签检索加权。功能标签由规则引擎映射（S8 预注册验证中），agent 可经 `sceneFunc` 标注修正。')
      }
      if (sceneTrack.matches?.length) {
        L.push('')
        L.push('> 相似场景与参考场景正文在 `library/<作者>/<作品>.txt`（paras 列给出段落范围），agent 生成逐场景修改参考时摘引对照。')
      }
      if (sceneTrack.entityTrack?.length) {
        L.push('')
        L.push('### 实体轨迹（L2 已标注）')
        L.push('')
        for (const et of sceneTrack.entityTrack) {
          L.push(`- **场景${et.scene}**${et.eqState ? `｜情势：${et.eqState}` : ''}${et.agency ? `｜主导行动元：${et.agency}` : ''}`)
          for (const e of et.entities ?? []) {
            L.push(`  - **${e.entity}**（${e.actant ?? '—'}${e.presence ? '，' + e.presence : ''}）${e.locations?.length ? '位置：' + e.locations.join('→') : ''}`)
            for (const a of e.actions ?? []) L.push(`    - 动作：「${a.text ?? ''}」${a.verb ? `（${a.verb}）` : ''}`)
            for (const c of e.stateChanges ?? []) L.push(`    - 变化：${c.dimension} ${c.before} → ${c.after}`)
            for (const c of e.consequences ?? []) L.push(`    - 后果：${c.desc}${c.targets?.length ? '（影响：' + c.targets.join('、') + (c.impact ? '，' + c.impact + '）' : '）') : ''}`)
            if (e.foreshadow) L.push(`    - 伏笔：${e.foreshadow.hint}${e.foreshadow.expectedPayoff ? '（预期回收：' + e.foreshadow.expectedPayoff + '）' : ''}`)
          }
          for (const q of et.suspenseQ ?? []) L.push(`  - 悬念（未决）：${q}`)
          for (const r2 of et.revealed ?? []) L.push(`  - 揭示：${r2}`)
        }
        L.push('')
      }
    } else if (sceneTrack.candidates) {
      L.push(`被测文本暂无场景标注（来源：${sceneTrack.source}）。候选边界（段落号，终判归 agent）：`)
      L.push('')
      L.push(sceneTrack.candidates.map((c) => `- 段${c}${sceneTrack.reasons?.[c] ? '：' + sceneTrack.reasons[c].join('；') : ''}${sceneTrack.semantic?.some((s) => s.idx === c) ? '（语义不连续 d=' + sceneTrack.semantic.find((s) => s.idx === c).d + '）' : ''}`).join('\n') || '（无候选）')
      L.push('')
      L.push('> **L2 请求**：agent 确认/修正候选后，写入 `{_replace:true, scene:[...]}` 经 annotate 回填（被测文本请先 ingest 入库获得 dossier），即可解锁逐场景比对与场景手艺侧面。')
    }
    L.push('')
  }
  L.push('## 弧线')
  L.push('')
  if (charts.val) L.push(charts.val)
  if (charts.emo) L.push(charts.emo)
  if (charts.dial) L.push(charts.dial)
  L.push('')
  L.push('## L2 语义层任务（agent 契约）')
  L.push('')
  for (const t of L2_TASKS) L.push(`- **${t.id}**：${t.desc}`)
  L.push('')
  L.push(`> 本插件零模型零网络，测量可复现；解释与语义标注由 agent 完成。修改参考的生成规则与 stylomeWeaver 相同：证据 + 方向，不代写。`)
  return L.join('\n')
}

/** weave JSON（双输出 + 建议层 + L2 契约）。 */
export function buildWeaveJson({ profile, rep, loc, source, suggestions = [], self = null, transfer = null, sceneTrack = null }) {
  return {
    version: 2,
    tool: 'stylome-architect',
    createdAt: new Date().toISOString(),
    source: source ?? null,
    semantics: '双输出：①自我忠实与进步变化（新作相对锚定作者自身作品历史的分布位置）；②迁移参考（跨作者相似信号检索与回放，案例式迁移）。弧线特征是作品级表达信号，不做作者归属。suggestions 为方向性修改建议，改写由 agent 完成。',
    work: { name: profile.name, han: profile.han, nPara: profile.nPara, nSent: profile.nSent },
    anchor: { author: rep.author, nWorks: rep.nWorks },
    selfFidelity: self,
    transfer,
    shape: loc?.shape ?? null,
    nearestOwn: loc?.nearest ?? null,
    threads: { topEntities: profile.topEntities, echo: profile.echo, echoMiss: profile.echoMiss ?? [], gapReturn: profile.gaps, chapters: profile.chapters },
    arcs: { valence: profile.valenceArc, classes: profile.classArcs },
    rhythm: { H: profile.H, alphaSpan: profile.alphaSpan, altRate: profile.altRate, dialCurve: profile.dialCurve },
    suggestions,
    sceneTrack,
    l2Tasks: L2_TASKS,
    usage: 'agent 先读 selfFidelity.progression（自我推进点）与 suggestions（带外/形状/线索）生成修改参考；transfer 给出跨作者参考作品（正文在档案库，可摘引回放）；再依据 l2Tasks 逐项完成语义标注。证据仅此文件与档案库所载。',
  }
}
