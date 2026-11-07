// L0 清洗（v2 §1）：markdown/格式残留在测量前去掉。
// sig 挖掘证实 %（AUC 39.2）、**（31.8）是假签名：它们测的是生成界面的排版，不是文体。

export function cleanText(text) {
  return String(text)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    // sig 挖掘的 U:% 是字符级签名，不分是否挨着数字，一律去掉
    .replace(/%/g, '')
}
