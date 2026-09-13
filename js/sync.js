// 云同步：通过 Upstash Redis REST 接口存取"同步码快照"，实现跨设备合并
// 使用模型：设备 A 生成 6 位同步码并推送快照 → 设备 B 绑定同码拉取合并（合并后自动回推，两端收敛）
// 合并策略：错题/收藏按题目 ID 取并集；最佳成绩取最大值；学习统计按日求和、进度按 ID 并集
// REST 地址与令牌填在 SYNC_API；留空时同步功能显示未配置
const SYNC_API = {
  url: "",    // 例：https://xxx.upstash.io
  token: "",  // Upstash REST TOKEN
};
const SYNC_TTL = 60 * 60 * 24 * 365; // 快照保留 1 年（每次推送刷新）
const SYNC_SAFE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混的 I O 0 1 L

function syncConfigured() { return !!(SYNC_API.url && SYNC_API.token); }
function syncCfg() { return getJSON("tiku_sync_cfg", {}); }
function syncSaveCfg(v) { setJSON("tiku_sync_cfg", v); }

function syncGenCode() {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return [...buf].map(n => SYNC_SAFE[n % SYNC_SAFE.length]).join("");
}

async function redis(cmd) {
  const res = await fetch(SYNC_API.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${SYNC_API.token}` },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash 接口错误 ${res.status}`);
  return (await res.json()).result;
}

// 当前设备完整快照（错题/收藏按稳定 ID，天然可并集合并）
function syncSnapshot() {
  return {
    wrong: readBook(WRONG_KEY),
    fav: readBook(FAV_KEY),
    best: getJSON(BEST_KEY, {}),
    stats: getJSON(STATS_KEY, { perCat: {}, daily: {}, totals: { answered: 0, correct: 0, exams: 0 } }),
    updated: Date.now(),
  };
}

function mergeBook(a, b) {
  const out = JSON.parse(JSON.stringify(a || {}));
  for (const [ind, cats] of Object.entries(b || {})) {
    out[ind] = out[ind] || {};
    for (const [cat, arr] of Object.entries(cats || {})) {
      const set = new Set((out[ind][cat] || []).filter(x => typeof x === "string"));
      (arr || []).filter(x => typeof x === "string").forEach(x => set.add(x));
      out[ind][cat] = [...set];
    }
  }
  return out;
}

function mergeBest(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(out[k] ?? -1, v);
  return out;
}

function mergeStats(a, b) {
  const out = JSON.parse(JSON.stringify(a || { perCat: {}, daily: {}, totals: { answered: 0, correct: 0, exams: 0 } }));
  for (const [day, v] of Object.entries(b.daily || {})) {
    out.daily[day] = out.daily[day] || { answered: 0, correct: 0 };
    out.daily[day].answered += v.answered || 0;
    out.daily[day].correct += v.correct || 0;
  }
  for (const [ind, cats] of Object.entries(b.perCat || {})) {
    out.perCat[ind] = out.perCat[ind] || {};
    for (const [cat, qmap] of Object.entries(cats || {})) {
      out.perCat[ind][cat] = out.perCat[ind][cat] || {};
      for (const [qid, ts] of Object.entries(qmap || {}))
        out.perCat[ind][cat][qid] = Math.max(out.perCat[ind][cat][qid] || 0, ts);
    }
  }
  const bt = b.totals || {};
  out.totals.answered = (out.totals.answered || 0) + (bt.answered || 0);
  out.totals.correct = (out.totals.correct || 0) + (bt.correct || 0);
  out.totals.exams = (out.totals.exams || 0) + (bt.exams || 0);
  return out;
}

function mergeSnapshot(local, remote) {
  return {
    wrong: mergeBook(local.wrong, remote.wrong),
    fav: mergeBook(local.fav, remote.fav),
    best: mergeBest(local.best, remote.best),
    stats: mergeStats(local.stats, remote.stats),
    updated: Date.now(),
  };
}

function applySnapshot(s) {
  setJSON(WRONG_KEY, s.wrong || {});
  setJSON(FAV_KEY, s.fav || {});
  setJSON(BEST_KEY, s.best || {});
  setJSON(STATS_KEY, s.stats || { perCat: {}, daily: {}, totals: { answered: 0, correct: 0, exams: 0 } });
}

// ---- UI（渲染到 wrong.html 的 #sync-card）----
function fmtTime(ts) { return ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false }) : "从未"; }

function syncRenderCard() {
  const box = document.getElementById("sync-card");
  if (!box) return;
  if (!syncConfigured()) {
    box.innerHTML = `<div class="sync-row"><b>☁️ 云同步</b><span class="sync-muted">未配置后端（需要 Upstash REST 地址与令牌，见 js/sync.js）</span></div>`;
    return;
  }
  const cfg = syncCfg();
  box.innerHTML = `
    <div class="sync-row"><b>☁️ 云同步</b>
      ${cfg.code ? `<span>同步码 <b class="sync-code">${cfg.code}</b></span>` : `<span class="sync-muted">尚未绑定同步码</span>`}
      <span class="sync-muted">上次推送 ${fmtTime(cfg.lastPush)} · 上次拉取 ${fmtTime(cfg.lastPull)}</span>
    </div>
    <div class="sync-row">
      <button class="btn" id="sync-push">⬆ 推送到云端</button>
      <button class="btn ghost" id="sync-pull">⬇ 从云端拉取合并</button>
      ${cfg.code ? `<button class="btn ghost" id="sync-rebind">换一个同步码</button>` : `<button class="btn ghost" id="sync-bind">绑定已有同步码</button>`}
      <span id="sync-msg" class="sync-muted"></span>
    </div>`;

  $("sync-push").addEventListener("click", syncPush);
  $("sync-pull").addEventListener("click", syncPull);
  const bindBtn = $("sync-bind") || $("sync-rebind");
  bindBtn.addEventListener("click", () => {
    const code = prompt(cfg.code ? "输入要改绑的 6 位同步码（原码云端快照保留 1 年）：" : "输入另一台设备生成的 6 位同步码：");
    if (!code) return;
    const c = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(c)) { alert("同步码格式不对（6 位，不含 I/O/0/1/L）"); return; }
    const cfg = syncCfg(); cfg.code = c; syncSaveCfg(cfg);
    syncRenderCard();
  });

  function $(id) { return document.getElementById(id); }
}

function syncMsg(text) { const el = document.getElementById("sync-msg"); if (el) el.textContent = text; }

async function syncPush() {
  const cfg = syncCfg();
  if (!cfg.code) {
    const code = syncGenCode();
    cfg.code = code; syncSaveCfg(cfg);
    syncRenderCard();
    alert(`已生成同步码：${code}\n请把这个码记下来，在另一台设备上绑定它即可同步。`);
  }
  syncMsg("推送中…");
  try {
    await redis(["SET", `tiku:sync:${cfg.code}`, JSON.stringify(syncSnapshot()), "EX", SYNC_TTL]);
    const cfg = syncCfg(); cfg.lastPush = Date.now(); syncSaveCfg(cfg);
    syncMsg("✅ 已推送到云端");
  } catch (e) { syncMsg("❌ 推送失败：" + e.message); }
}

async function syncPull() {
  const cfg = syncCfg();
  if (!cfg.code) { syncMsg("请先绑定同步码"); return; }
  syncMsg("拉取合并中…");
  try {
    const raw = await redis(["GET", `tiku:sync:${cfg.code}`]);
    if (!raw) { syncMsg("云端没有这个同步码的快照（先在原设备推送一次）"); return; }
    const remote = JSON.parse(raw);
    const merged = mergeSnapshot(syncSnapshot(), remote);
    applySnapshot(merged);
    await redis(["SET", `tiku:sync:${cfg.code}`, JSON.stringify(merged), "EX", SYNC_TTL]);
    const c = syncCfg(); c.lastPull = Date.now(); syncSaveCfg(c);
    syncMsg("✅ 已合并（并回推云端，两端一致）");
    setTimeout(() => location.reload(), 800);
  } catch (e) { syncMsg("❌ 拉取失败：" + e.message); }
}

document.addEventListener("DOMContentLoaded", () => setTimeout(syncRenderCard, 300));
