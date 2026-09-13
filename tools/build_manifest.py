#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 data/manifest.json：各行业的分类数、题数等统计信息，供首页轻量加载。

用法：python tools/build_manifest.py
- 数据改动后（如运行 tools/build_bank.py 导入新题）需重新执行本脚本
- 首页/导航只加载 manifest（几 KB），不再全量拉取行业 JSON
"""
import glob
import json
import os
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

manifest = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "total": 0, "industries": {}}

for path in sorted(glob.glob(os.path.join(DATA, "*.json"))):
    name = os.path.basename(path)
    if name == "manifest.json":
        continue
    d = json.load(open(path, encoding="utf-8"))
    ind_id = d.get("id") or name.replace(".json", "")
    cats = [{"id": c["id"], "name": c["name"], "count": len(c["questions"])} for c in d["categories"]]
    total = sum(c["count"] for c in cats)
    manifest["industries"][ind_id] = {
        "name": d.get("name", ind_id),
        "icon": d.get("icon", "📘"),
        "desc": d.get("desc", ""),
        "total": total,
        "categories": cats,
    }
    manifest["total"] += total

out = os.path.join(DATA, "manifest.json")
json.dump(manifest, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"manifest.json 已生成：{manifest['total']} 题，{len(manifest['industries'])} 个行业，"
      f"文件大小 {os.path.getsize(out) / 1024:.1f} KB")
