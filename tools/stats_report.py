#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
站长统计报表：从 Upstash 读取匿名答题埋点，输出全站使用情况与错误率排行。

用法：python tools/stats_report.py [天数]
（默认看最近 14 天趋势；凭据自动从 js/sync.js 的 SYNC_API 读取）

数据均来自匿名设备埋点，不含任何个人信息。
"""
import glob
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_questions import question_id  # noqa: E402  与站点 JS 同构的稳定 ID 算法


def load_api():
    src = open(os.path.join(ROOT, "js", "sync.js"), encoding="utf-8").read()
    url = re.search(r'url:\s*"([^"]+)"', src)
    token = re.search(r'token:\s*"([^"]+)"', src)
    if not url or not token or not url.group(1):
        raise SystemExit("js/sync.js 的 SYNC_API 未配置")
    return url.group(1), token.group(1)


def redis(url, token, cmd):
    req = urllib.request.Request(
        url, data=json.dumps(cmd).encode(),
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)["result"]


def build_stem_map():
    """qid -> (行业, 分类名, 题干)，用于报表里的可读名称"""
    m = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.json"))):
        if os.path.basename(path) == "manifest.json":
            continue
        ind = os.path.basename(path).replace(".json", "")
        d = json.load(open(path, encoding="utf-8"))
        for c in d["categories"]:
            for q in c["questions"]:
                if q.get("type") == "group" and isinstance(q.get("questions"), list):
                    mat = q.get("material") or ""
                    for gq in q["questions"]:
                        m[question_id(ind, c["id"], mat, gq.get("q", ""))] = (ind, c["name"], gq.get("q", ""))
                else:
                    m[question_id(ind, c["id"], "", q.get("q", ""))] = (ind, c["name"], q.get("q", ""))
    return m


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    url, token = load_api()
    stems = build_stem_map()

    flat = redis(url, token, ["HGETALL", "tiku:qstats"]) or []
    qstats = {flat[i]: int(flat[i + 1]) for i in range(0, len(flat), 2)}
    devices = redis(url, token, ["SCARD", "tiku:devs"]) or 0

    agg = defaultdict(lambda: {"ok": 0, "bad": 0})
    for field, n in qstats.items():
        qid, _, mark = field.rpartition(":")
        agg[qid][mark] += n

    total_ok = sum(v["ok"] for v in agg.values())
    total_bad = sum(v["bad"] for v in agg.values())
    total_ans = total_ok + total_bad

    print("=" * 52)
    print(f"免费题库 · 全站使用报表（匿名埋点）")
    print("=" * 52)
    print(f"累计设备数: {devices}")
    print(f"累计作答: {total_ans} 题 | 答对 {total_ok} | 答错 {total_bad} | 全站正确率 {round(total_ok / max(total_ans, 1) * 100)}%")

    print("-" * 52)
    print("近 {} 天日活与作答量:".format(days))
    today = date.today()
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        dau = redis(url, token, ["SCARD", f"tiku:dau:{d}"]) or 0
        dh = redis(url, token, ["HGETALL", f"tiku:daily:{d}"]) or {}
        daily = {dh[i]: int(dh[i + 1]) for i in range(0, len(dh), 2)}
        a, c = daily.get("answered", 0) + daily.get("correct", 0), daily.get("correct", 0)
        bar = "█" * min(30, a)
        print(f"  {d}  日活 {dau:>3}  作答 {a:>4}  答对 {c:>4}  {bar}")

    rows = []
    for qid, v in agg.items():
        n = v["ok"] + v["bad"]
        if n >= 3 and v["bad"]:
            info = stems.get(qid)
            rows.append((v["bad"] / n, n, info, qid))
    rows.sort(reverse=True)
    print("-" * 52)
    print("错误率最高题目 Top 15（作答 ≥3 次）:")
    for rate, n, info, qid in rows[:15]:
        if info:
            ind, cat, stem = info
            print(f"  [{rate * 100:>5.1f}%] {n:>3} 次 | {ind}/{cat} | {stem[:44]}")
        else:
            print(f"  [{rate * 100:>5.1f}%] {n:>3} 次 | (题库中已不存在) qid={qid}")

    by_ind = defaultdict(lambda: [0, 0])
    for qid, v in agg.items():
        info = stems.get(qid)
        if not info:
            continue
        by_ind[info[0]][0] += v["ok"]
        by_ind[info[0]][1] += v["bad"]
    if by_ind:
        print("-" * 52)
        print("各行业作答量:")
        for ind, (ok, bad) in sorted(by_ind.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
            print(f"  {ind:12s} 作答 {ok + bad:>5} | 正确率 {round(ok / max(ok + bad, 1) * 100)}%")


if __name__ == "__main__":
    main()
