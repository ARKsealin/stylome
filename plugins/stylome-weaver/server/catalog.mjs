// 特征登记表：画像收录哪些特征、按什么语义解读、越带时给什么方向性建议。
//
// 三类字段支撑全部读法：
//   group   语义组 —— 面板雷达轴与报告分组的唯一口径
//   advice  越带时的建议标签 —— ADVICE 词表按「高于/低于带沿」给出方向性措辞
//   hits    能否做精确命中定位（true = 能在原文里列出具体句子与命中词）
//
// 全部特征零模型、零网络：jieba 分词是词典工具，其余是字面统计。

/** 段长分档（段内汉字数）。画像学习与校验共用同一分档函数。 */
export const TIERS = [
  { id: 'xs', lo: 0, hi: 60, label: '<60字' },
  { id: 's', lo: 60, hi: 150, label: '60-150字' },
  { id: 'm', lo: 150, hi: 400, label: '150-400字' },
  { id: 'l', lo: 400, hi: 900, label: '400-900字' },
  { id: 'xl', lo: 900, hi: Infinity, label: '>900字' },
]
export const tierOf = (han) => TIERS.find((t) => han >= t.lo && han < t.hi)?.id ?? 'xl'
export const TIER_LABEL = Object.fromEntries(TIERS.map((t) => [t.id, t.label]))
/** 低于此汉字数的段落不做统计校验：短段的节奏/丰富度指标不稳定，会平凡满足门限。 */
export const MIN_CHECK_CHARS = 60

/**
 * 画像特征登记。键 = flatten() 的输出键。
 * minChars 是特征可定义的最小段长（如 MATTR 需要 ≥150 字），不足时该特征在该段不参与校验。
 */
export const CATALOG = [
  // ── 词汇丰富度 ──
  { key: 'lex:mattr', group: 'lexdiv', label: 'MATTR 词汇丰富度', advice: 'lexdiv', minChars: 150 },
  { key: 'lex:yuleK', group: 'lexdiv', label: 'Yule K 词汇多样度', advice: 'lexdiv', minChars: 150 },
  { key: 'lex:honoreR', group: 'lexdiv', label: "Honoré R 罕用词丰富度", advice: 'lexdiv', minChars: 150 },
  { key: 'lex:hapaxRatio', group: 'lexdiv', label: '孤立词占比', advice: 'lexdiv', minChars: 150 },
  // ── 用词构成 ──
  { key: 'word:nounRatio', group: 'lexmix', label: '名词占比', advice: 'wordmix' },
  { key: 'word:verbRatio', group: 'lexmix', label: '动词占比', advice: 'wordmix' },
  { key: 'word:adjRatio', group: 'lexmix', label: '形容词占比', advice: 'wordmix' },
  { key: 'word:descriptiveRatio', group: 'lexmix', label: '修饰性占比（形+「的」）', advice: 'wordmix' },
  { key: 'word:contentLogFreq', group: 'lexmix', label: '实词平均 log 词频', advice: 'wordfreq' },
  { key: 'word:rareContentRatio', group: 'lexmix', label: '低频实词占比', advice: 'wordfreq' },
  { key: 'word:newEntityPer1k', group: 'lexmix', label: '每千字新专名', advice: 'entity', hits: false },
  // ── 虚词（可精确定位）──
  { key: 'fw:的', group: 'fw', label: '「的」每万字', advice: 'fw-de', hits: true },
  { key: 'fw:了', group: 'fw', label: '「了」每万字', advice: 'fw-le', hits: true },
  { key: 'fw:在', group: 'fw', label: '「在」每万字', advice: 'fw-zai', hits: true },
  { key: 'fw:是', group: 'fw', label: '「是」每万字', advice: 'fw-shi', hits: true },
  { key: 'fw:着', group: 'fw', label: '「着」每万字', advice: 'fw-zhe', hits: true },
  { key: 'fw:地', group: 'fw', label: '「地」每万字', advice: 'fw-de2', hits: true },
  { key: 'fw:得', group: 'fw', label: '「得」每万字', advice: 'fw-de3', hits: true },
  { key: 'fw:但', group: 'fw', label: '「但」每万字', advice: 'fw-dan', hits: true },
  { key: 'fw:便', group: 'fw', label: '「便」每万字', advice: 'fw-bian', hits: true },
  { key: 'fw:就', group: 'fw', label: '「就」每万字', advice: 'fw-jiu', hits: true },
  { key: 'fw:也', group: 'fw', label: '「也」每万字', advice: 'fw-ye', hits: true },
  { key: 'fw:和', group: 'fw', label: '「和」每万字', advice: 'fw-he', hits: true },
  // ── 标点（可精确定位）──
  { key: 'punct:comma', group: 'punct', label: '逗号每千字', advice: 'punct-comma', hits: true },
  { key: 'punct:period', group: 'punct', label: '句号每千字', advice: 'punct-period', hits: true },
  { key: 'punct:question', group: 'punct', label: '问号每千字', advice: 'punct-q', hits: true },
  { key: 'punct:exclaim', group: 'punct', label: '叹号每千字', advice: 'punct-e', hits: true },
  { key: 'punct:ellipsis', group: 'punct', label: '省略号每千字', advice: 'punct-ellipsis', hits: true },
  { key: 'punct:dash', group: 'punct', label: '破折号每千字', advice: 'punct-dash', hits: true },
  // ── 句式节奏 ──
  { key: 'sent:sentLenMean', group: 'rhythm', label: '平均句长（字）', advice: 'sentlen' },
  { key: 'sent:sentLenCv', group: 'rhythm', label: '句长变异系数', advice: 'sentlen-cv' },
  { key: 'sent:shortSentRatio', group: 'rhythm', label: '短句占比', advice: 'sentlen' },
  { key: 'sent:longSentRatio', group: 'rhythm', label: '长句占比', advice: 'sentlen' },
  { key: 'sent:clausesPerSent', group: 'rhythm', label: '平均每句分句数', advice: 'clause' },
  { key: 'sent:fragmentation', group: 'rhythm', label: '句子碎片度', advice: 'fragment' },
  { key: 'sent:hurst', group: 'rhythm', label: '句长序列赫斯特指数', advice: 'hurst', minChars: 300 },
  { key: 'bigramDiv', group: 'rhythm', label: '词性转移多样性', advice: 'bigramdiv', minChars: 120 },
  // ── 代词与视角 ──
  { key: 'pron:firstPer1k', group: 'pron', label: '第一人称每千字', advice: 'pron', hits: true },
  { key: 'pron:secondPer1k', group: 'pron', label: '第二人称每千字', advice: 'pron', hits: true },
  { key: 'pron:thirdPer1k', group: 'pron', label: '第三人称每千字', advice: 'pron', hits: true },
  { key: 'dialogue:ratio', group: 'dialog', label: '对白占比', advice: 'dialogue' },
  // ── 情感与感官词表 ──
  { key: 'emo:R', group: 'emo', label: '情绪词密度（七类合计每千字）', advice: 'emo', hits: true },
  { key: 'lexicon:visual', group: 'emo', label: '视觉词每千字', advice: 'sensory', hits: true },
  { key: 'lexicon:auditory', group: 'emo', label: '听觉词每千字', advice: 'sensory', hits: true },
  { key: 'lexicon:tactile', group: 'emo', label: '触觉词每千字', advice: 'sensory', hits: true },
  { key: 'lexicon:metaphor', group: 'emo', label: '比喻标记词每千字', advice: 'sensory', hits: true },
  // ── 句式框架 ──
  { key: 'frame:total', group: 'frame', label: '框架句式总密度', advice: 'frame', hits: true },
  { key: 'frame:然而', group: 'frame', label: '「然而」密度', advice: 'frame', hits: true },
  { key: 'frame:仿佛', group: 'frame', label: '「仿佛」密度', advice: 'frame', hits: true },
  { key: 'frame:似乎', group: 'frame', label: '「似乎」密度', advice: 'frame', hits: true },
  { key: 'frame:甚至', group: 'frame', label: '「甚至」密度', advice: 'frame', hits: true },
]

export const CATALOG_KEYS = CATALOG.map((c) => c.key)
export const byKey = (k) => CATALOG.find((c) => c.key === k) ?? null

/** 雷达轴（语义组）。顺序即雷达轴顺序。 */
export const GROUPS = ['lexdiv', 'lexmix', 'fw', 'punct', 'rhythm', 'pron', 'dialog', 'emo', 'frame']
export const GROUP_LABELS = {
  lexdiv: '词汇丰富', lexmix: '用词构成', fw: '虚词用量', punct: '标点用量',
  rhythm: '句式节奏', pron: '人称视角', dialog: '对白', emo: '情感情官', frame: '框架句式',
}

/**
 * 建议词表：advice 标签 → { hi, lo } 方向性措辞。
 * 只陈述「往哪个方向调」，不代写任何句子。
 */
export const ADVICE = {
  lexdiv: { hi: '词汇丰富度高于参考带：可减少生僻词与一次性用词，让用词更贴近常配', lo: '词汇丰富度低于参考带：同词复用偏多，可替换部分重复词为同义表达' },
  wordmix: { hi: '该词类占比高于参考带：可减少此词类的堆叠', lo: '该词类占比低于参考带：可适当补入此类词以贴近参考配比' },
  wordfreq: { hi: '用词比参考更典雅生僻：可换用更常见的同义表达', lo: '用词比参考更日常：可酌情换用更具体或更书面的表达' },
  entity: { hi: '新专名密度高于参考带：可减少一次性专名的引入密度', lo: '新专名密度低于参考带：可补充具体名词让画面更实' },
  'fw-de': { hi: '「的」密度偏高：可删减连续修饰、合并定语，或改用复指省略', lo: '「的」密度偏低：修饰关系可能过于紧缩，可酌情补出定语标记' },
  'fw-le': { hi: '「了」密度偏高：连续完形标记可部分删减或改词', lo: '「了」密度偏低：完成态表达可能偏少，时体感可加强' },
  'fw-zai': { hi: '「在」密度偏高：处所/进行标记重复，可部分改写为直接动词句', lo: '「在」密度偏低：处所与进行态标记可酌情补入' },
  'fw-shi': { hi: '「是」密度偏高：判断句连用，可改换动词谓语句', lo: '「是」密度偏低：判断表达可酌情补入' },
  'fw-zhe': { hi: '「着」密度偏高：持续态标记堆叠，可部分改为止态或链式动作', lo: '「着」密度偏低：持续态描写可酌情补入' },
  'fw-de2': { hi: '「地」密度偏高：状语标记密集，可拆句或改用短语动词', lo: '「地」密度偏低：状语修饰可酌情补出' },
  'fw-de3': { hi: '「得」密度偏高：补语标记密集，可改为独立句', lo: '「得」密度偏低：程度补语可酌情补入' },
  'fw-dan': { hi: '「但」密度偏高：转折过密，可部分改为暗转折', lo: '「但」密度偏低：转折层次可酌情补入' },
  'fw-bian': { hi: '「便」密度偏高：书面承接词重复，可换「就/于是」或直接连接', lo: '「便」密度偏低：承接词可酌情补入' },
  'fw-jiu': { hi: '「就」密度偏高：口语承接重复，可部分删减', lo: '「就」密度偏低：承接可酌情补出' },
  'fw-ye': { hi: '「也」密度偏高：并列标记重复，可合并同类项', lo: '「也」密度偏低：并列可酌情补出' },
  'fw-he': { hi: '「和」密度偏高：并列连词过密，可改顿号或拆句', lo: '「和」密度偏低：并列可酌情补出' },
  'punct-comma': { hi: '逗号密度偏高：长句切分过碎，可合并分句', lo: '逗号密度偏低：句内层次少，可增补逗号分层' },
  'punct-period': { hi: '句号密度偏高：句子偏碎，可合并短句', lo: '句号密度偏低：句子偏长，可在语义单元处断句' },
  'punct-q': { hi: '问号密度高于参考带：疑问句堆叠，可改陈述或反问减量', lo: '问号密度低于参考带：疑问语气可酌情补入' },
  'punct-e': { hi: '叹号密度高于参考带：语气过满，可部分降为句号', lo: '叹号密度低于参考带：强调语气可酌情补入' },
  'punct-ellipsis': { hi: '省略号密度高于参考带：留白过多，可部分写实', lo: '省略号密度低于参考带：留白语气可酌情补入' },
  'punct-dash': { hi: '破折号密度高于参考带：插入语过多，可改括注或独立句', lo: '破折号密度低于参考带：插入语气可酌情补入' },
  sentlen: { hi: '平均句长高于参考带：可在语义单元处断句', lo: '平均句长低于参考带：可合并语义连续的短句' },
  'sentlen-cv': { hi: '句长波动高于参考带：长短句落差过大，可匀化节奏', lo: '句长波动低于参考带：句长过于均匀，可加入长短交替' },
  clause: { hi: '每句分句数高于参考带：复句过重，可拆分', lo: '每句分句数低于参考带：复句层次可酌情补入' },
  fragment: { hi: '碎片化高于参考带：独词句/超短句过多，可合并', lo: '碎片化低于参考带：可点缀短句制造顿挫' },
  hurst: { hi: '句长序列自相似高于参考带：节奏模式单一，可打破周期', lo: '句长序列过于随机：可建立局部节奏重复' },
  bigramdiv: { hi: '词性搭配种类高于参考带：结构花样过密，可收敛句型', lo: '词性搭配种类低于参考带：句型单一，可变换主谓宾结构' },
  pron: { hi: '该人称密度高于参考带：代词指称过密，可换专名或省略主语', lo: '该人称密度低于参考带：指称可酌情补明' },
  dialogue: { hi: '对白占比高于参考带：可把部分对白转叙述', lo: '对白占比低于参考带：可让人物开口推动场景' },
  emo: { hi: '情绪词密度高于参考带：直陈情绪过多，可改为动作/生理暗示', lo: '情绪词密度低于参考带：情感可酌情显影' },
  sensory: { hi: '该感官/修辞词密度高于参考带：同类意象堆叠，可换感官通道', lo: '该感官/修辞词密度低于参考带：可补入具体感官细节' },
  frame: { hi: '框架句式密度高于参考带：模板句型重复，可改写为非常规句式', lo: '框架句式密度低于参考带：可酌情使用衔接框架' },
  'tier-uncovered': {
    hi: '该段长度落在画像的段长分布之外（该档样本不足或近乎为零）——段长本身就不像该文风，建议对照参考作品的分段习惯拆分此段',
    lo: '该段长度落在画像的段长分布之外（该档样本不足）——建议对照参考作品的分段习惯',
    uncovered: '该段长度落在画像未覆盖的段长档（该档样本不足）：段长本身就不像参考文风，建议对照参考作品的分段习惯拆分或合并此段',
  },
}

/** 严重度分档：|z| 相对带半宽的倍数。 */
export const SEVERITY = [
  { id: 'mild', lo: 0, hi: 1, label: '轻微' },
  { id: 'notable', lo: 1, hi: 2, label: '明显' },
  { id: 'severe', lo: 2, hi: Infinity, label: '严重' },
]
export const severityOf = (z) => SEVERITY.find((s) => z >= s.lo && z < s.hi)?.id ?? 'severe'
export const SEVERITY_LABEL = Object.fromEntries(SEVERITY.map((s) => [s.id, s.label]))
