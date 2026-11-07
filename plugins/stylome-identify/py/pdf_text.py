# PDF 正文抽取（面板与命令行共用的 .pdf 入口）。
#
#   python -I py/pdf_text.py <文件>
#
# 输出一行 JSON：{"ok": true, "text": "...", "engine": "pymupdf"}；
# 失败时 {"ok": false, "error": "..."}。优先 PyMuPDF（对中文 CID 字体最稳），
# 退到 pypdf，再退到 pdfminer.six；三者都不在时报告缺依赖。

import json
import sys

# Windows 控制台缺省 GBK：强制 UTF-8，避免正文里的 \xa0 等字符让输出崩溃。
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def try_pymupdf(path):
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    try:
        parts = [page.get_text("text") for page in doc]
    finally:
        doc.close()
    return "\n".join(parts), "pymupdf"


def try_pypdf(path):
    from pypdf import PdfReader

    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages), "pypdf"


def try_pdfminer(path):
    from pdfminer.high_level import extract_text

    return extract_text(path), "pdfminer"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "用法：pdf_text.py <文件>"}, ensure_ascii=False))
        return
    path = sys.argv[1]
    errors = []
    for engine in (try_pymupdf, try_pypdf, try_pdfminer):
        try:
            text, name = engine(path)
        except Exception as exc:  # 缺依赖或解析失败都换下一个引擎
            errors.append("%s: %s" % (engine.__name__, str(exc)[:200]))
            continue
        if text and text.strip():
            print(json.dumps({"ok": True, "text": text, "engine": name}, ensure_ascii=False))
            return
        errors.append("%s: 没有抽出文字（可能是扫描版）" % engine.__name__)
    print(json.dumps({"ok": False, "error": "；".join(errors) or "未知错误"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
