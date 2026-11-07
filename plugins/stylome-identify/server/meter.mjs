// 推理时的测量：清洗 → 按 1200 汉字切块（与 feature-scan 同一 blocks 规则）→ jieba 分词 → measure → flatten
// → 补算 sent:hurst / sig:density / emo:R → 句向量（块表示与 emb:* 动态量）。训练特征来自同一套测量层，口径一致。
// 分词走 py/segment_server.py、句向量走 py/embed_server.py，两个常驻进程；
// 解释器取 LITIDENTIFY_PYTHON（缺省 python，须装 jieba、onnxruntime、tokenizers），模型目录见 server/embedder.mjs。

import { startSegmenter } from '../lib/corpus/segmenter.mjs'
import { measure } from '../lib/meter/measure.mjs'
import { flatten } from '../lib/profile/screen.mjs'
import { blocks, charCount } from '../lib/meter/segment.mjs'
import { cleanText } from './stack/clean.mjs'
import { extraFeatures } from './stack/features.mjs'
import { applyEmbedding } from './stack/embed.mjs'
import { ROUTE } from './stack/registry.mjs'
import { startEmbedder } from './embedder.mjs'
import { ensureEmbedModel } from './embedModel.mjs'

export const pythonPath = () => process.env.LITIDENTIFY_PYTHON || 'python'

export class Meter {
  constructor(python = pythonPath()) { this.seg = startSegmenter(python); this.python = python; this.emb = null; this.embReady = null }

  /** 嵌入依赖就绪：首跑触发外部模型检测/下载；失败降级为无嵌入（栈端插补），不阻断判别。 */
  async ensureEmb() {
    if (!this.embReady) this.embReady = (async () => {
      try {
        const dir = await ensureEmbedModel()
        this.emb = startEmbedder(this.python, dir)
      } catch { this.emb = null }
      return this.emb
    })()
    return this.embReady
  }

  /**
   * 判别所需的全部测量：≥800 汉字给逐窗结果 windows；350–800 字给整段句向量 doc；更短都不测。
   * @returns {Promise<{windows: object[]|null, doc: object|null}>}
   */
  async measure(text) {
    const clean = cleanText(text)
    const han = charCount(clean)
    if (han >= ROUTE.main) return { windows: await this.windows(clean), doc: null }
    if (han >= ROUTE.micro) {
      const emb = await this.ensureEmb()
      return { windows: null, doc: emb ? applyEmbedding({ features: {} }, await emb.embed(clean)) : { features: {} } }
    }
    return { windows: null, doc: null }
  }

  /** 主管线的逐窗测量（输入已清洗）。 */
  async windows(clean) {
    const emb = await this.ensureEmb()
    const out = []
    for (const b of blocks(clean, ROUTE.window)) {
      const toks = await this.seg.segment(b)
      const f = flatten(measure(b, toks))
      Object.assign(f, extraFeatures(b, f, toks))
      out.push(applyEmbedding({ han: charCount(b), text: b, features: f }, emb ? await emb.embed(b) : null))
    }
    return out
  }

  close() { this.seg.stop(); this.emb?.stop() }
}
