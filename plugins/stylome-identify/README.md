# stylome-identify

中文科幻文本的 AI 参与判别器。给一篇文本，它回答一个问题：这篇文章的写作过程里，机器参与到了什么程度——并以可解释的方式说明为什么。

## 它输出什么

- **四态判决**：高度疑似 / 存在嫌疑 / 混合可能 / 人工创作，附带 conformal 置信分层（高 / 中 / 低 / 弃权 / 证据冲突 / 样本不足）
- **逐特征证据表**：每个特征给出数值、方向与贡献排序，证据可追问
- **长文本能力**：逐窗光谱与变点定位，指出可疑区间在文中何处
- **判别档案**：每次判别自动存档完整结果，按文件路径或档案号原样回放；同一篇的跨版本判别形成历史序列

判别栈分三层：L0 清洗与路由 → L1 计量特征（逐窗测量 + 句向量）→ 判别器（线性判别为主，融合经准入检验的辅助判别器）。政策旋钮（可接受错误率）与每条判定线的派生方式记录在 `server/model.json` 的 `thresholds` 字段。

## 安装

```text
plugin_manager(action: "install_bundle", target: "<本仓库>/plugins/stylome-identify")
```

| 入口 | 用法 |
|---|---|
| 工具 | `stylome_identify`（text 或 path 二选一）、`stylome_identify_doctor`、`stylome_identify_archive` |
| 命令 | `/identify <文件路径>`、`/identify archive <文件\|档案号>`、`/identify doctor` |
| 命令行 | `node server/cli.mjs <文件>`，支持 .txt / .md / .docx / .pdf |

被测文本走完判别即离开；判别档案保存在用户级 `~/.stylome/archive/identify/`（环境变量 `STYLOME_ARCHIVE` 改址，config `archive: false` 停用）。

## 首次运行

句向量编码器（Apache-2.0）在首次判别时自动下载到 `~/.stylome/models/`（约 470 MB，仅一次）。离线部署可预先放置模型并用 `STYLOME_EMBED_MODEL` 指路；模型缺席时判别自动切换为插补模式，主判别照常输出。

自检：`node verify.mjs`（运行条件体检加 `--doctor`）。

## 训练数据与许可

判别权重 `server/model.json` 的训练语料来源与分发边界见仓库根 [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)：人类侧为公开中文科幻语料汇编，AI 侧为多模型配对生成的合成文本；本仓库只分发权重参数，原始文本未存储、未分发。权重以 [CC BY-NC 4.0](../../LICENSE-MODEL) 分发，代码以 [MIT](../../LICENSE) 分发。
