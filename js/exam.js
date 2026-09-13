// 模拟考试：整卷抽题、倒计时、答题卡跳转、交卷统一判分、成绩单与错题回顾
// 共享工具（存储键、题型、稳定 ID、记录读写等）定义在 js/app.js
const EXAM_ROOT_ID = "exam-root";

const exam = { ind: null, data: null, questions: [], answers: [], current: 0, minutes: 30, endAt: 0, timer: null, submitted: false };

async function loadManifest() {
  try {
    const res = await fetch("data/manifest.json");
    if (res.ok) return await res.json();
  } catch (e) { /* 走兜底 */ }
  return null;
}

function questionBodyHTML(q, prefix) {
  const t = typeOf(q);
  if (t === "judge") return `
    <button class="option ${prefix}0" data-i="0"><span class="prefix">√</span>正确</button>
    <button class="option ${prefix}1" data-i="1"><span class="prefix">×</span>错误</button>`;
  if (t === "blank") return `<input class="blank-input exam-blank" type="text" placeholder="请输入答案" autocomplete="off">`;
  return q.options.map((opt, i) => `
    <button class="option" data-i="${i}"><span class="prefix">${LETTERS[i]}.</span>${opt}</button>`).join("");
}

// ---------- 开始设置页 ----------
async function renderStart() {
  const root = document.getElementById(EXAM_ROOT_ID);
  const manifest = await loadManifest();
  const inds = manifest ? Object.entries(manifest.industries) : (window.INDUSTRY_LIST || []).map(i => [i.id, { name: i.name, icon: i.icon, total: "?" }]);
  root.innerHTML = `
    <div class="exam-start">
      <h2 class="section-title">📝 模拟考试</h2>
      <p style="color:var(--muted);margin-bottom:18px">从所选行业随机抽取整卷题目，统一计时、交卷后评分。多选题需全部选对方可得分。</p>
      <div class="exam-form">
        <label>选择行业
          <select id="exam-ind">${inds.map(([id, m]) => `<option value="${id}">${m.icon || ""} ${m.name}${m.total !== "?" ? `（${m.total} 题）` : ""}</option>`).join("")}</select>
        </label>
        <label>题目数量
          <select id="exam-n">${[10, 20, 30, 50, 100].map(n => `<option value="${n}" ${n === 30 ? "selected" : ""}>${n} 题</option>`).join("")}</select>
        </label>
        <label>考试时长
          <select id="exam-min">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${m === 45 ? "selected" : ""}>${m} 分钟</option>`).join("")}</select>
        </label>
        <button class="btn" id="exam-go">开始考试</button>
      </div>
    </div>`;
  document.getElementById("exam-go").addEventListener("click", () => {
    startExam(document.getElementById("exam-ind").value,
      +document.getElementById("exam-n").value,
      +document.getElementById("exam-min").value);
  });
}

async function startExam(indId, n, minutes) {
  const root = document.getElementById(EXAM_ROOT_ID);
  root.innerHTML = `<p class="empty">正在加载题库并抽卷…（行业题库较大，首次加载需要几秒）</p>`;
  let data;
  try {
    const res = await fetch(`data/${indId}.json`);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    root.innerHTML = `<p class="empty">题库加载失败，请通过本地服务器或线上站点访问。</p>`;
    return;
  }
  const pool = [];
  data.categories.forEach((c, ci) => expandQuestions(c).forEach(q => pool.push({
    ...q, _catId: c.id, _catName: c.name, _catIdx: ci,
  })));
  // 洗牌后抽 n 题
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  exam.ind = data;
  exam.indId = indId;
  exam.questions = pool.slice(0, Math.min(n, pool.length));
  exam.answers = new Array(exam.questions.length).fill(null);
  exam.multiSel = exam.questions.map(q => typeOf(q) === "multi" ? new Set() : null);
  exam.current = 0;
  exam.minutes = minutes;
  exam.submitted = false;
  exam.endAt = Date.now() + minutes * 60000;
  renderExamQuestion();
  exam.timer = setInterval(tick, 500);
  tick();
}

// ---------- 考试进行中 ----------
function renderExamQuestion() {
  const root = document.getElementById(EXAM_ROOT_ID);
  const i = exam.current, q = exam.questions[i];
  const answered = exam.answers.filter(a => a !== null && a !== undefined && a !== "").length;
  const prefix = "pick";
  root.innerHTML = `
    <div class="exam-bar">
      <span>📝 ${exam.ind.name} 模拟卷 · ${exam.questions.length} 题</span>
      <span class="exam-timer" id="exam-timer"></span>
      <span>已答 ${answered} / ${exam.questions.length}</span>
    </div>
    <div class="question">
      <span class="q-tag">第 ${i + 1} 题 · ${TYPE_LABEL[typeOf(q)]} · ${q._catName}</span>
      ${materialHTML(q._material)}
      <div class="q-text">${q.q}</div>
      ${questionBodyHTML(q, prefix)}
    </div>
    <div class="palette" id="palette">${exam.questions.map((_, k) =>
      `<button class="pcell ${k === i ? "current" : ""} ${exam.answers[k] !== null && exam.answers[k] !== undefined && exam.answers[k] !== "" ? "done" : ""}" data-k="${k}">${k + 1}</button>`).join("")}</div>
    <div class="quiz-actions">
      <button class="btn ghost" id="prev-btn" ${i === 0 ? "disabled" : ""}>← 上一题</button>
      <button class="btn ghost danger" id="handin-btn">交卷</button>
      ${i === exam.questions.length - 1
        ? `<button class="btn" id="handin-last">交卷并查看成绩</button>`
        : `<button class="btn" id="next-btn">下一题 →</button>`}
    </div>`;

  // 恢复已作答状态
  const ans = exam.answers[i];
  if (typeOf(q) === "blank") {
    const input = root.querySelector(".exam-blank");
    if (typeof ans === "string") input.value = ans;
    input.addEventListener("input", () => { exam.answers[i] = input.value; refreshPalette(); });
  } else if (typeOf(q) === "multi") {
    q.options.forEach((_, oi) => {
      const btn = root.querySelector(`.option[data-i="${oi}"]`);
      if (exam.multiSel[i].has(oi)) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        const sel = exam.multiSel[i];
        if (sel.has(oi)) { sel.delete(oi); btn.classList.remove("selected"); }
        else { sel.add(oi); btn.classList.add("selected"); }
        exam.answers[i] = [...sel].sort((a, b) => a - b);
        refreshExamMeta();
      });
    });
    if (ans && ans.length) exam.answers[i] = [...exam.multiSel[i]].sort((a, b) => a - b);
  } else {
    if (ans !== null && ans !== undefined) {
      const btn = root.querySelector(`.option[data-i="${ans}"]`);
      if (btn) btn.classList.add("selected");
    }
    root.querySelectorAll(".option").forEach(btn => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        exam.answers[i] = +btn.dataset.i;
        refreshExamMeta();
      });
    });
  }

  root.querySelectorAll(".pcell").forEach(cell => cell.addEventListener("click", () => {
    exam.current = +cell.dataset.k; renderExamQuestion();
  }));
  const prev = document.getElementById("prev-btn");
  if (prev) prev.addEventListener("click", () => { if (exam.current > 0) { exam.current--; renderExamQuestion(); } });
  const next = document.getElementById("next-btn");
  if (next) next.addEventListener("click", () => { if (exam.current < exam.questions.length - 1) { exam.current++; renderExamQuestion(); } });
  document.getElementById("handin-btn").addEventListener("click", confirmHandin);
  const last = document.getElementById("handin-last");
  if (last) last.addEventListener("click", confirmHandin);
  tick();
}

function refreshPalette() {
  document.querySelectorAll(".pcell").forEach((cell, k) => {
    const filled = exam.answers[k] !== null && exam.answers[k] !== undefined && exam.answers[k] !== "";
    cell.classList.toggle("done", filled);
    cell.classList.toggle("current", k === exam.current);
  });
  const answered = exam.answers.filter(a => a !== null && a !== undefined && a !== "").length;
  const meta = document.querySelector(".exam-bar span:last-child");
  if (meta) meta.textContent = `已答 ${answered} / ${exam.questions.length}`;
}
function refreshExamMeta() { refreshPalette(); }

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function tick() {
  const el = document.getElementById("exam-timer");
  if (!el) return;
  const left = Math.max(0, Math.round((exam.endAt - Date.now()) / 1000));
  el.textContent = `⏱ 剩余 ${fmt(left)}`;
  if (left <= 0) { doHandin(); }
}

function confirmHandin() {
  const unanswered = exam.answers.filter(a => a === null || a === undefined || a === "").length;
  const msg = unanswered ? `还有 ${unanswered} 题未作答，交卷后不能修改，确定交卷吗？` : "确定交卷并评分吗？";
  if (confirm(msg)) doHandin();
}

// ---------- 判分与成绩单 ----------
function gradeOne(q, ans) {
  const t = typeOf(q);
  if (t === "single") return ans === q.answer;
  if (t === "judge") return ans === (q.answer ? 0 : 1);
  if (t === "multi") return Array.isArray(ans) && ans.length === q.answers.length && q.answers.every(a => ans.includes(a));
  if (t === "blank") return typeof ans === "string" && q.answers.some(x => normBlank(x) === normBlank(ans));
  return false;
}

function doHandin() {
  if (exam.submitted) return;
  exam.submitted = true;
  clearInterval(exam.timer);
  const results = exam.questions.map((q, i) => ({ q, ans: exam.answers[i], ok: gradeOne(q, exam.answers[i]) }));
  const correct = results.filter(r => r.ok).length;
  const pct = Math.round(correct / results.length * 100);

  // 学习统计逐题记账 + 错题记入错题本（稳定题目 ID 格式，与刷题页互通）
  results.forEach(r => {
    const qid = questionId(exam.indId, r.q._catId, r.q);
    if (typeof statsRecord === "function") statsRecord(exam.indId, r.q._catId, qid, r.ok);
    if (typeof trackAnswer === "function") trackAnswer(qid, r.ok);
  });
  results.filter(r => !r.ok).forEach(r => {
    recordMark(WRONG_KEY, exam.indId, r.q._catId, questionId(exam.indId, r.q._catId, r.q), true);
  });
  if (typeof statsExamDone === "function") statsExamDone();

  // 按题型统计
  const byType = {};
  results.forEach(r => {
    const t = typeOf(r.q);
    byType[t] = byType[t] || { total: 0, ok: 0 };
    byType[t].total++;
    if (r.ok) byType[t].ok++;
  });

  const spent = exam.minutes * 60 - Math.max(0, Math.round((exam.endAt - Date.now()) / 1000));
  document.getElementById(EXAM_ROOT_ID).innerHTML = `
    <div class="result">
      <h2>${pct === 100 ? "🎉 满分！太棒了" : pct >= 60 ? "👍 通过！继续巩固" : "💪 未达 60 分，再接再厉"}</h2>
      <div class="score">${correct} / ${results.length}</div>
      <p style="color:var(--muted)">正确率 ${pct}% · 用时 ${fmt(spent)}</p>
      <div class="type-stats">
        ${Object.entries(byType).map(([t, s]) =>
          `<span class="tstat">${TYPE_LABEL[t]} ${s.ok}/${s.total}</span>`).join("")}
      </div>
      <div style="margin-top:20px">
        <button class="btn" onclick="location.reload()">再考一次</button>
        <a class="btn ghost" href="wrong.html" style="margin-left:8px">查看错题本</a>
        <a class="btn ghost" href="index.html" style="margin-left:8px">返回首页</a>
      </div>
    </div>
    <div class="wrong-list">
      <h3 style="margin:8px 0 12px">逐题回顾（${results.length} 题）</h3>
      ${results.map((r, i) => `
        <div class="review-item ${r.ok ? "ok" : "bad"}">
          <div class="review-q"><b>${i + 1}. 【${TYPE_LABEL[typeOf(r.q)]}】</b>${r.q.q}</div>
          <div>你的答案：${userAnsText(r)} ${r.ok ? "✅" : "❌"}</div>
          ${r.ok ? "" : `<div>正确答案：<b>${answerText(r.q)}</b></div>`}
          ${r.q.explain ? `<div class="review-explain">${r.q.explain}</div>` : ""}
        </div>`).join("")}
    </div>`;
  window.scrollTo(0, 0);
}

function userAnsText(r) {
  const { q, ans } = r;
  const t = typeOf(q);
  if (ans === null || ans === undefined || ans === "") return "未作答";
  if (t === "single") return LETTERS[ans];
  if (t === "judge") return ans === 0 ? "正确" : "错误";
  if (t === "multi") return ans.map(i => LETTERS[i]).join("、");
  if (t === "blank") return ans;
  return String(ans);
}

// 键盘：1-6 / A-F 选择，←→ 切题
document.addEventListener("keydown", e => {
  if (exam.submitted || !exam.questions.length) return;
  if (!document.querySelector(".exam-bar")) return;
  const q = exam.questions[exam.current];
  const k = e.key.toUpperCase();
  let idx = -1;
  if (/^[1-6]$/.test(e.key)) idx = +e.key - 1;
  else if (/^[A-F]$/.test(k)) idx = k.charCodeAt(0) - 65;
  if (idx >= 0 && typeOf(q) !== "blank") {
    const btn = document.querySelector(`.option[data-i="${idx}"]`);
    if (btn) { btn.click(); e.preventDefault(); }
  } else if (e.key === "ArrowRight") {
    const b = document.getElementById("next-btn"); if (b) { b.click(); e.preventDefault(); }
  } else if (e.key === "ArrowLeft") {
    const b = document.getElementById("prev-btn"); if (b) { b.click(); e.preventDefault(); }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id"), n = +params.get("n"), m = +params.get("minutes");
  if (id) { exam.indId = id; startExam(id, n || 30, m || 45); }
  else renderStart();
});
