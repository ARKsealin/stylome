// 报告面：findings（结构化发现，agent / 面板消费的契约）与人类可读 markdown。
//
// 双产物：
//   findings JSON —— 机器接口：问题段全文 + 逐发现（带/实测/z/严重度/建议标签/原文证据）。
//   markdown —— 人读：判读汇总、组汇总表、逐段明细。
//
// 本插件不改写文本：报告只陈述证据与方向性意见，改写由 agent 或作者在插件之外完成。

import { ADVICE, GROUPS, SEVERITY_LABEL, TIER_LABEL, MIN_CHECK_CHARS } from './catalog.mjs'
import { profileSummary } from './profile.mjs'

const f4 = (v) => (Number.isFinite(v) ? (Math.round(v * 10000) / 10000).toString() : '—')
/** 文档对象既可能是 ParaMeter 的结果（paras 是数组），也可能只是计数（paraCount）。 */
const paraCountOf = (doc) => (typeof doc?.paras === 'number' ? doc.paras : (doc?.paras?.length ?? 0))

/** advice 标签 → 方向性意见文本。 */
export const adviceText = (tag, side) => ADVICE[tag]?.[side] ?? '对照参考带调整该特征的用量。'

/**
 * 组装 findings JSON（agent 契约）。
 *
 * 哪些段落算「问题段落」由阈值决定，而不是按条数截断：
 *   problemZ —— 段落最深越带 z ≥ 该值的段落全部列入（记录下限 z=1，故阈值 < 1 等价于 1）。
 *   默认 2（严重档）；调低会纳入更多段落，调高只看最重的。段数多少由作品本身决定，不做配额。
 */
export function buildFindings({ source, doc, validation, evidences, profile, profileId, problemZ = 2 }) {
  const ps = profileSummary(profile)
  const z = clampProblemZ(problemZ)
  const evByPara = new Map()
  for (const e of evidences) {
    if (!evByPara.has(e.idx)) evByPara.set(e.idx, [])
    evByPara.get(e.idx).push(e.evidence)
  }
  const selected = validation.results
    .filter((r) => r.zMax >= z)
    // 先按严重度、再按 z 排：读者先看到最该改的段落。
    .sort((a, b) => (b.counts.severe - a.counts.severe) || (b.zMax - a.zMax) || (a.idx - b.idx))
  const paragraphs = selected
    .map((r) => {
      const para = doc.paras[r.idx - 1]
      const evByKey = new Map((evByPara.get(r.idx) ?? []).map((e) => [e.key, e]))
      return {
        idx: r.idx, han: r.han, tier: r.tier, verdict: r.verdict, zMax: r.zMax,
        text: para?.text ?? '',
        findings: r.findings.map((f) => ({
          key: f.key, label: f.label, group: f.group,
          band: [f.lo, f.hi], value: f.value, side: f.side, z: f.z, severity: SEVERITY_LABEL[f.severity] ?? f.severity,
          advice: adviceText(f.advice, f.side),
          evidence: evByKey.get(f.key) ?? null,
        })),
      }
    })
  return {
    version: 1,
    tool: 'stylome-weaver',
    createdAt: new Date().toISOString(),
    source: source ?? null,
    profile: { id: profileId ?? profile.id ?? null, author: profile.author ?? null, kind: ps.kind, alpha: ps.alpha, features: ps.features, cells: ps.cells, minN: ps.minN },
    document: { hanTotal: doc.hanTotal, paras: paraCountOf(doc), checked: validation.checked, skippedNoCheck: validation.skipped, minCheckChars: MIN_CHECK_CHARS },
    criterion: { problemZ: z, paragraphCount: paragraphs.length, checked: validation.checked },
    rollup: validation.rollup,
    usage: '本文件是修改意见的生成契约：对 paragraphs[].text 逐段对照 findings[] 生成修改建议；findings[] 给出参考带/实测/严重度/方向性意见/evidence（原文引句或滑窗）。paragraphs[] 是「最深 z ≥ criterion.problemZ」的全部段落，未做条数截断。改写本身不在本插件职责内。',
    paragraphs,
  }
}

/** 阈值归一：记录下限是 z=1，上限 10；非法输入退回默认 2。 */
export function clampProblemZ(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 2
  return Math.min(10, Math.max(1, n))
}

/** 把逐段发现压成「方向 → 出现次数」的意见汇总（面板与工具都用）。 */
export function summarizeAdvice(problems) {
  const tally = new Map()
  for (const p of problems) {
    for (const f of p.findings) {
      const key = `${f.key}|${f.side}`
      const item = tally.get(key) ?? { key: f.key, label: f.label, group: f.group, side: f.side, count: 0, zMax: 0, advice: f.advice }
      item.count++
      item.zMax = Math.max(item.zMax, f.z ?? 0)
      tally.set(key, item)
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.zMax - a.zMax || b.count - a.count)
    .slice(0, 8)
    .map((x) => ({ ...x, zMax: Math.round(x.zMax * 100) / 100 }))
}

/** 人类可读的比对报告（compare 工具的返回主体）。 */
export function renderFindings({ source, doc, validation, findingsJson }) {
  const L = []
  const ps = findingsJson.profile
  L.push(`# StylomeWeaver 比对报告${source ? ` —— ${source}` : ''}`)
  L.push('')
  L.push(`- 画像：${ps.author ?? ps.id}（带外预算 α=${ps.alpha}，特征 ${ps.features} 项，最薄档 n=${ps.minN}）`)
  L.push(`- 文档：${doc.hanTotal} 汉字，${paraCountOf(doc)} 段（可校验 ${validation.checked}，过短跳过 ${validation.skipped}，下限 ${MIN_CHECK_CHARS} 字）`)
  const v = validation.rollup.verdicts
  L.push(`- 判读：越带 ${v['越带'] ?? 0} 段 ｜ 关注 ${v['关注'] ?? 0} 段 ｜ 轻微偏离 ${v['轻微偏离'] ?? 0} 段 ｜ 在带内 ${v['在带内'] ?? 0} 段`)
  const criterion = findingsJson.criterion
  if (criterion) {
    L.push(`- 问题段落：最深越带 z ≥ ${criterion.problemZ} 的段落共 ${criterion.paragraphCount} 段（全列，未按条数截断；记录下限 z=1）`)
  }
  const groups = GROUPS.filter((g) => validation.rollup.groups[g])
  if (groups.length) {
    L.push('')
    L.push('## 组汇总')
    L.push('')
    L.push('| 组 | 带外发现 | 平均 z | 最深 z |')
    L.push('|---|---|---|---|')
    for (const g of groups) {
      const s = validation.rollup.groups[g]
      L.push(`| ${s.label} | ${s.n} | ${s.zMean} | ${s.zMax} |`)
    }
  }
  if (!findingsJson.paragraphs.length) {
    L.push('')
    L.push('全部段落都落在画像带内，无需修改。')
    L.push('')
    return L.join('\n')
  }
  L.push('')
  L.push('## 逐段问题与修改意见（按严重度排序）')
  for (const p of findingsJson.paragraphs) {
    L.push('')
    L.push(`### 段 ${p.idx}（${p.han} 字 · ${TIER_LABEL[p.tier] ?? p.tier}）—— ${p.verdict}，最深 z=${p.zMax}`)
    L.push('')
    L.push(`> ${p.text.length > 160 ? p.text.slice(0, 160) + '…' : p.text}`)
    L.push('')
    for (const f of p.findings) {
      const where = f.side === 'uncovered'
        ? '画像未覆盖该段长档（无分位带）'
        : `画像带 [${f4(f.band[0])}, ${f4(f.band[1])}]，${f.side === 'hi' ? '高于上沿' : '低于下沿'}`
      const zText = f.side === 'uncovered' ? '分类判定' : `z=${f.z}`
      L.push(`- **${f.label}**：实测 ${f4(f.value)}，${where}，${zText}（${f.severity}）`)
      L.push(`  - 意见：${f.advice}`)
      const e = f.evidence
      if (e?.kind === 'hits') for (const it of e.items.slice(0, 3)) L.push(`  - 例句（${it.count} 处）：「${it.quote}」`)
      else if (e?.kind === 'windows') for (const it of e.items.slice(0, 2)) L.push(`  - 最差窗（实测 ${f4(it.value)}）：「${it.quote}」`)
    }
  }
  L.push('')
  return L.join('\n')
}

/** 训练完成后的 markdown 摘要（train 工具返回主体）。 */
export function renderTrainReport({ profile, keywords, cards, axes, files, paragraphs, chars, replaced }) {
  const L = []
  L.push(`# StylomeWeaver 画像生成 —— ${profile.author}`)
  L.push('')
  L.push(`- 样本：${files} 个文件，${paragraphs} 个可校验段落，共 ${chars} 汉字`)
  L.push(`- 画像：${profile.coverage.features}/${profile.coverage.total} 项特征学到了分位带，带外预算 α=${profile.alpha}，最薄档 n=${profile.minN}`)
  L.push(`- 存档：已写入画像库（${replaced ? '覆盖同名作者的旧画像' : '新建'}），id=${profile.id}`)
  L.push('')
  L.push('## 风格关键词')
  L.push('')
  L.push(keywords.map((k) => `**${k.word}**（${k.detail}）`).join(' ｜ '))
  L.push('')
  if (cards.length) {
    L.push('## 关键指标')
    L.push('')
    L.push('| 指标 | 数值 | 说明 |')
    L.push('|---|---|---|')
    for (const c of cards) L.push(`| ${c.label} | ${c.value} ${c.unit} | ${c.note} |`)
    L.push('')
  }
  if (axes?.length) {
    L.push('## 九轴风格指纹（0–1 展示刻度）')
    L.push('')
    L.push('| 轴 | 位置 | 实测 | 画像带 |')
    L.push('|---|---|---|---|')
    for (const a of axes) {
      L.push(`| ${a.label} | ${a.value == null ? '—' : a.value.toFixed(2)} | ${a.raw == null ? '—' : a.raw} ${a.unit} | ${a.band ? `[${a.band.lo}, ${a.band.hi}]` : '无带' } |`)
    }
    L.push('')
  }
  return L.join('\n')
}
