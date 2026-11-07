// ============================================================================
// stylome-architect —— client half（浏览器 bundle）
// ----------------------------------------------------------------------------
// 侧栏面板「StylomeArchitect」，三个选项卡：
//   档案库：看库、标注锚定作者、选文件夹收录作品、回放已入档作品
//   织体校验：选文件/上传 → 双输出报告（自我忠实与进步变化 / 跨作者迁移参考）
//             + 线索轨 + 修改建议 + 场景轨 + L2 语义契约
//   环境体检：node / Python / jieba 桥 / 大工词典 / 测量核 / 神经轨模型 / 档案库
// 数据全部走宿主路由 /stylome-architect/api；这里不做统计、不读文件系统。
// 可见文案经 ctx.locale；样式只用 --dsw-alias-* 主题令牌（弧线图是数据图形，用自身配色）。
// ============================================================================
window.__ModuleLoader__.load({
	id: "stylome-architect",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");
		var jsxRuntime = require("react/jsx-runtime");
		var jsx = jsxRuntime.jsx;
		var jsxs = jsxRuntime.jsxs;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useRef = react.useRef;

		var PANEL_ID = "stylome-architect";
		var ROUTE = "/stylome-architect/api";

		// ---- 文案：命名空间字典（zh / en） ----
		var ZH = {
			"meta.title": "StylomeArchitect",
			"meta.desc": "宏观织体校验：作品在锚定作者自身历史中的位置 + 跨作者迁移参考",
			"tab.library": "档案库",
			"tab.weave": "织体校验",
			"tab.doctor": "环境体检",
			"tab.libraryMeta": "{n} 位作者",
			"tab.works": "{n} 部作品",
			"boot.hint": "本插件出厂不携带任何锚定样本与学习参数：档案库由你收录的作品建起来。",
			"first.title": "首次使用：档案库还是空的",
			"first.body": "三步开始：① 在「档案库」里选一个文件夹，收录锚定作者的作品；② 把该作者标注为锚定风格；③ 到「织体校验」选一篇新作跑双输出。出厂不携带任何样本与预训练参数。",
			"first.cta": "去收录作品",
			"lib.dir": "档案库目录",
			"lib.anchor": "锚定作者",
			"lib.anchorNone": "尚未标注：点一位作者标为锚定（校验以该作者的作品历史为「自我」基线）",
			"lib.anchorSet": "已标注锚定：{name}",
			"lib.mark": "标为锚定",
			"lib.ingest": "收录作品",
			"lib.pick": "选择文件夹",
			"lib.dirPh": "锚定作者的作品所在文件夹",
			"lib.author": "作者名",
			"lib.authorPh": "留空则用文件夹名",
			"lib.authorReq": "请填作者名（收录按作者分区）",
			"lib.scan": "扫描",
			"lib.scanInfo": "{total} 个文件，可读 {ok} 个",
			"lib.scanEmpty": "文件夹里没有可读文档",
			"lib.accept": "支持 .txt / .md / .docx / .doc / .pdf · 递归深度 ≤ 3 · 目录内最多 {max} 个文件",
			"lib.neural": "同时计算神经轨（需外部句向量模型）",
			"lib.run": "开始收录",
			"lib.running": "收录中…",
			"lib.current": "当前：{name}",
			"lib.cancel": "取消",
			"lib.done": "✓ 已收录 {added} 部（{author}）",
			"lib.cancelled": "收录已取消",
			"lib.works": "作品清单",
			"lib.worksEmpty": "档案库还没有作品：上面收录锚定作者的作品即可开始。",
			"lib.replay": "回放",
			"lib.replaying": "回放中…",
			"lib.unknownAuthor": "作者",
			"lib.workRow": "{han} 字 · {paras} 段 · 场景 {scenes}",
			"lib.scenesNone": "未标注场景",
			"lib.badgeAnnotated": "L2 已标注",
			"lib.badgeNeural": "神经轨",
			"weave.pick": "目标作品",
			"weave.none": "尚未选择作品",
			"weave.pathPh": "作品文件路径，或直接从磁盘选文件",
			"weave.pickFile": "选文件",
			"weave.run": "开始校验",
			"weave.running": "校验中…",
			"weave.queued": "排队中（等待上一个任务）",
			"weave.cancel": "取消",
			"weave.again": "重新校验",
			"weave.needAnchor": "档案库未标注锚定作者：到「档案库」点一位作者标为锚定后再校验。",
			"weave.errNoPath": "请先填作品路径或选一个文件",
			"weave.errBadExt": "不支持的文件格式：{ext}",
			"result.doc": "{han} 汉字 · {paras} 段 · {sent} 句 · 章节标记 {chapters}",
			"result.anchor": "锚定 {author}（{n} 部）｜迁移池 {pool} 部他作者作品",
			"result.neural": "神经轨：已参与",
			"result.neuralOff": "神经轨：未参与（纯统计三轨）",
			"self.title": "输出 A · 自我忠实与进步变化",
			"self.note": "相对锚定作者自身作品历史的分布位置——措辞是「自我推进点」，不是「不合格项」。",
			"self.colMetric": "指标",
			"self.colValue": "本作",
			"self.colCore": "作者核心 μ±σ",
			"self.colRange": "自身全幅",
			"self.colVerdict": "判读",
			"self.progress": "自我推进点：{list}",
			"self.stable": "全部指标处于作者稳态核心之内——高自我忠实，变化空间在曲线形状与线索设计。",
			"self.nearest": "最近自身作品（信号余弦）：{list}",
			"self.shape": "弧线形状：簇{id}（距离 {dist}）",
			"klass.faithful": "忠实核心",
			"klass.edge": "自我边缘",
			"klass.beyond": "超出自身历史",
			"klass.small": "样本少·仅位置",
			"klass.unavailable": "不可估",
			"transfer.title": "输出 B · 迁移参考",
			"transfer.note": "案例式迁移：标准化信号子空间近邻检索 + 信号回放；相似作品正文副本在档案库 library/<作者>/<作品>.txt，可摘引对照。",
			"transfer.colAspect": "侧面",
			"transfer.colNearest": "最相似（他作者）",
			"transfer.colReplay": "信号回放",
			"transfer.noPool": "他作者样本不足（< 2 篇），迁移参考暂不可用——先收录更多作者作品。",
			"threads.title": "线索轨",
			"threads.entities": "入选实体（≥{n} 次）",
			"threads.echo": "首尾呼应率 {v}",
			"threads.gaps": "gap-return 候选（沉寂 ≥2 十分位后回归）",
			"threads.gapsNone": "无",
			"threads.miss": "未回收线索（开篇出现、结尾未回归）",
			"threads.missNone": "无",
			"charts.title": "弧线",
			"charts.val": "valence 弧（褒−贬/千字）",
			"charts.emo": "七大类情绪强度/千字",
			"charts.dial": "对白占比",
			"advice.title": "修改建议（{n} 条）",
			"advice.clean": "全部指标在作者曲目带内，无未回收线索；弧线形状与所属簇吻合——无需对齐性修改。",
			"advice.reading": "双读法：对齐意图为主，附突破意图确认。本插件不代写，改写由你生成。",
			"sev.severe": "严重偏离",
			"sev.notable": "明显偏离",
			"sev.mild": "轻微",
			"sev.positive": "正向确认",
			"scene.title": "场景轨",
			"scene.source": "边界来源：{src}",
			"scene.summary": "{n} 个场景 ｜ 长度均值 {mean} 字（CV {cv}）｜ 开场：对白 {dial} / 叙述 {nar} ｜ 场景情绪 σ={swing}",
			"scene.arc": "场景 valence 弧：{arc}",
			"scene.colScene": "场景",
			"scene.colParas": "段落",
			"scene.colHan": "字数",
			"scene.colDial": "对白",
			"scene.colVal": "valence",
			"scene.colOpener": "开场",
			"scene.colFunc": "功能",
			"scene.colTraj": "场景内轨迹",
			"scene.matches": "逐场景比对（全库场景池最近参考，跨作者）",
			"scene.colMatch1": "最近参考",
			"scene.colMatch2": "次近",
			"scene.funcMatches": "逐场景功能比对（同功能参考场景）",
			"scene.entity": "实体轨迹（L2 已标注）",
			"scene.candidates": "被测文本暂无场景标注——候选边界（段落号，终判归 agent）",
			"scene.l2req": "L2 请求：确认/修正候选后经 annotate 回填，即可解锁逐场景比对与场景手艺侧面。",
			"shape.rising": "升",
			"shape.falling": "降",
			"shape.peak": "峰",
			"shape.valley": "谷",
			"shape.flat": "平",
			"l2.title": "L2 语义层任务（agent 契约）",
			"l2.note": "本插件零模型零网络，测量可复现；解释与语义标注由 agent 完成。",
			"doctor.run": "重新体检",
			"doctor.checking": "体检中…",
			"doctor.allPass": "全部通过，可以织体校验。",
			"doctor.someFail": "{n} 项未过，先处理再用。",
			"doctor.hint": "体检只做本机读取与一次分词试跑，不联网下载模型。",
			"err.offline": "面板服务不可用：",
			"err.noDir": "请先选择文件夹",
			"err.noAuthor": "请先填作者名",
			"units.per10k": "每万字",
			"refresh": "刷新",
			"dep.title": "外部依赖需要你确认",
			"dep.intro": "本插件零出厂：情感词典与句向量模型都不随包分发。下面这些缺失项交给你决定怎么处理——插件不会在你不知情时联网，也不会因为缺一个文件就让功能悄悄变形。",
			"dep.required": "阻断",
			"dep.optional": "可选",
			"dep.path": "期望路径",
			"dep.download": "现在下载（约 {mb} MB）",
			"dep.downloadNoSize": "现在下载",
			"dep.downloading": "下载中… {pct}%",
			"dep.downloadingShort": "下载中…",
			"dep.downloadFailed": "下载失败：{err}",
			"dep.downloadNote": "下载仅在你点上面的按钮后开始，约 {mb} MB，只取一次；失败可重试，不影响纯统计三轨。",
			"dep.downloadNoteNoSize": "下载仅在你点上面的按钮后开始：代为从官方附件取回并转成 UTF-8 CSV，写入上面路径；失败可重试，也可自行下载后放好再点「重新检查」。",
			"dep.command": "安装命令",
			"dep.manual": "官方未授予再分发权，插件不能替你下载：请从官方页获取后放到上面路径（或设 env STYLOME_LEXICON 指路），再点「重新检查」。",
			"dep.openUrl": "官方页",
			"dep.recheck": "我已放置，重新检查",
			"dep.checking": "正在检查…",
			"dep.later": "稍后处理",
			"dep.badge": "依赖 {n}",
			"dep.allOk": "外部依赖齐全",
			"dep.lexicon.label": "大工情感词典（外部数据）",
			"dep.lexicon.why": "情感轨（R/Q 与 valence 弧）与建议层依赖它；缺失时织体校验会明确报出这一项，而不是给出一份没有情感轨的报告。",
			"dep.embedModel.label": "句向量模型（神经轨，外部）",
			"dep.embedModel.why": "纯统计三轨不需要它；开启神经轨（或档案库里已有语义轨迹）时才需要，缺失则自动回落三轨并在报告里说明。",
		};
		var EN = {
			"meta.title": "StylomeArchitect",
			"meta.desc": "Macro texture check: a work's position in the anchor author's own history, plus cross-author transfer references",
			"tab.library": "Library",
			"tab.weave": "Weave",
			"tab.doctor": "Doctor",
			"tab.libraryMeta": "{n} authors",
			"tab.works": "{n} works",
			"boot.hint": "This plugin ships no anchoring samples and no learned parameters: the library is built from the works you ingest.",
			"first.title": "First run: the library is empty",
			"first.body": "Three steps: (1) pick a folder and ingest the anchor author's works under Library; (2) mark that author as the anchor style; (3) run a new work under Weave. Nothing is pretrained.",
			"first.cta": "Ingest works",
			"lib.dir": "Library directory",
			"lib.anchor": "Anchor author",
			"lib.anchorNone": "Not marked yet — pick an author as the anchor (checks use that author's own history as the baseline)",
			"lib.anchorSet": "Anchor marked: {name}",
			"lib.mark": "Mark as anchor",
			"lib.ingest": "Ingest works",
			"lib.pick": "Choose folder",
			"lib.dirPh": "Folder holding the anchor author's works",
			"lib.author": "Author name",
			"lib.authorPh": "Empty = use the folder name",
			"lib.authorReq": "Enter an author name (the library is partitioned by author)",
			"lib.scan": "Scan",
			"lib.scanInfo": "{total} files, {ok} readable",
			"lib.scanEmpty": "No readable document in this folder",
			"lib.accept": ".txt / .md / .docx / .doc / .pdf · depth ≤ 3 · up to {max} files",
			"lib.neural": "Also compute the neural track (needs an external sentence-embedding model)",
			"lib.run": "Start ingesting",
			"lib.running": "Ingesting…",
			"lib.current": "Now: {name}",
			"lib.cancel": "Cancel",
			"lib.done": "Ingested {added} works ({author})",
			"lib.cancelled": "Ingest cancelled",
			"lib.works": "Works",
			"lib.worksEmpty": "No works yet — ingest the anchor author's works above to start.",
			"lib.replay": "Replay",
			"lib.replaying": "Replaying…",
			"lib.unknownAuthor": "author",
			"lib.workRow": "{han} chars · {paras} paras · {scenes} scenes",
			"lib.scenesNone": "scenes not annotated",
			"lib.badgeAnnotated": "L2 annotated",
			"lib.badgeNeural": "neural",
			"weave.pick": "Target work",
			"weave.none": "No work selected",
			"weave.pathPh": "Path to the work, or pick a file from disk",
			"weave.pickFile": "Pick file",
			"weave.run": "Run check",
			"weave.running": "Checking…",
			"weave.queued": "Queued behind the running job",
			"weave.cancel": "Cancel",
			"weave.again": "Run again",
			"weave.needAnchor": "No anchor author yet — mark one under Library before running a check.",
			"weave.errNoPath": "Enter a path or pick a file first",
			"weave.errBadExt": "Unsupported file type: {ext}",
			"result.doc": "{han} chars · {paras} paras · {sent} sentences · {chapters} chapter marks",
			"result.anchor": "Anchor {author} ({n} works) ｜ transfer pool {pool} works by other authors",
			"result.neural": "Neural track: included",
			"result.neuralOff": "Neural track: off (statistical tracks only)",
			"self.title": "Output A · Self-fidelity and progression",
			"self.note": "Position within the anchor author's own history — phrased as progression points, never as failures.",
			"self.colMetric": "Metric",
			"self.colValue": "This work",
			"self.colCore": "Author core μ±σ",
			"self.colRange": "Own full range",
			"self.colVerdict": "Reading",
			"self.progress": "Progression points: {list}",
			"self.stable": "Every metric sits inside the author's stable core — high self-fidelity; variation lives in curve shape and thread design.",
			"self.nearest": "Nearest own works (signal cosine): {list}",
			"self.shape": "Arc shape: cluster {id} (distance {dist})",
			"klass.faithful": "faithful core",
			"klass.edge": "self edge",
			"klass.beyond": "beyond own history",
			"klass.small": "small sample · position only",
			"klass.unavailable": "not estimable",
			"transfer.title": "Output B · Transfer references",
			"transfer.note": "Case-based transfer: nearest neighbours in a standardised signal subspace plus signal replay; similar works' texts live at library/<author>/<work>.txt for quoting.",
			"transfer.colAspect": "Aspect",
			"transfer.colNearest": "Closest (other authors)",
			"transfer.colReplay": "Signal replay",
			"transfer.noPool": "Fewer than 2 works by other authors — transfer references unavailable. Ingest more authors first.",
			"threads.title": "Thread track",
			"threads.entities": "Entities above threshold (≥{n})",
			"threads.echo": "Head-tail echo rate {v}",
			"threads.gaps": "gap-return candidates (return after ≥2 deciles of silence)",
			"threads.gapsNone": "none",
			"threads.miss": "Unrecovered threads (appear early, absent at the end)",
			"threads.missNone": "none",
			"charts.title": "Arcs",
			"charts.val": "valence arc (pos−neg per 1k chars)",
			"charts.emo": "seven emotion classes per 1k chars",
			"charts.dial": "dialogue share",
			"advice.title": "Revision suggestions ({n})",
			"advice.clean": "Every metric is inside the author's repertoire bands, no unrecovered threads, and the arc shape matches its cluster — no alignment edits needed.",
			"advice.reading": "Double reading: alignment intent first, breakthrough intent acknowledged. This plugin never rewrites; you generate the revision.",
			"sev.severe": "severe deviation",
			"sev.notable": "notable deviation",
			"sev.mild": "mild",
			"sev.positive": "positive confirmation",
			"scene.title": "Scene track",
			"scene.source": "Boundaries from: {src}",
			"scene.summary": "{n} scenes ｜ mean length {mean} chars (CV {cv}) ｜ openers: dialogue {dial} / narration {nar} ｜ scene-valence σ={swing}",
			"scene.arc": "Scene valence arc: {arc}",
			"scene.colScene": "Scene",
			"scene.colParas": "Paras",
			"scene.colHan": "Chars",
			"scene.colDial": "Dialogue",
			"scene.colVal": "valence",
			"scene.colOpener": "Opener",
			"scene.colFunc": "Function",
			"scene.colTraj": "Inner trajectory",
			"scene.matches": "Per-scene comparison (nearest reference scenes across the library)",
			"scene.colMatch1": "Nearest",
			"scene.colMatch2": "Second",
			"scene.funcMatches": "Per-scene function comparison (same-function reference scenes)",
			"scene.entity": "Entity trajectories (L2 annotated)",
			"scene.candidates": "No scene annotation for this text — candidate boundaries (paragraph numbers, final call belongs to the agent)",
			"scene.l2req": "L2 request: confirm or correct the candidates, write them back through annotate, and per-scene comparison unlocks.",
			"shape.rising": "rising",
			"shape.falling": "falling",
			"shape.peak": "peak",
			"shape.valley": "valley",
			"shape.flat": "flat",
			"l2.title": "L2 semantic tasks (agent contract)",
			"l2.note": "This plugin is zero-model and offline; measurement is reproducible, interpretation and semantic annotation belong to the agent.",
			"doctor.run": "Run again",
			"doctor.checking": "Checking…",
			"doctor.allPass": "All checks passed — ready to weave.",
			"doctor.someFail": "{n} checks failed; fix them first.",
			"doctor.hint": "The doctor only reads local state and runs one segmentation trial; it never downloads a model.",
			"err.offline": "Panel service unavailable: ",
			"err.noDir": "Choose a folder first",
			"err.noAuthor": "Enter an author name first",
			"units.per10k": "per 10k",
			"refresh": "Refresh",
			"dep.title": "External dependencies need your call",
			"dep.intro": "Zero-shipped: neither the emotion lexicon nor the sentence-embedding model travels with the package. These missing items are handed to you — nothing goes online behind your back, and nothing silently degrades into a report that is quietly missing a track.",
			"dep.required": "blocking",
			"dep.optional": "optional",
			"dep.path": "Expected path",
			"dep.download": "Download now (~{mb} MB)",
			"dep.downloadNoSize": "Download now",
			"dep.downloading": "Downloading… {pct}%",
			"dep.downloadingShort": "Downloading…",
			"dep.downloadFailed": "Download failed: {err}",
			"dep.downloadNote": "The download starts only after you press the button above (~{mb} MB, once); failures are retryable and never affect the three statistical tracks.",
			"dep.downloadNoteNoSize": "The download starts only after you press the button above: the official attachment is fetched, converted to UTF-8 CSV and written to the path above. Failures are retryable; you can also place the file yourself and press “Recheck”.",
			"dep.command": "Install command",
			"dep.manual": "The official terms do not grant redistribution, so the plugin cannot fetch it for you: obtain it from the official page, place it at the path above (or set env STYLOME_LEXICON), then press “Recheck”.",
			"dep.openUrl": "Official page",
			"dep.recheck": "I placed it — recheck",
			"dep.checking": "Checking…",
			"dep.later": "Later",
			"dep.badge": "Deps {n}",
			"dep.allOk": "Dependencies ready",
			"dep.lexicon.label": "DLUT emotion lexicon (external data)",
			"dep.lexicon.why": "The emotion track (R/Q and the valence arc) and the advice layer depend on it; when missing, the check says so instead of returning a report with no emotion track.",
			"dep.embedModel.label": "Sentence-embedding model (neural track, external)",
			"dep.embedModel.why": "The three statistical tracks do not need it; the neural track (or an existing semantic trajectory in the library) does. Missing means a documented fallback to the three tracks.",
		};

		// ---- 样式：仅主题令牌 ----
		var CSS = [
			".sa-root{position:relative;width:100%;height:100%;min-height:420px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:calc(14px + var(--dsh-frame-top-clearance,0px)) 16px 18px;overflow-y:auto;}",
			".sa-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;flex:0 0 auto;}",
			".sa-head .sa-title{font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sa-badge{display:inline-flex;align-items:center;font-size:11px;font-weight:500;border-radius:999px;padding:2px 9px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 45%,transparent);color:var(--dsw-alias-brand-primary,#4e6ef2);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 9%,transparent);}",
			".sa-badge.warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 45%,transparent);color:var(--dsw-alias-state-warn-primary,#e5a03c);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 10%,transparent);}",
			".sa-head .sa-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sa-tabs{display:flex;align-items:center;gap:6px;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.09));padding-bottom:8px;flex-wrap:wrap;}",
			".sa-tab{border:none;background:transparent;font:inherit;font-size:13px;padding:6px 14px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".sa-tab.on{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500;}",
			".sa-tab-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46%;}",
			".sa-card{background:var(--dsw-alias-bg-layer-2,#f6f7f9);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:12px;padding:14px 16px;}",
			".sa-card > * + *{margin-top:10px;}",
			".sa-card h2{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);letter-spacing:.2px;}",
			".sa-card h2 .sa-sub{display:block;margin-top:3px;font-size:11px;font-weight:400;letter-spacing:0;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sa-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
			".sa-hint{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sa-empty{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sa-input,.sa-select{flex:1 1 220px;min-width:160px;font:inherit;font-size:12px;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);}",
			".sa-input:focus,.sa-select:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 45%,transparent);outline-offset:1px;}",
			".sa-btn{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.16));border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;background:transparent;color:var(--dsw-alias-label-primary,#1f2329);white-space:nowrap;transition:background .12s ease,opacity .12s ease;}",
			".sa-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".sa-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff);}",
			".sa-btn:disabled{opacity:.45;cursor:not-allowed;}",
			".sa-btn.ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-btn.tiny{padding:3px 9px;font-size:11px;border-radius:7px;}",
			".sa-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#424a55);cursor:pointer;}",
			".sa-msg{font-size:12.5px;line-height:1.6;border-radius:10px;padding:10px 12px;border:1px solid;}",
			".sa-msg.info{color:var(--dsw-alias-label-secondary,#424a55);border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));}",
			".sa-msg.ok{color:var(--dsw-alias-state-success-primary,#2e9e5b);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 8%,transparent);}",
			".sa-msg.warn{color:var(--dsw-alias-state-warn-primary,#b9791f);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 10%,transparent);}",
			".sa-msg.err{color:var(--dsw-alias-state-error-primary,#d64550);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 8%,transparent);}",
			".sa-msg .sa-msg-t{display:block;font-weight:600;font-size:13px;margin-bottom:4px;}",
			".sa-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;border-radius:999px;padding:2px 9px;border:1px solid;font-variant-numeric:tabular-nums;}",
			".sa-author{display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));}",
			".sa-author.on{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 50%,transparent);}",
			".sa-author .nm{font-size:12.5px;font-weight:600;}",
			".sa-author .mt{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".sa-author .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}",
			".sa-table{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;overflow:hidden;}",
			".sa-tr{display:grid;gap:8px;align-items:center;font-size:11.5px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.07));}",
			".sa-tr:last-child{border-bottom:none;}",
			".sa-tr.th{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));font-weight:500;}",
			".sa-tr .num{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-tr .fn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".sa-tr.self{grid-template-columns:minmax(110px,1.35fr) 66px 108px 108px minmax(90px,1.5fr);}",
			".sa-tr.scene{grid-template-columns:44px 56px 56px 52px 54px 58px 96px minmax(80px,1fr);}",
			".sa-scroll{max-height:min(46vh,420px);overflow:auto;border-radius:10px;}",
			".sa-work{display:flex;align-items:center;gap:8px;font-size:11.5px;padding:6px 9px;border-radius:8px;}",
			".sa-work:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".sa-work .nm{font-size:12px;color:var(--dsw-alias-label-primary,#1f2329);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".sa-work .mt{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".sa-work .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:0;}",
			".sa-prog{height:7px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.16));overflow:hidden;}",
			".sa-prog .f{height:100%;border-radius:4px;background:var(--dsw-alias-brand-primary,#4e6ef2);transition:width .35s ease;}",
			".sa-chart{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#fff);overflow:hidden;}",
			".sa-chart svg{display:block;width:100%;height:auto;}",
			".sa-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;}",
			"@media (max-width:820px){.sa-split{grid-template-columns:minmax(0,1fr);}.sa-tr.self{grid-template-columns:minmax(90px,1fr) 60px 92px 92px minmax(80px,1fr);}}",
			".sa-sug{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:9px 11px;display:flex;flex-direction:column;gap:5px;background:var(--dsw-alias-bg-layer-1,#fff);}",
			".sa-sug .hd{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;}",
			".sa-sug .nm{font-size:12px;font-weight:600;}",
			".sa-sug .body{font-size:11.5px;line-height:1.72;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-aspect{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:9px 11px;display:flex;flex-direction:column;gap:4px;}",
			".sa-aspect .hd{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:12px;}",
			".sa-aspect .lb{font-weight:600;}",
			".sa-aspect .rp{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;word-break:break-word;}",
			".sa-aspect .ad{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-thread{display:flex;flex-direction:column;gap:3px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-kw{display:flex;flex-wrap:wrap;gap:5px;}",
			".sa-details{font-size:11.5px;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-details summary{cursor:pointer;font-weight:600;}",
			".sa-details ul{margin:6px 0 0;padding-left:18px;line-height:1.7;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sa-doc{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#424a55);font-variant-numeric:tabular-nums;}",
			".sa-doc b{color:var(--dsw-alias-label-primary,#1f2329);font-weight:600;}",
			// 外部依赖确认弹窗：零出厂资源的缺失由用户决定怎么处理，不在后台偷偷下载
			".sa-scrim{position:fixed;inset:0;background:color-mix(in srgb,#000 36%,transparent);display:flex;align-items:flex-start;justify-content:center;padding:34px 18px;z-index:40;overflow:auto;}",
			".sa-modal{width:100%;max-width:640px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));border-radius:14px;padding:16px 18px;box-shadow:0 14px 44px color-mix(in srgb,#000 24%,transparent);display:flex;flex-direction:column;gap:10px;}",
			".sa-modal-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}",
			".sa-modal-t{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sa-modal-f{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;}",
			".sa-dep{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#f6f7f9);}",
			".sa-dep-hd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}",
			".sa-dep-t{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sa-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:6px;padding:2px 6px;word-break:break-all;user-select:all;color:var(--dsw-alias-label-secondary,#424a55);}",
		];

		function ensureCss() {
			if (document.getElementById("sa-panel-css")) return function () {};
			var el = document.createElement("style");
			el.id = "sa-panel-css";
			el.textContent = CSS.join("\n");
			document.head.appendChild(el);
			return function () { if (el.parentNode) el.parentNode.removeChild(el); };
		}

		// ---------------- 宿主 API ----------------
		async function api(path, method, body) {
			var res = await fetch(ROUTE + path, {
				method: method || "GET",
				headers: method === "POST" ? { "content-type": "application/json" } : undefined,
				body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
			});
			var j = await res.json().catch(function () { return { ok: false, error: "响应不是 JSON" }; });
			if (!res.ok || j.ok === false) throw new Error(j.error || ("HTTP " + res.status));
			return j.result;
		}

		async function uploadWork(file, neural) {
			var qs = "?name=" + encodeURIComponent(file.name) + "&neural=" + (neural ? "1" : "0");
			var res = await fetch(ROUTE + "/weave/upload" + qs, {
				method: "POST",
				headers: { "content-type": "application/octet-stream" },
				body: file,
			});
			var j = await res.json().catch(function () { return { ok: false, error: "响应不是 JSON" }; });
			if (!res.ok || j.ok === false) throw new Error(j.error || ("HTTP " + res.status));
			return j.result;
		}

		// ---------------- 小工具 ----------------
		function fmt(v, d) { return typeof v === "number" && isFinite(v) ? v.toFixed(d == null ? 2 : d) : "—"; }
		function num(v, d) { return typeof v === "number" && isFinite(v) ? (d ? v.toFixed(d) : String(Math.round(v))) : "—"; }
		function fmtTpl(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); }); }
		function pctTxt(v) { return (Math.max(0, Math.min(1, isFinite(v) ? v : 0)) * 100).toFixed(1) + "%"; }
		function fmtSize(n) {
			if (!isFinite(n)) return "—";
			if (n < 1024) return n + " B";
			if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
			return (n / 1024 / 1024).toFixed(1) + " MB";
		}
		function toneVar(t) {
			if (t === "error") return "var(--dsw-alias-state-error-primary,#d64550)";
			if (t === "warn") return "var(--dsw-alias-state-warn-primary,#e5a03c)";
			if (t === "ok") return "var(--dsw-alias-state-success-primary,#2e9e5b)";
			if (t === "blue") return "var(--dsw-alias-brand-primary,#4e6ef2)";
			return "var(--dsw-alias-state-idle-primary,#8b94a3)";
		}
		function chipStyle(t) {
			var c = toneVar(t);
			return { color: c, borderColor: "color-mix(in srgb, " + c + " 42%, transparent)", background: "color-mix(in srgb, " + c + " 9%, transparent)" };
		}
		function klassLabel(t, klass) {
			if (klass === "faithful") return t("klass.faithful");
			if (klass === "edge") return t("klass.edge");
			if (klass === "beyond") return t("klass.beyond");
			if (klass === "small-sample") return t("klass.small");
			return t("klass.unavailable");
		}
		function klassTone(klass) {
			if (klass === "beyond") return "blue";
			if (klass === "edge") return "warn";
			if (klass === "faithful") return "ok";
			return "idle";
		}
		function sevLabel(t, s) {
			if (s === "severe") return t("sev.severe");
			if (s === "notable") return t("sev.notable");
			if (s === "positive") return t("sev.positive");
			return t("sev.mild");
		}
		function sevTone(s) {
			if (s === "severe") return "error";
			if (s === "notable") return "warn";
			if (s === "positive") return "ok";
			return "idle";
		}
		// 迁移侧面的信号回放：曲线逐 bin 对照，标量直接给两侧读数
		function replayText(rp) {
			if (!rp) return "—";
			if (Array.isArray(rp.self) && Array.isArray(rp.neighbor)) {
				var f = (v) => (typeof v === "number" && isFinite(v) ? String(Math.round(v)) : "—");
				return "本作 [" + rp.self.map(f).join(", ") + "] ｜ 参考 [" + rp.neighbor.map(f).join(", ") + "]";
			}
			return String(rp.self) + " ｜ 参考 " + String(rp.neighbor);
		}

		// ---------------- 公共小件 ----------------
		function Msg(props) {
			return jsx("div", { className: "sa-msg " + (props.kind || "info"), children: props.title
				? [jsx("span", { className: "sa-msg-t", children: props.title }, "t"), props.children]
				: props.children });
		}

		function Chart(props) {
			if (!props.svg) return jsx("div", { className: "sa-empty", children: "—" });
			return jsx("div", { className: "sa-chart", dangerouslySetInnerHTML: { __html: props.svg } });
		}

		function DocLine(props) {
			var m = props.meta || {};
			var t = props.t;
			return jsxs("div", { className: "sa-doc", children: [
				jsx("span", { children: jsx("b", { children: m.name || "—" }) }),
				jsx("span", { children: fmtTpl(t("result.doc"), { han: num(m.han), paras: num(m.nPara), sent: num(m.nSent), chapters: num(m.chapters) }) }),
				m.anchor ? jsx("span", { children: fmtTpl(t("result.anchor"), { author: m.anchor, n: num(m.nWorks), pool: num(m.pool) }) }) : null,
				m.neural ? jsx("span", { children: t("result.neural") }) : jsx("span", { children: t("result.neuralOff") }),
			] });
		}

		// ---------------- 输出 A：自我忠实与进步变化 ----------------
		function SelfTable(props) {
			var t = props.t;
			var self = props.self;
			if (!self || !self.rows || !self.rows.length) return null;
			var rows = [jsxs("div", { className: "sa-tr th self", children: [
				jsx("span", { children: t("self.colMetric") }),
				jsx("span", { children: t("self.colValue") }),
				jsx("span", { children: t("self.colCore") }),
				jsx("span", { children: t("self.colRange") }),
				jsx("span", { children: t("self.colVerdict") }),
			] }, "h")].concat(self.rows.map(function (r) {
				return jsxs("div", { className: "sa-tr self", children: [
					jsx("span", { className: "fn", children: r.label }),
					jsx("span", { className: "num", children: num(r.value, 3) }),
					jsx("span", { className: "num", children: r.core ? "[" + num(r.core[0], 2) + ", " + num(r.core[1], 2) + "]" : "—" }),
					jsx("span", { className: "num", children: r.range ? "[" + num(r.range[0], 2) + ", " + num(r.range[1], 2) + "]" : "—" }),
					jsxs("span", { children: [
						jsx("span", { className: "sa-chip", style: chipStyle(klassTone(r.klass)), children: klassLabel(t, r.klass) }),
						r.note ? jsx("span", { className: "sa-hint", style: { display: "block", marginTop: "2px" }, children: r.note }) : null,
					] }),
				] }, r.key);
			}));
			var progression = self.progression || [];
			return jsxs("div", { className: "sa-card", children: [
				jsx("h2", { children: [t("self.title"), jsx("span", { className: "sa-sub", children: t("self.note") })] }),
				jsx("div", { className: "sa-table", children: rows }),
				progression.length
					? jsx(Msg, { kind: "info", children: fmtTpl(t("self.progress"), { list: progression.map(function (p) { return p.label + "（" + klassLabel(t, p.klass) + "）"; }).join("、") }) })
					: jsx(Msg, { kind: "ok", children: t("self.stable") }),
			] });
		}

		// ---------------- 输出 B：迁移参考 ----------------
		function TransferBlock(props) {
			var t = props.t;
			var tr = props.transfer;
			if (!tr) return null;
			if (!tr.aspects || !tr.aspects.length) {
				return jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: t("transfer.title") }),
					jsx("div", { className: "sa-empty", children: tr.note || t("transfer.noPool") }),
				] });
			}
			return jsxs("div", { className: "sa-card", children: [
				jsx("h2", { children: [t("transfer.title"), jsx("span", { className: "sa-sub", children: t("transfer.colNearest") })] }),
				jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: tr.aspects.map(function (a, i) {
					var n = (a.neighbors || [])[0];
					if (!n) return null;
					return jsxs("div", { className: "sa-aspect", children: [
						jsxs("div", { className: "hd", children: [
							jsx("span", { className: "lb", children: a.label }),
							jsx("span", { className: "sa-chip", style: chipStyle("blue"), children: "《" + n.work + "》" }),
							jsx("span", { className: "sa-hint", children: n.author + "　d=" + fmt(n.distance, 4) }),
						] }),
						jsx("div", { className: "rp", children: replayText(n.replay) }),
						jsx("div", { className: "ad", children: n.advice }),
					] }, a.id || ("a" + i));
				}) }),
				jsx("div", { className: "sa-hint", children: t("transfer.note") }),
			] });
		}

		// ---------------- 线索轨 ----------------
		function ThreadBlock(props) {
			var t = props.t;
			var th = props.threads;
			if (!th) return null;
			var ents = th.topEntities || [];
			return jsxs("div", { className: "sa-card", children: [
				jsx("h2", { children: t("threads.title") }),
				jsxs("div", { className: "sa-thread", children: [
					jsx("div", { children: fmtTpl(t("threads.entities"), { n: num(th.minCount) }) }),
					ents.length
						? jsx("div", { className: "sa-kw", children: ents.slice(0, 12).map(function (e) {
							return jsx("span", { className: "sa-chip", style: chipStyle("idle"), children: e.entity + " ×" + e.count }, e.entity);
						}) })
						: jsx("div", { className: "sa-hint", children: "—" }),
					jsx("div", { children: fmtTpl(t("threads.echo"), { v: fmt(th.echo, 2) }) }),
					jsxs("div", { children: [
						jsx("div", { children: t("threads.gaps") }),
						(th.gaps || []).length
							? jsxs("div", { className: "sa-hint", children: (th.gaps || []).slice(0, 8).map(function (g) {
								return "「" + g.entity + "」bin" + g.from + " → bin" + g.to + "（沉寂 " + g.gapBins + " bin）";
							}).join("；") })
							: jsx("div", { className: "sa-hint", children: t("threads.gapsNone") }),
					] }),
					jsxs("div", { children: [
						jsx("div", { children: t("threads.miss") }),
						(th.echoMiss || []).length
							? jsx("div", { className: "sa-kw", children: (th.echoMiss || []).map(function (m) {
								return jsx("span", { className: "sa-chip", style: chipStyle("warn"), children: m.entity + " · bin" + m.lastBin }, m.entity);
							}) })
							: jsx("div", { className: "sa-hint", children: t("threads.missNone") }),
					] }),
				] }),
			] });
		}

		// ---------------- 修改建议 ----------------
		function AdviceBlock(props) {
			var t = props.t;
			var list = props.suggestions || [];
			if (!list.length) {
				return jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: fmtTpl(t("advice.title"), { n: 0 }) }),
					jsx(Msg, { kind: "ok", children: t("advice.clean") }),
				] });
			}
			return jsxs("div", { className: "sa-card", children: [
				jsx("h2", { children: [fmtTpl(t("advice.title"), { n: list.length }), jsx("span", { className: "sa-sub", children: t("advice.reading") })] }),
				jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: list.map(function (s, i) {
					var sev = s.positive ? "positive" : (s.severity || "mild");
					var title = s.kind === "band"
						? s.label + "　" + num(s.value, 3) + " ｜ 带 [" + num(s.band && s.band[0], 2) + ", " + num(s.band && s.band[1], 2) + "]"
						: s.kind === "shape"
							? "弧线形状 · 簇" + s.clusterId + "（距离 " + fmt(s.dist, 3) + "）"
							: s.positive
								? "长程回收 ·「" + s.entity + "」bin" + s.from + " → bin" + s.to
								: "未回收线索 ·「" + s.entity + "」（最后 bin" + s.lastBin + "）";
					return jsxs("div", { className: "sa-sug", children: [
						jsxs("div", { className: "hd", children: [
							jsx("span", { className: "sa-chip", style: chipStyle(sevTone(sev)), children: sevLabel(t, sev) }),
							jsx("span", { className: "nm", children: title }),
						] }),
						jsx("div", { className: "body", children: s.advice }),
					] }, "s" + i);
				}) }),
			] });
		}

		// ---------------- 场景轨 ----------------
		function SceneBlock(props) {
			var t = props.t;
			var st = props.sceneTrack;
			if (!st) return null;
			var head = [jsx("h2", { children: st.source ? fmtTpl(t("scene.source"), { src: st.source }) : t("scene.title") }, "h")];
			if (st.sceneFeat) {
				var sf = st.sceneFeat;
				var legend = sf.funcLegend || {};
				var shapeName = function (s) {
					if (s === "rising") return t("shape.rising");
					if (s === "falling") return t("shape.falling");
					if (s === "peak") return t("shape.peak");
					if (s === "valley") return t("shape.valley");
					return t("shape.flat");
				};
				var rows = [jsxs("div", { className: "sa-tr th scene", children: [
					jsx("span", { children: t("scene.colScene") }),
					jsx("span", { children: t("scene.colParas") }),
					jsx("span", { children: t("scene.colHan") }),
					jsx("span", { children: t("scene.colDial") }),
					jsx("span", { children: t("scene.colVal") }),
					jsx("span", { children: t("scene.colOpener") }),
					jsx("span", { children: t("scene.colFunc") }),
					jsx("span", { children: t("scene.colTraj") }),
				] }, "h")].concat((sf.perScene || []).map(function (s) {
					var tr2 = s.trajectory || {};
					return jsxs("div", { className: "sa-tr scene", children: [
						jsx("span", { className: "num", children: s.scene }),
						jsx("span", { className: "num", children: s.paras }),
						jsx("span", { className: "num", children: s.han }),
						jsx("span", { className: "num", children: fmt(s.dial, 2) }),
						jsx("span", { className: "num", children: num(s.valence) }),
						jsx("span", { className: "fn", children: s.opener }),
						jsx("span", { className: "fn", children: jsx("b", { children: s.funcLabel + (legend[s.funcLabel] ? "·" + legend[s.funcLabel] : "") }) }),
						jsx("span", { className: "fn", children: shapeName(tr2.shape) + " ｜ v5[" + (tr2.valence5 || []).map(function (v) { return num(v); }).join(",") + "]" }),
					] }, "s" + s.scene);
				}));
				var matches = st.matches || [];
				var funcMatches = st.funcMatches || [];
				return jsxs("div", { className: "sa-card", children: [
					jsxs("h2", { children: [
						t("scene.title"),
						jsx("span", { className: "sa-sub", children: fmtTpl(t("scene.summary"), {
							n: num(sf.nScenes), mean: num(sf.sceneLen && sf.sceneLen.mean), cv: num(sf.sceneLen && sf.sceneLen.cv),
							dial: num(sf.openerMix && sf.openerMix.dialogue), nar: num(sf.openerMix && sf.openerMix.narration),
							swing: num(sf.valenceSwing),
						}) }),
					] }),
					jsx("div", { className: "sa-hint", children: fmtTpl(t("scene.arc"), { arc: (sf.valenceArcScene || []).join(" → ") }) }),
					jsx("div", { className: "sa-scroll", children: jsx("div", { className: "sa-table", children: rows }) }),
					matches.length
						? jsxs("div", { children: [
							jsx("div", { className: "sa-hint", style: { fontWeight: 600 }, children: t("scene.matches") }),
							jsx("div", { className: "sa-thread", children: matches.map(function (m) {
								var a = (m.matches || [])[0], b = (m.matches || [])[1];
								var f = function (x) { return x ? "《" + x.work + "》场景" + x.scene + "（" + x.author + "，d=" + fmt(x.distance, 3) + "）" : "—"; };
								return jsx("div", { children: "场景" + m.scene + "：" + f(a) + " ｜ " + t("scene.colMatch2") + " " + f(b) }, "m" + m.scene);
							}) }),
						] })
						: null,
					funcMatches.length
						? jsxs("div", { children: [
							jsx("div", { className: "sa-hint", style: { fontWeight: 600 }, children: t("scene.funcMatches") }),
							jsx("div", { className: "sa-thread", children: funcMatches.map(function (m) {
								var top = (m.matches || [])[0];
								if (!top) return null;
								return jsx("div", { children: "场景" + m.scene + " " + m.label + " → 《" + top.work + "》场景" + top.scene + "（" + top.author + (top.sameLabel ? "，同标签" : "") + "，d=" + fmt(top.distance, 3) + "）" }, "f" + m.scene);
							}) }),
						] })
						: null,
					(st.entityTrack || []).length
						? jsxs("details", { className: "sa-details", children: [
							jsx("summary", { children: t("scene.entity") + "（" + st.entityTrack.length + "）" }),
							jsx("ul", { children: st.entityTrack.map(function (et, i) {
								return jsx("li", { children: "场景" + et.scene + (et.eqState ? "｜情势 " + et.eqState : "") + (et.agency ? "｜主导行动元 " + et.agency : "") }, "e" + i);
							}) }),
						] })
						: null,
				] });
			}
			if (st.candidates) {
				return jsxs("div", { className: "sa-card", children: head.concat([
					jsx("div", { className: "sa-hint", children: t("scene.candidates") }),
					jsx("div", { className: "sa-thread", children: st.candidates.slice(0, 24).map(function (c) {
						var why = (st.reasons && st.reasons[c]) || [];
						return jsx("div", { children: "段" + c + (why.length ? "：" + why.join("；") : "") }, "c" + c);
					}) }),
					jsx(Msg, { kind: "warn", children: t("scene.l2req") }),
				]) });
			}
			return jsxs("div", { className: "sa-card", children: head.concat([jsx("div", { className: "sa-empty", children: st.note || "—" })]) });
		}

		// ---------------- L2 契约 ----------------
		function L2Block(props) {
			var t = props.t;
			var tasks = props.tasks || [];
			if (!tasks.length) return null;
			return jsxs("details", { className: "sa-details", children: [
				jsx("summary", { children: t("l2.title") }),
				jsx("ul", { children: tasks.map(function (x) {
					return jsxs("li", { children: [jsx("b", { children: x.id }), "：" + x.desc] }, x.id);
				}) }),
				jsx("div", { className: "sa-hint", children: t("l2.note") }),
			] });
		}

		// ---------------- 报告视图（校验结果与作品回放共用） ----------------
		function ReportView(props) {
			var t = props.t;
			var view = props.view;
			if (!view) return null;
			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
				jsx(DocLine, { t: t, meta: view.meta }),
				view.self ? jsx(SelfTable, { t: t, self: view.self }) : null,
				view.self && (view.loc || view.self) ? jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: t("self.title") }),
					(view.loc && view.loc.nearest && view.loc.nearest.length)
						? jsx("div", { className: "sa-hint", children: fmtTpl(t("self.nearest"), { list: view.loc.nearest.map(function (n) { return n.name + "（" + fmt(n.sim, 2) + "）"; }).join("、") }) })
						: null,
					(view.loc && view.loc.shape && view.loc.shape.length)
						? jsx("div", { className: "sa-hint", children: fmtTpl(t("self.shape"), { id: view.loc.shape[0].id, dist: fmt(view.loc.shape[0].dist, 2) }) })
						: null,
				] }) : null,
				view.transfer ? jsx(TransferBlock, { t: t, transfer: view.transfer }) : null,
				view.threads ? jsx(ThreadBlock, { t: t, threads: view.threads }) : null,
				view.charts
					? jsxs("div", { className: "sa-card", children: [
						jsx("h2", { children: t("charts.title") }),
						jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
							view.charts.val ? jsxs("div", { children: [jsx("div", { className: "sa-hint", children: t("charts.val") }), jsx(Chart, { svg: view.charts.val })] }) : null,
							view.charts.emo ? jsxs("div", { children: [jsx("div", { className: "sa-hint", children: t("charts.emo") }), jsx(Chart, { svg: view.charts.emo })] }) : null,
							view.charts.dial ? jsxs("div", { children: [jsx("div", { className: "sa-hint", children: t("charts.dial") }), jsx(Chart, { svg: view.charts.dial })] }) : null,
						] }),
					] })
					: null,
				view.suggestions ? jsx(AdviceBlock, { t: t, suggestions: view.suggestions }) : null,
				view.sceneTrack ? jsx(SceneBlock, { t: t, sceneTrack: view.sceneTrack }) : null,
				jsx(L2Block, { t: t, tasks: view.l2Tasks }),
			] });
		}

		// ---------------- 档案库 ----------------
		function LibraryTab(props) {
			var t = props.t;
			var state = props.state;
			var onChanged = props.onChanged;
			var stDir = useState(""), dir = stDir[0], setDir = stDir[1];
			var stAuthor = useState(""), author = stAuthor[0], setAuthor = stAuthor[1];
			var stScan = useState(null), scan = stScan[0], setScan = stScan[1];
			var stMsg = useState(null), msg = stMsg[0], setMsg = stMsg[1];
			var stBusy = useState(null), busy = stBusy[0], setBusy = stBusy[1];
			var stJob = useState(null), job = stJob[0], setJob = stJob[1];
			var stNeural = useState(false), neural = stNeural[0], setNeural = stNeural[1];
			var stReplay = useState(null), replay = stReplay[0], setReplay = stReplay[1];
			var timer = useRef(null);

			useEffect(function () { return function () { if (timer.current) clearInterval(timer.current); }; }, []);

			function pickFolder() {
				setBusy("pick");
				api("/pick-folder", "POST", {}).then(function (r) { setDir(r.path || ""); setScan(null); }, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); }).then(function () { setBusy(null); });
			}
			function doScan() {
				if (!dir.trim()) { setMsg({ kind: "warn", text: t("err.noDir") }); return; }
				setBusy("scan"); setScan(null);
				api("/scan", "POST", { dir: dir.trim() }).then(function (r) {
					setScan(r);
					if (!r.files || !r.files.length) setMsg({ kind: "warn", text: t("lib.scanEmpty") });
					else setMsg({ kind: "info", text: fmtTpl(t("lib.scanInfo"), { total: r.total, ok: r.files.length }) });
				}, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); }).then(function () { setBusy(null); });
			}
			function pollIngest(jobId) {
				var ticks = 0;
				if (timer.current) clearInterval(timer.current);
				timer.current = setInterval(function () {
					ticks++;
					api("/ingest/state?jobId=" + encodeURIComponent(jobId)).then(function (s) {
						setJob(s);
						if (s.status === "done") {
							clearInterval(timer.current); timer.current = null;
							setMsg({ kind: "ok", text: fmtTpl(t("lib.done"), { added: (s.result && s.result.added) || 0, author: (s.result && s.result.author) || author }) });
							setScan(null); onChanged();
						} else if (s.status === "error") {
							clearInterval(timer.current); timer.current = null;
							setMsg({ kind: "err", text: s.error || "error" });
						} else if (s.status === "cancelled") {
							clearInterval(timer.current); timer.current = null;
							setMsg({ kind: "warn", text: t("lib.cancelled") });
						}
					}, function (e) {
						clearInterval(timer.current); timer.current = null;
						setMsg({ kind: "err", text: String(e.message || e) });
					});
				}, 600);
			}
			function doIngest() {
				if (!dir.trim()) { setMsg({ kind: "warn", text: t("err.noDir") }); return; }
				var who = author.trim() || (dir.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "");
				if (!who) { setMsg({ kind: "warn", text: t("err.noAuthor") }); return; }
				setBusy("ingest"); setMsg({ kind: "info", text: t("lib.running") });
				api("/ingest/start", "POST", { author: who, dir: dir.trim(), neural: neural }).then(function (r) {
					setJob({ jobId: r.jobId, status: "running", done: 0, total: r.total || 0, current: null });
					pollIngest(r.jobId);
				}, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); setBusy(null); });
			}
			function cancelIngest() {
				if (!job || !job.jobId) return;
				api("/ingest/cancel", "POST", { jobId: job.jobId }).then(function () { setMsg({ kind: "warn", text: t("lib.cancelled") }); }, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); });
			}
			function mark(a) {
				setBusy("mark:" + a);
				api("/mark", "POST", { author: a }).then(function () {
					setMsg({ kind: "ok", text: fmtTpl(t("lib.anchorSet"), { name: a }) });
					onChanged();
				}, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); }).then(function () { setBusy(null); });
			}
			function doReplay(a, w) {
				setBusy("replay:" + a + "/" + w); setReplay(null);
				api("/work?author=" + encodeURIComponent(a) + "&work=" + encodeURIComponent(w)).then(function (r) { setReplay(r); }, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); }).then(function () { setBusy(null); });
			}

			var authors = (state && state.authors) || [];
			var anchor = state && state.anchor;
			var running = job && (job.status === "queued" || job.status === "running");
			var jobPct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
				jsxs("div", { className: "sa-card", children: [
					jsxs("h2", { children: [t("lib.anchor"), jsx("span", { className: "sa-sub", children: anchor || t("lib.anchorNone") })] }),
					jsx("div", { className: "sa-hint", children: (state && state.libraryDir) || "" }),
					authors.length
						? jsx("div", { style: { display: "flex", flexDirection: "column", gap: "5px" }, children: authors.map(function (a) {
							var on = a.name === anchor;
							return jsxs("div", { className: "sa-author" + (on ? " on" : ""), children: [
								jsx("span", { className: "sa-chip", style: chipStyle(on ? "blue" : "idle"), children: on ? "★" : "·" }),
								jsxs("div", { className: "grow", children: [
									jsx("span", { className: "nm", children: a.name }),
									jsx("span", { className: "mt", children: a.totalWorks + " 部 / " + num(a.han) + " 字" + (a.broken ? "（" + a.broken + " 部档案缺失）" : "") }),
								] }),
								on ? null : jsx("button", { className: "sa-btn", disabled: !!busy, onClick: function () { mark(a.name); }, children: t("lib.mark") }),
							] }, a.name);
						}) })
						: jsx("div", { className: "sa-empty", children: t("lib.worksEmpty") }),
				] }),
				jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: t("lib.ingest") }),
					jsxs("div", { className: "sa-row", children: [
						jsx("input", { className: "sa-input", value: dir, placeholder: t("lib.dirPh"), onChange: function (e) { setDir(e.target.value); setScan(null); } }),
						jsx("button", { className: "sa-btn", disabled: !!busy, onClick: pickFolder, children: t("lib.pick") }),
						jsx("button", { className: "sa-btn", disabled: !!busy, onClick: doScan, children: t("lib.scan") }),
					] }),
					jsxs("div", { className: "sa-row", children: [
						jsx("input", { className: "sa-input", value: author, placeholder: t("lib.authorPh"), onChange: function (e) { setAuthor(e.target.value); } }),
						jsx("label", { className: "sa-check", children: [
							jsx("input", { type: "checkbox", checked: neural, onChange: function (e) { setNeural(e.target.checked); } }),
							t("lib.neural"),
						] }),
					] }),
					jsx("div", { className: "sa-hint", children: fmtTpl(t("lib.accept"), { max: num(state && state.maxFiles) }) }),
					scan
						? jsxs("div", { children: [
							jsx("div", { className: "sa-hint", children: fmtTpl(t("lib.scanInfo"), { total: scan.total, ok: (scan.files || []).length }) + (scan.truncated ? "（已截断到 " + scan.limit + "）" : "") }),
							jsx("details", { className: "sa-details", children: [
								jsx("summary", { children: (scan.files || []).slice(0, 1).map(function (f) { return f.name; }) + " 等" }),
								jsx("ul", { children: (scan.files || []).map(function (f) { return jsx("li", { children: f.rel + "（" + fmtSize(f.size) + "）" }, f.rel); }) }),
							] }),
						] })
						: null,
					running
						? jsxs("div", { children: [
							jsx("div", { className: "sa-hint", children: t("lib.running") + (job.current ? "　" + fmtTpl(t("lib.current"), { name: job.current }) : "") + "　" + job.done + "/" + job.total }),
							jsx("div", { className: "sa-prog", children: jsx("div", { className: "f", style: { width: jobPct + "%" } }) }),
							jsx("div", { className: "sa-row", style: { marginTop: "6px" }, children: jsx("button", { className: "sa-btn", onClick: cancelIngest, children: t("lib.cancel") }) }),
						] })
						: jsx("div", { className: "sa-row", children: jsx("button", { className: "sa-btn primary", disabled: !!busy || !dir.trim(), onClick: doIngest, children: t("lib.run") }) }),
					msg ? jsx(Msg, { kind: msg.kind, children: msg.text }) : null,
				] }),
				jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: [t("lib.works"), jsx("span", { className: "sa-sub", children: fmtTpl(t("tab.works"), { n: num(state && state.totalWorks) }) })] }),
					authors.length
						? jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px", maxHeight: "min(38vh,340px)", overflow: "auto" }, children: authors.map(function (a) {
							return jsxs("div", { children: [
								jsx("div", { className: "sa-hint", style: { fontWeight: 600 }, children: a.name }),
								(a.works || []).map(function (w) {
									return jsxs("div", { className: "sa-work", children: [
										jsxs("div", { className: "grow", children: [
											jsx("span", { className: "nm", children: w.name }),
											jsx("span", { className: "mt", children: fmtTpl(t("lib.workRow"), { han: num(w.han), paras: num(w.nPara), scenes: w.scenes ? num(w.scenes) : t("lib.scenesNone") }) }),
										] }),
										w.annotated ? jsx("span", { className: "sa-chip", style: chipStyle("blue"), children: t("lib.badgeAnnotated") }) : null,
										w.neural ? jsx("span", { className: "sa-chip", style: chipStyle("ok"), children: t("lib.badgeNeural") }) : null,
										jsx("button", { className: "sa-btn ghost", disabled: !!busy, onClick: function () { doReplay(a.name, w.name); }, children: busy === "replay:" + a.name + "/" + w.name ? t("lib.replaying") : t("lib.replay") }),
									] }, a.name + "/" + w.name);
								}),
							] }, a.name);
						}) })
						: jsx("div", { className: "sa-empty", children: t("lib.worksEmpty") }),
				] }),
				replay ? jsx(ReportView, { t: t, view: replay }) : null,
			] });
		}

		// ---------------- 织体校验 ----------------
		function WeaveTab(props) {
			var t = props.t;
			var state = props.state;
			var stPath = useState(""), path = stPath[0], setPath = stPath[1];
			var stMsg = useState(null), msg = stMsg[0], setMsg = stMsg[1];
			var stBusy = useState(null), busy = stBusy[0], setBusy = stBusy[1];
			var stJob = useState(null), job = stJob[0], setJob = stJob[1];
			var stView = useState(null), view = stView[0], setView = stView[1];
			var stNeural = useState(!!(state && state.neural)), neural = stNeural[0], setNeural = stNeural[1];
			var stName = useState(""), fileName = stName[0], setFileName = stName[1];
			var fileRef = useRef(null);
			var timer = useRef(null);

			useEffect(function () { return function () { if (timer.current) clearInterval(timer.current); }; }, []);
			// 配置里的神经常开项到达后同步一次（state 异步载入）
			useEffect(function () { if (state && typeof state.neural === "boolean") setNeural(state.neural); }, [state]);

			function pollWeave(jobId) {
				var ticks = 0;
				if (timer.current) clearInterval(timer.current);
				timer.current = setInterval(function () {
					ticks++;
					api("/weave/state?jobId=" + encodeURIComponent(jobId)).then(function (s) {
						setJob(s);
						if (s.status === "done") {
							clearInterval(timer.current); timer.current = null;
							setView(s.result); setBusy(null);
							setMsg(null);
						} else if (s.status === "error") {
							clearInterval(timer.current); timer.current = null;
							setMsg({ kind: "err", text: s.error || "error" }); setBusy(null);
						} else if (s.status === "cancelled") {
							clearInterval(timer.current); timer.current = null;
							setMsg({ kind: "warn", text: t("lib.cancelled") }); setBusy(null);
						}
					}, function (e) {
						clearInterval(timer.current); timer.current = null;
						setMsg({ kind: "err", text: String(e.message || e) }); setBusy(null);
					});
				}, 700);
			}
			function guardAnchor() {
				if (!(state && state.anchor)) { setMsg({ kind: "warn", text: t("weave.needAnchor") }); return false; }
				return true;
			}
			function runPath() {
				if (!guardAnchor()) return;
				if (!path.trim()) { setMsg({ kind: "warn", text: t("weave.errNoPath") }); return; }
				setView(null); setBusy("weave"); setMsg({ kind: "info", text: t("weave.running") });
				api("/weave/start", "POST", { path: path.trim(), neural: neural }).then(function (r) {
					setJob({ jobId: r.jobId, status: "running", label: "" });
					pollWeave(r.jobId);
				}, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); setBusy(null); });
			}
			function onPickFile(e) {
				var f = e.target.files && e.target.files[0];
				if (!f) return;
				if (!guardAnchor()) return;
				var ext = ("." + f.name.split(".").pop()).toLowerCase();
				var okExts = (state && state.exts) || [".txt", ".md", ".docx", ".doc", ".pdf"];
				if (okExts.indexOf(ext) < 0) { setMsg({ kind: "warn", text: fmtTpl(t("weave.errBadExt"), { ext: ext }) }); return; }
				setView(null); setBusy("weave"); setFileName(f.name); setMsg({ kind: "info", text: t("weave.running") });
				uploadWork(f, neural).then(function (r) {
					setJob({ jobId: r.jobId, status: "running", label: "" });
					pollWeave(r.jobId);
				}, function (er) { setMsg({ kind: "err", text: String(er.message || er) }); setBusy(null); });
				if (fileRef.current) fileRef.current.value = "";
			}
			function cancelWeave() {
				if (!job || !job.jobId) return;
				api("/weave/cancel", "POST", { jobId: job.jobId }).then(function () { setMsg({ kind: "warn", text: t("lib.cancelled") }); setBusy(null); }, function (e) { setMsg({ kind: "err", text: String(e.message || e) }); });
			}

			var running = job && (job.status === "queued" || job.status === "running");
			var target = path.trim() || fileName || t("weave.none");

			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
				jsxs("div", { className: "sa-card", children: [
					jsx("h2", { children: [t("weave.pick"), jsx("span", { className: "sa-sub", children: target })] }),
					jsxs("div", { className: "sa-row", children: [
						jsx("input", { className: "sa-input", value: path, placeholder: t("weave.pathPh"), onChange: function (e) { setPath(e.target.value); setFileName(""); } }),
						jsx("button", { className: "sa-btn", disabled: !!busy, onClick: function () { if (fileRef.current) fileRef.current.click(); }, children: t("weave.pickFile") }),
						jsx("input", { ref: fileRef, type: "file", style: { display: "none" }, accept: ".txt,.md,.docx,.doc,.pdf", onChange: onPickFile }),
					] }),
					jsxs("div", { className: "sa-row", children: [
						jsx("label", { className: "sa-check", children: [
							jsx("input", { type: "checkbox", checked: neural, onChange: function (e) { setNeural(e.target.checked); } }),
							t("lib.neural"),
						] }),
						jsx("span", { className: "sa-hint", children: (state && state.anchor) ? fmtTpl(t("lib.anchorSet"), { name: state.anchor }) : t("lib.anchorNone") }),
					] }),
					running
						? jsxs("div", { children: [
							jsx("div", { className: "sa-hint", children: t("weave.running") + (job.label ? "　" + job.label : "") }),
							jsx("div", { className: "sa-row", style: { marginTop: "6px" }, children: jsx("button", { className: "sa-btn", onClick: cancelWeave, children: t("weave.cancel") }) }),
						] })
						: jsxs("div", { className: "sa-row", children: [
							jsx("button", {
								className: "sa-btn primary",
								disabled: !!busy,
								onClick: function () {
									if (path.trim()) runPath();
									else if (fileRef.current) fileRef.current.click();
								},
								children: view ? t("weave.again") : t("weave.run"),
							}),
						] }),
					msg ? jsx(Msg, { kind: msg.kind, children: msg.text }) : null,
				] }),
				view ? jsx(ReportView, { t: t, view: view }) : null,
			] });
		}

		// ---------------- 环境体检 ----------------
		function DoctorTab(props) {
			var t = props.t;
			var stData = useState(null), data = stData[0], setData = stData[1];
			var stBusy = useState(false), busy = stBusy[0], setBusy = stBusy[1];
			var stErr = useState(null), err = stErr[0], setErr = stErr[1];

			function run() {
				setBusy(true); setErr(null);
				api("/doctor").then(function (r) { setData(r); }, function (e) { setErr(String(e.message || e)); }).then(function () { setBusy(false); });
			}
			useEffect(function () { run(); }, []);

			var checks = (data && data.checks) || [];
			var bad = checks.filter(function (c) { return !c.ok; }).length;
			return jsxs("div", { className: "sa-card", children: [
				jsxs("h2", { children: [
					t("tab.doctor"),
					data ? jsx("span", { className: "sa-chip", style: chipStyle(bad ? "warn" : "ok"), children: bad ? fmtTpl(t("doctor.someFail"), { n: bad }) : t("doctor.allPass") }) : null,
				] }),
				jsx("div", { className: "sa-row", children: jsx("button", { className: "sa-btn", disabled: busy, onClick: run, children: busy ? t("doctor.checking") : t("doctor.run") }) }),
				err ? jsx(Msg, { kind: "err", children: t("err.offline") + err }) : null,
				checks.length
					? jsx("div", { style: { display: "flex", flexDirection: "column", gap: "5px" }, children: checks.map(function (c, i) {
						return jsxs("div", { className: "sa-thread", style: { flexDirection: "row", alignItems: "baseline", gap: "8px" }, children: [
							jsx("span", { className: "sa-chip", style: chipStyle(c.ok ? "ok" : "error"), children: c.ok ? "✓" : "✗" }),
							jsx("span", { style: { fontWeight: 600 }, children: c.name }),
							jsx("span", { className: "sa-hint", children: c.msg }),
						] }, "c" + i);
					}) })
					: jsx("div", { className: "sa-empty", children: busy ? t("doctor.checking") : "—" }),
				jsx("div", { className: "sa-hint", children: t("doctor.hint") }),
			] });
		}

		// ---------------- 外部依赖确认弹窗 ----------------
		// 缺失的外部资源（词典须用户放置、模型可下载但需确认）在这里交给用户决定；
		// 只有「现在下载」会触发宿主联网，进度由 /deps/download/state 轮询。
		function DepDialog(props) {
			var t = props.t;
			var deps = props.deps;
			var onClose = props.onClose;
			var onRecheck = props.onRecheck;
			var stJob = useState(null), job = stJob[0], setJob = stJob[1];
			var stBusy = useState(null), busy = stBusy[0], setBusy = stBusy[1];
			var timer = useRef(null);

			useEffect(function () {
				function onKey(e) { if (e.key === "Escape") onClose(); }
				window.addEventListener("keydown", onKey);
				return function () {
					window.removeEventListener("keydown", onKey);
					if (timer.current) clearInterval(timer.current);
				};
			}, []);

			function poll(jobId) {
				if (timer.current) clearInterval(timer.current);
				timer.current = setInterval(function () {
					api("/deps/download/state?jobId=" + encodeURIComponent(jobId)).then(function (s) {
						setJob(s);
						if (s.status === "done" || s.status === "error") {
							clearInterval(timer.current); timer.current = null;
							setBusy(null);
							if (s.status === "done") onRecheck();
						}
					}, function (e) {
						clearInterval(timer.current); timer.current = null;
						setBusy(null);
						setJob({ status: "error", error: String(e.message || e) });
					});
				}, 600);
			}
			function download(id) {
				setBusy(id);
				setJob({ status: "running", pct: 0 });
				api("/deps/download", "POST", { id: id }).then(function (r) {
					setJob({ status: "running", pct: 0, step: "" });
					poll(r.jobId);
				}, function (e) {
					setBusy(null);
					setJob({ status: "error", error: String(e.message || e) });
				});
			}
			function recheck() {
				setBusy("recheck");
				Promise.resolve(onRecheck()).then(function () { setBusy(null); }, function () { setBusy(null); });
			}

			var items = (deps && deps.items) || [];
			var open = items.filter(function (i) { return !i.ok && i.fix; });
			var running = !!(job && job.status === "running");

			function depCard(item) {
				var isDownload = item.fix.kind === "download";
				var mb = Math.round((item.bytes || 0) / 1024 / 1024);
				var downloadLabel = item.bytes ? fmtTpl(t("dep.download"), { mb: mb }) : t("dep.downloadNoSize");
				var actions = [];
				if (isDownload) {
					actions.push(jsx("button", {
						className: "sa-btn primary",
						disabled: !!busy || running,
						onClick: function () { download(item.id); },
						children: busy === item.id ? t("dep.downloadingShort") : downloadLabel,
					}, "dl"));
					actions.push(jsx("button", {
						className: "sa-btn",
						disabled: !!busy,
						onClick: recheck,
						children: busy === "recheck" ? t("dep.checking") : t("dep.recheck"),
					}, "rc"));
					if (item.fix.url) {
						actions.push(jsx("span", { className: "sa-hint", children: t("dep.openUrl") + "：" }, "u"));
						actions.push(jsx("code", { className: "sa-code", children: item.fix.url }, "uc"));
					}
				} else {
					if (item.fix.command) {
						actions.push(jsx("span", { className: "sa-hint", children: t("dep.command") + "：" }, "c"));
						actions.push(jsx("code", { className: "sa-code", children: item.fix.command }, "cc"));
					}
					actions.push(jsx("button", {
						className: "sa-btn",
						disabled: !!busy,
						onClick: recheck,
						children: busy === "recheck" ? t("dep.checking") : t("dep.recheck"),
					}, "rc"));
				}
				return jsxs("div", { className: "sa-dep", children: [
					jsxs("div", { className: "sa-dep-hd", children: [
						jsx("span", { className: "sa-chip", style: chipStyle(item.required ? "error" : "warn"), children: item.required ? t("dep.required") : t("dep.optional") }),
						jsx("span", { className: "sa-dep-t", children: t("dep." + item.id + ".label") }),
						jsx("span", { className: "sa-hint", children: item.detail }),
					] }),
					jsx("div", { className: "sa-hint", children: t("dep." + item.id + ".why") }),
					jsxs("div", { className: "sa-row", children: [
						jsx("span", { className: "sa-hint", children: t("dep.path") + "：" }),
						jsx("code", { className: "sa-code", children: item.path || "—" }),
					] }),
					item.fix.note ? jsx("div", { className: "sa-hint", children: item.fix.note }) : null,
					jsx("div", { className: "sa-row", children: actions }),
					jsx("div", { className: "sa-hint", children: isDownload
						? (item.bytes ? fmtTpl(t("dep.downloadNote"), { mb: mb }) : t("dep.downloadNoteNoSize"))
						: t("dep.manual") }),
				] }, item.id);
			}

			return jsx("div", {
				className: "sa-scrim",
				onMouseDown: function (e) { if (e.target === e.currentTarget) onClose(); },
				children: jsxs("div", { className: "sa-modal", role: "dialog", "aria-modal": "true", "aria-label": t("dep.title"), children: [
					jsxs("div", { className: "sa-modal-h", children: [
						jsx("span", { className: "sa-modal-t", children: t("dep.title") }),
						jsx("span", { className: "sa-chip", style: chipStyle("warn"), children: open.length + " / " + items.length }),
					] }),
					jsx("div", { className: "sa-hint", children: t("dep.intro") }),
					open.length ? null : jsx(Msg, { kind: "ok", children: t("dep.allOk") }),
					open.map(depCard),
					jsxs("div", { className: "sa-modal-f", children: [
						running
							? jsxs("div", { className: "sa-row", style: { flex: "1 1 220px" }, children: [
								jsx("div", { className: "sa-prog", style: { flex: 1 }, children: jsx("div", { className: "f", style: { width: (job.pct || 0) + "%" } }) }),
								jsx("span", { className: "sa-hint", children: fmtTpl(t("dep.downloading"), { pct: job.pct || 0 }) + (job.step ? " · " + job.step : "") }),
							] })
							: null,
						job && job.status === "error"
							? jsx("span", { className: "sa-hint", style: { color: toneVar("error"), flex: "1 1 220px" }, children: fmtTpl(t("dep.downloadFailed"), { err: job.error || "" }) })
							: null,
						jsx("button", { className: "sa-btn", onClick: onClose, disabled: running, children: t("dep.later") }),
					] }),
				] }),
			});
		}

		// ---------------- 面板根 ----------------
		function Root(props) {
			var t = props.t;
			var stTab = useState("library"), tab = stTab[0], setTab = stTab[1];
			var stState = useState(null), state = stState[0], setState = stState[1];
			var stErr = useState(null), err = stErr[0], setErr = stErr[1];
			var stDeps = useState(null), deps = stDeps[0], setDeps = stDeps[1];
			var stDepOpen = useState(false), depOpen = stDepOpen[0], setDepOpen = stDepOpen[1];

			function refresh() {
				return api("/state").then(function (s) { setState(s); setErr(null); }, function (e) { setErr(String(e.message || e)); });
			}
			function refreshDeps() {
				return api("/deps").then(function (d) {
					setDeps(d);
					if (!d.needsUser || !d.needsUser.length) setDepOpen(false);
					return d;
				}, function (e) { setErr(String(e.message || e)); });
			}
			useEffect(function () {
				var alive = true;
				api("/state").then(function (s) { if (alive) setState(s); }, function (e) { if (alive) setErr(String(e.message || e)); });
				api("/deps").then(function (d) {
					if (!alive) return;
					setDeps(d);
					// 外部依赖缺失时主动弹窗（面板打开即可见），而不是等用户撞到功能失败
					if (d.needsUser && d.needsUser.length) setDepOpen(true);
				}, function (e) { if (alive) setErr(String(e.message || e)); });
				return function () { alive = false; };
			}, []);

			function tabBtn(key, label) {
				return jsx("button", { className: "sa-tab" + (tab === key ? " on" : ""), onClick: function () { setTab(key); }, children: label }, key);
			}

			var firstRun = !!(state && state.firstRun);
			return jsxs("div", { className: "sa-root", children: [
				jsxs("div", { className: "sa-head", children: [
					jsx("span", { className: "sa-title", children: t("meta.title") }),
					state
						? jsx("span", { className: "sa-badge" + (firstRun ? " warn" : ""), children: firstRun
							? t("first.title")
							: fmtTpl(t("tab.libraryMeta"), { n: (state.authors || []).length }) + " · " + fmtTpl(t("tab.works"), { n: state.totalWorks || 0 }) })
						: null,
					jsx("span", { className: "sa-desc", children: t("meta.desc") }),
					deps
						? jsx("button", {
							className: "sa-btn tiny",
							onClick: function () { setDepOpen(true); },
							title: t("dep.title"),
							children: (deps.needsUser && deps.needsUser.length)
								? fmtTpl(t("dep.badge"), { n: deps.needsUser.length })
								: t("dep.allOk"),
						})
						: null,
				] }),
				jsxs("div", { className: "sa-tabs", children: [
					tabBtn("library", t("tab.library")),
					tabBtn("weave", t("tab.weave")),
					tabBtn("doctor", t("tab.doctor")),
					state ? jsx("span", { className: "sa-tab-meta", children: state.libraryDir || "" }) : null,
				] }),
				err ? jsx(Msg, { kind: "err", children: t("err.offline") + err }) : null,
				firstRun
					? jsx(Msg, { kind: "warn", title: t("first.title"), children: [
						jsx("div", { children: t("first.body") }),
						jsx("div", { style: { marginTop: "8px" }, children: jsx("button", { className: "sa-btn primary", onClick: function () { setTab("library"); }, children: t("first.cta") }) }),
					] })
					: null,
				tab === "library" ? jsx(LibraryTab, { t: t, state: state, onChanged: refresh }) : null,
				tab === "weave" ? jsx(WeaveTab, { t: t, state: state }) : null,
				tab === "doctor" ? jsx(DoctorTab, { t: t }) : null,
				depOpen && deps ? jsx(DepDialog, { t: t, deps: deps, onClose: function () { setDepOpen(false); }, onRecheck: refreshDeps }) : null,
			] });
		}

		// ---------------- 侧栏入口 ----------------
		// 与 64px 的 icon.svg 同一造型语言：雷达弧环 + 中心节点 + 十分位柱 + 弧线架。
		function PanelIcon() {
			return jsxs("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, children: [
				jsx("g", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", children: [
					jsx("path", { d: "M7.6 13.1A5.25 5.25 0 1 1 7.6 2.9", strokeWidth: 1.5 }),
					jsx("path", { d: "M7.3 11.8A3.9 3.9 0 1 1 7.3 4.2", strokeWidth: 0.8, opacity: 0.55 }),
					jsx("path", { d: "M9.4 9.6Q11.1 5.4 13.9 4.6", strokeWidth: 1.1 }),
					jsx("path", { d: "M9.6 12.2h4.6", strokeWidth: 0.8, opacity: 0.45 }),
				] }),
				jsx("g", { fill: "currentColor", opacity: 0.55, children: [
					jsx("rect", { x: 9.9, y: 8.4, width: 1.5, height: 3.4, rx: 0.5 }),
					jsx("rect", { x: 11.9, y: 6.6, width: 1.5, height: 5.2, rx: 0.5 }),
				] }),
				jsx("circle", { cx: 6.5, cy: 8, r: 1.45, fill: "none", stroke: "currentColor", strokeWidth: 1.2 }),
			] });
		}

		var inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(function () { return ensureCss(); });
			var t = ctx.locale.bind(PANEL_ID);
			ctx.effect(function () { return ctx.locale.register(PANEL_ID, "zh", ZH); });
			ctx.effect(function () { return ctx.locale.register(PANEL_ID, "en", EN); });
			ctx.effect(function () {
				return ctx.slots.inject("sidebar.panellist", function () {
					return ctx.slots.register({
						name: "sidebar.panellist",
						id: PANEL_ID,
						order: 218,
						label: function () { return t("meta.title"); },
					}, PanelIcon);
				});
			});
			ctx.effect(function () {
				return ctx.slots.inject("main", function () {
					return ctx.slots.register({ name: "main", key: PANEL_ID }, function () { return jsx(Root, { t: t }); });
				});
			});
		}

		exports.name = PANEL_ID;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
