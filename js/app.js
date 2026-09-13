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

// 首页：渲染行业卡片
async function renderHome() {
  const grid = document.getElementById("grid");
  if (!grid) return;
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

// 行业页：渲染分类列表
async function renderIndustry() {
  const list = document.getElementById("cat-list");
  if (!list) return;
  const id = new URLSearchParams(location.search).get("id");
  const meta = INDUSTRY_LIST.find(i => i.id === id);
  if (!meta) { list.innerHTML = `<p class="empty">未找到该行业</p>`; return; }
  document.title = `${meta.name} - 免费题库`;
  document.getElementById("industry-title").innerHTML =
    `<a class="back" href="index.html">← 返回</a> &nbsp; ${meta.icon} ${meta.name}`;
  let data;
  try { data = await fetchIndustry(id); } catch (e) {
    list.innerHTML = `<p class="empty">${e.message}，请通过本地服务器访问（见 README）。</p>`;
    return;
  }
  list.innerHTML = data.categories.map((c, idx) => `
    <div class="cat-item">
      <div>
        <h3>${c.name}</h3>
        <div class="info">共 ${c.questions.length} 题 · 每次练习随机排序</div>
      </div>
      <a class="btn" href="quiz.html?id=${id}&cat=${idx}">开始刷题</a>
    </div>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  renderHome();
  renderIndustry();
});
