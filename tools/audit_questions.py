#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
可疑题扫描：用启发式规则从 data/*.json 中找出需要人工复核的题目，输出审计报告。

用法：python tools/audit_questions.py
输出：tools/audit_report.json（可疑题清单）+ 控制台汇总
规则只是"疑似"，最终判定需人工确认（可配合 tools/proofread.html 校对工作台）。
"""
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "tools", "audit_report.json")

LETTERS = "ABCDEFG"
NUM_PREFIX = re.compile(r"^\s*[（(]?\d{1,3}[、.．）)]")
HTML_RE = re.compile(r"<[a-zA-Z/][^>]*>|&nbsp;")
ANSWER_MENTION = re.compile(r"(?:答案[为是为：:]|故选|应选)\s*([A-G])")


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


def audit_question(ind, cat_id, cat_name, material, q, idx):
    """返回该题命中的可疑规则列表；同时给出严重度：high 需人工必查，info 仅供参考"""
    issues = []
    t = q.get("type", "single")
    stem = (q.get("q") or "").strip()
    opts = q.get("options") or []
    explain = (q.get("explain") or "").strip()
    severity = "info"

    if t in ("single", "multi"):
        if len(opts) < 4:
            # 学习强国等源存在大量"判断题归一成二选一"的题，属已知形态，仅提示
            issues.append(f"单多选题只有 {len(opts)} 个选项（若源自判断题可忽略）")
    if t == "multi":
        a = q.get("answers") or []
        if len(a) == 1:
            issues.append("多选题只有 1 个答案（更像单选）")
            severity = "high"
        if len(a) >= len(opts):
            issues.append("多选题答案数等于选项数（确认是否全选题）")
            severity = "high"
    if t == "single":
        m = ANSWER_MENTION.search(explain)
        if m:
            letter = m.group(1)
            if LETTERS.index(letter) != q.get("answer"):
                issues.append(f"解析提到答案 {letter} 但系统答案是 {LETTERS[q.get('answer')]}（导入打乱选项后解析字母未更新？）")
                severity = "high"
    if t == "judge" and explain:
        head = explain[:2]
        if (q.get("answer") is True and head.startswith("错误")) or (q.get("answer") is False and head.startswith("正确")):
            issues.append("判断题解析开头与答案矛盾")
            severity = "high"
    if len(set(opts)) != len(opts):
        issues.append("存在完全相同的选项")
        severity = "high"
    if t in ("single", "multi") and 0 < len(stem) < 10:
        issues.append(f"题干过短（{len(stem)} 字）")
    if len(stem) > 300:
        issues.append(f"题干过长（{len(stem)} 字，疑似材料未拆分）")
    if NUM_PREFIX.match(stem):
        issues.append("题干带残留题号前缀")
    if HTML_RE.search(stem) or any(HTML_RE.search(o or "") for o in opts):
        issues.append("题干/选项残留 HTML 标记")
        severity = "high"
    if t == "blank" and "____" not in stem:
        issues.append("填空题题干没有 ____ 空位标记")
    return issues, severity


def main():
    report = []
    per_ind = defaultdict(Counter)
    answer_dist = defaultdict(Counter)
    total = 0

    for path in sorted(glob.glob(os.path.join(DATA, "*.json"))):
        if os.path.basename(path) == "manifest.json":
            continue
        ind = os.path.basename(path).replace(".json", "")
        d = json.load(open(path, encoding="utf-8"))
        for c in d["categories"]:
            flat = []
            for q in c["questions"]:
                if q.get("type") == "group" and isinstance(q.get("questions"), list):
                    flat.extend((q.get("material") or "", gq) for gq in q["questions"])
                else:
                    flat.append(("", q))
            for material, q in flat:
                total += 1
                if q.get("type") == "single":
                    answer_dist[ind][LETTERS[q.get("answer", 0)]] += 1
                issues, severity = audit_question(ind, c["id"], c["name"], material, q, 0)
                if issues:
                    per_ind[ind][issues[0].split("（")[0]] += 1
                    report.append({
                        "severity": severity,
                        "industry": ind,
                        "category": c["id"],
                        "category_name": c["name"],
                        "qid": question_id(ind, c["id"], material, q.get("q", "")),
                        "type": q.get("type", "single"),
                        "stem": (q.get("q") or "")[:120],
                        "options": q.get("options"),
                        "answer": q.get("answer", q.get("answers")),
                        "issues": issues,
                    })

    high = sum(1 for r in report if r["severity"] == "high")
    print(f"扫描题目总数: {total}")
    print(f"可疑题目: {len(report)} 条（{len(report) / max(total, 1) * 100:.1f}%），其中高危(high) {high} 条")
    for ind, cnt in sorted(per_ind.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"  {ind}: {sum(cnt.values())} 条 | {dict(cnt)}")
    json.dump(report, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"明细已写入 {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
