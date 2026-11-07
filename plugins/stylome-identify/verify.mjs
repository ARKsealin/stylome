#!/usr/bin/env node
// 开箱自检：不依赖任何外部语料，用一段内置中文文本跑完整的测量与判别栈。
//
//   node verify.mjs            # 判别内置文本（会拉起分词桥与句向量桥）
//   node verify.mjs --doctor   # 只做环境体检
//
// 退出码 0 表示自检通过。失败时打印可执行的排查提示。

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Stack } from './server/stack/index.mjs'
import { Meter } from './server/meter.mjs'
import { doctor, renderDoctor } from './server/doctor.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MODEL = join(HERE, 'server', 'model.json')

const SAMPLE = `夜班的最后一班地铁开走以后，站厅里只剩下清洁工和几盏没有关掉的灯。老李推着水车从东口走到西口，水痕在地砖上拖出一条湿亮的线。他在这座车站做了十一年，知道哪块地砖下面容易积水，哪根立柱的背面总有人躲着抽烟，也知道凌晨两点以后，广播里那句请勿倚靠屏蔽门会重复三遍。

他把拖把拧干，靠在墙边，从口袋里摸出半包烟，又想起站里不让抽，只好把烟盒在手里转了两圈，塞回去。对面长椅上坐着一个年轻人，背包搁在脚边，衬衫领口松开，手机屏幕的光照着他的脸。老李走过去，想说这里不能过夜，话到嘴边又停住了，因为年轻人先抬起头，问他末班车是不是已经走了。

老李点点头，说走了，下一班要等到五点半。年轻人哦了一声，把手机翻过去扣在腿上，像是终于放下了什么。他说自己坐过了站，手机没电，身上也没有现金，本来打算等天亮再想办法。老李看了看他，又看了看空荡荡的站台，说值班室有热水，要不要喝一杯。

他们一起走到值班室。热水壶的指示灯亮着，发出很轻的嗡嗡声。老李找出两个纸杯，倒满，把其中一个推过去。年轻人双手捧着杯子，说了声谢谢，然后很长时间没有再说话。窗外是黑的，偶尔有一列货车从远处经过，声音闷闷地滚过来，又滚远。

后来年轻人睡着了，靠在椅背上，呼吸很轻。老李没有叫醒他，只是把值班室的门留了一条缝，好让走廊的灯照进来一点。他坐在另一把椅子上，翻开一本已经看旧了的书，看了两页，也困了。

五点钟，外面开始有鸟叫。老李起身把水壶重新烧上，年轻人也醒了，有些不好意思地站起来，说耽误您休息了。老李摆摆手，说走吧，第一班车快到了。他们走到站台的时候，天边刚有一点灰白，灯还亮着，但已经不那么刺眼。年轻人上了车，隔着车窗朝他挥了挥手。老李也抬了抬手，转身推起水车，从西口往东口走。水痕在身后慢慢干掉，像什么都没发生过。

他想起自己刚来的时候，老师傅也是这样教他的：站台每天都要拖，不是因为有那么脏，是因为天亮以后，总有人要在这里等车。想到这儿，他笑了一下，把水车推得更快了些。

他把水车推到东口，天已经亮透了，早班的人从扶梯上下来，脚步匆匆。有人朝他点头，他也点头。这样的早晨他过了很多个，多到记不清，但他记得每一个说过谢谢的人。站台尽头有一面玻璃，映出他的影子，也映出身后一列刚刚进站的车。灯一盏一盏地灭掉，白天来了。`

if (process.argv.includes('--doctor')) {
  const { ok, checks } = await doctor({ modelPath: MODEL })
  console.log(renderDoctor(checks))
  process.exit(ok ? 0 : 1)
}

const started = Date.now()
let meter = null
try {
  const stack = Stack.load(MODEL)
  meter = new Meter()
  const result = stack.judge(SAMPLE, await meter.measure(SAMPLE))
  const axes = Object.entries(result.sdn?.axes ?? {}).map(([k, v]) => `${k} ${v}`).join(' ')
  console.log(`模型      ${stack.model.version}（${stack.model.trainedAt}）`)
  console.log(`路由      ${result.route} · ${result.han} 汉字`)
  console.log(`综合      pAI ${result.pAI ?? '—'}（${result.grade}）`)
  if (result.sdn) console.log(`判决      ${result.sdn.verdict}（${result.sdn.by}）`)
  if (axes) console.log(`六轴      ${axes}`)
  console.log(`自检通过（${((Date.now() - started) / 1000).toFixed(1)} s）`)
  process.exit(0)
} catch (e) {
  console.error(`自检失败：${e?.message ?? e}`)
  console.error('先运行 `node server/cli.mjs --doctor` 检查环境；Python 依赖见 requirements.txt。')
  process.exit(1)
} finally {
  try { meter?.close() } catch { /* 已退出 */ }
}
