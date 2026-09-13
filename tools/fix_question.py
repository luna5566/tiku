#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题目修复管线：按题干关键词定位题目并应用修改（配合校对工作台的导出清单使用）。

用法示例：
  # 查找（只列出匹配题，不做修改）
  python tools/fix_question.py --file data/falv.json --find "债的保全" --cat fkzk

  # 修改答案（单选字母 / 判断"对|错|true|false" / 多选"A,C"），同时固定显式 id 防止改题干后错位
  python tools/fix_question.py --file data/falv.json --find "债的保全" --set-answer C --id

  # 修改题干 / 解析 / 类型 / 打标签 / 删除
  python tools/fix_question.py --file data/falv.json --find "..." --set-stem "新题干"
  python tools/fix_question.py --file data/falv.json --find "..." --set-explain "新解析"
  python tools/fix_question.py --file data/falv.json --find "..." --set-type multi
  python tools/fix_question.py --file data/falv.json --find "..." --add-tag "法考真题"
  python tools/fix_question.py --file data/falv.json --find "..." --delete

多个匹配时用 --index N 选择第 N 个（从 0 开始）。改完请运行：
  python tools/validate_data.py && python tools/build_manifest.py
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LETTERS = "ABCDEFG"


def b36(n):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out


def question_id(ind, cat, material, stem):
    # 与 js/app.js questionId 完全同构（32 位双散列 + base36），两端可互相比对
    s = f"{ind}|{cat}|{(material.strip() + '|') if material.strip() else ''}{stem.strip()}"
    h1, h2 = 0x811C9DC5, 0x1000193
    for i, ch in enumerate(s):
        c = ord(ch)
        h1 = ((h1 ^ c) * 16777619) & 0xFFFFFFFF
        h2 = ((h2 ^ (c + i)) * 2246822519) & 0xFFFFFFFF
    return b36(h1) + b36(h2)


def iter_with_meta(questions):
    """产出 (宿主列表引用, 下标, material, 题目) —— 组内题也覆盖"""
    for i, q in enumerate(questions):
        if q.get("type") == "group" and isinstance(q.get("questions"), list):
            for j, gq in enumerate(q["questions"]):
                yield q["questions"], j, q.get("material") or "", gq
        else:
            yield questions, i, "", q


def parse_answer(t, val, n_opts):
    val = val.strip()
    if t == "judge":
        return {"对": True, "正确": True, "true": True, "√": True,
                "错": False, "错误": False, "false": False, "×": False}[val.lower() if val.lower() in ("true", "false") else val]
    if t == "multi":
        idx = sorted({LETTERS.index(x.strip().upper()) for x in val.split(",") if x.strip()})
        if len(idx) < 2:
            raise SystemExit("多选题至少需要两个答案字母，如：A,C")
        return idx
    return LETTERS.index(val.strip().upper())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="data/xxx.json")
    ap.add_argument("--find", required=True, help="题干包含的关键词")
    ap.add_argument("--cat", help="限定分类 id")
    ap.add_argument("--index", type=int, default=0, help="多个匹配时选择第 N 个")
    ap.add_argument("--set-answer", dest="set_answer")
    ap.add_argument("--set-stem", dest="set_stem")
    ap.add_argument("--set-explain", dest="set_explain")
    ap.add_argument("--set-type", dest="set_type", choices=["single", "multi", "judge", "blank"])
    ap.add_argument("--add-tag", dest="add_tag")
    ap.add_argument("--delete", action="store_true")
    ap.add_argument("--id", action="store_true", help="写入显式 id 字段，固定稳定 ID（改题干前建议先加）")
    ap.add_argument("--yes", action="store_true", help="跳过确认")
    args = ap.parse_args()

    path = os.path.join(ROOT, args.file)
    d = json.load(open(path, encoding="utf-8"))
    ind = d.get("id") or os.path.basename(args.file).replace(".json", "")

    matches = []
    for c in d["categories"]:
        if args.cat and c["id"] != args.cat:
            continue
        for host, i, material, q in iter_with_meta(c["questions"]):
            if args.find in (q.get("q") or ""):
                matches.append((c, host, i, material, q))

    if not matches:
        print("没有匹配的题目。")
        return 1
    if args.index >= len(matches):
        print(f"--index {args.index} 超出范围，共 {len(matches)} 个匹配。")
        return 1
    c, host, i, material, q = matches[args.index]

    print(f"定位到 {len(matches)} 个匹配，操作第 {args.index} 个：")
    print(f"  行业/分类: {ind}/{c['id']}（{c['name']}）")
    print(f"  类型: {q.get('type', 'single')} | 题干: {(q.get('q') or '')[:80]}")
    print(f"  当前答案: {json.dumps(q.get('answer', q.get('answers')), ensure_ascii=False)}")

    if not args.yes:
        r = input("确认修改？[y/N] ").strip().lower()
        if r != "y":
            print("已取消。")
            return 0

    changed = []
    t = args.set_type or q.get("type", "single")
    if args.id and not q.get("id"):
        q["id"] = question_id(ind, c["id"], material, q.get("q", ""))
        changed.append(f"固定显式 id={q['id']}")
    if args.set_type:
        q["type"] = t
        changed.append(f"type={t}")
    if args.set_answer:
        q.pop("answer", None)
        q.pop("answers", None)
        val = parse_answer(t, args.set_answer, len(q.get("options") or []))
        if t == "multi":
            q["answers"] = val
        else:
            q["answer"] = val
        changed.append(f"答案={args.set_answer}")
    if args.set_stem:
        q["q"] = args.set_stem
        changed.append("题干已替换")
    if args.set_explain:
        q["explain"] = args.set_explain
        changed.append("解析已替换")
    if args.add_tag:
        tags = q.get("tags") or []
        if args.add_tag not in tags:
            tags.append(args.add_tag)
        q["tags"] = tags
        changed.append(f"标签+{args.add_tag}")
    if args.delete:
        host.pop(i)
        changed.append("已删除该题")

    if not changed:
        print("未指定任何修改动作（--set-answer/--set-stem/--set-explain/--set-type/--add-tag/--delete）。")
        return 1

    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("已应用：", "；".join(changed))
    print("请随后运行：python tools/validate_data.py && python tools/build_manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
