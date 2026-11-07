// ============================================================================
// stylome-identify —— client half（浏览器 bundle）
// ----------------------------------------------------------------------------
// 面板：两个选项卡。
//   单篇分析：文件选择器（.txt/.md/.docx/.doc/.pdf）→ 上传字节 → 宿主解析判别
//             → 雷达图（server/radar.mjs 渲染的 SVG）+ 六轴数值 + 证据 + 结论。
//   批处理  ：选文件夹 → 先扫描可分析文件 → 串行判别 → 四态分布 + 参考意见 + 文件序列。
// 数据全部走 /stylome-identify/api（宿主路由）；这里不做判别，也不读文件系统。
// 可见文案经 ctx.locale；样式只用 --dsw-alias-* 主题令牌。
// ============================================================================
window.__ModuleLoader__.load({
	id: "stylome-identify",
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

		var PANEL_ID = "stylome-identify";
		var ROUTE = "/stylome-identify/api";
		var STATES = ["高度疑似", "存在嫌疑", "混合可能", "人工创作", "无法判定"];

		// ---- 文案：命名空间字典（zh/en） ----
		var ZH = {
			"meta.title": "StylomeIdentify",
			"meta.desc": "基于文学计算与迁移学习特征分析的中文科幻AIGC评分器",
			"tab.single": "单篇分析",
			"tab.batch": "批处理",
			"single.hint": "选择一个文档，输出四态判决、六轴雷达与逐特征证据。",
			"pick.file": "选择文件",
			"pick.folder": "选择文件夹",
			"pick.none": "尚未选择文件",
			"pick.noneFolder": "尚未选择文件夹",
			"pick.accept": "支持 .txt / .md / .docx / .doc / .pdf",
			"analyze": "开始分析",
			"analyzing": "分析中…",
			"batch.run": "批处理分析",
			"batch.checking": "正在检查文件夹…",
			"batch.cancel": "取消",
			"batch.empty": "文件夹内没有可分析的文件",
			"batch.scanned": "已扫描 {total} 个文件，其中可分析 {ok} 个",
			"batch.progress": "正在分析 {done}/{total}",
			"batch.done": "批处理完成",
			"batch.cancelled": "已取消",
			"batch.failed": "失败 {n} 个",
			"batch.records": "文件序列",
			"batch.advice": "参考意见",
			"batch.dist": "四态分布",
			"batch.col.file": "文件",
			"batch.col.verdict": "判决",
			"batch.col.pai": "pAI",
			"batch.col.winTop": "最可疑窗",
			"batch.col.advice": "建议",
			"batch.mid": "判别区间中位数 {mid}（tSusp {tSusp} ↔ highLine {highLine}）",
			"result.verdict": "判决",
			"result.grade": "分级",
			"result.axes": "六轴判据",
			"result.evidence": "证据表",
			"result.note": "说明",
			"result.boundary": "边界与声明",
			"result.winTop": "最可疑连续窗",
			"result.han": "汉字",
			"result.route": "路由",
			"result.humanBand": "人类 75 分位",
			"result.mixed": "混合",
			"result.noRadar": "样本不足，不给雷达与结论",
			"state.高度疑似": "高度疑似",
			"state.存在嫌疑": "存在嫌疑",
			"state.混合可能": "混合可能",
			"state.人工创作": "人工创作",
			"state.无法判定": "无法判定",
			"lamp.ood": "OOD",
			"lamp.conflict": "冲突",
			"lamp.short": "样本不足",
			"model.version": "模型 {v}",
			"err.noFile": "请先选择文件",
			"err.noFolder": "请先选择文件夹",
			"err.badExt": "不支持的文件格式：{ext}",
			"err.offline": "面板服务不可用：",
			"tab.archive": "存档回放",
			"archive.title": "判别档案",
			"archive.desc": "判别过的文本自动入档（清洗文本哈希 + 完整结果），可原样回放当时的报告；同一篇跨模型版本的多次判别形成历史序列。",
			"archive.off": "自动存档已关闭（配置 archive: false）——面板仍可读取已有档案。",
			"archive.dir": "档案目录：{dir}",
			"archive.total": "共 {n} 条",
			"archive.empty": "档案为空：分析一篇文档后会自动入档。",
			"archive.refresh": "刷新",
			"archive.replay": "回放",
			"archive.lookup": "按文件回放",
			"archive.lookupPh": "被测文件路径（按清洗文本哈希反查）",
			"archive.notFound": "该文件还没有判别档案——对它做一次判别即可自动入档。",
			"archive.history": "历史序列（{n} 次判别，新→旧）",
			"archive.model": "模型 {v}",
			"archive.isLatest": "最新一次",
			"archive.notLatest": "非最新（结论可能已变）",
			"archive.col.time": "时间",
			"archive.col.source": "来源",
			"archive.col.state": "判决",
			"archive.col.pai": "pAI",
			"archive.col.model": "模型",
			"archive.report": "当时那份报告（原样回放）",
			"archive.noItem": "选择一条档案或一个文件路径开始回放。",
			"archive.needsRestart": "宿主还没加载存档接口：重启 Harness 后「存档回放」才可用（其余两个选项卡不受影响）。",
			"tab.archiveMeta": "档案 {n} 条",
			"dep.title": "外部依赖需要你确认",
			"dep.intro": "判别需要的外部资源不随包分发：下面这些缺失项交给你决定怎么处理——插件不会在你不知情时联网，也不会因为缺一项就让判决悄悄换一种口径。",
			"dep.required": "阻断",
			"dep.optional": "可选",
			"dep.path": "期望路径",
			"dep.command": "安装命令",
			"dep.download": "现在下载（约 {mb} MB）",
			"dep.downloadingShort": "下载中…",
			"dep.downloading": "下载中… {pct}%",
			"dep.downloadFailed": "下载失败：{err}",
			"dep.downloadNote": "下载只在你点上面的按钮后开始（约 {mb} MB，只取一次）；失败可重试，不下载时句向量项按插补模式降级。",
			"dep.manual": "按上面的路径/命令处理后，点「重新检查」。",
			"dep.recheck": "重新检查",
			"dep.checking": "正在检查…",
			"dep.later": "稍后处理",
			"dep.badge": "依赖 {n}",
			"dep.allOk": "依赖齐全",
			"dep.embedModel.label": "句向量模型（外部）",
			"dep.embedModel.why": "句向量/微段特征用到它；缺失时按插补模式降级，主判别（L1+L3）仍可运行——报告里会标出降级。",
			"dep.onnxruntime.label": "onnxruntime + tokenizers（Python 包）",
			"dep.onnxruntime.why": "句向量推理依赖这两个 Python 包；未安装时自动降级为插补模式，判别主链不受影响。",
			"dep.model.label": "判别模型 model.json",
			"dep.model.why": "判别模型随包分发；缺失说明安装不完整，需要重新安装本插件。",
		};
		var EN = {
			"meta.title": "StylomeIdentify",
			"meta.desc": "Chinese science-fiction AIGC scorer on literary-computing and transfer-learning features",
			"tab.single": "Single",
			"tab.batch": "Batch",
			"single.hint": "Pick a document to get a four-state verdict, a six-axis radar and per-feature evidence.",
			"pick.file": "Choose file",
			"pick.folder": "Choose folder",
			"pick.none": "No file selected",
			"pick.noneFolder": "No folder selected",
			"pick.accept": ".txt / .md / .docx / .doc / .pdf",
			"analyze": "Analyze",
			"analyzing": "Analyzing…",
			"batch.run": "Run batch",
			"batch.checking": "Checking folder…",
			"batch.cancel": "Cancel",
			"batch.empty": "No analyzable file in this folder",
			"batch.scanned": "{total} files scanned, {ok} analyzable",
			"batch.progress": "Analyzing {done}/{total}",
			"batch.done": "Batch finished",
			"batch.cancelled": "Cancelled",
			"batch.failed": "{n} failed",
			"batch.records": "File sequence",
			"batch.advice": "Recommendations",
			"batch.dist": "Four-state distribution",
			"batch.col.file": "File",
			"batch.col.verdict": "Verdict",
			"batch.col.pai": "pAI",
			"batch.col.winTop": "Peak window",
			"batch.col.advice": "Advice",
			"batch.mid": "Midpoint {mid} (tSusp {tSusp} ↔ highLine {highLine})",
			"result.verdict": "Verdict",
			"result.grade": "Grade",
			"result.axes": "Six axes",
			"result.evidence": "Evidence",
			"result.note": "Note",
			"result.boundary": "Scope and disclaimer",
			"result.winTop": "Peak window",
			"result.han": "Han chars",
			"result.route": "Route",
			"result.humanBand": "Human p75",
			"result.mixed": "Mixed",
			"result.noRadar": "Too short — no radar or verdict",
			"state.高度疑似": "Likely AI",
			"state.存在嫌疑": "Suspicious",
			"state.混合可能": "Mixed",
			"state.人工创作": "Human",
			"state.无法判定": "Undetermined",
			"lamp.ood": "OOD",
			"lamp.conflict": "Conflict",
			"lamp.short": "Short",
			"model.version": "Model {v}",
			"err.noFile": "Choose a file first",
			"err.noFolder": "Choose a folder first",
			"err.badExt": "Unsupported file type: {ext}",
			"err.offline": "Panel service unavailable: ",
			"tab.archive": "Archive",
			"archive.title": "Judgment archive",
			"archive.desc": "Every judged text is archived (cleaned-text hash plus the full result) and can be replayed exactly as reported; repeated judgments of one text across model versions form a history series.",
			"archive.off": "Automatic archiving is off (archive: false) — existing records are still readable here.",
			"archive.dir": "Archive directory: {dir}",
			"archive.total": "{n} records",
			"archive.empty": "The archive is empty: judge a document and it lands here automatically.",
			"archive.refresh": "Refresh",
			"archive.replay": "Replay",
			"archive.lookup": "Replay by file",
			"archive.lookupPh": "Path of the judged file (looked up by cleaned-text hash)",
			"archive.notFound": "No record for this file yet — judge it once and it is archived.",
			"archive.history": "History series ({n} judgments, newest first)",
			"archive.model": "model {v}",
			"archive.isLatest": "latest",
			"archive.notLatest": "not latest (verdict may have moved)",
			"archive.col.time": "Time",
			"archive.col.source": "Source",
			"archive.col.state": "Verdict",
			"archive.col.pai": "pAI",
			"archive.col.model": "Model",
			"archive.report": "Report as filed (replayed verbatim)",
			"archive.noItem": "Pick a record or a file path to replay.",
			"archive.needsRestart": "The Host has not loaded the archive routes yet — restart Harness to enable this tab (the other two tabs keep working).",
			"tab.archiveMeta": "{n} archived",
			"dep.title": "External dependencies need your call",
			"dep.intro": "The external resources this scorer needs are not shipped with the package. These missing items are handed to you — nothing goes online behind your back, and no verdict silently changes its calibration because a file was missing.",
			"dep.required": "blocking",
			"dep.optional": "optional",
			"dep.path": "Expected path",
			"dep.command": "Install command",
			"dep.download": "Download now (~{mb} MB)",
			"dep.downloadingShort": "Downloading…",
			"dep.downloading": "Downloading… {pct}%",
			"dep.downloadFailed": "Download failed: {err}",
			"dep.downloadNote": "The download starts only after you press the button above (~{mb} MB, once); failures are retryable, and skipping it degrades the embedding features to imputation.",
			"dep.manual": "After placing the file or running the command above, press “Recheck”.",
			"dep.recheck": "Recheck",
			"dep.checking": "Checking…",
			"dep.later": "Later",
			"dep.badge": "Deps {n}",
			"dep.allOk": "Dependencies ready",
			"dep.embedModel.label": "Sentence-embedding model (external)",
			"dep.embedModel.why": "Embedding and micro-segment features use it; when missing they fall back to imputation, the main judgment (L1+L3) still runs — and the report marks the degradation.",
			"dep.onnxruntime.label": "onnxruntime + tokenizers (Python packages)",
			"dep.onnxruntime.why": "Embedding inference needs these two packages; without them features degrade to imputation and the main track is unaffected.",
			"dep.model.label": "Judgment model model.json",
			"dep.model.why": "The model ships with the package; if it is missing the installation is incomplete and the plugin should be reinstalled.",
		};

		var CSS = [
			".si-root{position:relative;width:100%;height:100%;min-height:420px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:calc(14px + var(--dsh-frame-top-clearance,0px)) 16px 18px;overflow-y:auto;}",
			".si-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;flex:0 0 auto;}",
			".si-head .si-title{font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-head .si-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".si-badge{display:inline-flex;align-items:center;font-size:11px;font-weight:500;border-radius:999px;padding:2px 9px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 45%,transparent);color:var(--dsw-alias-brand-primary,#4e6ef2);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4e6ef2) 9%,transparent);}",
			".si-tabs{display:flex;align-items:center;gap:6px;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.09));padding-bottom:8px;}",
			".si-tab{border:none;background:transparent;font:inherit;font-size:13px;padding:6px 14px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary,#424a55);}",
			".si-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".si-tab.on{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500;}",
			".si-tab-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".si-card{background:var(--dsw-alias-bg-layer-2,#f6f7f9);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:12px;padding:14px 16px;}",
			".si-card h2{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);letter-spacing:.2px;}",
			".si-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
			".si-path{flex:1 1 240px;min-width:180px;font-size:12px;color:var(--dsw-alias-label-secondary,#424a55);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:8px;padding:7px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".si-input{flex:1 1 240px;min-width:180px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));border-radius:8px;padding:7px 10px;}",
			".si-btn{border:1px solid transparent;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:background .12s ease,opacity .12s ease;}",
			".si-btn:disabled{opacity:.45;cursor:not-allowed;}",
			".si-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4e6ef2));color:var(--dsw-alias-label-primary-foreground,#fff);}",
			".si-btn.ghost{background:transparent;border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}",
			".si-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".si-msg{font-size:12.5px;line-height:1.6;border-radius:10px;padding:10px 12px;border:1px solid;}",
			".si-msg.ok{color:var(--dsw-alias-state-success-primary,#2e9e5b);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 8%,transparent);}",
			".si-msg.err{color:var(--dsw-alias-state-error-primary,#d64550);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64550) 8%,transparent);}",
			".si-msg.info{color:var(--dsw-alias-label-secondary,#424a55);border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));}",
			".si-msg.warn{color:var(--dsw-alias-state-warn-primary,#b9791f);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e5a03c) 10%,transparent);}",
			".si-verdict{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}",
			".si-verdict .big{font-size:24px;font-weight:650;letter-spacing:.5px;}",
			".si-verdict .sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".si-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;border-radius:999px;padding:2px 9px;border:1px solid;}",
			".si-lamps{display:flex;gap:6px;flex-wrap:wrap;}",
			".si-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}",
			".si-stat{background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:9px;padding:9px 11px;}",
			".si-stat .v{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);font-variant-numeric:tabular-nums;}",
			".si-stat .k{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);margin-top:2px;}",
			".si-radar{display:flex;justify-content:center;padding:4px 0 0;}",
			".si-radar svg{display:block;width:100%;max-width:430px;height:auto;}",
			".si-axis{background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:9px;padding:8px 10px;}",
			".si-axis .top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}",
			".si-axis .nm{font-size:12px;color:var(--dsw-alias-label-secondary,#424a55);}",
			".si-axis .val{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-axis .bar{height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.1));margin-top:6px;overflow:hidden;position:relative;}",
			".si-axis .fill{height:100%;border-radius:3px;background:var(--dsw-alias-state-warn-primary,#e5a03c);}",
			".si-axis .mark{position:absolute;top:-2px;width:2px;height:9px;background:var(--dsw-alias-brand-primary,#4e6ef2);opacity:.8;}",
			".si-axis .foot{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7a828e);margin-top:3px;font-variant-numeric:tabular-nums;}",
			".si-ev{display:flex;flex-direction:column;gap:4px;}",
			".si-ev-row{display:grid;grid-template-columns:1.4fr .7fr .7fr 1fr;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#424a55);padding:3px 0;border-bottom:1px dashed var(--dsw-alias-border-l3,rgba(0,0,0,.08));font-variant-numeric:tabular-nums;}",
			".si-ev-row:last-child{border-bottom:none;}",
			".si-ev-row .dir.ai{color:var(--dsw-alias-state-warn-primary,#e5a03c);}",
			".si-ev-row .dir.hu{color:var(--dsw-alias-state-success-primary,#2e9e5b);}",
			".si-details{margin-top:6px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".si-details summary{cursor:pointer;}",
			".si-details ul{margin:6px 0 0;padding-left:18px;line-height:1.65;}",
			".si-prog{height:7px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.16));overflow:hidden;}",
			".si-prog .f{height:100%;border-radius:4px;background:var(--dsw-alias-brand-primary,#4e6ef2);transition:width .35s ease;}",
			".si-dist{display:flex;flex-direction:column;gap:6px;}",
			".si-dist-row{display:flex;align-items:center;gap:8px;}",
			".si-dist-row .nm{width:88px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#424a55);flex-shrink:0;}",
			".si-dist-row .bar{flex:1;height:9px;border-radius:5px;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.12));overflow:hidden;}",
			".si-dist-row .fill{height:100%;border-radius:5px;}",
			".si-dist-row .num{width:76px;text-align:right;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#7a828e);font-variant-numeric:tabular-nums;}",
			".si-advice{margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary,#424a55);}",
			".si-table{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;overflow:hidden;}",
			".si-tr{display:grid;grid-template-columns:minmax(120px,1.5fr) 92px 64px 70px minmax(140px,1.6fr);gap:8px;align-items:center;font-size:11.5px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.07));}",
			".si-tr:last-child{border-bottom:none;}",
			".si-tr.th{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));font-weight:500;}",
			".si-tr .fn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-tr .num{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#424a55);}",
			".si-tr .adv{font-size:11px;color:var(--dsw-alias-label-tertiary,#7a828e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".si-scroll{max-height:min(46vh,420px);overflow:auto;}",
			".si-empty{font-size:12px;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			// 存档回放（与家族面板同款：表格行 + 历史条纹 + 原样报告）
			".si-tr.arch{grid-template-columns:128px minmax(120px,1.6fr) 96px 60px 92px 64px;}",
			".si-time{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,#7a828e);}",
			".si-hist{display:flex;flex-direction:column;gap:4px;}",
			".si-hist-row{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#424a55);padding:3px 0;border-bottom:1px dashed var(--dsw-alias-border-l3,rgba(0,0,0,.08));font-variant-numeric:tabular-nums;}",
			".si-hist-row:last-child{border-bottom:none;}",
			".si-hist-row.on{color:var(--dsw-alias-label-primary,#1f2329);font-weight:600;}",
			".si-btn.tiny{padding:3px 9px;font-size:11px;border-radius:7px;}",
			// 外部依赖确认弹窗（与家族另两个面板同款）
			".si-scrim{position:fixed;inset:0;background:color-mix(in srgb,#000 36%,transparent);display:flex;align-items:flex-start;justify-content:center;padding:34px 18px;z-index:40;overflow:auto;}",
			".si-modal{width:100%;max-width:640px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.14));border-radius:14px;padding:16px 18px;box-shadow:0 14px 44px color-mix(in srgb,#000 24%,transparent);display:flex;flex-direction:column;gap:10px;}",
			".si-modal-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}",
			".si-modal-t{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-modal-f{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;}",
			".si-dep{border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.1));border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#f6f7f9);}",
			".si-dep-hd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}",
			".si-dep-t{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);}",
			".si-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:6px;padding:2px 6px;word-break:break-all;user-select:all;color:var(--dsw-alias-label-secondary,#424a55);}",
		];

		function ensureCss() {
			if (document.getElementById("si-panel-css")) return function () {};
			var el = document.createElement("style");
			el.id = "si-panel-css";
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

		async function uploadFile(file) {
			var res = await fetch(ROUTE + "/analyze-upload?name=" + encodeURIComponent(file.name), {
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
		// 四态色与雷达图同源（server/radar.mjs 的 VERDICT_ACCENTS）：红 / 橙 / 紫 / 蓝，无法判定为灰。
		function tone(state) {
			if (state === "高度疑似") return "error";
			if (state === "存在嫌疑") return "warn";
			if (state === "混合可能") return "violet";
			if (state === "人工创作") return "blue";
			return "idle";
		}
		function toneVar(t) {
			if (t === "error") return "var(--dsw-alias-state-error-primary,#ef4b5f)";
			if (t === "warn") return "var(--dsw-alias-state-warn-primary,#f28a2e)";
			if (t === "violet") return "var(--dsw-alias-state-violet-primary,#8b5cf6)";
			if (t === "blue") return "var(--dsw-alias-label-primary-bluish,#2f7bff)";
			return "var(--dsw-alias-state-idle-primary,#8b949e)";
		}
		function chipStyle(t) {
			var c = toneVar(t);
			return {
				color: c,
				borderColor: "color-mix(in srgb, " + c + " 42%, transparent)",
				background: "color-mix(in srgb, " + c + " 9%, transparent)",
			};
		}

		// ---------------- 单篇 ----------------
		function SingleTab(props) {
			var t = props.t;
			var meta = props.meta;
			var fileRef = useRef(null);
			var st = useState(null), file = st[0], setFile = st[1];
			var busyState = useState(false), busy = busyState[0], setBusy = busyState[1];
			var errState = useState(null), error = errState[0], setError = errState[1];
			var resState = useState(null), result = resState[0], setResult = resState[1];

			function choose() { if (fileRef.current) fileRef.current.click(); }
			function onChange(ev) {
				var f = ev.target.files && ev.target.files[0];
				ev.target.value = "";
				if (!f) return;
				var ext = ("." + (f.name.split(".").pop() || "")).toLowerCase();
				var exts = (meta && meta.exts) || [".txt", ".md", ".docx", ".doc", ".pdf"];
				if (exts.indexOf(ext) < 0) { setError(fmtTpl(t("err.badExt"), { ext: ext })); return; }
				setFile(f);
				setError(null);
				setResult(null);
			}
			async function run() {
				if (!file) { setError(t("err.noFile")); return; }
				setBusy(true); setError(null); setResult(null);
				try { setResult(await uploadFile(file)); }
				catch (e) { setError(String(e.message || e)); }
				finally { setBusy(false); }
			}

			var canRun = !!file && !busy;
			var children = [
				jsxs("div", { className: "si-row", children: [
					jsx("button", { className: "si-btn ghost", onClick: choose, disabled: busy, children: t("pick.file") }),
					jsx("div", { className: "si-path", title: file ? file.name : "", children: file ? file.name + " · " + fmtSize(file.size) : t("pick.none") }),
					jsx("button", { className: "si-btn primary", onClick: run, disabled: !canRun, children: busy ? t("analyzing") : t("analyze") }),
				] }),
				jsx("div", { className: "si-hint", children: t("pick.accept") + (meta && meta.maxChars ? " · ≤ " + meta.maxChars + " 字符" : "") }),
				jsx("input", { ref: fileRef, type: "file", accept: ".txt,.md,.docx,.doc,.pdf", style: { display: "none" }, onChange: onChange }),
				error ? jsx("div", { className: "si-msg err", children: error }) : null,
			];
			if (result) children.push(jsx(SingleResult, { t: t, r: result }));
			return jsxs("div", { className: "si-card", children: [
				jsx("h2", { children: t("single.hint") }),
				jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: children }),
			] });
		}

		function SingleResult(props) {
			var t = props.t;
			var r = props.r;
			var state = r.mixed ? "混合可能" : (r.verdict || "无法判定");
			var lamps = r.lamps || {};
			var lampList = [];
			if (lamps.ood) lampList.push(["OOD", "OOD"]);
			if (lamps.conflict) lampList.push(["Conflict", t("lamp.conflict")]);
			if (lamps.short) lampList.push(["Short", t("lamp.short")]);
			var axes = r.axes || {};
			var band = r.bandHi || {};

			var parts = [
				jsxs("div", { className: "si-card", children: [
					jsxs("div", { className: "si-verdict", children: [
						jsx("span", { className: "big", style: { color: toneVar(tone(state)) }, children: t("state." + state) }),
						jsx("span", { className: "si-chip", style: chipStyle(tone(r.grade === "高" ? "高度疑似" : r.grade === "中" ? "存在嫌疑" : r.grade === "低" ? "人工创作" : "无法判定")), children: t("result.grade") + " " + (r.grade || "—") }),
						r.pAI == null ? null : jsx("span", { className: "sub", children: "pAI " + fmt(r.pAI, 4) }),
						r.winTop == null ? null : jsx("span", { className: "sub", children: t("result.winTop") + " " + fmt(r.winTop, 3) }),
						jsx("span", { className: "sub", children: t("result.han") + " " + (r.han == null ? "—" : r.han) }),
					] }),
					lampList.length ? jsxs("div", { className: "si-lamps", style: { marginTop: "8px" }, children: lampList.map(function (x, i) {
						return jsx("span", { className: "si-chip", style: chipStyle(x[0] === "OOD" ? "blue" : "warn"), title: x[0], children: x[1] }, "l" + i);
					}) }) : null,
					r.note ? jsx("div", { className: "si-hint", style: { marginTop: "6px" }, children: r.note }) : null,
				] }),
			];

			if (r.radarSvg) {
				parts.push(jsxs("div", { className: "si-card", children: [
					jsx("h2", { children: t("result.axes") }),
					jsx("div", { className: "si-radar", dangerouslySetInnerHTML: { __html: r.radarSvg } }),
				] }));
				parts.push(jsxs("div", { className: "si-grid", children: (r.axisMeta || []).map(function (a) {
					var v = axes[a.key];
					var hi = band[a.key];
					return jsxs("div", { className: "si-axis", children: [
						jsxs("div", { className: "top", children: [
							jsx("span", { className: "nm", children: a.label }),
							jsx("span", { className: "val", children: v == null ? "—" : v.toFixed(2) }),
						] }),
						jsxs("div", { className: "bar", children: [
							jsx("div", { className: "fill", style: { width: (v == null ? 0 : Math.max(0, Math.min(1, v)) * 100) + "%" } }),
							hi == null ? null : jsx("div", { className: "mark", style: { left: Math.max(0, Math.min(1, hi)) * 100 + "%" } }),
						] }),
						jsx("div", { className: "foot", children: t("result.humanBand") + " " + fmt(hi) }),
					] }, a.key);
				}) }));
			} else {
				parts.push(jsx("div", { className: "si-msg info", children: t("result.noRadar") }));
			}

			if (r.evidence && r.evidence.length) {
				parts.push(jsxs("div", { className: "si-card", children: [
					jsx("h2", { children: t("result.evidence") }),
					jsx("div", { className: "si-ev", children: r.evidence.map(function (e, i) {
						var ai = (e.direction || "").indexOf("AI") >= 0;
						return jsxs("div", { className: "si-ev-row", children: [
							jsx("span", { children: e.name }),
							jsx("span", { children: fmt(e.value, 3) }),
							jsx("span", { children: "z " + fmt(e.z, 2) }),
							jsx("span", { className: "dir " + (ai ? "ai" : "hu"), children: e.direction + (e.push != null ? " · " + fmt(e.push, 2) : "") }),
						] }, "e" + i);
					}) }),
					jsxs("details", { className: "si-details", children: [
						jsx("summary", { children: t("result.boundary") }),
						jsx("ul", { children: (r.disclaimer || []).map(function (d, i) { return jsx("li", { children: d }, "d" + i); }) }),
					] }),
				] }));
			}
			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: parts });
		}

		// ---------------- 存档回放 ----------------
		// 判别时自动入档（server/archive.mjs）；这里只读取与回放：
		// 列表 → 回放某条（原样报告），或按文件路径反查同一篇的跨版本历史。
		function ArchiveTab(props) {
			var t = props.t;
			var meta = props.meta;
			var stState = useState(null), state = stState[0], setState = stState[1];
			var stRows = useState([]), rows = stRows[0], setRows = stRows[1];
			var stView = useState(null), view = stView[0], setView = stView[1];
			var stErr = useState(null), error = stErr[0], setError = stErr[1];
			var stBusy = useState(null), busy = stBusy[0], setBusy = stBusy[1];
			var stPath = useState(""), path = stPath[0], setPath = stPath[1];

			function loadList() {
				setBusy("list");
				api("/archive/list?limit=50").then(function (r) {
					setState(r); setRows(r.rows || []); setError(null);
				}, function (e) { setError(String(e.message || e)); }).then(function () { setBusy(null); });
			}
			useEffect(function () { loadList(); }, []);

			function replayById(rec) {
				setBusy("id:" + rec.id); setError(null);
				api("/archive/replay?id=" + encodeURIComponent(rec.id)).then(function (r) { setView(r); }, function (e) { setError(String(e.message || e)); }).then(function () { setBusy(null); });
			}
			function replayByPath() {
				if (!path.trim()) { setError(t("err.noFile")); return; }
				setBusy("path"); setError(null);
				api("/archive/replay?path=" + encodeURIComponent(path.trim())).then(function (r) { setView(r); }, function (e) { setError(String(e.message || e)); }).then(function () { setBusy(null); });
			}

			var listRows = rows.map(function (r) {
				return jsxs("div", { className: "si-tr arch", children: [
					jsx("span", { className: "si-time", children: String(r.at || "").slice(0, 16).replace("T", " ") }),
					jsx("span", { className: "fn", title: r.source || r.excerpt || "", children: r.source || r.excerpt || "—" }),
					jsx("span", { children: jsx("span", { className: "si-chip", style: chipStyle(tone(r.state)), children: t("state." + r.state) }) }),
					jsx("span", { className: "num", children: fmt(r.pAI, 3) }),
					jsx("span", { className: "num", children: r.modelVersion || "—" }),
					jsx("span", { children: jsx("button", { className: "si-btn ghost tiny", disabled: !!busy, onClick: function () { replayById(r); }, children: t("archive.replay") }) }),
				] }, r.id);
			});

			var parts = [
				jsxs("div", { className: "si-card", children: [
					jsx("h2", { children: t("archive.title") }),
					jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
						jsx("div", { className: "si-hint", children: t("archive.desc") }),
						jsxs("div", { className: "si-row", children: [
							jsx("button", { className: "si-btn ghost", onClick: loadList, disabled: !!busy, children: t("archive.refresh") }),
							state ? jsx("span", { className: "si-hint", children: fmtTpl(t("archive.total"), { n: state.total }) }) : null,
							state && state.dir ? jsx("span", { className: "si-hint", title: state.dir, children: fmtTpl(t("archive.dir"), { dir: state.dir }) }) : null,
						] }),
						state && state.enabled === false ? jsx("div", { className: "si-msg info", children: t("archive.off") }) : null,
						meta && !meta.archive ? jsx("div", { className: "si-msg warn", children: t("archive.needsRestart") }) : null,
						error ? jsx("div", { className: "si-msg err", children: error }) : null,
						jsxs("div", { className: "si-row", children: [
							jsx("input", { className: "si-input", value: path, placeholder: t("archive.lookupPh"), onChange: function (e) { setPath(e.target.value); } }),
							jsx("button", { className: "si-btn ghost", onClick: replayByPath, disabled: !!busy, children: t("archive.lookup") }),
						] }),
						rows.length
							? jsxs("div", { className: "si-table", children: [
								jsxs("div", { className: "si-tr arch th", children: [
									jsx("span", { children: t("archive.col.time") }),
									jsx("span", { children: t("archive.col.source") }),
									jsx("span", { children: t("archive.col.state") }),
									jsx("span", { children: t("archive.col.pai") }),
									jsx("span", { children: t("archive.col.model") }),
									jsx("span", { children: "" }),
								] }),
								jsx("div", { className: "si-scroll", children: listRows }),
							] })
							: jsx("div", { className: "si-empty", children: state ? t("archive.empty") : "…" }),
					] }),
				] }),
			];

			if (view) {
				var m = view.meta || {};
				var hist = view.history || [];
				parts.push(jsxs("div", { className: "si-card", children: [
					jsxs("div", { className: "si-row", style: { justifyContent: "space-between", marginBottom: "6px" }, children: [
						jsx("h2", { style: { margin: 0 }, children: t("archive.report") }),
						jsxs("div", { className: "si-row", children: [
							jsx("span", { className: "si-chip", style: chipStyle(m.isLatest ? "ok" : "warn"), children: m.isLatest ? t("archive.isLatest") : t("archive.notLatest") }),
							jsx("span", { className: "si-hint", children: fmtTpl(t("archive.model"), { v: m.modelVersion || "—" }) }),
						] }),
					] }),
					jsx("div", { className: "si-hint", children: m.source || m.excerpt || m.id }),
					hist.length > 1
						? jsxs("div", { style: { marginTop: "8px" }, children: [
							jsx("div", { className: "si-hint", style: { marginBottom: "4px" }, children: fmtTpl(t("archive.history"), { n: hist.length }) }),
							jsx("div", { className: "si-hist", children: hist.map(function (h) {
								return jsxs("div", { className: "si-hist-row" + (h.id === m.id ? " on" : ""), children: [
									jsx("span", { className: "si-time", children: String(h.at || "").slice(0, 16).replace("T", " ") }),
									jsx("span", { children: fmtTpl(t("archive.model"), { v: h.modelVersion || "—" }) }),
									jsx("span", { children: "pAI " + fmt(h.pAI, 3) }),
									jsx("span", { children: h.verdict || h.grade || "—" }),
									jsx("span", { className: "si-time", children: h.id }),
								] }, h.id);
							}) }),
						] })
						: null,
				] }));
				parts.push(jsx(SingleResult, { t: t, r: view.item }));
			} else {
				parts.push(jsx("div", { className: "si-hint", children: t("archive.noItem") }));
			}

			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: parts });
		}

		// ---------------- 批处理 ----------------
		function BatchTab(props) {
			var t = props.t;
			var meta = props.meta;
			var dirState = useState(""), dir = dirState[0], setDir = dirState[1];
			var busyState = useState(null), busy = busyState[0], setBusy = busyState[1]; // 'pick' | 'checking' | null
			var errState = useState(null), error = errState[0], setError = errState[1];
			var noticeState = useState(null), notice = noticeState[0], setNotice = noticeState[1];
			var jobState = useState(null), job = jobState[0], setJob = jobState[1];
			var sumState = useState(null), summary = sumState[0], setSummary = sumState[1];

			async function pickFolder() {
				setBusy("pick"); setError(null);
				try {
					var r = await api("/pick-folder", "POST", {});
					if (r && r.path) { setDir(r.path); setNotice(null); setSummary(null); setJob(null); }
				} catch (e) { setError(String(e.message || e)); }
				finally { setBusy(null); }
			}

			async function runBatch() {
				if (!dir) { setError(t("err.noFolder")); return; }
				setError(null); setNotice(null); setSummary(null); setJob(null); setBusy("checking");
				try {
					var scan = await api("/scan", "POST", { dir: dir });
					if (!scan.files || !scan.files.length) {
						setNotice(fmtTpl(t("batch.empty"), {}) + " — " + fmtTpl(t("batch.scanned"), { total: scan.total, ok: 0 }) + (scan.unsupported ? "（不支持 " + scan.unsupported + "）" : ""));
						return;
					}
					setNotice(fmtTpl(t("batch.scanned"), { total: scan.total, ok: scan.files.length }) + (scan.truncated ? "（上限 " + scan.limit + "）" : ""));
					var started = await api("/batch/start", "POST", { dir: dir });
					if (!started.started) { setNotice(started.message || t("batch.empty")); return; }
					setJob({ jobId: started.jobId, done: 0, total: started.total, status: "running", current: null });
				} catch (e) { setError(String(e.message || e)); }
				finally { setBusy(null); }
			}

			async function cancel() {
				if (!job) return;
				try { await api("/batch/cancel", "POST", { jobId: job.jobId }); }
				catch (e) { setError(String(e.message || e)); }
			}

			var jobId = job ? job.jobId : null;
			var running = !!(job && job.status === "running");
			useEffect(function () {
				if (!jobId || !running) return function () {};
				var alive = true;
				var timer = setInterval(async function () {
					try {
						var s = await api("/batch/state?jobId=" + encodeURIComponent(jobId));
						if (!alive) return;
						setJob(s);
						if (s.status !== "running") { setSummary(s); clearInterval(timer); }
					} catch (e) {
						if (!alive) return;
						setError(String(e.message || e));
						clearInterval(timer);
					}
				}, 1200);
				return function () { alive = false; clearInterval(timer); };
			}, [jobId, running]);

			var head = jsxs("div", { className: "si-row", children: [
				jsx("button", { className: "si-btn ghost", onClick: pickFolder, disabled: !!busy || running, children: busy === "pick" ? "…" : t("pick.folder") }),
				jsx("input", {
					className: "si-input", value: dir, placeholder: "D:/path/to/folder",
					onChange: function (e) { setDir(e.target.value); },
					disabled: running,
				}),
				running
					? jsx("button", { className: "si-btn ghost", onClick: cancel, children: t("batch.cancel") })
					: jsx("button", { className: "si-btn primary", onClick: runBatch, disabled: !!busy || !dir, children: busy === "checking" ? t("batch.checking") : t("batch.run") }),
			] });

			var body = [];
			if (error) body.push(jsx("div", { className: "si-msg err", children: error }));
			if (notice) body.push(jsx("div", { className: "si-msg info", children: notice }));
			if (job) {
				var pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
				body.push(jsxs("div", { children: [
					jsxs("div", { className: "si-row", style: { justifyContent: "space-between", marginBottom: "6px" }, children: [
						jsx("span", { className: "si-hint", children: running ? fmtTpl(t("batch.progress"), { done: job.done, total: job.total }) : (job.status === "cancelled" ? t("batch.cancelled") : t("batch.done")) }),
						jsx("span", { className: "si-hint", children: job.current || "" }),
					] }),
					jsx("div", { className: "si-prog", children: jsx("div", { className: "f", style: { width: pct + "%" } }) }),
					job.errors ? jsx("div", { className: "si-hint", style: { marginTop: "4px" }, children: fmtTpl(t("batch.failed"), { n: job.errors }) }) : null,
				] }));
			}
			if (summary) body.push(jsx(BatchSummary, { t: t, s: summary, meta: meta }));
			return jsxs("div", { className: "si-card", children: [
				jsx("h2", { children: t("batch.run") }),
				jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [head].concat(body) }),
			] });
		}

		function BatchSummary(props) {
			var t = props.t;
			var s = props.s;
			var counts = s.counts || {};
			var total = s.total || 0;
			var th = s.thresholds || {};
			var order = STATES;
			var dist = order.map(function (name) {
				var n = counts[name] || 0;
				var pct = total ? Math.round((n / total) * 100) : 0;
				return jsxs("div", { className: "si-dist-row", children: [
					jsx("span", { className: "nm", children: t("state." + name) }),
					jsx("div", { className: "bar", children: jsx("div", { className: "fill", style: { width: pct + "%", background: toneVar(tone(name)) } }) }),
					jsxs("span", { className: "num", children: [n + " · " + pct + "%"] }),
				] }, name);
			});

			var records = (s.records || []).slice().sort(function (a, b) {
				var rank = { high: 0, review: 1, watch: 2, unknown: 3, low: 4, error: 5 };
				var ra = rank[(a.recommendation || {}).kind] == null ? 9 : rank[(a.recommendation || {}).kind];
				var rb = rank[(b.recommendation || {}).kind] == null ? 9 : rank[(b.recommendation || {}).kind];
				if (ra !== rb) return ra - rb;
				return String(a.rel || a.name).localeCompare(String(b.rel || b.name));
			});

			var rows = records.map(function (r, i) {
				var state = r.state || (r.ok ? "无法判定" : "无法判定");
				return jsxs("div", { className: "si-tr", children: [
					jsx("span", { className: "fn", title: r.rel || r.name, children: r.rel || r.name }),
					jsx("span", { children: jsx("span", { className: "si-chip", style: chipStyle(tone(state)), children: t("state." + state) }) }),
					jsx("span", { className: "num", children: fmt(r.pAI, 3) }),
					jsx("span", { className: "num", children: r.winTop == null ? "—" : fmt(r.winTop, 3) }),
					jsx("span", { className: "adv", title: (r.recommendation || {}).text || r.error || "", children: (r.recommendation || {}).text || r.error || "—" }),
				] }, "r" + i);
			});

			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
				jsxs("div", { className: "si-card", children: [
					jsx("h2", { children: t("batch.dist") }),
					jsx("div", { className: "si-dist", children: dist }),
					s.mid == null ? null : jsx("div", { className: "si-hint", style: { marginTop: "8px" }, children: fmtTpl(t("batch.mid"), { mid: s.mid, tSusp: th.tSusp == null ? "—" : th.tSusp, highLine: th.highLine == null ? "—" : th.highLine }) }),
				] }),
				jsxs("div", { className: "si-card", children: [
					jsx("h2", { children: t("batch.advice") }),
					jsx("ul", { className: "si-advice", children: (s.advice || []).map(function (a, i) { return jsx("li", { children: a }, "a" + i); }) }),
				] }),
				jsxs("div", { className: "si-card", children: [
					jsxs("h2", { children: [t("batch.records"), " · " + total] }),
					jsxs("div", { className: "si-table", children: [
						jsxs("div", { className: "si-tr th", children: [
							jsx("span", { children: t("batch.col.file") }),
							jsx("span", { children: t("batch.col.verdict") }),
							jsx("span", { children: t("batch.col.pai") }),
							jsx("span", { children: t("batch.col.winTop") }),
							jsx("span", { children: t("batch.col.advice") }),
						] }),
						jsx("div", { className: "si-scroll", children: rows.length ? rows : jsx("div", { className: "si-empty", style: { padding: "10px" }, children: "—" }) }),
					] }),
				] }),
			] });
		}

		// ---------------- 外部依赖确认弹窗 ----------------
		// 句向量模型 / onnxruntime / 判别模型缺失时交给用户决定：只有「现在下载」会联网，
		// 其余给可复制命令与确切路径，处理完点「重新检查」。
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
				var kind = item.fix.kind;
				var mb = Math.round((item.bytes || 0) / 1024 / 1024);
				var action;
				if (kind === "download") {
					action = jsx("div", { className: "si-row", children: jsx("button", {
						className: "si-btn primary",
						disabled: !!busy || running,
						onClick: function () { download(item.id); },
						children: busy === item.id ? t("dep.downloadingShort") : fmtTpl(t("dep.download"), { mb: mb }),
					}) });
				} else if (kind === "install") {
					action = jsxs("div", { className: "si-row", children: [
						jsx("span", { className: "si-hint", children: t("dep.command") }),
						jsx("code", { className: "si-code", children: item.fix.command || "" }),
						jsx("button", { className: "si-btn", disabled: !!busy, onClick: recheck, children: busy === "recheck" ? t("dep.checking") : t("dep.recheck") }),
					] });
				} else {
					action = jsxs("div", { className: "si-row", children: [
						jsx("span", { className: "si-hint", children: t("dep.path") }),
						jsx("code", { className: "si-code", children: item.path || "—" }),
						jsx("button", { className: "si-btn", disabled: !!busy, onClick: recheck, children: busy === "recheck" ? t("dep.checking") : t("dep.recheck") }),
					] });
				}
				return jsxs("div", { className: "si-dep", children: [
					jsxs("div", { className: "si-dep-hd", children: [
						jsx("span", { className: "si-chip", style: chipStyle(item.required ? "error" : "warn"), children: item.required ? t("dep.required") : t("dep.optional") }),
						jsx("span", { className: "si-dep-t", children: t("dep." + item.id + ".label") }),
						jsx("span", { className: "si-hint", children: item.detail }),
					] }),
					jsx("div", { className: "si-hint", children: t("dep." + item.id + ".why") }),
					action,
					jsx("div", { className: "si-hint", children: kind === "download" ? fmtTpl(t("dep.downloadNote"), { mb: mb }) : (item.fix.note || t("dep.manual")) }),
				] }, item.id);
			}

			return jsx("div", {
				className: "si-scrim",
				onMouseDown: function (e) { if (e.target === e.currentTarget) onClose(); },
				children: jsxs("div", { className: "si-modal", role: "dialog", "aria-modal": "true", "aria-label": t("dep.title"), children: [
					jsxs("div", { className: "si-modal-h", children: [
						jsx("span", { className: "si-modal-t", children: t("dep.title") }),
						jsx("span", { className: "si-chip", style: chipStyle("warn"), children: open.length + " / " + items.length }),
					] }),
					jsx("div", { className: "si-hint", children: t("dep.intro") }),
					open.length ? null : jsx("div", { className: "si-msg ok", children: t("dep.allOk") }),
					open.map(depCard),
					jsxs("div", { className: "si-modal-f", children: [
						running
							? jsxs("div", { className: "si-row", style: { flex: "1 1 220px" }, children: [
								jsx("div", { className: "si-prog", style: { flex: 1 }, children: jsx("div", { className: "f", style: { width: (job.pct || 0) + "%" } }) }),
								jsx("span", { className: "si-hint", children: fmtTpl(t("dep.downloading"), { pct: job.pct || 0 }) + (job.step ? " · " + job.step : "") }),
							] })
							: null,
						job && job.status === "error"
							? jsx("span", { className: "si-hint", style: { color: toneVar("error"), flex: "1 1 220px" }, children: fmtTpl(t("dep.downloadFailed"), { err: job.error || "" }) })
							: null,
						jsx("button", { className: "si-btn ghost", onClick: onClose, disabled: running, children: t("dep.later") }),
					] }),
				] }),
			});
		}

		// ---------------- 面板根 ----------------
		function Root(props) {
			var t = props.t;
			var tabState = useState("single"), tab = tabState[0], setTab = tabState[1];
			var metaState = useState(null), meta = metaState[0], setMeta = metaState[1];
			var errState = useState(null), err = errState[0], setErr = errState[1];
			var depsState = useState(null), deps = depsState[0], setDeps = depsState[1];
			var depOpenState = useState(false), depOpen = depOpenState[0], setDepOpen = depOpenState[1];

			function refreshDeps() {
				return api("/deps").then(function (d) {
					setDeps(d);
					if (!d.needsUser || !d.needsUser.length) setDepOpen(false);
					return d;
				}, function (e) { setErr(String(e.message || e)); });
			}
			useEffect(function () {
				var alive = true;
				api("/state").then(function (m) { if (alive) setMeta(m); }, function (e) { if (alive) setErr(String(e.message || e)); });
				api("/deps").then(function (d) {
					if (!alive) return;
					setDeps(d);
					// 外部依赖缺失时主动弹窗，而不是等用户撞上一次失败
					if (d.needsUser && d.needsUser.length) setDepOpen(true);
				}, function (e) { if (alive) setErr(String(e.message || e)); });
				return function () { alive = false; };
			}, []);

			function tabBtn(key, label) {
				return jsx("button", { className: "si-tab" + (tab === key ? " on" : ""), onClick: function () { setTab(key); }, children: label }, key);
			}

			return jsxs("div", { className: "si-root", children: [
				jsxs("div", { className: "si-head", children: [
					jsx("span", { className: "si-title", children: t("meta.title") }),
					meta ? jsx("span", { className: "si-badge", children: fmtTpl(t("model.version"), { v: meta.model.version }) }) : null,
					jsx("span", { className: "si-desc", children: t("meta.desc") }),
					deps
						? jsx("button", {
							className: "si-btn ghost tiny",
							onClick: function () { setDepOpen(true); },
							title: t("dep.title"),
							children: (deps.needsUser && deps.needsUser.length)
								? fmtTpl(t("dep.badge"), { n: deps.needsUser.length })
								: t("dep.allOk"),
						})
						: null,
				] }),
				jsxs("div", { className: "si-tabs", children: [
					tabBtn("single", t("tab.single")),
					tabBtn("batch", t("tab.batch")),
					tabBtn("archive", t("tab.archive")),
					meta ? jsx("span", { className: "si-tab-meta", children: "tSusp " + fmt(meta.thresholds && meta.thresholds.tSusp, 2) + " · highLine " + fmt(meta.thresholds && meta.thresholds.highLine, 2)
						+ (meta.archive ? " · " + fmtTpl(t("tab.archiveMeta"), { n: meta.archive.total }) : "") }) : null,
				] }),
				err ? jsx("div", { className: "si-msg err", children: t("err.offline") + err }) : null,
				tab === "single" ? jsx(SingleTab, { t: t, meta: meta }) : (tab === "archive" ? jsx(ArchiveTab, { t: t, meta: meta }) : jsx(BatchTab, { t: t, meta: meta })),
				depOpen && deps ? jsx(DepDialog, { t: t, deps: deps, onClose: function () { setDepOpen(false); }, onRecheck: refreshDeps }) : null,
			] });
		}

		// ---------------- 侧栏入口 ----------------
		// 与 64px 的 icon.svg 同一造型语言（也是家族统一语言）：逐窗雷达弧环 + 中心节点 + 判据迸裂 + 火花。
		function PanelIcon() {
			return jsxs("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, children: [
				jsx("g", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", children: [
					jsx("path", { d: "M7.6 13.1A5.25 5.25 0 1 1 7.6 2.9", strokeWidth: 1.5 }),
					jsx("path", { d: "M7.3 11.8A3.9 3.9 0 1 1 7.3 4.2", strokeWidth: 0.8, opacity: 0.55 }),
					jsx("path", { d: "M9.6 6.4 12.2 4.2", strokeWidth: 1.2 }),
					jsx("path", { d: "M10.3 8h3.7", strokeWidth: 1.2 }),
					jsx("path", { d: "M9.9 9.4 12.4 11.4", strokeWidth: 1.2 }),
				] }),
				jsx("circle", { cx: 6.5, cy: 8, r: 1.45, fill: "none", stroke: "currentColor", strokeWidth: 1.2 }),
				jsx("path", { d: "M12.7 1.6 13.15 2.75 14.3 3.2 13.15 3.65 12.7 4.8 12.25 3.65 11.1 3.2 12.25 2.75 Z", fill: "currentColor" }),
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
						order: 215,
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
