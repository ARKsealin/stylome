# 分词与词性标注服务。从 stdin 逐行读文本，向 stdout 逐行写 JSON。
# 每行输入一个文本；每行输出 {"tokens": [{"w": 词, "p": 词性, "f": 词频}, ...]}。
# f 是 jieba 词典里的词频（不在词典里为 0），词汇复杂度按它计算（设计第 4 节）。
# 空行输出空 tokens。stderr 只用于 jieba 的加载信息，不混进数据。
import json
import sys

import jieba
import jieba.posseg as posseg

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
jieba.dt.initialize()
FREQ = jieba.dt.FREQ

for line in sys.stdin:
    text = line.rstrip('\n')
    tokens = [{'w': t.word, 'p': t.flag, 'f': FREQ.get(t.word, 0)} for t in posseg.cut(text)] if text else []
    sys.stdout.write(json.dumps({'tokens': tokens}, ensure_ascii=False) + '\n')
    sys.stdout.flush()
