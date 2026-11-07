# Stylome - 科幻写作辅助组件

基于文学计算相关理论，结合参数辨识、特征分析与迁移学习等技术，面向中文科幻写作开发的辅助工具集。该组件旨在让作者看见自己文本的风格与结构，并把这些观察变成可操作的写作参考。

全部计算在本地完成，以 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件形态安装运行。三个插件共享同一套测量层，所有结论均基于可量化与可解释的指标进行分析。

本组件共三个DSH插件，无交叉依赖关系，可根据具体需求自行选择安装。

| 插件 | 关注问题 | 核心能力 |
|---|---|---|
| [stylome-identify](plugins/stylome-identify/) | 写作特征 | 基于预训练权重与迁移学习判别给定作品AIGC概率 |
| [stylome-weaver](plugins/stylome-weaver/) | 文风习惯 | 根据多种文学计量特征参数分析行文习惯，并结合锚定作者风格给出参考意见 |
| [stylome-architect](plugins/stylome-architect/) | 基于叙事动力学与场景划分分析并归档作品的叙事结构，并以场景为最小颗粒度提供自定义修改参考 |

## StylomeIdentify - 以铜为鉴，可以正衣冠

介绍

## StylomeWeaver - 以古为鉴，可以知兴替

介绍

## StylomeArchitect - 以人为鉴，可以明得失

介绍

## 安装

| 依赖 | 要求 |
|---|---|
| Node | ≥ 22.13 |
| DSH | ≥ 0.2.1-rc.3 |
| Python | 3.8+，安装 jieba |

```text
plugin_manager(action: "install_bundle", target: "<本仓库路径>/plugins/<插件目录>")
```

三个插件出厂均为待初始化状态：identify 开箱即用（首次判别自动下载句向量模型）；weaver 的第一次 `train` 建立你的画像；architect 先收录作品、再标注锚定作者。各插件 README 内有具体步骤，`node verify.mjs` 做本地自检。

## 仓库结构

```text
plugins/
  stylome-identify/    AI 参与判别器
  stylome-weaver/      作者风格锚定与比对
  stylome-architect/   宏观织体校验器
LICENSE                代码许可（MIT）
LICENSE-MODEL          训练权重许可（CC BY-NC 4.0）
THIRD-PARTY-NOTICES.md 第三方组件、数据资源与训练数据声明
```

## 外部资源

- **句向量模型** [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)（Apache-2.0）：identify 与 architect 使用，首次使用时自动下载（约 470 MB）到用户级目录 `~/.stylome/models/`，也接受手动放置或环境变量 `STYLOME_EMBED_MODEL` 指路
- **大工《情感词汇本体库》**：architect 情感轨的数据来源，按官方条款获取；architect 面板确认后可代为下载并转存到用户目录。条款与引用要求见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)

## 许可

- 代码以 [MIT](LICENSE) 分发
- 训练权重（`plugins/stylome-identify/server/model.json`）以 [CC BY-NC 4.0](LICENSE-MODEL) 分发；训练语料的来源与分发边界见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
