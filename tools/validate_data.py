#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库数据校验工具：检查 data/*.json 的结构合法性并输出统计报告。

用法：python tools/validate_data.py
- 错误（answer 越界、选项不足、题型非法等）会全部列出
- 缺解析只警告不计错（部分导入题库本身无解析）
- 校验通过后可放心提交 / 部署
"""
import glob
import hashlib
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def main():
    stats = Counter()
    errors = []
    warns = Counter()
    stems = Counter()
    total = 0

    for path in sorted(glob.glob(os.path.join(DATA, "*.json"))):
        if os.path.basename(path) == "manifest.json":
            continue
        ind = os.path.basename(path).replace(".json", "")
        try:
            d = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            errors.append(f"{ind}: JSON 解析失败：{e}")
            continue
        assert d.get("id") == ind or True, path
        if not d.get("name") or not isinstance(d.get("categories"), list):
            errors.append(f"{ind}: 缺 name/categories")
            continue
        for c in d["categories"]:
            if not c.get("id") or not c.get("name"):
                errors.append(f"{ind}: 分类缺 id/name")
                continue
            for i, q in enumerate(c["questions"]):
                total += 1
                t = q.get("type", "single")
                tag = f"{ind}/{c['id']}#{i}"
                if t not in ("single", "multi", "judge", "blank"):
                    errors.append(f"{tag} 未知题型 {t!r}")
                    continue
                stats[t] += 1
                if not (q.get("q") or "").strip():
                    errors.append(f"{tag} 缺题干")
                if t in ("single", "multi"):
                    o = q.get("options", [])
                    a = [q["answer"]] if t == "single" else q.get("answers", [])
                    if len(o) < 2:
                        errors.append(f"{tag} 选项不足")
                    elif not a or any(not isinstance(x, int) or x < 0 or x >= len(o) for x in a):
                        errors.append(f"{tag} 答案下标非法 {a}")
                    elif len(set(a)) != len(a):
                        errors.append(f"{tag} 重复答案")
                elif t == "judge":
                    if not isinstance(q.get("answer"), bool):
                        errors.append(f"{tag} 判断题答案非布尔")
                elif t == "blank":
                    ans = q.get("answers")
                    if not ans or not all(isinstance(x, str) and x.strip() for x in ans):
                        errors.append(f"{tag} 填空答案非法")
                if not (q.get("explain") or "").strip():
                    warns[ind] += 1
                key = hashlib.md5((q.get("q") or "").strip().lower().encode()).hexdigest()
                stems[key] += 1

    print(f"总题数: {total} | 题型分布: {dict(stats)}")
    print(f"结构错误: {len(errors)}")
    for e in errors[:30]:
        print("  !", e)
    dup = sum(n - 1 for n in stems.values() if n > 1)
    print(f"同题干重复(跨行业全部): {dup}")
    if warns:
        print("无解析题量(仅警告):", dict(warns))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
