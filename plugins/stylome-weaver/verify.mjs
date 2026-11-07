#!/usr/bin/env node
// 开箱自检：不依赖任何外部语料，用一段内置中文文本走完「测量 → 学画像 → 九轴/关键词 → 逐段校验」。
//
//   node verify.mjs            # 完整自检（会拉起 jieba 分词桥）
//   node verify.mjs --doctor   # 只做运行条件体检
//
// 退出码 0 表示自检通过。自检只验证链路可用，不代表画像质量；
// 真实画像必须由用户提供的样本集训练（本包不含任何预训练权重或内置画像）。

import { doctor, renderDoctor, defaultPython } from './server/doctor.mjs'
import { ParaMeter } from './server/meter.mjs'
import { learnProfile, profileSummary } from './server/profile.mjs'
import { validate } from './server/validate.mjs'
import { profileAxes, profileCards, profileKeywords, coverageRows, tierRows } from './server/metrics.mjs'
import { renderRadarSVG } from './server/radar.mjs'
import { summarizeAdvice } from './server/report.mjs'
import { compareDocument } from './server/weaver.mjs'

const SAMPLE = `雨停以后，江面上浮着一层薄薄的雾。船工老周把缆绳在木桩上绕了三圈，蹲下来，用袖口擦了擦额头。他的船是这条渡口最后一条木船，船帮上补过三块铁皮，颜色深浅不一，像贴上去的旧邮票。

对岸有人招手。老周站起来，把竹篙往水里一插，船就慢慢地荡出去。雾里看不见岸，只听见桨声和水声，还有很远的地方传来的汽笛。他记得三十年前这条江上有七条船，现在只剩下他这一条。

“老师傅，还过江吗？”对岸那个人穿着雨衣，帽檐往下滴水，手里提着一个纸箱。
“过。”老周说，“上来吧，站稳。”
那人上船的时候船晃了一下，纸箱里发出玻璃碰撞的轻响。他把箱子抱在胸前，坐下，不再说话。

雾越来越薄，江心的浮标露出一个顶。老周一边撑篙一边说，这条江每年涨水的时候最不好走，水面看着平，底下有暗流，船一偏就要打横。他说这话的时候并不看人，声音很平，像在讲别人的事。

“您一个人撑了多少年了？”那人问。
老周想了想，说记不清了。他说起先是他爹撑，后来是他，中间有几年他去城里的工厂做工，回来的时候船还在，只是掉了一层漆。他花了半个月把漆重新刷上，刷的时候手一直抖。

船靠岸的时候，太阳已经出来了。那人付了钱，道了谢，抱着纸箱往坡上走。老周没有立刻回头，他坐在船头，把竹篙横在膝上，看着那个背影越走越远，直到拐进巷子里看不见了。

江面上雾散了，浮标一个接一个地露出来。他从口袋里摸出一支烟，没点火，只是叼着。刚才那个人说话的口音像他年轻时候的同伴，那个后来去了南方，再没回来的人。风从水面上过来，很凉，带着水草的味道。他坐了很长时间，才重新站起来，把船往对岸撑。

镇上的钟敲了九下。老周把船拴好，去街口的铺子里吃了一碗面。面馆的老板娘问他今天过了几趟，他说三趟。老板娘说，太少了吧，以前一天十几趟。他嗯了一声，低头吃面，汤很烫，热气把眼镜糊住了。`;

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  return !!cond
}

if (process.argv.includes('--doctor')) {
  const report = await doctor({ profilesDir: process.env.STYLOME_WEAVER_PROFILES || '' })
  console.log(renderDoctor(report.checks))
  process.exit(report.ok ? 0 : 1)
}

const started = Date.now()
const py = defaultPython()
let meter = null
try {
  const report = await doctor({ python: py, profilesDir: process.env.STYLOME_WEAVER_PROFILES || '' })
  check('运行条件（doctor 全过）', report.ok, report.checks.filter((c) => !c.ok).map((c) => c.name).join('、') || 'ok')

  meter = new ParaMeter(py)
  const doc = await meter.document(SAMPLE)
  const checkable = doc.paras.filter((p) => p.checkable)
  check('段落测量', doc.paras.length >= 6 && checkable.length >= 4, `${doc.paras.length} 段 / 可校验 ${checkable.length}`)
  const flat = checkable[0]?.features ?? {}
  check('特征平表', Number.isFinite(flat['fw:的']) && Number.isFinite(flat['sent:sentLenMean']) && Number.isFinite(flat['lex:mattr']) && Number.isFinite(flat['emo:R']) && Number.isFinite(flat['bigramDiv']), `${Object.keys(flat).length} 个键`)

  // 自检用的训练单元：内置文本的段落 + 段内滑窗（只验证链路，不代表画像质量）
  const units = checkable.map((p) => ({ han: p.han, features: p.features }))
  for (const p of checkable) {
    for (const w of await meter.windowsOf(p.sents, 140)) {
      const han = [...w.text].filter((ch) => /\p{Script=Han}/u.test(ch)).length
      if (han >= 60) units.push({ han, features: w.features })
    }
  }
  check('训练单元', units.length >= 10, `${units.length} 个可校验单元`)

  const profile = learnProfile(units, { alpha: 0.1, minN: 3, author: '自检样本', id: 'selfcheck', source: { files: 1, paragraphs: units.length, chars: doc.hanTotal } })
  const sum = profileSummary(profile)
  check('学习画像', sum.features >= 8 && sum.cells >= 8, `${sum.features} 项特征 / ${sum.cells} 个带格`)

  const axes = profileAxes(profile)
  const filled = axes.filter((a) => a.value != null).length
  check('九轴指纹', axes.length === 9 && filled >= 6, `${filled}/9 轴有读数`)
  const keywords = profileKeywords(profile)
  check('风格关键词', keywords.length >= 3 && keywords.every((k) => k.word && k.detail), keywords.map((k) => k.word).join('、'))
  const cards = profileCards(profile)
  check('指标卡', cards.length >= 3, `${cards.length} 张`)
  const rows = coverageRows(profile)
  check('覆盖表', rows.length >= 8, `${rows.length} 行`)
  check('段长分档', tierRows(profile).length >= 1, JSON.stringify(profile.coverage.tiers))

  const svg = renderRadarSVG({ axes: axes.map((a) => ({ key: a.key, label: a.label })), series: [{ key: 'p', label: '自检', tone: 'profile', values: Object.fromEntries(axes.map((a) => [a.key, a.value])) }] })
  check('雷达 SVG', svg.startsWith('<svg') && svg.includes('</svg>') && svg.length > 500, `${svg.length} 字节`)

  const validation = validate(doc.paras, profile)
  check('逐段校验', validation.checked >= 4 && validation.rollup && typeof validation.rollup.verdicts === 'object', `${validation.checked} 段参与，跳过 ${validation.skipped}`)

  const cmp = await compareDocument({ profile, profileId: 'selfcheck', text: SAMPLE, source: '自检样本', meter })
  check('完整比对', cmp.axes.length === 9 && typeof cmp.svg === 'string' && Array.isArray(cmp.problems) && Array.isArray(cmp.advice), `${cmp.problemCount} 段问题 / ${cmp.advice.length} 条方向`)
  if (cmp.advice.length) check('修改意见', cmp.advice.every((a) => a.advice && a.label && a.count > 0), cmp.advice.map((a) => a.label).join('、'))

  console.log(`关键词  ${keywords.map((k) => k.word).join('、')}`)
  console.log(`九轴    ${axes.map((a) => `${a.label}${a.value == null ? '—' : a.value.toFixed(2)}`).join(' ')}`)
  console.log(`判读    越带 ${validation.rollup.verdicts['越带'] ?? 0} 段 / 关注 ${validation.rollup.verdicts['关注'] ?? 0} 段 / 在带内 ${validation.rollup.verdicts['在带内'] ?? 0} 段`)
  if (cmp.advice.length) console.log(`方向    ${summarizeAdvice(cmp.problems).map((a) => a.label).join('、')}`)
} catch (e) {
  check('自检执行', false, e?.stack ?? String(e))
} finally {
  try { meter?.close() } catch { /* 已退出 */ }
}

const bad = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' —— ' + r.detail : ''}`)
if (bad.length) {
  console.error(`\n自检失败：${bad.length} 项未过。先运行 node verify.mjs --doctor；Python 依赖见 requirements.txt。`)
  process.exit(1)
}
console.log(`\n自检通过（${((Date.now() - started) / 1000).toFixed(1)} s）：测量、学画像、九轴/关键词、逐段校验与完整比对链路可用。`)
console.log('提示：真实画像必须由你提供的参考作者样本集训练，本包不含任何预训练权重或内置画像。')
process.exit(0)
