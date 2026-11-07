// L0 清洗：markdown / 格式残留在测量前去掉。
// 理由：`**`、行首 `>`、`%` 这类字符测的是排版工具与生成界面，不是文体；
// 它们会让同一段文字的「标点密度」「句长」随导出格式漂移。

export function cleanText(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/%/g, '')
}
