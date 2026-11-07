// ============================================================================
// stylome-weaver —— client half（浏览器 bundle）
// ----------------------------------------------------------------------------
// 侧栏面板「StylomeWeaver」，两个选项卡：
//   锚定风格：选择样本文件夹 → 启动特征提取 → 九轴指纹雷达 + 风格关键词 + 指标卡
//             + 分位带覆盖表；画像按作者隔离存档，可回放、可删除。
//   比对分析：选一位已训练作者 + 选一个目标文档 → 双序列雷达对比 + 九轴差异
//             + 逐段问题与修改意见（可在选项卡内展开浏览）。
// 数据全部走宿主路由 /stylome-weaver/api；这里不做统计、不读文件系统。
// 可见文案经 ctx.locale；样式只用 --dsw-alias-* 主题令牌。
// ============================================================================
window.__ModuleLoader__.load({
	id: "stylome-weaver",
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

		var PANEL_ID = "stylome-weaver";
		var ROUTE = "/stylome-weaver/api";

		// ---- 文案：命名空间字典（zh / en） ----
		var ZH = {
			"meta.title": "StylomeWeaver",
			"meta.desc": "作者风格锚定与比对：从样本集训练画像，逐段对照作者文风",
			"boot.hint": "本插件不携带任何预训练权重，也没有内置作者画像：画像是从你提供的参考样本里学出来的。",
			"tab.anchor": "锚定风格",
			"tab.compare": "比对分析",
			"tab.meta": "画像 {n} 位 · α {alpha} · 每档 ≥ {minN} 段",
			"first.title": "首次使用：还没有任何作者风格画像",
			"first.body": "请先提供至少一位参考作者的样本集（同一文体的一组 .txt / .md / .docx / .doc / .pdf 文件所在的文件夹），在「锚定风格」里选择该文件夹并启动特征提取。训练完成后画像是可保存、可回放、可比对的。",
			"first.cta": "去选择样本文件夹",
			"anchor.train": "训练画像",
			"anchor.pick": "选择文件夹",
			"anchor.scanBtn": "扫描",
			"anchor.none": "尚未选择样本文件夹",
			"anchor.accept": "支持 .txt / .md / .docx / .doc / .pdf · 递归深度 ≤ 3 · 目录内最多 {max} 个文件",
			"anchor.author": "作者名（缺省用文件夹名）",
			"anchor.run": "启动特征提取",
			"anchor.running": "特征提取中…",
			"anchor.queued": "排队中（等待上一个任务）",
			"anchor.cancel": "取消",
			"anchor.progress": "正在测量 {done}/{total}　可校验段落 {paragraphs}",
			"anchor.scan": "{total} 个文件，可读 {ok} 个",
			"anchor.scanEmpty": "文件夹里没有可读文档",
			"anchor.done": "画像已保存",
			"anchor.replaced": "（覆盖了同名作者的旧画像）",
			"anchor.cancelled": "训练已取消",
			"anchor.library": "画像库",
			"anchor.libraryEmpty": "画像库为空：训练第一位作者后，画像会出现在这里，可随时回放。",
			"anchor.replay": "回放",
			"anchor.delete": "删除",
			"anchor.confirm": "删除 {author} 的画像？此操作不可撤销。",
			"anchor.term": "训练样本：{files} 个文件 / {paragraphs} 段 / {chars} 字",
			"keywords": "风格关键词",
			"cards": "关键指标",
			"radar": "九轴风格指纹",
			"radar.note": "轴长 = 该轴在固定展示刻度上的位置（0–1），只用于可视化；判定只看画像分位带。",
			"axes": "九轴读数",
			"bands": "分位带覆盖（前 24 项）",
			"tiers": "段长分档样本",
			"col.axis": "轴",
			"col.value": "实测",
			"col.band": "画像带",
			"col.feature": "特征",
			"col.group": "组",
			"col.tiers": "档",
			"col.n": "样本",
			"compare.pick": "选择目标文档",
			"compare.none": "尚未选择文档",
			"compare.profile": "比对画像",
			"compare.threshold": "问题阈值",
			"threshold.z2": "严重（z ≥ 2）",
			"threshold.z15": "明显偏上（z ≥ 1.5）",
			"threshold.z1": "含明显（z ≥ 1）",
			"compare.criterion": "问题段落判据：最深越带 z ≥ {z} · 共 {n} 段 / 可校验 {checked} 段（全量列出，未按条数截断）",
			"compare.noProfile": "还没有可用画像：先在「锚定风格」里训练一位作者",
			"compare.run": "开始比对",
			"compare.running": "比对中…",
			"compare.again": "重新比对",
			"compare.doc": "{chars} 字 / {paras} 段（可校验 {checked}）",
			"compare.verdicts": "越带 {over} 段 ｜ 关注 {watch} 段 ｜ 轻微偏离 {mild} 段 ｜ 在带内 {ok} 段",
			"compare.clean": "全部段落都在画像带内，没有需要修改的地方。",
			"compare.advice": "优先修改方向",
			"compare.problems": "问题段落与修改意见（{n} 段）",
			"compare.excerpt": "原文",
			"compare.evidence": "定位",
			"compare.head": "画像预期（实线）vs 目标文档（虚线）",
			"compare.deviation": "偏离",
			"compare.findings": "越带 {n} 项",
			"result.zmax": "最深 z {z}",
			"result.han": "{n} 字",
			"result.severity": "严重度",
			"err.noDir": "请先选择样本文件夹",
			"err.noProfile": "请先训练或选择一位作者画像",
			"err.noFile": "请先选择目标文档",
			"err.badExt": "不支持的文件格式：{ext}",
			"err.offline": "面板服务不可用：",
			"doctor.run": "环境体检",
			"doctor.title": "运行条件",
			"units.per10k": "每万字",
			"units.per1k": "每千字",
			"band.none": "该轴暂无分位带",
		};
		var EN = {
			"meta.title": "StylomeWeaver",
			"meta.desc": "Author-style anchoring: train a profile from samples, then compare a document paragraph by paragraph",
			"boot.hint": "This plugin ships no pretrained weights and no built-in author profile: a profile is learned from the reference samples you supply.",
			"tab.anchor": "Anchor style",
			"tab.compare": "Compare",
			"tab.meta": "{n} profiles · α {alpha} · ≥ {minN} paras per tier",
			"first.title": "First run: no author profile yet",
			"first.body": "Provide at least one reference author's sample set (a folder of same-genre .txt / .md / .docx / .doc / .pdf files), pick that folder under “Anchor style”, and start feature extraction. The resulting profile can be saved, replayed, and compared against.",
			"first.cta": "Pick the sample folder",
			"anchor.train": "Train a profile",
			"anchor.pick": "Choose folder",
			"anchor.scanBtn": "Scan",
			"anchor.none": "No sample folder selected",
			"anchor.accept": ".txt / .md / .docx / .doc / .pdf · depth ≤ 3 · up to {max} files",
			"anchor.author": "Author name (defaults to the folder name)",
			"anchor.run": "Start feature extraction",
			"anchor.running": "Extracting…",
			"anchor.queued": "Queued behind the running job",
			"anchor.cancel": "Cancel",
			"anchor.progress": "Measuring {done}/{total} · {paragraphs} checkable paragraphs",
			"anchor.scan": "{total} files, {ok} readable",
			"anchor.scanEmpty": "No readable document in this folder",
			"anchor.done": "Profile saved",
			"anchor.replaced": " (replaced the same author's previous profile)",
			"anchor.cancelled": "Training cancelled",
			"anchor.library": "Profile library",
			"anchor.libraryEmpty": "The library is empty. Train the first author and the profile will appear here for replay.",
			"anchor.replay": "Replay",
			"anchor.delete": "Delete",
			"anchor.confirm": "Delete {author}'s profile? This cannot be undone.",
			"anchor.term": "Samples: {files} files / {paragraphs} paragraphs / {chars} chars",
			"keywords": "Style keywords",
			"cards": "Key metrics",
			"radar": "Nine-axis style fingerprint",
			"radar.note": "Axis length is the position on a fixed display scale (0–1), for visualisation only; judgments come from the profile bands.",
			"axes": "Axis readings",
			"bands": "Band coverage (first 24)",
			"tiers": "Paragraph-length tiers",
			"col.axis": "Axis",
			"col.value": "Measured",
			"col.band": "Profile band",
			"col.feature": "Feature",
			"col.group": "Group",
			"col.tiers": "Tiers",
			"col.n": "n",
			"compare.pick": "Choose target document",
			"compare.none": "No document selected",
			"compare.profile": "Compare against",
			"compare.threshold": "Problem threshold",
			"threshold.z2": "Severe (z ≥ 2)",
			"threshold.z15": "Notable+ (z ≥ 1.5)",
			"threshold.z1": "Include notable (z ≥ 1)",
			"compare.criterion": "Problem paragraphs: max z ≥ {z} · {n} of {checked} checked paragraphs (all listed, no count cap)",
			"compare.noProfile": "No profile yet: train an author under “Anchor style” first",
			"compare.run": "Compare",
			"compare.running": "Comparing…",
			"compare.again": "Compare again",
			"compare.doc": "{chars} chars / {paras} paras ({checked} checked)",
			"compare.verdicts": "{over} outside ｜ {watch} watch ｜ {mild} slight ｜ {ok} in band",
			"compare.clean": "Every paragraph sits inside the profile bands — nothing to revise.",
			"compare.advice": "Revision directions",
			"compare.problems": "Problem paragraphs and revision advice ({n})",
			"compare.excerpt": "Source",
			"compare.evidence": "Evidence",
			"compare.head": "Profile expectation (solid) vs target document (dashed)",
			"compare.deviation": "Deviation",
			"compare.findings": "{n} findings",
			"result.zmax": "max z {z}",
			"result.han": "{n} chars",
			"result.severity": "Severity",
			"err.noDir": "Pick a sample folder first",
			"err.noProfile": "Train or select an author profile first",
			"err.noFile": "Choose a target document first",
			"err.badExt": "Unsupported file type: {ext}",
			"err.offline": "Panel service unavailable: ",
			"doctor.run": "Environment check",
			"doctor.title": "Runtime conditions",
			"units.per10k": "per 10k",
			"units.per1k": "per 1k",
			"band.none": "No band on this axis yet",
		};

		var CSS = [
			".sw-root{position:relative;width:100%;height:100%;min-height:420px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:calc(14px + var(--dsh-frame-top-clearance,0px)) 16px 18px;overflow-y:auto;}",
			".sw-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;flex:0 0 auto;}",
			".sw-head .sw-title{font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-head .sw-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sw-badge{display:inline-flex;align-items:center;font-size:11px;font-weight:500;border-radius:999px;padding:2px 9px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 45%,transparent);color:var(--dsw-alias-brand-primary,#4e6ef2);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 9%,transparent);}",
			".sw-badge.warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 45%,transparent);color:var(--dsw-alias-state-warn-primary,#e5a03c);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 10%,transparent);}",
			".sw-tabs{display:flex;align-items:center;gap:6px;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.09));padding-bottom:8px;flex-wrap:wrap;}",
			".sw-tab{border:none;background:transparent;font:inherit;font-size:13px;padding:6px 14px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".sw-tab.on{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500;}",
			".sw-tab-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".sw-card{background:var(--dsw-alias-bg-layer-2,#f6f7f9);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:12px;padding:14px 16px;}",
			".sw-card h2{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);letter-spacing:.2px;}",
			".sw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
			".sw-path{flex:1 1 240px;min-width:170px;font-size:12px;color:var(--dsw-alias-label-secondary,#424a55);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:8px;padding:7px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".sw-input,.sw-select{flex:1 1 200px;min-width:150px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));border-radius:8px;padding:7px 10px;}",
			".sw-btn{border:1px solid transparent;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:background .12s ease,opacity .12s ease;}",
			".sw-btn:disabled{opacity:.45;cursor:not-allowed;}",
			".sw-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));color:var(--dsw-alias-label-primary-foreground,#fff);}",
			".sw-btn.ghost{background:transparent;border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".sw-btn.tiny{padding:3px 9px;font-size:11px;border-radius:7px;}",
			".sw-btn.danger{background:transparent;border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 45%,transparent);color:var(--dsw-alias-state-error-primary,#d64550);}",
			".sw-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);line-height:1.6;}",
			".sw-msg{font-size:12.5px;line-height:1.6;border-radius:10px;padding:10px 12px;border:1px solid;}",
			".sw-msg.ok{color:var(--dsw-alias-state-success-primary,#2e9e5b);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 8%,transparent);}",
			".sw-msg.err{color:var(--dsw-alias-state-error-primary,#d64550);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 8%,transparent);}",
			".sw-msg.info{color:var(--dsw-alias-label-secondary,#424a55);border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));}",
			".sw-msg.warn{color:var(--dsw-alias-state-warn-primary,#b9791f);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 10%,transparent);}",
			".sw-msg.warn .sw-msg-t{font-weight:600;font-size:13px;margin-bottom:4px;display:block;}",
			".sw-kws{display:flex;gap:8px;flex-wrap:wrap;}",
			".sw-kw{display:flex;flex-direction:column;gap:2px;border-radius:10px;padding:8px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 7%,transparent);}",
			".sw-kw .w{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-kw .d{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7a828e);max-width:240px;line-height:1.5;}",
			".sw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px;}",
			".sw-stat{background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:9px;padding:9px 11px;}",
			".sw-stat .v{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);font-variant-numeric:tabular-nums;}",
			".sw-stat .v small{font-size:10.5px;font-weight:400;color:var(--dsw-alias-label-tertiary,#7a828e);margin-left:3px;}",
			".sw-stat .k{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);margin-top:2px;}",
			".sw-radar{display:flex;justify-content:center;padding:2px 0 0;}",
			".sw-radar svg{display:block;width:100%;max-width:440px;height:auto;}",
			".sw-axis{background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:9px;padding:8px 10px;display:flex;flex-direction:column;gap:5px;}",
			".sw-axis .top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}",
			".sw-axis .nm{font-size:12px;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-axis .val{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".sw-track{position:relative;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.1));overflow:hidden;}",
			".sw-track .fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--dsw-alias-brand-primary,#4e6ef2);opacity:.72;}",
			".sw-track .mark{position:absolute;top:-2px;width:2px;height:10px;background:var(--dsw-alias-state-warn-primary,#e5a03c);}",
			".sw-axis .foot{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;display:flex;gap:10px;flex-wrap:wrap;}",
			".sw-axis .foot .bad{color:var(--dsw-alias-state-warn-primary,#b9791f);}",
			".sw-table{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;overflow:hidden;}",
			".sw-tr{display:grid;grid-template-columns:minmax(120px,1.6fr) 78px minmax(90px,1fr) 62px;gap:8px;align-items:center;font-size:11.5px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.07));}",
			".sw-tr:last-child{border-bottom:none;}",
			".sw-tr.th{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));font-weight:500;}",
			".sw-tr .fn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-tr .num{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-tr.bands{grid-template-columns:minmax(120px,1.7fr) 74px 92px 46px;}",
			".sw-scroll{max-height:min(44vh,400px);overflow:auto;}",
			".sw-empty{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);line-height:1.7;}",
			".sw-prog{height:7px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.16));overflow:hidden;}",
			".sw-prog .f{height:100%;border-radius:4px;background:var(--dsw-alias-brand-primary,#4e6ef2);transition:width .35s ease;}",
			".sw-lib{display:flex;flex-direction:column;gap:6px;}",
			".sw-lib-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));}",
			".sw-lib-row.on{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 45%,transparent);}",
			".sw-lib-row .au{font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-lib-row .mt{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".sw-lib-row .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}",
			".sw-prob{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;background:var(--dsw-alias-bg-layer-2,#f6f7f9);}",
			".sw-prob .ph{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}",
			".sw-prob .pi{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:999px;padding:2px 9px;border:1px solid;font-variant-numeric:tabular-nums;}",
			".sw-prob .quote{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#424a55);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:8px;padding:7px 9px;max-height:96px;overflow:auto;}",
			".sw-find{display:flex;flex-direction:column;gap:3px;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-find .fl{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;}",
			".sw-find .fname{font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".sw-find .adv{color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-find .ev{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);padding-left:2px;}",
			".sw-advice{margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary,#424a55);}",
			".sw-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;}",
			"@media (max-width:760px){.sw-split{grid-template-columns:minmax(0,1fr);}}",
			".sw-details{margin-top:6px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".sw-details summary{cursor:pointer;}",
			".sw-details ul{margin:6px 0 0;padding-left:18px;line-height:1.7;}",
		];

		function ensureCss() {
			if (document.getElementById("sw-panel-css")) return function () {};
			var el = document.createElement("style");
			el.id = "sw-panel-css";
			el.textContent = CSS.join("\n");
			document.head.appendChild(el);
			return function () { if (el.parentNode) el.parentNode.removeChild(el); };
		}

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

		async function upload(file, profileId, problemZ) {
			var qs = "?name=" + encodeURIComponent(file.name) +
				(profileId ? "&profileId=" + encodeURIComponent(profileId) : "") +
				(problemZ != null ? "&problemZ=" + encodeURIComponent(String(problemZ)) : "");
			var res = await fetch(ROUTE + "/compare-upload" + qs, {
				method: "POST",
				headers: { "content-type": "application/octet-stream" },
				body: file,
			});
			var j = await res.json().catch(function () { return { ok: false, error: "响应不是 JSON" }; });
			if (!res.ok || j.ok === false) throw new Error(j.error || ("HTTP " + res.status));
			return j.result;
		}

		function fmt(v, d) { return typeof v === "number" && isFinite(v) ? v.toFixed(d == null ? 2 : d) : "—"; }
		function fmtSize(n) {
			if (!isFinite(n)) return "—";
			if (n < 1024) return n + " B";
			if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
			return (n / 1024 / 1024).toFixed(1) + " MB";
		}
		function fmtTpl(s, vars) {
			return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); });
		}
		function pct(v) { return Math.max(0, Math.min(1, isFinite(v) ? v : 0)) * 100 + "%"; }
		function num(v, d) { return typeof v === "number" && isFinite(v) ? (d ? v.toFixed(d) : String(Math.round(v))) : "—"; }

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
		function verdictTone(v) {
			if (v === "越带") return "error";
			if (v === "关注") return "warn";
			if (v === "轻微偏离") return "blue";
			if (v === "在带内") return "ok";
			return "idle";
		}
		// 一条发现的读数行：分类判定（段长档未覆盖）与连续越带分开措辞，别把没有带的特征写成「高于上沿」。
		function findingWhere(f) {
			if (f.side === "uncovered") return "实测 " + num(f.value, 0) + " 字 ｜ 画像未覆盖该段长档 ｜ 分类判定";
			return "实测 " + num(f.value, 3) + " ｜ 带 [" + num(f.band[0], 3) + ", " + num(f.band[1], 3) + "] ｜ " +
				(f.side === "hi" ? "高于上沿" : "低于下沿") + " z=" + fmt(f.z, 2);
		}

		// ---------------- 公共小件 ----------------
		function Msg(props) {
			var cls = "sw-msg " + (props.kind || "info");
			return jsx("div", { className: cls, children: props.title
				? [jsx("span", { className: "sw-msg-t", children: props.title }, "t"), props.children]
				: props.children });
		}

		function RadarBox(props) {
			if (!props.svg) return jsx("div", { className: "sw-empty", children: props.empty || "—" });
			return jsx("div", { className: "sw-radar", dangerouslySetInnerHTML: { __html: props.svg } });
		}

		function MetricCards(props) {
			var t = props.t;
			var cards = props.cards || [];
			if (!cards.length) return null;
			return jsxs("div", { className: "sw-card", children: [
				jsx("h2", { children: t("cards") }),
				jsx("div", { className: "sw-grid", children: cards.map(function (c) {
					return jsxs("div", { className: "sw-stat", children: [
						jsxs("div", { className: "v", children: [num(c.value, c.value != null && Math.abs(c.value) < 10 && c.value % 1 !== 0 ? 2 : 0), jsx("small", { children: c.unit })] }),
						jsx("div", { className: "k", children: c.label }),
					] }, c.key);
				}) }),
			] });
		}

		// 训练结果与回放共用：把两种数据形状归一
		function normalizeView(r) {
			var src = r.source || (r.summary && r.summary.source) || {};
			return {
				author: r.author,
				id: r.id,
				createdAt: r.createdAt || null,
				alpha: r.alpha != null ? r.alpha : (r.summary ? r.summary.alpha : null),
				minN: r.minN != null ? r.minN : (r.summary ? r.summary.minN : null),
				files: r.files != null ? r.files : src.files,
				paragraphs: r.paragraphs != null ? r.paragraphs : src.paragraphs,
				chars: r.chars != null ? r.chars : src.chars,
				coverage: r.coverage || (r.summary ? { features: r.summary.features, total: 51, cells: r.summary.cells } : null),
				tiers: r.tiers || [],
				axes: r.axes || [],
				cards: r.cards || [],
				keywords: r.keywords || [],
				rows: r.rows || [],
				svg: r.svg || "",
				replaced: !!r.replaced,
			};
		}

		function ProfileView(props) {
			var t = props.t;
			var v = normalizeView(props.view);
			var cov = v.coverage || {};
			var parts = [];
			parts.push(jsxs("div", { className: "sw-card", children: [
				jsxs("div", { className: "sw-row", style: { justifyContent: "space-between" }, children: [
					jsxs("div", { children: [
						jsx("div", { style: { fontSize: "14.5px", fontWeight: 600, color: "var(--dsw-alias-label-primary,#1f2329)" }, children: v.author + "　" }),
						jsx("div", { className: "sw-hint", children: fmtTpl(t("anchor.term"), { files: num(v.files), paragraphs: num(v.paragraphs), chars: num(v.chars) }) +
							"　·　" + t("col.n") + " α " + fmt(v.alpha, 2) + " / minN " + num(v.minN) +
							(cov.features != null ? "　·　" + cov.features + "/" + (cov.total || 51) : "") }),
					] }),
					jsx("span", { className: "sw-chip", style: chipStyle("blue"), children: "id " + v.id }),
				] }),
				props.replaced ? jsx("div", { className: "sw-hint", style: { marginTop: "4px" }, children: t("anchor.replaced") }) : null,
			] }));
			if (v.keywords.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("keywords") }),
					jsx("div", { className: "sw-kws", children: v.keywords.map(function (k, i) {
						return jsxs("div", { className: "sw-kw", children: [
							jsx("span", { className: "w", children: k.word }),
							jsx("span", { className: "d", children: k.detail }),
						] }, "k" + i);
					}) }),
				] }));
			}
			if (v.cards.length) parts.push(jsx(MetricCards, { t: t, cards: v.cards }));
			if (v.svg) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("radar") }),
					jsx(RadarBox, { svg: v.svg }),
					jsx("div", { className: "sw-hint", children: t("radar.note") }),
				] }));
			}
			if (v.axes.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("axes") }),
					jsx("div", { className: "sw-grid", children: v.axes.map(function (a) {
						return jsxs("div", { className: "sw-axis", children: [
							jsxs("div", { className: "top", children: [
								jsx("span", { className: "nm", children: a.label }),
								jsx("span", { className: "val", children: num(a.raw, a.fmt) + " " + a.unit }),
							] }),
							jsx("div", { className: "sw-track", children: jsx("div", { className: "fill", style: { width: pct(a.value) } }) }),
							jsxs("div", { className: "foot", children: [
								jsx("span", { children: t("col.band") + " " + (a.band ? "[" + num(a.band.lo, 2) + ", " + num(a.band.hi, 2) + "]" : t("band.none")) }),
							] }),
						] }, a.key);
					}) }),
				] }));
			}
			if (v.tiers.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("tiers") }),
					jsx("div", { className: "sw-row", children: v.tiers.map(function (r) {
						return jsxs("span", { className: "sw-chip", style: chipStyle(r.id === "xl" ? "warn" : "blue"), children: [r.label + " · " + r.n] }, r.id);
					}) }),
				] }));
			}
			if (v.rows.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("bands") }),
					jsxs("div", { className: "sw-table", children: [
						jsxs("div", { className: "sw-tr bands th", children: [
							jsx("span", { children: t("col.feature") }),
							jsx("span", { children: t("col.group") }),
							jsx("span", { children: t("col.band") }),
							jsx("span", { children: t("col.n") }),
						] }),
						jsx("div", { className: "sw-scroll", children: v.rows.map(function (r, i) {
							return jsxs("div", { className: "sw-tr bands", children: [
								jsx("span", { className: "fn", title: r.key, children: r.label }),
								jsx("span", { className: "num", children: r.groupLabel }),
								jsx("span", { className: "num", children: "[" + num(r.lo, 2) + ", " + num(r.hi, 2) + "]" }),
								jsx("span", { className: "num", children: num(r.n) }),
							] }, "b" + i);
						}) }),
					] }),
				] }));
			}
			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: parts });
		}

		// ---------------- 选项卡 1：锚定风格 ----------------
		function AnchorTab(props) {
			var t = props.t;
			var meta = props.meta;
			var fileRef = useRef(null);
			var stDir = useState(""), dir = stDir[0], setDir = stDir[1];
			var stAuthor = useState(""), author = stAuthor[0], setAuthor = stAuthor[1];
			var stFiles = useState(null), files = stFiles[0], setFiles = stFiles[1];
			var stBusy = useState(null), busy = stBusy[0], setBusy = stBusy[1];
			var stErr = useState(null), error = stErr[0], setError = stErr[1];
			var stNotice = useState(null), notice = stNotice[0], setNotice = stNotice[1];
			var stJob = useState(null), job = stJob[0], setJob = stJob[1];
			var stView = useState(null), view = stView[0], setView = stView[1];
			var stLib = useState([]), lib = stLib[0], setLib = stLib[1];
			var stReplayId = useState(null), replayId = stReplayId[0], setReplayId = stReplayId[1];

			function loadLibrary() {
				return api("/profiles").then(function (r) { setLib(r.profiles || []); return r; }, function () { return null; });
			}
			useEffect(function () {
				var alive = true;
				api("/profiles").then(function (r) { if (alive) setLib(r.profiles || []); }, function () {});
				return function () { alive = false; };
			}, []);

			async function pick() {
				setBusy("pick"); setError(null); setNotice(null);
				try {
					var r = await api("/pick-folder", "POST", {});
					if (r && r.path) { setDir(r.path); setFiles(null); setView(null); setReplayId(null); await scan(r.path); }
				} catch (e) { setError(String(e.message || e)); }
				finally { setBusy(null); }
			}
			async function scan(target) {
				var p = target || dir;
				if (!p) { setError(t("err.noDir")); return; }
				setBusy("scan"); setError(null);
				try {
					var r = await api("/scan", "POST", { dir: p });
					setFiles(r);
					if (!r.files || !r.files.length) setNotice(t("anchor.scanEmpty") + "（" + fmtTpl(t("anchor.scan"), { total: r.total, ok: 0 }) + "）");
					else setNotice(fmtTpl(t("anchor.scan"), { total: r.total, ok: r.files.length }) + (r.truncated ? "（上限 " + r.limit + "）" : ""));
				} catch (e) { setError(String(e.message || e)); setFiles(null); }
				finally { setBusy(null); }
			}

			async function start() {
				if (!dir) { setError(t("err.noDir")); return; }
				setError(null); setNotice(null); setView(null); setReplayId(null);
				try {
					var r = await api("/train/start", "POST", { dir: dir, author: author });
					setJob({ jobId: r.jobId, status: "queued", done: 0, total: r.files || 0, current: null, paragraphs: 0 });
				} catch (e) { setError(String(e.message || e)); }
			}
			async function cancel() {
				if (!job) return;
				try { await api("/train/cancel", "POST", { jobId: job.jobId }); } catch (e) { setError(String(e.message || e)); }
			}

			var jobId = job ? job.jobId : null;
			var running = !!(job && (job.status === "running" || job.status === "queued"));
			useEffect(function () {
				if (!jobId || !running) return function () {};
				var alive = true;
				var timer = setInterval(async function () {
					try {
						var s = await api("/train/state?jobId=" + encodeURIComponent(jobId));
						if (!alive) return;
						setJob(s);
						if (s.status === "done") {
							clearInterval(timer);
							if (s.result && !s.result.cancelled) { setView(s.result); setNotice(t("anchor.done")); loadLibrary(); }
						} else if (s.status === "error" || s.status === "cancelled") {
							clearInterval(timer);
							if (s.status === "error") setError(s.error || "训练失败");
							else setNotice(t("anchor.cancelled"));
						}
					} catch (e) {
						if (!alive) return;
						setError(String(e.message || e));
						clearInterval(timer);
					}
				}, 1200);
				return function () { alive = false; clearInterval(timer); };
			}, [jobId, running]);

			async function replay(id) {
				setError(null);
				try {
					var r = await api("/profile?id=" + encodeURIComponent(id));
					setView(r); setReplayId(id);
				} catch (e) { setError(String(e.message || e)); }
			}
			async function remove(p) {
				var okDel = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(fmtTpl(t("anchor.confirm"), { author: p.author })) : true;
				if (!okDel) return;
				try {
					await api("/profile/delete", "POST", { id: p.id });
					if (replayId === p.id) { setView(null); setReplayId(null); }
					await loadLibrary();
				} catch (e) { setError(String(e.message || e)); }
			}

			var canRun = !!dir && !running && busy !== "scan";
			var children = [
				jsxs("div", { className: "sw-row", children: [
					jsx("button", { className: "sw-btn ghost", onClick: pick, disabled: busy === "pick" || running, children: busy === "pick" ? "…" : t("anchor.pick") }),
					jsx("input", {
						className: "sw-input", value: dir, placeholder: "样本文件夹路径", 
						onChange: function (e) { setDir(e.target.value); setFiles(null); },
						disabled: running,
					}),
					jsx("button", { className: "sw-btn ghost", onClick: function () { scan(); }, disabled: !dir || running || busy === "scan", children: busy === "scan" ? "…" : t("anchor.scanBtn") }),
				] }),
				jsxs("div", { className: "sw-row", children: [
					jsx("input", {
						className: "sw-input", value: author, placeholder: t("anchor.author"),
						onChange: function (e) { setAuthor(e.target.value); },
						disabled: running,
					}),
					running
						? jsx("button", { className: "sw-btn ghost", onClick: cancel, children: t("anchor.cancel") })
						: jsx("button", { className: "sw-btn primary", onClick: start, disabled: !canRun, children: t("anchor.run") }),
				] }),
				jsx("div", { className: "sw-hint", children: fmtTpl(t("anchor.accept"), { max: (meta && meta.maxFiles) || 200 }) }),
				error ? jsx(Msg, { kind: "err", children: error }) : null,
				notice ? jsx(Msg, { kind: "info", children: notice }) : null,
			];
			if (job && (job.status === "queued" || job.status === "running")) {
				var total = job.total || (files ? files.files.length : 0) || 0;
				var done = job.done || 0;
				var p = total ? Math.round((done / total) * 100) : 0;
				children.push(jsxs("div", { children: [
					jsxs("div", { className: "sw-row", style: { justifyContent: "space-between", marginBottom: "6px" }, children: [
						jsx("span", { className: "sw-hint", children: job.status === "queued" ? t("anchor.queued") : t("anchor.running") }),
						jsx("span", { className: "sw-hint", children: job.current || "" }),
					] }),
					jsx("div", { className: "sw-prog", children: jsx("div", { className: "f", style: { width: p + "%" } }) }),
					jsx("div", { className: "sw-hint", style: { marginTop: "4px" }, children: fmtTpl(t("anchor.progress"), { done: done, total: total, paragraphs: job.paragraphs || 0 }) }),
				] }));
			}

			var libRows = lib.map(function (p) {
				return jsxs("div", { className: "sw-lib-row" + (replayId === p.id ? " on" : ""), children: [
					jsxs("div", { className: "grow", children: [
						jsx("span", { className: "au", children: p.author }),
						jsx("span", { className: "mt", children: "id " + p.id + "　·　" + p.features + " 项特征　·　" + num(p.source && p.source.paragraphs) + " 段 / " + num(p.source && p.source.chars) + " 字" }),
					] }),
					jsx("button", { className: "sw-btn ghost tiny", onClick: function () { replay(p.id); }, disabled: running, children: t("anchor.replay") }),
					jsx("button", { className: "sw-btn danger tiny", onClick: function () { remove(p); }, disabled: running, children: t("anchor.delete") }),
				] }, p.id);
			});

			var out = [
				jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("anchor.train") }),
					jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: children }),
				] }),
				jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("anchor.library") }),
					lib.length ? jsx("div", { className: "sw-lib", children: libRows }) : jsx("div", { className: "sw-empty", children: t("anchor.libraryEmpty") }),
				] }),
			];
			if (view) out.push(jsx(ProfileView, { t: t, view: view, replaced: view.replaced }));
			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: out });
		}

		// ---------------- 选项卡 2：比对分析 ----------------
		function CompareTab(props) {
			var t = props.t;
			var meta = props.meta;
			var fileRef = useRef(null);
			var stProfiles = useState([]), profiles = stProfiles[0], setProfiles = stProfiles[1];
			var stProfileId = useState(""), profileId = stProfileId[0], setProfileId = stProfileId[1];
			var stFile = useState(null), file = stFile[0], setFile = stFile[1];
			var stBusy = useState(false), busy = stBusy[0], setBusy = stBusy[1];
			var stErr = useState(null), error = stErr[0], setError = stErr[1];
			var stResult = useState(null), result = stResult[0], setResult = stResult[1];
			// 问题阈值：超过它的段落都算问题段落并全部列出（不做条数配额）。
			var stZ = useState((meta && meta.problemZ) || 2), problemZ = stZ[0], setProblemZ = stZ[1];

			useEffect(function () {
				var alive = true;
				api("/profiles").then(function (r) {
					if (!alive) return;
					var list = r.profiles || [];
					setProfiles(list);
					if (list.length && !profileId) setProfileId(list[0].id);
				}, function (e) { if (alive) setError(String(e.message || e)); });
				return function () { alive = false; };
			}, []);

			function choose() { if (fileRef.current) fileRef.current.click(); }
			function onChange(ev) {
				var f = ev.target.files && ev.target.files[0];
				ev.target.value = "";
				if (!f) return;
				var ext = ("." + (f.name.split(".").pop() || "")).toLowerCase();
				var exts = (meta && meta.exts) || [".txt", ".md", ".docx", ".doc", ".pdf"];
				if (exts.indexOf(ext) < 0) { setError(fmtTpl(t("err.badExt"), { ext: ext })); return; }
				setFile(f); setError(null); setResult(null);
			}

			async function run() {
				if (!profileId) { setError(t("err.noProfile")); return; }
				if (!file) { setError(t("err.noFile")); return; }
				setBusy(true); setError(null); setResult(null);
				try { setResult(await upload(file, profileId, problemZ)); }
				catch (e) { setError(String(e.message || e)); }
				finally { setBusy(false); }
			}

			var opts = profiles.map(function (p) {
				return jsx("option", { value: p.id, children: p.author + "（" + p.id + "）" }, p.id);
			});
			var head = [
				jsxs("div", { className: "sw-row", children: [
					jsx("span", { className: "sw-hint", style: { minWidth: "64px" }, children: t("compare.profile") }),
					profiles.length
						? jsx("select", { className: "sw-select", value: profileId, onChange: function (e) { setProfileId(e.target.value); setResult(null); }, disabled: busy, children: opts })
						: jsx("div", { className: "sw-path", children: t("compare.noProfile") }),
				] }),
				jsxs("div", { className: "sw-row", children: [
					jsx("span", { className: "sw-hint", style: { minWidth: "64px" }, children: t("compare.threshold") }),
					jsx("select", {
						className: "sw-select", value: String(problemZ),
						onChange: function (e) { setProblemZ(Number(e.target.value)); setResult(null); },
						disabled: busy,
						children: [
							jsx("option", { value: "2", children: t("threshold.z2") }, "z2"),
							jsx("option", { value: "1.5", children: t("threshold.z15") }, "z15"),
							jsx("option", { value: "1", children: t("threshold.z1") }, "z1"),
						],
					}),
				] }),
				jsxs("div", { className: "sw-row", children: [
					jsx("button", { className: "sw-btn ghost", onClick: choose, disabled: busy, children: t("compare.pick") }),
					jsx("div", { className: "sw-path", title: file ? file.name : "", children: file ? file.name + " · " + fmtSize(file.size) : t("compare.none") }),
					jsx("button", { className: "sw-btn primary", onClick: run, disabled: busy || !profileId, children: busy ? t("compare.running") : t("compare.run") }),
				] }),
				jsx("input", { ref: fileRef, type: "file", accept: ".txt,.md,.docx,.doc,.pdf", style: { display: "none" }, onChange: onChange }),
				jsx("div", { className: "sw-hint", children: "支持 .txt / .md / .docx / .doc / .pdf" + (meta && meta.maxChars ? " · ≤ " + meta.maxChars + " 字符" : "") }),
				error ? jsx(Msg, { kind: "err", children: error }) : null,
			];

			var out = [jsxs("div", { className: "sw-card", children: [
				jsx("h2", { children: t("compare.run") }),
				jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: head }),
			] })];
			if (result) out.push(jsx(CompareResult, { t: t, r: result }));
			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: out });
		}

		function CompareResult(props) {
			var t = props.t;
			var r = props.r;
			var d = r.document || {};
			var vcounts = d.verdicts || {};
			var parts = [];

			parts.push(jsxs("div", { className: "sw-card", children: [
				jsxs("div", { className: "sw-row", style: { justifyContent: "space-between" }, children: [
					jsxs("div", { children: [
						jsx("div", { style: { fontSize: "14.5px", fontWeight: 600, color: "var(--dsw-alias-label-primary,#1f2329)" }, children: (d.name || "目标文档") }),
						jsx("div", { className: "sw-hint", children: "画像 " + r.profile.author + "（id " + r.profile.id + "，α " + fmt(r.profile.alpha, 2) + "）" }),
					] }),
					jsx("span", { className: "sw-chip", style: chipStyle(r.problemCount ? "warn" : "ok"), children: r.problemCount ? r.problemCount + " 段问题" : "全部在带内" }),
				] }),
				jsx("div", { className: "sw-hint", style: { marginTop: "4px" }, children: fmtTpl(t("compare.doc"), { chars: num(d.hanTotal), paras: num(d.paras), checked: num(d.checked) }) }),
				jsx("div", { className: "sw-hint", children: fmtTpl(t("compare.verdicts"), {
					over: num(vcounts["越带"] || 0), watch: num(vcounts["关注"] || 0),
					mild: num(vcounts["轻微偏离"] || 0), ok: num(vcounts["在带内"] || 0),
				}) }),
				r.criterion
					? jsx("div", { className: "sw-hint", children: fmtTpl(t("compare.criterion"), { z: fmt(r.criterion.problemZ, 1), n: num(r.problemCount), checked: num(r.criterion.checked) }) })
					: null,
			] }));

			if (r.svg) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("radar") }),
					jsx("div", { className: "sw-hint", style: { marginBottom: "6px" }, children: t("compare.head") }),
					jsx(RadarBox, { svg: r.svg }),
				] }));
			}

			if (r.axes && r.axes.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("axes") }),
					jsx("div", { className: "sw-grid", children: r.axes.map(function (a) {
						var out = a.deviation > 0 || (a.n || 0) > 0;
						return jsxs("div", { className: "sw-axis", children: [
							jsxs("div", { className: "top", children: [
								jsx("span", { className: "nm", children: a.label }),
								jsx("span", { className: "val", children: "画像 " + num(a.rawProfile, a.fmt) + " ← 目标 " + num(a.rawTarget, a.fmt) }),
							] }),
							jsxs("div", { className: "sw-track", children: [
								jsx("div", { className: "fill", style: { width: pct(a.profile) } }),
								jsx("div", { className: "mark", style: { left: pct(a.target) } }),
							] }),
							jsxs("div", { className: "foot", children: [
								jsx("span", { children: t("col.band") + " " + (a.band ? "[" + num(a.band.lo, 2) + ", " + num(a.band.hi, 2) + "]" : t("band.none")) }),
								jsx("span", { className: out ? "bad" : "", children: t("compare.deviation") + " " + fmt(a.deviation, 2) + (a.n ? " · " + fmtTpl(t("compare.findings"), { n: a.n }) : "") }),
							] }),
						] }, a.key);
					}) }),
				] }));
			}

			if (!r.problemCount) {
				parts.push(jsx(Msg, { kind: "ok", children: t("compare.clean") }));
				return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: parts });
			}

			if (r.advice && r.advice.length) {
				parts.push(jsxs("div", { className: "sw-card", children: [
					jsx("h2", { children: t("compare.advice") }),
					jsx("ol", { className: "sw-advice", children: r.advice.map(function (a, i) {
						return jsx("li", { children: jsxs("span", { children: [
							jsx("strong", { children: a.label }),
							"（" + a.count + " 处，" + (a.side === "uncovered" ? "分类判定" : "最深 z=" + fmt(a.zMax, 2)) + "）：" + a.advice,
						] }) }, "a" + i);
					}) }),
				] }));
			}

			parts.push(jsxs("div", { className: "sw-card", children: [
				jsx("h2", { children: fmtTpl(t("compare.problems"), { n: r.problemCount }) }),
				jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px", maxHeight: "min(60vh,560px)", overflow: "auto" }, children: (r.problems || []).map(function (p) {
					return jsxs("div", { className: "sw-prob", children: [
						jsxs("div", { className: "ph", children: [
							jsx("span", { className: "pi", children: "段 " + p.idx }),
							jsx("span", { className: "sw-chip", style: chipStyle(verdictTone(p.verdict)), children: p.verdict }),
							jsx("span", { className: "sw-hint", children: fmtTpl(t("result.han"), { n: p.han }) + " · " + p.tier + " 档" }),
							jsx("span", { className: "sw-hint", children: fmtTpl(t("result.zmax"), { z: fmt(p.zMax, 2) }) }),
						] }),
						p.text ? jsx("div", { className: "quote", children: p.text }) : null,
						jsx("div", { className: "sw-find", children: (p.findings || []).map(function (f, i) {
							return jsxs("div", { children: [
								jsxs("div", { className: "fl", children: [
									jsx("span", { className: "fname", children: f.label }),
									jsx("span", { className: "sw-chip", style: chipStyle(f.severity === "严重" ? "error" : f.severity === "明显" ? "warn" : "blue"), children: f.severity }),
									jsx("span", { children: findingWhere(f) }),
								] }),
								jsx("div", { className: "adv", children: f.advice }),
								f.evidence && f.evidence.items && f.evidence.items.length
									? jsx("div", { className: "ev", children: f.evidence.items.slice(0, 2).map(function (it, k) {
										return jsx("div", { children: (f.evidence.kind === "hits" ? "「" + (it.quote || it.text) + "」（" + it.count + " 处）" : "最差窗（" + num(it.value, 3) + "）：「" + (it.quote || it.text) + "」") }, "e" + k);
									}) })
									: null,
							] }, "f" + i);
						}) }),
					] }, "p" + p.idx);
				}) }),
			] }));
			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: parts });
		}

		// ---------------- 面板根 ----------------
		function Root(props) {
			var t = props.t;
			var stTab = useState("anchor"), tab = stTab[0], setTab = stTab[1];
			var stMeta = useState(null), meta = stMeta[0], setMeta = stMeta[1];
			var stErr = useState(null), err = stErr[0], setErr = stErr[1];

			function refresh() {
				return api("/state").then(function (m) { setMeta(m); }, function (e) { setErr(String(e.message || e)); });
			}
			useEffect(function () {
				var alive = true;
				api("/state").then(function (m) { if (alive) setMeta(m); }, function (e) { if (alive) setErr(String(e.message || e)); });
				return function () { alive = false; };
			}, []);

			function tabBtn(key, label) {
				return jsx("button", { className: "sw-tab" + (tab === key ? " on" : ""), onClick: function () { setTab(key); }, children: label }, key);
			}

			var profiles = (meta && meta.profiles) || [];
			var firstRun = !!(meta && meta.firstRun);

			return jsxs("div", { className: "sw-root", children: [
				jsxs("div", { className: "sw-head", children: [
					jsx("span", { className: "sw-title", children: t("meta.title") }),
					meta ? jsx("span", { className: "sw-badge" + (firstRun ? " warn" : ""), children: firstRun ? "首次使用 · 尚无画像" : fmtTpl(t("tab.meta"), { n: profiles.length, alpha: fmt(meta.alpha, 2), minN: meta.minN }) }) : null,
					jsx("span", { className: "sw-desc", children: t("meta.desc") }),
				] }),
				jsxs("div", { className: "sw-tabs", children: [
					tabBtn("anchor", t("tab.anchor")),
					tabBtn("compare", t("tab.compare")),
					meta ? jsx("span", { className: "sw-tab-meta", children: meta.profilesDir || "" }) : null,
				] }),
				err ? jsx(Msg, { kind: "err", children: t("err.offline") + err }) : null,
				firstRun
					? jsx(Msg, { kind: "warn", title: t("first.title"), children: [
						jsx("div", { children: t("first.body") }),
						jsx("div", { style: { marginTop: "8px" }, children: jsx("button", { className: "sw-btn primary", onClick: function () { setTab("anchor"); }, children: t("first.cta") }) }),
					] })
					: null,
				tab === "anchor"
					? jsx(AnchorTab, { t: t, meta: meta, onChanged: refresh })
					: jsx(CompareTab, { t: t, meta: meta }),
			] });
		}

		// ---------------- 侧栏入口 ----------------
		// 与 64px 的 icon.svg 同一造型语言：雷达弧环 + 中心节点 + 梭子 + 经线扇。
		function PanelIcon() {
			return jsx("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, children: jsxs("g", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", children: [
				jsx("path", { d: "M7.6 13.1A5.25 5.25 0 1 1 7.6 2.9", strokeWidth: 1.5 }),
				jsx("path", { d: "M7.3 11.8A3.9 3.9 0 1 1 7.3 4.2", strokeWidth: 0.8, opacity: 0.55 }),
				jsx("path", { d: "M9.9 7.4 10.3 2.4M10.4 8 13.6 5.7M10.2 8.6 13.1 10.4M9.7 8.9 9.7 12.8", strokeWidth: 0.9 }),
				jsx("path", { d: "M8.3 8h2", strokeWidth: 2.2 }),
				jsx("circle", { cx: 6.5, cy: 8, r: 1.45, strokeWidth: 1.2 }),
			] }) });
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
						order: 216,
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
