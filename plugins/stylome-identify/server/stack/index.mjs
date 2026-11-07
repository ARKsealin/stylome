// 判别栈 v2 的推理入口。
// L0 清洗与路由 → L1 特征（逐窗测量与句向量，Meter 给）→ 判别器（L1-LR 主；L3-HASH、EMB-LR 按准入与辨识出的融合权重进综合；
// D-OPEN 单独报告）→ 运营点（误判代价政策辨识的判定线）+ sig 仲裁 + 高误报重叠区降级
// → L4 分级输出、SDN 判决（等级 + 混合）、全文光谱、证据表、边界声明。
// 模型从 model.json 读；训练见 scripts/train.mjs，参数辨识见 scripts/tune.mjs。

import { readFileSync } from 'node:fs'
import { charCount } from '../../lib/meter/segment.mjs'
import { cleanText } from './clean.mjs'
import { createHash } from 'node:crypto'
import { LinearHead } from './linear.mjs'
import { HashHead } from './hash.mjs'
import { EmbedHead } from './embed.mjs'
import { OpenSetHead } from './openset.mjs'
import { predictSet } from './conformal.mjs'
import { OverlapZone } from './overlap.mjs'
import { microFeatures, microScorer } from './micro.mjs'
import { segmentSeries } from './hybrid.mjs'
import { sigDensity, SIG_THRESHOLD } from './sig.mjs'
import { AxisModel } from './axes.mjs'
import { docVector, lamps } from './docs.mjs'
import { sdnFromJSON, mapVerdict } from './sdn.mjs'
import { fuse } from './transfer.mjs'
import { REPORT, ROUTE } from './registry.mjs'

export { cleanText }

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const round = (v, d = 4) => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d

/** 逐窗特征取均值（键缺失按 0，NaN 跳过）。 */
function averageFeatures(windows) {
  const keys = new Set(windows.flatMap((w) => Object.keys(w.features)))
  const out = {}
  for (const k of keys) {
    const v = windows.map((w) => w.features[k] ?? 0).filter(Number.isFinite)
    out[k] = v.length ? mean(v) : NaN
  }
  return out
}

export class Stack {
  /** @param {object} model model.json 的内容 */
  constructor(model) {
    const th = model.thresholds ?? {}
    this.gradeHigh = th.gradeHigh ?? 0.8
    this.conflictSpread = th.conflictSpread ?? 0.4
    this.model = model
    this.fusion = model.fusion ?? { l1: 1, l3: 0, emb: 0 }
    this.l1 = LinearHead.fromJSON(model.l1)
    this.l3 = model.l3 ? HashHead.fromJSON(model.l3) : null
    this.emb = model.emb ? EmbedHead.fromJSON(model.emb) : null
    this.open = OpenSetHead.fromJSON(model.open)
    this.zone = OverlapZone.fromJSON(model.zone)
    this.microScore = model.micro?.admitted ? microScorer(model.micro) : null
    this.axis = AxisModel.fromJSON(model.axis)
    this.sdn = sdnFromJSON(model.sdn.model)
  }

  static load(path) { return new Stack(JSON.parse(readFileSync(path, 'utf8'))) }

  /**
   * 判别一篇文本。
   * @param {string} text 原文
   * @param {object} [opt] Meter.measure(text) 的结果：windows（≥800 汉字时必需）、doc（350–800 字时的句向量）
   */
  judge(text, { windows = null, doc = null } = {}) {
    const clean = cleanText(text)
    const han = charCount(clean), chars = [...clean].length
    const base = {
      han, chars, textHash: createHash('sha256').update(clean).digest('hex').slice(0, 16),
      pAI: null, parts: {}, predictionSet: [], grade: '样本不足', note: null, conflict: false,
      overlapAuthors: [], openSet: null, evidence: [], report: [], sdn: null, spectrum: null, disclaimer: this.disclaimer(),
    }
    if (han < ROUTE.micro) return { ...base, route: 'short', note: `低于 ${ROUTE.micro} 汉字，只出报告，不给结论` }
    if (han < ROUTE.main) return this.judgeMicro(clean, base, doc)
    if (!windows?.length) throw new Error('主管线需要逐窗测量结果（server/meter.mjs 的 Meter.measure）')
    return this.judgeMain(clean, windows, base)
  }

  judgeMicro(clean, base, doc) {
    if (!this.microScore) return { ...base, route: 'micro', note: `微段管线未过准入：${this.model.micro.reason}` }
    const row = { features: microFeatures(clean), text: clean, emb: doc?.emb ?? null }
    const p = this.microScore(row)
    const set = predictSet(p, this.model.micro.conformal.qAi, this.model.micro.conformal.qHuman)
    const g = this.gradeOf({ p, set, text: clean, zoneHits: [] })
    // <800 字结论降一级（v2 §3），但"中"不再降到"低"：降到低就是把有 AI 迹象的文本判成人类，违反误判代价政策
    const grade = g.grade === '高' ? '中' : g.grade
    return {
      ...base, route: 'micro', pAI: round(p), parts: { micro: round(p) }, predictionSet: set, microModel: this.model.micro.cand.join('+'),
      grade, note: [g.note, g.grade === '高' ? '低于 800 汉字，结论降一级' : null].filter(Boolean).join('；') || null,
    }
  }

  /** 一个窗在各判别器上的分数（缺句向量时 emb 为 NaN，融合按其余权重重新归一）。 */
  windowParts(w, clean) {
    return { l1: this.l1.p(w.features), l3: this.l3 ? this.l3.p(w.text ?? clean) : null, emb: this.emb && w.emb ? this.emb.p(w.emb) : null }
  }

  judgeMain(clean, windows, base) {
    // 逐窗打分（训练与运营点都在块上做）；窗级综合 pAI = 辨识出的融合权重加权，全文 pAI = 窗级综合的均值
    const wp = windows.map((w) => this.windowParts(w, clean))
    const ps = wp.map((x) => fuse(x, this.fusion))
    const p1 = wp.map((x) => x.l1)
    const pAI = mean(ps)
    const headMean = (k) => { const v = wp.map((x) => x[k]).filter(Number.isFinite); return v.length ? mean(v) : null }
    const parts = { 'L1-LR': headMean('l1') }
    if (this.l3) parts['L3-HASH'] = headMean('l3')
    if (this.emb) parts['EMB-LR'] = headMean('emb')
    const used = [['l1', 'L1-LR'], ['l3', 'L3-HASH'], ['emb', 'EMB-LR']].filter(([k, n]) => this.fusion[k] > 0 && Number.isFinite(parts[n])).map(([, n]) => parts[n])
    const spread = Math.max(...used) - Math.min(...used)
    const avg = averageFeatures(windows)
    const zoneHits = this.zone.hits(avg)
    const set = predictSet(pAI, this.model.conformal.qAi, this.model.conformal.qHuman)
    const g = this.gradeOf({ p: pAI, set, conflict: spread > this.conflictSpread, text: clean, zoneHits })

    const levelWindow = this.model.sdn.levelWindow ?? 1
    const v = docVector(windows.map((w, i) => ({ features: w.features, p: ps[i], pPos: p1[i] })), { axisModel: this.axis, open: this.open, chars: base.chars, levelWindow })
    const openNorm = this.open.admitted ? v.openNorm : null
    const ood = openNorm !== null && openNorm > 1 && pAI >= this.gradeHigh
    const notes = [g.note]
    if (ood) notes.push('有 AI 迹象，生成源可能不在训练覆盖内')

    const lamp = lamps({ ps, chars: base.han, openNorm: v.openNorm, discriminatorSpread: spread, levelWindow })
    let s = mapVerdict(this.sdn.forward(v.x), lamp, { cuts: this.sdn.cuts() })
    // 重叠区降级同样作用于等级（v2 §3）：落入登记作者区间时不给高度疑似；混合标记不受影响（降级后等级仍 ≥ 存在嫌疑）
    const zoneDowngrade = zoneHits.length > 0 && s.level === '高度疑似'
    if (zoneDowngrade) s = { ...s, level: '存在嫌疑', verdict: s.mixed ? '存在嫌疑＋混合可能' : '存在嫌疑' }

    const evidence = this.l1.evidence(avg)
    const report = REPORT.filter((n) => Number.isFinite(avg[n])).map((n) => ({ name: n, value: round(avg[n]), role: '报告项', direction: '不参与判别' }))

    return {
      ...base, route: 'main', pAI: round(pAI),
      parts: Object.fromEntries(Object.entries(parts).map(([k, x]) => [k, round(x)])),
      fusion: this.fusion,
      predictionSet: set, grade: g.grade, note: notes.filter(Boolean).join('；') || null, conflict: spread > this.conflictSpread,
      overlapAuthors: zoneHits,
      openSet: this.open.admitted ? { normalized: round(openNorm), ood } : { admitted: false },
      evidence, report,
      sdn: {
        verdict: s.verdict, level: s.level, mixed: s.mixed, levelProbs: s.probs, pMix: s.pMix,
        winTop: round(v.stats.top, 3), levelWindow,
        lamps: lamp, zoneDowngrade, by: this.model.sdn.admitted ? 'net' : 'rule',
        axes: Object.fromEntries(Object.entries(v.axes).map(([k, x]) => [k, round(x, 3)])),
        evidenceRef: 'L1 证据表（逐特征归因不指向 SDN）',
      },
      spectrum: windows.length >= 2 ? this.spectrum(windows, ps) : null,
    }
  }

  /** conformal 预测集 → 运营分级（v2 §3 映射表）。 */
  gradeOf({ p, set, conflict = false, text, zoneHits }) {
    if (conflict) return { grade: '证据冲突', note: `判别器间 max−min > ${this.conflictSpread}，各方并列，不给单值` }
    if (set.length !== 1) {
      const d = sigDensity(text)
      const why = set.length === 0 ? 'pAI 落在两条校准带之间' : 'pAI 同时落在两条校准带内'
      if (d >= SIG_THRESHOLD) return { grade: '中', note: `${why}；词汇签名佐证（AI 侧 Top-20 密度 ${d.toFixed(2)}/千字 ≥ ${SIG_THRESHOLD}）` }
      return { grade: '弃权', note: `${why}；sig 密度 ${d.toFixed(2)}/千字，不足以仲裁` }
    }
    if (set[0] === 'AI') {
      if (zoneHits.length) return { grade: '中', note: `落入高误报作者区间（${zoneHits.join('、')}），AI 结论降一级` }
      return p >= this.gradeHigh ? { grade: '高', note: '可提示 AI 参与（附证据表）' } : { grade: '中', note: '给证据表，不做强弱判断' }
    }
    return { grade: '低', note: '参照覆盖范围内未检出 AI 签名（不构成"人类书写"结论）' }
  }

  /** 全文光谱（v2 §4.2）：逐窗 pAI、BOCPD 变点、尾部振荡。参数与校准结论来自留出拼接文档（train-report）。 */
  spectrum(windows, ps) {
    const sp = this.model.spectrum ?? { sigma: 0.15, cpThreshold: 0.5, calibrated: false }
    const seg = segmentSeries(ps, { sigma: sp.sigma, cpThreshold: sp.cpThreshold, hazard: sp.hazard, prior: sp.prior, sigma0: sp.sigma0 })
    const e = sp.eval
    const pol = this.model.policy ?? { locMiss: 0.05, humanFlag: 0.2 }
    return {
      windows: windows.map((w, i) => ({ index: i, han: w.han, pAI: round(ps[i], 3) })),
      segments: seg.segments.map((s) => ({ ...s, mean: round(s.mean, 3) })),
      changePoints: seg.cuts.map((i) => ({ index: i, p: round(seg.changePoints[i], 3) })),
      highWindows: ps.map((p, i) => p >= this.gradeHigh ? i : -1).filter((i) => i >= 0),
      oscillation: seg.oscillation,
      calibrated: !!sp.calibrated,
      note: e ? `变点定位${sp.calibrated ? '已校准' : '未校准'}：留出拼接文档漏定位 ${round(1 - e.hitRate, 3)}，长篇人类文档误报 ${round(e.falseAlarm, 3)}（线 ${pol.locMiss} / ${pol.humanFlag}）` : '变点定位未校准',
    }
  }

  disclaimer() {
    const c = this.model.card
    return [
      `训练覆盖：${c.families.join('、')}，温度 ${c.temps.join('/')}；第五个模型出现时全部留一格需重跑。`,
      c.gptossNote + '。',
      ...(c.highFprAuthors.length ? [`已知高误报区：${c.highFprAuthors.join('、')}的部分作品在 pos7 上与 AI 重叠（留一作者 0.5 阈值误报率见 train-report）。`] : []),
      `人类参照 = ${c.humanAuthors} 位作者 ${c.humanWorks} 部${c.domain}；领域外文本不在工况内。`,
      c.errorRates ? `判定线按"AI 尽量不错判为人类"取：在没见过的家族与作者上估计，AI 判成人类约 ${(c.errorRates.aiJudgedHuman * 100).toFixed(1)}%，人类判成 AI 约 ${(c.errorRates.humanJudgedAi * 100).toFixed(1)}%。` : null,
      '输出是统计证据排序，不是对作者的判定（证伪强、证真弱）。',
    ].filter(Boolean)
  }
}
