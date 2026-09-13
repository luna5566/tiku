// 学习统计与打卡：按日记账、连续天数、首页概览、行业页分类进度
// 记账入口：statsRecord()（刷题逐题 / 考试逐题）、statsExamDone()（一场考试结束）
// 展示入口：index.html 的 #stats-strip 概览条；industry.html 的分类行迷你进度（自动增强）
const STATS_KEY = "tiku_stats";
// { perCat: {indId:{catId:{qid:最后作答时间}}}, daily: {"YYYY-MM-DD":{answered,correct}}, totals:{answered,correct,exams} }

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statsLoad() {
  return getJSON(STATS_KEY, { perCat: {}, daily: {}, totals: { answered: 0, correct: 0, exams: 0 } });
}

// 记一次作答（ok 为是否答对）；进度按题目 ID 去重，按日次数按作答计
function statsRecord(indId, catId, qId, ok) {
  const s = statsLoad();
  const day = localDate(new Date());
  s.daily[day] = s.daily[day] || { answered: 0, correct: 0 };
  s.daily[day].answered++;
  if (ok) s.daily[day].correct++;
  s.totals.answered++;
  if (ok) s.totals.correct++;
  s.perCat[indId] = s.perCat[indId] || {};
  s.perCat[indId][catId] = s.perCat[indId][catId] || {};
  if (!s.perCat[indId][catId][qId]) s.perCat[indId][catId][qId] = Date.now();
  setJSON(STATS_KEY, s);
}

// 记一场完整考试
function statsExamDone() {
  const s = statsLoad();
  s.totals.exams++;
  setJSON(STATS_KEY, s);
}

// 连续打卡天数：从今天（或昨天）向前数有作答记录的天数
function statsStreak(daily) {
  const done = new Set(Object.keys(daily).filter(d => daily[d].answered > 0));
  if (!done.size) return 0;
  const cursor = new Date();
  if (!done.has(localDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!done.has(localDate(cursor))) return 0;
  }
  let streak = 0;
  while (done.has(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function statsSummary(manifestTotal) {
  const s = statsLoad();
  const today = s.daily[localDate(new Date())] || { answered: 0, correct: 0 };
  let unique = 0;
  for (const ind of Object.values(s.perCat))
    for (const cat of Object.values(ind)) unique += Object.keys(cat).length;
  return {
    today: today.answered,
    todayCorrect: today.correct,
    streak: statsStreak(s.daily),
    totalDays: Object.values(s.daily).filter(x => x.answered > 0).length,
    totalAnswered: s.totals.answered,
    totalExams: s.totals.exams,
    unique,
    total: manifestTotal || 0,
  };
}

// 首页概览条：今日题数 / 连续打卡 / 累计刷题 / 总进度
async function renderStatsStrip() {
  const strip = document.getElementById("stats-strip");
  if (!strip) return;
  const manifest = await fetchManifest();
  const sum = statsSummary(manifest ? manifest.total : 0);
  const pct = sum.total ? Math.min(100, (sum.unique / sum.total) * 100) : 0;
  strip.innerHTML = `
    <div class="wcard"><b>${sum.today}</b><span>今日做题</span></div>
    <div class="wcard"><b>🔥 ${sum.streak}</b><span>连续打卡（天）</span></div>
    <div class="wcard"><b>${sum.totalAnswered}</b><span>累计作答</span></div>
    <div class="wcard"><b>${sum.totalExams}</b><span>模拟考试（场）</span></div>
    <div class="wcard"><b>${pct < 0.1 && pct > 0 ? "<0.1" : pct.toFixed(1)}%</b><span>总进度 ${sum.unique}/${sum.total || "-"}</span></div>`;
  strip.classList.remove("hidden");
}

// 行业页：等分类列表渲染后，为每个分类行补充"已刷 x/y"迷你进度
async function augmentIndustryProgress() {
  const list = document.getElementById("cat-list");
  if (!list) return;
  const indId = new URLSearchParams(location.search).get("id");
  const manifest = await fetchManifest();
  if (!manifest || !manifest.industries[indId]) return;
  const cats = manifest.industries[indId].categories;
  const s = statsLoad();
  const items = list.querySelectorAll(".cat-item");
  items.forEach((item, i) => {
    const cat = cats[i];
    if (!cat || item.querySelector(".mini-progress")) return;
    const done = Object.keys((s.perCat[indId] || {})[cat.id] || {}).length;
    const pct = cat.count ? Math.min(100, (done / cat.count) * 100) : 0;
    const info = item.querySelector(".info");
    if (!info) return;
    info.insertAdjacentHTML("afterend", `
      <div class="done-info">已刷 ${done} / ${cat.count} 题</div>
      <div class="mini-progress"><div style="width:${pct}%"></div></div>`);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderStatsStrip();
  // 行业页分类列表由 app.js 异步渲染，监听其变化后再增强
  const list = document.getElementById("cat-list");
  if (list) {
    const tryAugment = () => {
      if (list.querySelector(".cat-item")) augmentIndustryProgress();
    };
    new MutationObserver(() => tryAugment()).observe(list, { childList: true });
    tryAugment();
  }
});
