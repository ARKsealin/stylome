// stylome-architect 本地自检（不依赖 DSH 运行时）：在部署机上确认测量核、分词桥、
// 词典、档案库与面板数据层都能工作。
//
//   node verify.mjs              快速自检（测量核 + 词典 + 分词桥 + 面板裁剪）
//   node verify.mjs --doctor     额外跑完整环境体检（与工具 stylome_architect_doctor 同源）
//
// 只读本机状态；不联网、不下载模型、不写档案库。

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLexicon } from './server/lexicon.mjs'
import { StreamMeter, pythonPath } from './server/stream.mjs'
import { workProfile, learnRepertoire, locate } from './server/architect.mjs'
import { buildSuggestions } from './server/advice.mjs'
import { selfAssessment } from './server/fidelity.mjs'
import { transferSuggestions } from './server/transfer.mjs'
import { renderCharts, renderWeave } from './server/report.mjs'
import { defaultLibraryRoot, loadLibrary, librarySummary } from './server/library.mjs'
import { libraryState, analyzeWork } from './server/pipeline.mjs'
import { scanFolder, weaveView, workView } from './server/panel.mjs'
import { doctor, renderDoctor, defaultPython } from './server/doctor.mjs'

const lines = []
const add = (ok, name, msg) => { lines.push((ok ? '✓ ' : '✗ ') + name + ' —— ' + msg); return ok }
let failed = 0
const check = (ok, name, msg) => { if (!add(ok, name, msg)) failed++ }

const SAMPLE = [
  '她推开门，听见穹顶的回声。走廊尽头有一盏灯，灯下的影子很长，长得像另一个人。',
  '他说：别过去。她没回头，只把手按在门框上，木头的纹理硌着掌心。',
  '风从窗缝里挤进来，带着铁锈和陈旧纸张的气味。她想起很久以前的一个下午，也是这样的光。',
  '她终于推开门。门后空无一物，只有一面镜子，镜子里的人也正推开门。',
].join('\n\n')

async function main() {
  // ① 测量核（零模型）——直接跑一部微型作品的档案
  let dict = null
  try {
    dict = loadLexicon()
    check(dict.size > 20000, '大工情感词典', `${dict.size} 词条（外部数据；学术使用免费，商用需联系大连理工 IR Lab）`)
  } catch (e) {
    check(false, '大工情感词典', e?.message ?? String(e))
  }

  let profile = null
  if (dict) {
    const meter = new StreamMeter(pythonPath())
    try {
      const stream = await meter.document(SAMPLE, dict)
      profile = workProfile(stream, { name: 'verify-sample' })
      check(Number.isFinite(profile.R) && profile.valenceArc.length === 10, '段落流测量', `${profile.han} 汉字 / ${profile.nPara} 段 / R=${profile.R}`)
      const charts = renderCharts(profile)
      check(!!charts.val, '弧线图渲染', 'valence 弧 SVG 已生成')
    } catch (e) {
      check(false, 'jieba 分词桥', `${pythonPath()}：${e?.message ?? e}`)
    } finally {
      try { meter.stop ? meter.stop() : meter.close() } catch { /* 桥已退出 */ }
    }
  }

  // ② 经验库定位：自我评估 + 建议 + 迁移检索（单作品即锚定历史，只验证管线可跑通）
  if (profile) {
    const rep = learnRepertoire([profile, { ...profile, name: 'verify-sample-2', R: (profile.R ?? 0) * 0.9 }], { author: 'verify' })
    const loc = locate(profile, rep)
    const self = selfAssessment(profile, [profile])
    const suggestions = buildSuggestions(profile, rep, loc)
    const transfer = transferSuggestions(profile, { authors: {} }, defaultLibraryRoot(), 'verify', () => [])
    check(self?.rows?.length === 7, '输出 A 自我评估', `${self.rows.length} 个指标 / 推进点 ${self.progression.length} 项`)
    check(Array.isArray(suggestions), '修改建议层', `${suggestions.length} 条`)
    check(!!transfer.note, '输出 B 迁移检索', '空迁移池给出明确说明（不伪造参考）')
    const md = renderWeave({ profile, rep, loc, charts: renderCharts(profile), suggestions, self, transfer, sceneTrack: null })
    check(md.includes('输出 A') && md.includes('输出 B'), 'weave 报告渲染', `${md.length} 字符`)
    const view = weaveView({ profile, rep, loc, self, transfer, suggestions, sceneTrack: null, charts: renderCharts(profile) })
    check(view.meta.han === profile.han && view.self.rows.length === 7, '面板载荷裁剪', 'weaveView 形状正确')
    const replay = workView(profile, { author: 'verify' })
    check(refreshCheck(replay), '作品回放载荷', 'workView 形状正确')
  }

  // ③ 档案库（只读）
  let libState = null
  try {
    libState = libraryState(defaultLibraryRoot())
    check(true, '档案库', `${libState.dir}｜锚定 ${libState.anchor ?? '（未标注）'}｜${libState.totalWorks} 部`)
  } catch (e) {
    check(false, '档案库', e?.message ?? String(e))
  }
  try {
    const s = librarySummary(loadLibrary(defaultLibraryRoot()))
    check(true, '注册表可读', `作者 ${s.authors.length} 个 / 作品 ${s.totalWorks} 部`)
  } catch (e) {
    check(false, '注册表可读', e?.message ?? String(e))
  }

  // ④ 面板扫描层（临时目录，用完即删）
  const tmp = mkdtempSync(join(tmpdir(), 'stylome-architect-verify-'))
  try {
    writeFileSync(join(tmp, 'a.txt'), '样例一')
    writeFileSync(join(tmp, 'b.md'), '样例二')
    writeFileSync(join(tmp, 'c.bin'), 'x')
    const scan = scanFolder(tmp, { maxFiles: 10 })
    check(scan.files.length === 2 && scan.unsupported === 1, '目录扫描', `${scan.total} 个文件，可读 ${scan.files.length}，不支持 ${scan.unsupported}`)
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理忽略 */ }
  }

  // ⑤ 可选：完整体检（与插件工具同源；会做一次真实分词）
  if (process.argv.includes('--doctor')) {
    const { checks } = await doctor({ python: process.env.STYLOME_ARCHITECT_PYTHON || defaultPython(), libraryPath: defaultLibraryRoot() })
    for (const c of checks) check(c.ok, '[doctor] ' + c.name, c.msg)
    lines.push('', renderDoctor(checks))
  }

  console.log(lines.join('\n'))
  console.log(failed ? `\n${failed} 项未过。` : '\n自检通过。')
  process.exit(failed ? 1 : 0)
}

function refreshCheck(v) {
  return !!(v && v.meta && v.threads && v.arcs && v.charts && Array.isArray(v.l2Tasks))
}

main().catch((e) => { console.error('✗ 自检崩溃：' + (e?.message ?? e)); process.exit(1) })
