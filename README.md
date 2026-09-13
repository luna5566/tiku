# 免费题库（在线刷题网站）

参考主流刷题平台搭建的免费在线刷题网站，深色主题，纯前端实现（HTML/CSS/JS + JSON 题库），零依赖、可直接静态部署。

当前共收录 **431 道题**：单选 235 / 多选 78 / 判断 79 / 填空 39。

## 快速开始

题库数据通过 JSON 文件加载，需要通过 HTTP 服务访问（直接双击 index.html 会被浏览器拦截）：

- **方式一**：双击 `start.bat`（需要已安装 Python），自动打开 http://localhost:8080
- **方式二**：命令行执行 `python -m http.server 8080`，浏览器访问 http://localhost:8080
- **部署上线**：整个目录直接上传到 GitHub Pages / Vercel / Cloudflare Pages / 任意静态托管即可。

## 已收录行业（13 个，39 个分类）

电气工程、化工、心理咨询师、金融、消防工程师、翻译、建筑、计算机、医学、法律、财会、教师、公务员。

每个行业 3 个分类，每个分类约 10~12 道题，四种题型混合。题目为示例题库，可持续扩充。

## 功能

- 首页行业卡片导航（含分类数、题数统计）
- 行业页展示科目分类列表
- 支持四种题型：**单选、多选、判断、填空**（填空判分忽略大小写、空格和标点，支持多个同义答案）
- 刷题页：随机出题顺序、逐题作答、即时判分、答案解析、进度条
- 交卷后显示正确率、历史最佳成绩（localStorage）
- 错题自动记录，支持"只练错题"模式，答对后自动移出错题本
- 响应式布局，手机可用

## 如何新增题目 / 行业

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
├── index.html       # 首页（行业导航）
├── industry.html    # 行业分类页
├── quiz.html        # 刷题页
├── css/style.css    # 深色主题样式
├── js/app.js        # 首页/行业页逻辑 + 行业清单
├── js/quiz.js       # 四种题型的渲染、判分、错题记录
├── data/*.json      # 各行业题库（13 个行业 / 431 题）
└── start.bat        # 一键启动本地服务器
```
