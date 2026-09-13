#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 data/manifest.json：各行业的分类数、题数、知识点标签索引，供首页轻量加载。

用法：python tools/build_manifest.py
- 数据改动后（如运行 tools/build_bank.py 导入新题）需重新执行本脚本
- 首页/导航只加载 manifest（几 KB），不再全量拉取行业 JSON
- 材料题组（type:"group"）按组内题目数计数；tags 聚合到行业级索引
"""
import glob
import json
import os
import datetime
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def iter_questions(questions):
    """遍历分类题目，材料题组展开为组内题"""
    for q in questions:
        if q.get("type") == "group" and isinstance(q.get("questions"), list):
            yield from q["questions"]
        else:
            yield q


manifest = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "total": 0, "industries": {}}

for path in sorted(glob.glob(os.path.join(DATA, "*.json"))):
    name = os.path.basename(path)
    if name == "manifest.json":
        continue
    d = json.load(open(path, encoding="utf-8"))
    ind_id = d.get("id") or name.replace(".json", "")
    cats = []
    tags = Counter()
    total = 0
    for c in d["categories"]:
        qs = list(iter_questions(c["questions"]))
        n = len(qs)
        total += n
        for q in qs:
            for t in (q.get("tags") or []):
                if isinstance(t, str) and t.strip():
                    tags[t.strip()] += 1
        cats.append({"id": c["id"], "name": c["name"], "count": n})
    manifest["industries"][ind_id] = {
        "name": d.get("name", ind_id),
        "icon": d.get("icon", "📘"),
        "desc": d.get("desc", ""),
        "total": total,
        "categories": cats,
        "tags": dict(tags),
    }
    manifest["total"] += total

out = os.path.join(DATA, "manifest.json")
json.dump(manifest, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tag_n = sum(len(v["tags"]) for v in manifest["industries"].values())
print(f"manifest.json 已生成：{manifest['total']} 题，{len(manifest['industries'])} 个行业，"
      f"{tag_n} 个知识点标签，文件大小 {os.path.getsize(out) / 1024:.1f} KB")
