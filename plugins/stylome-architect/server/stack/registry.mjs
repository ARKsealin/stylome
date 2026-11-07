// stylomeArchitect L1 登记表：宏观特征目录与经验带配置。
// 理论依据（叙事动力学：Todorov 情势逻辑 / Sternberg 三动力 / Greimas 行动元）——
// 情感弧线类特征是"作品级表达信号/作者经验集合"，只做 repertoire 定位，不做作者归属。

/** 大工词典 21 小类 → 7 大类（官方《情感词汇本体的构造》映射）。 */
export const CAT7 = {
  PA: '乐', PE: '乐',
  PD: '好', PH: '好', PG: '好', PB: '好', PK: '好',
  NA: '怒',
  NB: '哀', NJ: '哀', NH: '哀', PF: '哀',
  NI: '惧', NC: '惧', NG: '惧',
  NE: '恶', ND: '恶', NN: '恶', NK: '恶', NL: '恶',
  PC: '惊',
}
export const EMOTIONS7 = ['乐', '好', '怒', '哀', '惧', '恶', '惊']
export const BINS = 10

/** 章节标题模式（硬边界；无标题作品场景切分交 L2 agent）。 */
export const CHAPTER_RE = /^(第[一二三四五六七八九十百千0-9]+[章卷节部回]|序章|序|楔子|尾声|后记|Epilogue|Prologue|[一二三四五六七八九十]+、|\d{1,2}[\.、]\s*\S)/

/** L1 作品档案的特征清单（repertoire 学习与定位共用的向量键）。 */
export const PROFILE_KEYS = [
  { key: 'R', label: '情绪词密度总量 R', band: true },
  { key: 'Q', label: '情绪曲折度 Q', band: true },
  { key: 'H', label: '全文句长赫斯特 H', band: true },
  { key: 'alphaSpan', label: '局部赫斯特 α 跨度', band: true },
  { key: 'altRate', label: '对白交替率', band: true },
  { key: 'echo', label: '首尾呼应率', band: true },
  { key: 'dialMean', label: '平均对白占比', band: true },
]

/** 实体入选作品的次数下限：按全文汉字数自适应（E3 教训：短篇固定阈值失准）。 */
export const entityMinCount = (han) => Math.max(4, Math.min(10, Math.round(han / 2500)))

/** L2 契约：agent 语义层任务清单（词典/统计失效域，见 THEORY.md §五）。 */
export const L2_TASKS = [
  { id: 'scene', desc: '场景切分：确认/修正章节硬边界，无标题作品按场景转换（时间/地点/人物组合变化）切分，返回场景边界段落号' },
  { id: 'foreshadow', desc: '伏笔/回收标注：对线索轨给出的实体 gap-return 候选与疑似伏笔句，按 Foreshadow/Trigger/Payoff 三元结构标注' },
  { id: 'attribution', desc: '情绪归因：对情绪弧峰值 bin 的代表段，判定情绪归属人物（叙述者/对白角色/环境投射）' },
  { id: 'blindspot', desc: '白描/反衬审计：对词典情绪强度低谷但叙事密度高的 bin，检查是否为白描蓄力或"以乐景写哀"反衬' },
  { id: 'entityTrack', desc: '实体轨迹标注（叙事动力学）：逐场景对每个在场实体给出——行动元角色（subject/object/sender/receiver/helper/opponent，Greimas；含换位共身）、位置、动作事件链（有序，每事件附原文引句）、状态变化（位置/认知/情感/关系/资源/生命 维度 before→after）、后果与影响（指向实体+高中低）、伏笔接口（hint/expectedPayoff）；场景级另给情势态（EQ 均衡/DIST 失衡/NEWEQ 新均衡）、主导行动元、未决问题（悬念）与揭示清单。schema 见 README' },
]
