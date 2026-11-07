# 第三方组件与数据来源声明

本仓库的分发边界：第三方代码由用户按各自许可证自行安装，数据资源按其官方条款由用户获取，本仓库的分发物只包含自有代码与自有训练产物。

## Python 依赖（pip 安装，见各插件 requirements.txt）

| 组件 | 用途 | 许可证 |
|---|---|---|
| [jieba](https://github.com/fxsjy/jieba) | 中文分词与词性标注 | MIT |
| [onnxruntime](https://github.com/microsoft/onnxruntime) | 句向量推理 | MIT |
| [tokenizers](https://github.com/huggingface/tokenizers) | 句向量输入编码 | Apache-2.0 |
| [numpy](https://github.com/numpy/numpy) | 句向量数值计算 | BSD-3-Clause |
| [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | .pdf 正文抽取（可选，三选一） | AGPL-3.0 或商业双许可 |
| [pypdf](https://github.com/py-pdf/pypdf) | .pdf 正文抽取（可选回退） | BSD-3-Clause |
| [pdfminer.six](https://github.com/pdfminer/pdfminer.six) | .pdf 正文抽取（可选回退） | MIT |
| [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl) | 情感词典官方附件转存（可选） | MIT |
| [xlrd](https://github.com/python-excel/xlrd) | 情感词典官方附件转存（可选） | BSD-3-Clause |

PyMuPDF 与 pypdf / pdfminer.six 覆盖同一条 .pdf 抽取路径，任一可用即可。PyMuPDF 由用户自行安装、以独立子进程调用；偏好宽松许可的部署安装 pypdf 或 pdfminer.six 即可覆盖该路径。

## 运行平台

插件宿主为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery` 随宿主分发，本仓库以 peerDependencies 声明兼容版本。

## 句向量模型

[paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)（ONNX 版，Apache-2.0）：权重保持原版冻结，stylome-identify 与 stylome-architect 首次使用时自动下载到用户级目录 `~/.stylome/models/`，也接受手动放置或环境变量 `STYLOME_EMBED_MODEL` 指路。

## 数据资源：大工《情感词汇本体库》

[大连理工大学信息检索研究室《情感词汇本体库》](https://ir.dlut.edu.cn/zyxz/qgbtk.htm)（约 2.7 万词条）为 stylome-architect 的情感轨提供数据。官方条款：仅供科研及教学使用；商业用途请致函 irlab@dlut.edu.cn；使用请引用徐琳宏、林鸿飞、潘宇、任惠、陈建美《情感词汇本体的构造》。词典文件保存在用户目录，由用户按官方条款获取——stylome-architect 的面板确认后可代为下载官方附件并转存为本机 CSV，也可手动放置。

## 训练数据声明（stylome-identify 判别权重）

`plugins/stylome-identify/server/model.json` 在以下语料上训练：

- **人类侧**：公开中文科幻 NLP 语料汇编 [guhhhhaa/4675-scifi](https://github.com/guhhhhaa/4675-scifi)（约 4675 本；仓库无许可声明，作品文本版权归原作者及权利人所有）中按风格谱系选取的作品文本；
- **AI 侧**：多模型配对生成的合成文本（同题材、等长配对，生成记录带模型标签）。

本仓库只分发训练得到的权重参数。原始文本未存储在本仓库，也随本仓库分发；判别运行时只消费用户传入的文本与该权重文件。权重为手工计量特征上的统计聚合，不含文本片段，不可还原任何原文，以 [CC BY-NC 4.0](LICENSE-MODEL) 分发。若权利人对训练数据的使用边界有异议，欢迎提 issue 协商。
