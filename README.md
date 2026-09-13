# 免费题库（在线刷题网站）

参考主流刷题平台搭建的免费在线刷题网站，深色主题，纯前端实现（HTML/CSS/JS + JSON 题库），零依赖、可直接静态部署。

当前共收录 **26,600+ 道题**（13 个行业 / 60+ 个分类）：单选 20,500+ / 多选 3,000+ / 判断 3,100+ / 填空等其余题型若干。

## 快速开始

题库数据通过 JSON 文件加载，需要通过 HTTP 服务访问（直接双击 index.html 会被浏览器拦截）：

- **方式一**：双击 `start.bat`（需要已安装 Python），自动打开 http://localhost:8080
- **方式二**：命令行执行 `python -m http.server 8080`，浏览器访问 http://localhost:8080
- **线上地址**：https://luna5566.github.io/tiku/
- **部署上线**：整个目录直接上传到 GitHub Pages / Vercel / Cloudflare Pages / 任意静态托管即可。

## 各行业题量（目标：每行业 ≥1000 题）

| 行业 | 题数 | 主要来源 |
|---|---|---|
| 公务员 | 7,985 | 学习强国挑战答题题库（开源仓库 imutum/XXQG_TiKu；部分题目已按关键词分流至其他行业常识分类） |
| 建筑 | 6,675 | 二级建造师题库 + 广东 C3 建筑施工安全考核题库 |
| 医学 | 4,530 | 中医执业医师题库（按 14 个学科分类） |
| 财会 | 1,572 | 中级会计真题·实务/财管（IAT-exam） |
| 电气工程 | 1,480 | 电工进网作业题库（选择 + 判断） |
| 法律 | 1,440 | 法考真题分科题库（MIT）+ 法考客观题 |
| 消防工程师 | 902 | 消防设施操作员（中级）模拟卷 ×4 + 消防常识 |
| 教师 | 728 | 教资综合素质题库 532（sodalevy/ntce_exam）+ 教资三科目（高中物理）+ 教育常识 |
| 计算机 | 668 | NCRE 一级选择题 476（dengcao/ncre）+ 计算机网络章节题库 + 信息科技常识 |
| 金融 | 456 | 期货从业题库 171 + 金融基础常识 |
| 翻译 | 114 | 英语语法时态题库 |
| 心理咨询师 | 68 | 心理健康常识 |
| 化工 | 53 | 化工安全常识 |

> "XX 常识"分类是按关键词从学习强国通用题库分流的通识内容（金融/计算机/心理/化工/教育/消防），用于补充开源渠道没有成规模专业题库的行业。
> 题目均来自公开的开源仓库整理，仅供个人学习交流使用，版权归原作者/整理者所有。

## 功能

- 首页行业卡片导航（读取轻量清单 `data/manifest.json`，无需全量加载题库，秒开）
- 行业页分类列表：随机练习（默认抽 20 题）/ 一键练全部 / 行业模拟考入口
- 支持四种题型：**单选、多选（全对得分）、判断、填空**（填空判分忽略大小写、空格和标点，支持多个同义答案）
- 刷题体验：随机出题、逐题作答、即时判分、答案解析、进度条、**上一题回看**、**键盘快捷键**（1~6 或 A~F 选选项，Enter 确认/下一题，← 上一题）
- **收藏**：题目旁 ☆ 一键收藏，按分类"练收藏"
- **全局错题本**（wrong.html）：跨行业汇总、按分类练习/清空、**错题与成绩一键导出/导入备份**
- **模拟考试**（exam.html）：任选行业整卷抽题、倒计时、答题卡跳题、交卷统一判分、分题型统计与逐题回顾，错题自动入本
- 错题与收藏按**稳定题目 ID** 记录，扩充/重排题库不影响历史记录
- **PWA**：可安装到手机主屏幕，已缓存的题离线可刷
- **学习统计与打卡**：首页展示今日做题、连续打卡天数、累计作答、模拟考试场数与总进度；行业页每个分类显示"已刷 x/y"进度条（`js/stats.js` 本地记录）
- 响应式布局，手机可用；答错的题可一键"报告此题有误"（GitHub Issue）

## 题库扩充工具（tools/build_bank.py）

把抓取的开源题库原始文件放入 `sources/` 目录（已 gitignore），然后运行：

```bash
python -m pip install json5   # 首次需要
python tools/build_bank.py
```

脚本会自动：解析各格式（JSON/CSV/TXT/Markdown/内嵌 JS）→ 清洗（去 HTML、去题号）→ 统一题型（单选/多选/判断/填空）→ 打乱选项 → 同行业去重（已入库旧题优先）→ 幂等合并进 `data/*.json`，并打印各行业统计。

**接入新题库源**：在 `build_bank.py` 中新增一个 `parse_xxx()` 生成器（yield 题目记录）+ 在 `route()` 中登记分类映射即可。

**改完数据后必做**（顺序不限）：

```bash
python tools/validate_data.py    # 全量结构校验（答案越界、题型非法等），有错先修复
python tools/build_manifest.py   # 重新生成 data/manifest.json（首页统计清单）
```

## 题目质量与人工校对

```bash
python tools/audit_questions.py  # 启发式扫描可疑题（解析与答案矛盾、残留标记等），分级输出 tools/audit_report.json
```

- **校对工作台**：浏览器打开 `http://localhost:8080/tools/proofread.html`，选行业后逐题核对（高危复核 / 全部可疑 / 随机抽查三种模式），判定结果存本地，可一键导出 JSON 清单
- **修复管线**：`python tools/fix_question.py --file data/falv.json --cat fkzk --find "题干关键词" --set-answer C --id`，支持改答案/题干/解析/类型、打标签、删题；`--id` 会把当前稳定 ID 写成显式字段，改题干后记录不丢失
- 当前审计基线（2026-09-13）：26,674 题中可疑 7,304 条，其中**高危 705 条**（法考"解析与答案矛盾"约 440 条为最大簇，多为导入时选项打乱后解析字母未更新，需逐条确认）

## 发布注意

修改了 HTML/CSS/JS 后，需把 `sw.js` 里的 `VERSION` 递增一位（如 `tiku-v3` → `tiku-v4`），老用户下次访问才会拿到新缓存；只改题库 JSON 不需要（数据走网络优先策略）。

## 手工新增题目 / 行业

**新增题目**：编辑 `data/<行业id>.json`，在对应分类的 `questions` 数组中追加。支持四种题型：

```jsonc
// 单选题（type 为 "single" 或省略）
{ "type": "single", "q": "题干", "options": ["A", "B", "C", "D"], "answer": 2, "explain": "解析" }

// 多选题（answers 为正确答案下标数组，全部选对才得分）
{ "type": "multi", "q": "题干", "options": ["A", "B", "C", "D"], "answers": [0, 2], "explain": "解析" }

// 判断题（answer 为 true / false）
{ "type": "judge", "q": "题干", "answer": true, "explain": "解析" }

// 填空题（answers 为可接受的答案列表，判分忽略大小写与标点）
{ "type": "blank", "q": "题干____空位", "answers": ["答案1", "答案2"], "explain": "解析" }
```

> 注意：`answer` / `answers` 填的是选项**下标**（0=A）。选项顺序无关，程序不要求正确答案固定在某个位置。

**新增分类**：在同一 JSON 的 `categories` 数组中追加 `{ "id": "xxx", "name": "分类名", "questions": [...] }`。

**新增行业**：
1. 新建 `data/<行业id>.json`（含 `id`、`name`、`icon`、`desc`、`categories`）；
2. 在 `js/app.js` 的 `INDUSTRY_LIST` 中登记一行即可，首页自动显示。

## 部署上线

纯静态站点，任选其一：

- **GitHub Pages**：将仓库推送到 GitHub 后，进入仓库 Settings → Pages → Source 选择 `main` 分支 `/ (root)`，保存即可获得 `https://<用户名>.github.io/tiku/`。
- **Vercel / Cloudflare Pages / Netlify**：导入仓库，无需任何构建配置，直接以根目录作为静态站点发布。

## 目录结构

```
tiku/
├── index.html         # 首页（行业导航）
├── industry.html      # 行业分类页
├── quiz.html          # 刷题页（四种题型、收藏、错题、键盘操作）
├── exam.html          # 模拟考试（计时、答题卡、成绩单）
├── wrong.html         # 全局错题本（跨行业汇总、备份导出/导入）
├── css/style.css      # 深色主题样式
├── js/app.js          # 首页/行业页逻辑 + 行业清单
├── js/quiz.js         # 刷题：判分、抽题、收藏、错题（稳定题目 ID）
├── js/exam.js         # 模拟考试逻辑
├── js/wrong.js        # 错题本逻辑
├── sw.js / manifest.webmanifest / icons/  # PWA（离线缓存、安装到主屏）
├── data/*.json        # 各行业题库（25,600+ 题）+ manifest.json 统计清单
├── tools/             # build_bank.py 导入 / validate_data.py 校验 / build_manifest.py 清单
├── sources/           # 原始题库文件（gitignore，仅本地）
└── start.bat          # 一键启动本地服务器
```
