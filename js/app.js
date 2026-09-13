// 行业清单：新增行业时，在 data/ 下新建 <id>.json，并在此登记一行即可
const INDUSTRY_LIST = [
  { id: "dianqi",     icon: "⚡", name: "电气工程",   desc: "电气工程行业" },
  { id: "huagong",    icon: "🧪", name: "化工",       desc: "化工行业" },
  { id: "xinli",      icon: "🧠", name: "心理咨询师", desc: "心理咨询师行业" },
  { id: "jinrong",    icon: "💰", name: "金融",       desc: "金融行业" },
  { id: "xiaofang",   icon: "🚒", name: "消防工程师", desc: "消防工程师行业" },
  { id: "fanyi",      icon: "🌍", name: "翻译",       desc: "翻译行业" },
  { id: "jianzhu",    icon: "🏗️", name: "建筑",       desc: "建筑行业" },
  { id: "jisuanji",   icon: "💻", name: "计算机",     desc: "计算机科学与技术相关考试" },
  { id: "yixue",      icon: "🏥", name: "医学",       desc: "执业医师、护士资格等医学考试" },
  { id: "falv",       icon: "⚖️", name: "法律",       desc: "司法考试、法律职业资格等" },
  { id: "caikuai",    icon: "📊", name: "财会",       desc: "注册会计师、初级/中级会计职称等" },
  { id: "jiaoshi",    icon: "👩‍🏫", name: "教师",      desc: "教师资格证、教师招聘考试等" },
  { id: "gongwuyuan", icon: "🏛️", name: "公务员",    desc: "国考、省考、事业单位等" }
];

async function fetchIndustry(id) {
  const res = await fetch(`data/${id}.json`);
  if (!res.ok) throw new Error(`加载题库失败: ${id}`);
  return res.json();
}

// ---- 共享工具（刷题 / 考试 / 错题本页面共用，先于页面脚本加载）----

const WRONG_KEY = "tiku_wrong_answers";   // {industryId: {catId: [题目ID]}}
const BEST_KEY = "tiku_best_scores";      // {industryId|catId: bestPercent}
const FAV_KEY = "tiku_fav_questions";     // {industryId: {catId: [题目ID]}}
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const TYPE_LABEL = { single: "单选题", multi: "多选题", judge: "判断题", blank: "填空题" };

function getJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function typeOf(q) { return TYPE_LABEL[q.type] ? q.type : "single"; }

// 填空判分前的归一化：去空白、转小写、去中英文标点
function normBlank(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "")
    .replace(/[。，、．,.;；:：!！?？''""（）()·～~—-]/g, "");
}

function answerText(q) {
  const t = typeOf(q);
  if (t === "multi") return q.answers.slice().sort((a, b) => a - b).map(i => LETTERS[i]).join("、");
  if (t === "judge") return q.answer ? "正确" : "错误";
  if (t === "blank") return q.answers.join(" ／ ");
  return LETTERS[q.answer];
}

// 稳定题目 ID：由行业/分类/题干散列生成，与数组位置无关，扩充或重排题库不影响错题本
// 数据里显式写了 "id" 字段的题优先使用（校对修复改题干时可固定 ID，避免记录丢失）
function questionId(indId, catId, q) {
  if (q.id) return String(q.id);
  const s = `${indId}|${catId}|${(q.q || "").trim()}`;
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// 读取记录本；旧版按数组下标（数字）记录的条目在大规模导库后已错位，读取时直接淘汰
function readBook(key) {
  const all = getJSON(key, {});
  let changed = false;
  for (const ind of Object.values(all)) {
    for (const [cat, arr] of Object.entries(ind)) {
      if (!Array.isArray(arr)) { delete ind[cat]; changed = true; continue; }
      const ids = arr.filter(x => typeof x === "string");
      if (ids.length !== arr.length) { ind[cat] = ids; changed = true; }
    }
  }
  if (changed) setJSON(key, all);
  return all;
}

function recordMark(key, indId, catId, qId, on) {
  const all = getJSON(key, {});
  all[indId] = all[indId] || {};
  const arr = new Set((all[indId][catId] || []).filter(x => typeof x === "string"));
  if (on) arr.add(qId); else arr.delete(qId);
  all[indId][catId] = [...arr];
  setJSON(key, all);
}

// 轻量统计清单（由 tools/build_manifest.py 生成）；首页只加载它，不再全量拉取行业题库
let manifestCache = null;
async function fetchManifest() {
  if (manifestCache) return manifestCache;
  try {
    const res = await fetch("data/manifest.json");
    if (res.ok) manifestCache = await res.json();
  } catch (e) { /* 缺失时走兜底 */ }
  return manifestCache;
}

// 首页：渲染行业卡片（优先使用 manifest 统计，manifest 缺失时回退为逐行业加载）
async function renderHome() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  const manifest = await fetchManifest();
  if (manifest && manifest.industries) {
    grid.innerHTML = INDUSTRY_LIST.filter(ind => manifest.industries[ind.id]).map(ind => {
      const m = manifest.industries[ind.id];
      const icon = m.icon || ind.icon, desc = m.desc || ind.desc, name = m.name || ind.name;
      return `
      <a class="card" href="industry.html?id=${ind.id}">
        <div class="icon">${icon}</div>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div class="meta">${m.categories.length} 个分类 · ${m.total} 题</div>
      </a>`;
    }).join("");
    return;
  }
  // 兜底：逐行业加载统计
  const cards = await Promise.all(INDUSTRY_LIST.map(async ind => {
    let cats = 0, nq = 0;
    try {
      const d = await fetchIndustry(ind.id);
      cats = d.categories.length;
      nq = d.categories.reduce((s, c) => s + c.questions.length, 0);
    } catch (e) { /* 文件缺失时忽略 */ }
    return `
      <a class="card" href="industry.html?id=${ind.id}">
        <div class="icon">${ind.icon}</div>
        <h3>${ind.name}</h3>
        <p>${ind.desc}</p>
        <div class="meta">${cats} 个分类 · ${nq} 题</div>
      </a>`;
  }));
  grid.innerHTML = cards.join("");
}

// 行业页：渲染分类列表（行业信息优先取 manifest，仅练习时才加载完整题库）
async function renderIndustry() {
  const list = document.getElementById("cat-list");
  if (!list) return;
  const id = new URLSearchParams(location.search).get("id");
  const meta = INDUSTRY_LIST.find(i => i.id === id);
  if (!meta) { list.innerHTML = `<p class="empty">未找到该行业</p>`; return; }
  document.title = `${meta.name} - 免费题库`;

  const manifest = await fetchManifest();
  const m = manifest && manifest.industries[id];
  const headHTML = `
    <a class="back" href="index.html">← 返回</a> &nbsp; ${m ? (m.icon || meta.icon) : meta.icon} ${m ? (m.name || meta.name) : meta.name}
    &nbsp; <a class="btn ghost" href="exam.html?id=${id}">📝 行业模拟考</a>`;
  document.getElementById("industry-title").innerHTML = headHTML;

  if (m) {
    list.innerHTML = m.categories.map((c, idx) => `
      <div class="cat-item">
        <div>
          <h3>${c.name}</h3>
          <div class="info">共 ${c.count} 题 · 每次随机抽题练习</div>
        </div>
        <div>
          <a class="btn" href="quiz.html?id=${id}&cat=${idx}">随机练习</a>
          ${c.count > 20 ? `<a class="btn ghost" style="margin-left:8px" href="quiz.html?id=${id}&cat=${idx}&n=${c.count}">练全部</a>` : ""}
        </div>
      </div>`).join("");
    return;
  }
  // 兜底：加载完整行业数据
  let data;
  try { data = await fetchIndustry(id); } catch (e) {
    list.innerHTML = `<p class="empty">${e.message}，请通过本地服务器访问（见 README）。</p>`;
    return;
  }
  list.innerHTML = data.categories.map((c, idx) => `
    <div class="cat-item">
      <div>
        <h3>${c.name}</h3>
        <div class="info">共 ${c.questions.length} 题 · 每次随机抽题练习</div>
      </div>
      <div>
        <a class="btn" href="quiz.html?id=${id}&cat=${idx}">随机练习</a>
        ${c.questions.length > 20 ? `<a class="btn ghost" style="margin-left:8px" href="quiz.html?id=${id}&cat=${idx}&n=${c.questions.length}">练全部</a>` : ""}
      </div>
    </div>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  renderHome();
  renderIndustry();
});
