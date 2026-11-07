// 移植体检：逐项确认当前设备满足判别所需的运行条件。
// 命令行 `node server/cli.mjs --doctor` 与 DSH 工具 stylome_identify_doctor 共用；
// 每项返回 { name, ok, msg }，全部通过才代表判别功能可完整运行。
// 主判别只需 node / python / jieba / model.json；句向量项缺失时自动降级为插补模式。

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveEmbedModelDir } from './embedModel.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_MODEL = join(HERE, 'model.json')
export const defaultPython = () => process.env.LITIDENTIFY_PYTHON || 'python'

/**
 * @param {{ python?: string, modelPath?: string, embedDir?: string }} [options]
 * @returns {Promise<{ ok: boolean, checks: Array<{ name: string, ok: boolean, msg: string }> }>}
 */
export async function doctor({ python = defaultPython(), modelPath = DEFAULT_MODEL, embedDir = null } = {}) {
  const checks = []
  const add = (name, ok, msg) => checks.push({ name, ok, msg })

  add('node ≥ 22', Number(process.versions.node.split('.')[0]) >= 22, '当前 ' + process.versions.node)

  let pyMsg = python + ' 不可用'
  let pyOk = false
  try {
    const v = spawnSync(python, ['--version'], { encoding: 'utf8', timeout: 15000 })
    pyOk = v.status === 0
    pyMsg = pyOk ? python + ' → ' + (v.stdout || v.stderr || '').trim() : python + ' 不可用：' + (v.error?.message ?? 'exit ' + v.status)
  } catch (e) {
    pyMsg = '探测失败：' + e.message
  }
  add('python 解释器', pyOk, pyMsg)

  let jiebaOk = false
  let jiebaMsg = ''
  let seg = null
  try {
    const { startSegmenter } = await import('../lib/corpus/segmenter.mjs')
    seg = startSegmenter(python)
    await Promise.race([seg.segment('测试'), new Promise((_, rej) => setTimeout(() => rej(new Error('10s 无响应')), 10000))])
    jiebaOk = true
    jiebaMsg = '分词桥握手成功'
  } catch (e) {
    jiebaMsg = e.message.slice(0, 160)
  } finally {
    try { seg?.stop() } catch { /* 桥未建立时忽略 */ }
  }
  add('jieba 分词桥', jiebaOk, jiebaMsg)

  // 句向量模型（外部数据）：这里只报告就绪状态，不在体检里触发下载。
  // 缺失时由面板「依赖」弹窗让用户确认是否下载（约 470MB），或按 env STYLOME_EMBED_MODEL 指路。
  let embDir = embedDir ?? resolveEmbedModelDir()
  const embOk = existsSync(join(embDir, 'model.onnx')) && existsSync(join(embDir, 'tokenizer.json'))
  add('句向量模型（外部，需确认后下载）', true, embOk
    ? `已就绪：${embDir}`
    : `未下载：${embDir}——面板「依赖」会弹窗让你确认是否现在下载；不下载时按插补模式降级，主判别不受影响`)

  let onnxOk = false
  let onnxMsg = '未探测'
  try {
    const code = 'import onnxruntime, tokenizers; print("ok")'
    const v = spawnSync(python, ['-I', '-c', code], { encoding: 'utf8', timeout: 30000 })
    onnxOk = v.status === 0 && (v.stdout || '').includes('ok')
    onnxMsg = onnxOk ? 'onnxruntime + tokenizers 可用' : (v.stderr || '不可用').slice(0, 160)
  } catch (e) {
    onnxMsg = '探测失败：' + e.message
  }
  add('onnxruntime + tokenizers（微段/句向量）', onnxOk, onnxMsg + '；缺失时自动降级为插补模式')

  let modelOk = false
  let modelMsg = '缺失：' + modelPath
  if (existsSync(modelPath)) {
    try {
      const model = JSON.parse(readFileSync(modelPath, 'utf8'))
      modelOk = true
      modelMsg = `已加载 ${model.version ?? '?'}（${model.trainedAt ?? '?'}）`
    } catch (e) {
      modelMsg = '无法解析：' + e.message
    }
  }
  add('判别模型 model.json', modelOk, modelMsg)

  return { ok: checks.every((c) => c.ok), checks }
}

/** 体检结果的可读文本。主判别四项优先，其余项缺失只影响精度。 */
export function renderDoctor(checks) {
  const lines = checks.map((c) => (c.ok ? '✓ ' : '✗ ') + c.name + ' —— ' + c.msg)
  const bad = checks.filter((c) => !c.ok).length
  lines.push(bad === 0 ? '体检通过：判别功能可完整运行。' : bad + ' 项未过；主判别（L1+L3）只需 node/python/jieba/模型四项全过，句向量项缺失走插补降级。')
  return lines.join('\n')
}
