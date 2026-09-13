// 全局错题本：汇总所有行业/分类的错题，支持练习、清空、导出/导入备份
// 共享工具（存储键、记录读写等）定义在 js/app.js；记录兼容稳定 ID（字符串）与旧版下标（数字）
function wrongCount(arr) { return Array.isArray(arr) ? arr.length : 0; }

async function loadManifest() {
  try {
    const res = await fetch("data/manifest.json");
    if (res.ok) return await res.json();
  } catch (e) { /* 离线或文件缺失时走兜底 */ }
  return null;
}

// 兜底方案：manifest 拿不到时，用 app.js 的 INDUSTRY_LIST + 错题记录里的原始分类 id 渲染
function fallbackRows(wrong) {
  const rows = [];
  for (const ind of (window.INDUSTRY_LIST || [])) {
    const cats = wrong[ind.id] || {};
    for (const [catId, arr] of Object.entries(cats)) {
      if (wrongCount(arr)) rows.push({ indId: ind.id, indName: `${ind.icon} ${ind.name}`, catId, catName: catId, count: wrongCount(arr) });
    }
  }
  return rows;
}

function render(rows, total) {
  document.getElementById("summary").innerHTML = `
    <div class="wrong-summary-cards">
      <div class="wcard"><b>${total}</b><span>累计错题</span></div>
      <div class="wcard"><b>${new Set(rows.map(r => r.indId)).size}</b><span>涉及行业</span></div>
      <div class="wcard"><b>${rows.length}</b><span>涉及分类</span></div>
    </div>
    <div class="wrong-tools">
      <button class="btn ghost" id="export-btn">⬇ 导出备份</button>
      <button class="btn ghost" id="import-btn">⬆ 导入备份</button>
      <input type="file" id="import-file" accept="application/json" class="hidden">
      <button class="btn ghost danger" id="clear-all-btn">🗑 清空全部错题</button>
    </div>`;

  const list = document.getElementById("wrong-list");
  if (!rows.length) {
    list.innerHTML = `<div class="result"><h2>🎉 暂无错题记录</h2>
      <p style="color:var(--muted);margin:12px 0">去首页挑个行业开始刷题吧，答错的题会自动收进这里。</p>
      <a class="btn" href="index.html">去刷题</a></div>`;
    return;
  }
  // 按行业分组渲染
  const byInd = new Map();
  for (const r of rows) {
    if (!byInd.has(r.indId)) byInd.set(r.indId, { indName: r.indName, cats: [] });
    byInd.get(r.indId).cats.push(r);
  }
  list.innerHTML = [...byInd.entries()].map(([indId, g]) => `
    <div class="wrong-ind">
      <h3>${g.indName}</h3>
      ${g.cats.map(r => `
        <div class="cat-item">
          <div><h3>${r.catName}</h3><div class="info">错题 ${r.count} 题</div></div>
          <div>
            ${r.catIdx !== undefined ? `<a class="btn" href="quiz.html?id=${indId}&cat=${r.catIdx}&wrong=1">练习错题</a>` : ""}
            <button class="btn ghost danger" data-clear="${indId}|${r.catId}">清空</button>
          </div>
        </div>`).join("")}
    </div>`).join("");

  list.querySelectorAll("[data-clear]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [indId, catId] = btn.dataset.clear.split("|");
      if (!confirm(`确定清空该分类的错题记录吗？`)) return;
      const wrong = getJSON(WRONG_KEY, {});
      if (wrong[indId]) { delete wrong[indId][catId]; if (!Object.keys(wrong[indId]).length) delete wrong[indId]; }
      setJSON(WRONG_KEY, wrong);
      init();
    });
  });

  document.getElementById("export-btn").addEventListener("click", exportBackup);
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", importBackup);
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    if (!confirm("确定清空全部错题记录吗？此操作不可恢复（建议先导出备份）。")) return;
    setJSON(WRONG_KEY, {});
    init();
  });
}

function exportBackup() {
  const payload = {
    app: "tiku", version: 1,
    exported: new Date().toISOString(),
    wrong: getJSON(WRONG_KEY, {}),
    best: getJSON(BEST_KEY, {}),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tiku-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || !("wrong" in data)) throw new Error("不是有效的题库备份文件");
      const wN = Object.values(data.wrong || {}).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + wrongCount(b), 0), 0);
      if (!confirm(`导入备份：${wN} 条错题记录${data.best ? "及最佳成绩" : ""}。\n将覆盖当前本地记录，确定继续吗？`)) return;
      setJSON(WRONG_KEY, data.wrong || {});
      if (data.best) setJSON(BEST_KEY, data.best);
      init();
    } catch (e) {
      alert("导入失败：" + e.message);
    }
  };
  reader.readAsText(file, "utf-8");
  ev.target.value = "";
}

async function init() {
  const wrong = getJSON(WRONG_KEY, {});
  const manifest = await loadManifest();
  let rows = [];
  if (manifest) {
    for (const [indId, ind] of Object.entries(manifest.industries)) {
      const cats = wrong[indId] || {};
      for (const [catId, arr] of Object.entries(cats)) {
        const n = wrongCount(arr);
        if (!n) continue;
        const meta = ind.categories.find(c => c.id === catId);
        rows.push({
          indId, indName: `${ind.icon} ${ind.name}`,
          catId, catName: meta ? meta.name : catId,
          catIdx: meta ? ind.categories.indexOf(meta) : 0,
          count: n,
        });
      }
    }
  }
  if (!rows.length) rows = fallbackRows(wrong);
  const total = rows.reduce((s, r) => s + r.count, 0);
  render(rows, total);
}

document.addEventListener("DOMContentLoaded", init);
