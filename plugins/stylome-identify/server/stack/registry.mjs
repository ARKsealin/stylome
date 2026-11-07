// 特征分级清单（v2 §2，取代总账 v5 的判别决策）。
// 数字取自 runs/family-commonality/effects.json 与 runs/landing-premise/premise.json，
// 随训练时的实测复核（scripts/train.mjs 写 feature-grades.json 时比对）。

/** 判别集：主特征 pos:d + 六辅特征。 */
export const POS7 = ['pos:d', 'pos:n', 'pos:m', 'pos:i', 'pos:l', 'pos:r', 'pos:c']

/** 主特征。四家族同向、跨度比唯一低于 1。 */
export const PRIMARY = ['pos:d']

/** 辅特征：进判别器，但证据表必须带跨度比与落入作者。 */
export const AUX = ['pos:n', 'pos:m', 'pos:i', 'pos:l', 'pos:r', 'pos:c']

/**
 * 跨度比（作家间均值极差 / 人机均值差）与落入 AI 区间的作者。
 * 口径：限原创、作品不少于 15 块的作者（落地设计 §1.5）。
 */
export const SPAN = {
  'pos:d': { ratio: 0.88, nearAi: [], d: 1.96, dNoDeepseek: 1.39 },
  'pos:n': { ratio: 1.30, nearAi: ['刘慈欣'], d: -1.20 },
  'pos:m': { ratio: 1.52, nearAi: ['刘慈欣'], d: null },
  'pos:i': { ratio: 1.56, nearAi: ['刘慈欣'], d: 1.24 },
  'pos:l': { ratio: 1.80, nearAi: ['王晋康'], d: null },
  'pos:r': { ratio: 2.00, nearAi: ['刘慈欣', '陈楸帆'], d: 0.93 },
  'pos:c': { ratio: 2.20, nearAi: ['夏笳'], d: 1.32 },
}

/** 扩展候选：未过晋级实验不进判别（v2 修正①②）。 */
export const CANDIDATES = {
  bigram: 'bigramDiv',
  fw: ['fw:到', 'fw:这', 'fw:和'],
  hurst: 'sent:hurst',
}

/** 报告集：只出现在证据表，不进判别器。 */
export const REPORT = ['para:paraLenMean', 'para:paraLenCv', 'para:adjacentLenRatioMean', 'rep:contentWords', 'pos:y', 'word:nounRatio']

/** 排除集：家族翻号或负结果，防止回流。 */
export const EXCLUDED = ['sent:sentLenMean', 'sent:sentLenCv', 'sent:longSentRatio', 'punct:period', 'lex:yuleK', 'lex:hapaxRatio', 'pos:uj', 'stripe:diaRatio', 'stripe:switchRate', 'stripe:maxRun']

/** 高误报作者登记（落地设计 §6.2：超过全体均值两倍）。郝景芳只登记样本不足。 */
// 泽拉兹尼 2026-11-06 移出登记：译本翻译腔 + 作者行文机械，其误报有明确成因且经用户确认不构成否决（见 FPR_EXEMPT）
export const HIGH_FPR_AUTHORS = ['刘慈欣', '盖曼']
/** 豁免名单：这些作者的误报即使实测显著也不登记、不触发降级（用户 2026-11-06 决定）。 */
export const FPR_EXEMPT = ['泽拉兹尼']

/** 留一家族四格的参考值（落地设计 §1.3，pos7 线性）。验收线 ≥ 0.89。 */
export const LOFO_REFERENCE = { deepseek: 0.943, gemini: 0.944, glm: 0.950, gptoss: 0.891 }

/** 仲裁集：sig Top-20（总账 v5 §3.1，去掉格式残留 % 与 **）。密度单位：每千字。 */
export const SIG_MARKERS = [
  '三秒', '。母亲', '一行字', '你妈', '一行小字', '上传', '接入', '三天后', '。系统', '编号',
  '舱里', '投诉', '家属', '母亲说', '校准', '缝里', '浓度', '我妈', '，建议', '“系统',
]
export const SIG_REF = { aiMean: 3.03, humanMean: 0.12, promoteAt: 1.5 }

// 微段域特征清单在 micro.mjs（MICRO_SUBCLASSES / MICRO_WORDS）

/**
 * 误判代价政策（用户 2026-11-05 决定，推翻设计方案 §1.2"误指人类作品的成本高于漏报"）：
 * AI 作品尽量 0 错判为人类，允许少部分人类作品误判为 AI。"判为人类"指分级为低（预测集 {人类}）或等级为人工创作。
 *   aiMiss     AI 判成人类的上限。AI 判定线按"跨家族"折外分数（模型没见过该家族）的这一分位辨识，也是准入 2 的 AI 侧线。
 *              取 1%：AI 训练块约 600，1% 分位由最低的 5–6 块决定；取 0 会让判定线落在单个离群块上
 *   humanFlag  人类判成 AI 的上限。取设计 v2 §3 原有的人类侧 α 0.20；人类判定线按"跨作者"折外分数的 1 − 0.20 分位辨识，
 *              也是准入 2 的人类侧线与光谱误报线
 *   highLine   高度疑似线：数据线 0.538（2026-11-05 双边实验：max(作者留一人类 winTop max 0.508, 部署人类 max 0.321) + 3pp 边距；
 *              双视图人类上限封死、部署 AI 高度疑似占比 72.9%→91.0%、准入 6 由破转过、算珠落第三节正确升级。
 *              语料变更时须重算：跑 runs/experiments/highline-exp.mjs）
 *   locMiss    定位类检验（准入 5、光谱）的失败线 5%。定位失败不等于把 AI 判成人类，等级仍按 AI 判定线判
 */
export const POLICY = { aiMiss: 0.01, humanFlag: 0.20, humanRaise: 0.10, highMiss: 0.10, highLine: 0.538, locMiss: 0.05 }

/** 域路由阈值（汉字数）。 */
export const ROUTE = { main: 800, micro: 350, window: 1200 }

export const FAMILIES = ['deepseek', 'gemini', 'glm', 'gptoss']
