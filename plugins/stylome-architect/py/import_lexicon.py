#!/usr/bin/env python3
# 大工《情感词汇本体》附件 → UTF-8 CSV。
#
# 只做格式转换，不改词条内容：官方附件是 zip（内含 xls/xlsx/csv），
# 这里解包、读第一张有数据的表、按原列序写出 CSV，供 server/lexicon.mjs 的解析器读取。
# 不依赖 pandas：xlsx 用 openpyxl、xls 用 xlrd、csv/txt 直接按常见中文编码解码。
#
# 用法：python import_lexicon.py <下载到的附件路径> <输出 CSV 路径>
# 成功时向 stdout 打一行 JSON：{"rows": N, "cols": M, "source": "<内部文件>"}；失败非零退出并写 stderr。

import sys
import os
import csv
import json
import zipfile
import tempfile

DATA_EXT = ('.xls', '.xlsx', '.csv', '.txt')


def fail(msg):
    sys.stderr.write(str(msg))
    sys.exit(1)


def decode_bytes(b):
    for enc in ('utf-8-sig', 'utf-8', 'gb18030', 'gbk'):
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode('gb18030', 'ignore')


def clean(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def rows_from_xlsx(path):
    try:
        from openpyxl import load_workbook
    except Exception as e:
        fail('未安装 openpyxl，无法读取 xlsx（%s）——请转存为 CSV 后重试' % e)
    wb = load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        rows = [[clean(c) for c in r] for r in ws.iter_rows(values_only=True)]
        if sum(1 for r in rows if any(r)) > 100:
            return rows
    return []


def rows_from_xls(path):
    try:
        import xlrd
    except Exception as e:
        fail('未安装 xlrd，无法读取 xls（%s）——请转存为 CSV 后重试' % e)
    try:
        book = xlrd.open_workbook(path)
    except Exception as e:
        fail('xls 读取失败：%s' % e)
    for sh in book.sheets():
        rows = [[clean(sh.cell_value(i, j)) for j in range(sh.ncols)] for i in range(sh.nrows)]
        if sum(1 for r in rows if any(r)) > 100:
            return rows
    return []


def rows_from_csv(path):
    text = decode_bytes(open(path, 'rb').read())
    delim = '\t' if (text.count('\t') > text.count(',') and text.count('\t') > 100) else ','
    return [[c.strip() for c in line.split(delim)] for line in text.splitlines()]


def sniff(path):
    with open(path, 'rb') as f:
        head = f.read(8)
    if head[:4] == b'PK\x03\x04':
        return 'zip'
    if head[:4] == b'\xd0\xcf\x11\xe0':
        return 'ole'
    return 'text'


def collect(path):
    """按内容嗅探而不是按扩展名分派：官方附件可能被下载成 .bin 或无扩展名。"""
    kind = sniff(path)
    if kind == 'zip':
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            if any(n.lower().endswith('xl/workbook.xml') for n in names):  # 本身就是 xlsx
                return rows_from_xlsx(path)
            data = [n for n in names if n.lower().endswith(DATA_EXT)]
            if not data:
                fail('附件 zip 里没有 xls/xlsx/csv（%s）' % ', '.join(names[:6]))
            tmpdir = tempfile.mkdtemp(prefix='stylome-lexicon-')
            z.extract(data[0], tmpdir)
            return collect(os.path.join(tmpdir, data[0]))
    if kind == 'ole':
        # xls（BIFF）与 mdb 都是 OLE 容器：先按 xls 读，读不了再明确报错
        try:
            return rows_from_xls(path)
        except SystemExit:
            raise
        except Exception as e:
            fail('附件是 OLE 容器但不是可读的 xls（%s）——若为 .mdb，请转存为 CSV 后再试' % e)
    return rows_from_csv(path)


def main():
    if len(sys.argv) < 3:
        fail('用法：python import_lexicon.py <附件路径> <输出 CSV>')
    src, dest = sys.argv[1], sys.argv[2]
    rows = collect(src)
    rows = [r for r in rows if any(c for c in r)]
    if len(rows) < 20000:
        fail('只读出 %d 行（预期约 27466）——附件可能不完整或不是词典表' % len(rows))
    cols = max(len(r) for r in rows)
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    with open(dest, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        for r in rows:
            w.writerow(r)
    sys.stdout.write(json.dumps({'rows': len(rows), 'cols': cols, 'source': os.path.basename(src)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
