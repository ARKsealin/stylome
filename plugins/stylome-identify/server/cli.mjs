// 判别命令行。
//
//   node server/cli.mjs <文件> [--json]
//   node server/cli.mjs --doctor
//
// 支持 .txt / .md / .docx / .doc。≥800 汉字走主管线（需要 jieba 分词，解释器见 LITIDENTIFY_PYTHON）；
// 350–800 字走微段管线；更短只出报告。
// DSH 里的等价入口是本插件的 stylome_identify 工具与 /identify 命令，二者与这里共用 server/report.mjs。

import { join, dirname } from 'node:path'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readRaw } from '../lib/corpus/import.mjs'
import { Stack } from './stack/index.mjs'
import { Meter } from './meter.mjs'
import * as archive from './archive.mjs'
import { render } from './report.mjs'
import { doctor, renderDoctor, DEFAULT_MODEL } from './doctor.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// --doctor 移植体检：逐项确认目标设备满足运行条件，全部 OK 才判别可用
if (process.argv.includes('--doctor')) {
  const { ok, checks } = await doctor({ modelPath: DEFAULT_MODEL })
  console.log(renderDoctor(checks))
  process.exit(ok ? 0 : 1)
}

if (process.argv.includes('--archive')) {
  const argVal = process.argv[process.argv.indexOf('--archive') + 1]
  const idFlag = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null
  const arg = idFlag ? 'id' : ((!argVal || argVal.startsWith('--')) ? 'list' : argVal)
  if (arg === 'list') {
    const rows = archive.list({ limit: Number(process.argv[process.argv.indexOf('--limit') + 1] ?? 20) || 20 })
    console.log(rows.length ? ['—— 判别档案（最近 ' + rows.length + ' 条）——', ...rows.map((r) => archive.summaryLine(r))].join(String.fromCharCode(10)) : '档案为空：判别过的文本会自动入档。')
    process.exit(0)
  }
  let hist = []
  const { cleanText } = await import('./stack/clean.mjs')
  if (existsSync(arg)) {
    const hash = (await import('node:crypto')).createHash('sha256').update(cleanText(readRaw(arg))).digest('hex').slice(0, 16)
    hist = archive.historyOf(hash)
    if (!hist.length) { console.log('该文件没有判别档案——对它做一次判别即可自动入档。'); process.exit(0) }
  } else if (idFlag || arg === 'id') {
    const rec = archive.get(idFlag)
    if (!rec) { console.error(`档案号不存在：${idFlag}`); process.exit(1) }
    hist = [rec]
  } else {
    const rec = archive.get(arg)
    if (!rec) { console.error(`既不是文件路径也不是档案号：${arg}`); process.exit(1) }
    hist = [rec]
  }
  const latest = hist[0]
  console.log(`—— 【档案回放】${latest.source ?? latest.excerpt} 共 ${hist.length} 条记录 ——`)
  for (const h of hist) console.log(`  · ${h.at.slice(0, 16).replace('T', ' ')}  模型 ${h.modelVersion}  pAI=${h.pAI}  ${h.verdict}  （${h.id}）`)
  console.log('')
  console.log(`以下为最新一次判别的原样报告（${latest.at.slice(0, 16).replace('T', ' ')}，模型 ${latest.modelVersion}）：`)
  console.log(render(latest.result))
  process.exit(0)
}

const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!file) { console.error('用法：node server/cli.mjs <文件> [--json] 或 --doctor'); process.exit(2) }

const stack = Stack.load(join(HERE, 'model.json'))
const text = readRaw(file)
const meter = new Meter()
let result
try {
  result = stack.judge(text, await meter.measure(text))
} finally {
  meter.close()
}

if (!process.argv.includes('--no-archive') && result.grade !== '样本不足' && result.route !== 'short') {
  try {
    const rec = archive.append(result, {
      source: file, textHash: result.textHash,
      excerpt: String(text).replace(/\s+/gu, '').slice(0, 48),
      modelVersion: stack.model?.card?.version ?? stack.model?.trainedAt?.slice(0, 10) ?? 'unknown',
    })
    var archiveReceipt = rec ? `—— 已存档（档案号 ${rec.id}）；回放：node server/cli.mjs --archive ${file}` : null
  } catch (e) { var archiveReceipt = `—— 存档失败：${e.message}` }
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(result, null, 1)); process.exit(0) }
if (process.argv.includes('--radar')) {
  const { renderRadarHTML } = await import('./radar.mjs')
  const html = renderRadarHTML({
    label: file.split(/[/]/).pop(),
    axes: result.sdn?.axes ?? {},
    bandHi: result.sdn?.bandHi ?? null,
    meta: { pAI: result.pAI, grade: result.grade, verdict: result.sdn?.verdict, winTop: result.sdn?.winTop, han: result.han, nWin: result.spectrum?.windows?.length },
  })
  const out = file.replace(/.[^.]+$/, '') + '.radar.html'
  writeFileSync(out, html)
  console.log('雷达图已写出：' + out)
  process.exit(0)
}
console.log(render(result))
if (typeof archiveReceipt !== 'undefined' && archiveReceipt) console.log(archiveReceipt)
