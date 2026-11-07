# 句向量服务（迁移学习：冻结的 embedding 编码器，判别头在 Node 侧训练）。从 stdin 逐行读 JSON，向 stdout 逐行写 JSON。
# 输入 {"sents": [句子, ...]}（句子由 Node 侧按 lib/meter/segment.mjs 的规则切好）。
# 输出 {"mean": [384 维] | null, "adj": 相邻句余弦均值, "adjSd": 相邻句余弦标准差, "disp": 句向量到块中心的平均余弦距离, "n": 句数}；
# 句数不足时对应量为 null。
# 模型：paraphrase-multilingual-MiniLM-L12-v2（ONNX）。句向量 = 注意力掩码下的 token 均值池化后 L2 归一化
# （sentence-transformers 对该模型的池化方式）。不是语言模型，不打困惑度分。
# 用法：python embed_server.py <模型目录>。stderr 只放加载信息。
import json
import os
import sys

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')

MODEL_DIR = sys.argv[1]
MAX_LEN = 128
tok = Tokenizer.from_file(os.path.join(MODEL_DIR, 'tokenizer.json'))
tok.enable_truncation(max_length=MAX_LEN)
pad = tok.token_to_id('<pad>')
tok.enable_padding(pad_id=pad if pad is not None else 1, pad_token='<pad>')
sess = ort.InferenceSession(os.path.join(MODEL_DIR, 'model.onnx'), providers=['CPUExecutionProvider'])
INPUTS = {i.name for i in sess.get_inputs()}
print(f'embed_server: {MODEL_DIR} 已加载', file=sys.stderr, flush=True)


def embed(sents, batch=64):
    out = np.zeros((len(sents), 384), dtype=np.float32)
    order = sorted(range(len(sents)), key=lambda i: len(sents[i]))
    for s in range(0, len(order), batch):
        idx = order[s:s + batch]
        enc = tok.encode_batch([sents[i] for i in idx])
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {'input_ids': ids, 'attention_mask': mask}
        if 'token_type_ids' in INPUTS:
            feed['token_type_ids'] = np.zeros_like(ids)
        h = sess.run(None, feed)[0]
        m = mask[..., None].astype(np.float32)
        v = (h * m).sum(1) / np.maximum(m.sum(1), 1e-9)
        v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)
        out[idx] = v
    return out


def summarize(sents):
    sents = [s for s in sents if s.strip()]
    n = len(sents)
    res = {'mean': None, 'adj': None, 'adjSd': None, 'disp': None, 'n': n}
    if n == 0:
        return res
    e = embed(sents)
    mean = e.mean(0)
    res['mean'] = [round(float(x), 5) for x in mean]
    if n >= 2:
        adj = (e[:-1] * e[1:]).sum(1)
        res['adj'] = round(float(adj.mean()), 6)
        res['adjSd'] = round(float(adj.std()), 6) if n >= 3 else None
        c = mean / max(float(np.linalg.norm(mean)), 1e-12)
        res['disp'] = round(float((1 - e @ c).mean()), 6)
    return res


for line in sys.stdin:
    line = line.strip()
    try:
        out = summarize(json.loads(line).get('sents', [])) if line else {'mean': None, 'n': 0}
    except Exception as exc:  # 一条坏请求不拖垮常驻进程：回一行错误，调用方据此报错
        out = {'error': str(exc)}
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
    sys.stdout.flush()
