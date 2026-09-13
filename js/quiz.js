// 刷题页逻辑：逐题作答、即时判分、错题记录（localStorage）
// 题型：single 单选 / multi 多选 / judge 判断 / blank 填空（type 字段缺省按 single 处理）
const WRONG_KEY = "tiku_wrong_answers";   // {industryId: {catId: [题目索引]}}
const BEST_KEY = "tiku_best_scores";      // {industryId|catId: bestPercent}
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const TYPE_LABEL = { single: "单选题", multi: "多选题", judge: "判断题", blank: "填空题" };

function getJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function recordWrong(indId, catId, qIndex, isWrong) {
  const all = getJSON(WRONG_KEY, {});
  all[indId] = all[indId] || {};
  const arr = new Set(all[indId][catId] || []);
  if (isWrong) arr.add(qIndex); else arr.delete(qIndex);
  all[indId][catId] = [...arr];
  setJSON(WRONG_KEY, all);
}

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

let state = { questions: [], idx: 0, correct: 0, wrongList: [], indId: "", catId: "", indName: "", catName: "", order: [], fullCount: 0 };

async function initQuiz() {
  const params = new URLSearchParams(location.search);
  const indId = params.get("id"), catIdx = +params.get("cat") || 0;
  const onlyWrong = params.get("wrong") === "1";
  // 每组抽题数量：默认 20 题，n=0 或超大值表示练全部
  const sampleN = +params.get("n") || 20;
  let data;
  try { data = await fetchIndustry(indId); } catch (e) {
    document.getElementById("quiz-content").innerHTML = `<p class="empty">${e.message}，请通过本地服务器访问（见 README）。</p>`;
    document.getElementById("quiz-root").classList.remove("hidden");
    return;
  }
  const cat = data.categories[catIdx];
  state.indId = indId; state.catId = cat.id;
  state.indName = data.name; state.catName = cat.name;
  document.title = `${cat.name} - ${data.name} - 免费题库`;
  document.getElementById("crumb").innerHTML =
    `<a class="back" href="index.html">首页</a> › <a class="back" href="industry.html?id=${indId}">${data.name}</a> › ${cat.name}`;

  let qs = cat.questions.map((q, i) => ({ ...q, _i: i }));
  if (onlyWrong) {
    const saved = getJSON(WRONG_KEY, {})[indId]?.[cat.id] || [];
    qs = qs.filter(q => saved.includes(q._i));
    if (!qs.length) {
      document.getElementById("quiz-root").classList.remove("hidden");
      document.getElementById("quiz-content").innerHTML =
        `<div class="result"><h2>🎉 没有错题记录！</h2><p style="color:var(--muted);margin:12px 0">该分类你还没有答错过。</p>
         <a class="btn" href="quiz.html?id=${indId}&cat=${catIdx}">重新练习全部题目</a></div>`;
      return;
    }
  }
  // 随机排序（仅练习顺序，不改变题目归属），并按 sampleN 抽样
  state.fullCount = qs.length;
  qs = qs.slice().sort(() => Math.random() - 0.5);
  if (sampleN > 0 && qs.length > sampleN) qs = qs.slice(0, sampleN);
  state.questions = qs;
  state.idx = 0; state.correct = 0; state.wrongList = [];
  state.order = qs.map((_, i) => i).sort(() => Math.random() - 0.5);
  const sub = state.fullCount > qs.length ? `（本组 ${qs.length} 题 / 共 ${state.fullCount} 题）` : "";
  document.getElementById("crumb").innerHTML += `<span style="color:var(--muted)">${sub}</span>`;
  document.getElementById("quiz-root").classList.remove("hidden");
  renderQuestion();
}

function renderQuestion() {
  const { questions, order, idx } = state;
  const q = questions[order[idx]];
  const t = typeOf(q);
  const root = document.getElementById("quiz-content");
  const pct = Math.round((idx / questions.length) * 100);
  document.getElementById("progress").firstElementChild.style.width = pct + "%";
  document.getElementById("progress-num").textContent = `${idx + 1} / ${questions.length}`;

  let body = "";
  if (t === "single") {
    body = q.options.map((opt, i) => `
      <button class="option" data-i="${i}"><span class="prefix">${LETTERS[i]}.</span>${opt}</button>`).join("");
  } else if (t === "judge") {
    body = `
      <button class="option" data-i="0"><span class="prefix">√</span>正确</button>
      <button class="option" data-i="1"><span class="prefix">×</span>错误</button>`;
  } else if (t === "multi") {
    body = `<p class="hint">多选题：选出所有正确选项后点击"确认答案"，全部选对才得分。</p>` +
      q.options.map((opt, i) => `
      <button class="option" data-i="${i}"><span class="prefix">${LETTERS[i]}.</span>${opt}</button>`).join("");
  } else if (t === "blank") {
    body = `
      <input class="blank-input" id="blank-input" type="text" placeholder="请输入答案" autocomplete="off">
      <p class="hint">填空题：输入答案后点击"确认答案"判分（判分时忽略大小写和标点）。</p>`;
  }

  const needSubmit = (t === "multi" || t === "blank");
  root.innerHTML = `
    <div class="question">
      <span class="q-tag">${state.indName} · ${state.catName} · ${TYPE_LABEL[t]}</span>
      <div class="q-text">${idx + 1}. ${q.q}</div>
      ${body}
      <div class="explain" id="explain"><b>正确答案：${answerText(q)}</b><br>${q.explain || ""}</div>
    </div>
    <div class="quiz-actions">
      <span></span>
      ${needSubmit ? `<button class="btn ghost" id="submit-btn" disabled>确认答案</button>` : ""}
      <button class="btn hidden" id="next-btn">${idx === questions.length - 1 ? "查看成绩" : "下一题"}</button>
    </div>`;

  bindEvents(q, t);
}

function bindEvents(q, t) {
  const root = document.getElementById("quiz-content");
  const nextBtn = document.getElementById("next-btn");
  const submitBtn = document.getElementById("submit-btn");
  let answered = false;

  function finish(isWrong) {
    if (answered) return;
    answered = true;
    if (isWrong) state.wrongList.push(q); else state.correct++;
    recordWrong(state.indId, state.catId, q._i, isWrong);
    document.getElementById("explain").classList.add("show");
    if (submitBtn) submitBtn.classList.add("hidden");
    nextBtn.classList.remove("hidden");
  }

  if (t === "single" || t === "judge") {
    const correctIdx = t === "judge" ? (q.answer ? 0 : 1) : q.answer;
    root.querySelectorAll(".option").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = +btn.dataset.i;
        root.querySelectorAll(".option").forEach(b => b.disabled = true);
        if (i === correctIdx) btn.classList.add("correct");
        else {
          btn.classList.add("wrong");
          root.querySelectorAll(".option")[correctIdx].classList.add("correct");
        }
        finish(i !== correctIdx);
      });
    });
  } else if (t === "multi") {
    const selected = new Set();
    root.querySelectorAll(".option").forEach(btn => {
      btn.addEventListener("click", () => {
        if (answered) return;
        const i = +btn.dataset.i;
        if (selected.has(i)) { selected.delete(i); btn.classList.remove("selected"); }
        else { selected.add(i); btn.classList.add("selected"); }
        submitBtn.disabled = selected.size === 0;
      });
    });
    submitBtn.addEventListener("click", () => {
      root.querySelectorAll(".option").forEach(b => b.disabled = true);
      const ans = new Set(q.answers);
      const ok = selected.size === ans.size && [...selected].every(i => ans.has(i));
      root.querySelectorAll(".option").forEach(b => {
        const i = +b.dataset.i;
        b.classList.remove("selected");
        if (ans.has(i)) b.classList.add("correct");
        else if (selected.has(i)) b.classList.add("wrong");
      });
      finish(!ok);
    });
  } else if (t === "blank") {
    const input = document.getElementById("blank-input");
    input.addEventListener("input", () => { submitBtn.disabled = input.value.trim() === ""; });
    submitBtn.addEventListener("click", () => {
      input.disabled = true;
      const ok = q.answers.some(a => normBlank(a) === normBlank(input.value));
      input.classList.add(ok ? "correct" : "wrong");
      finish(!ok);
    });
  }

  nextBtn.addEventListener("click", () => {
    if (state.idx === state.questions.length - 1) showResult();
    else { state.idx++; renderQuestion(); }
  });
}

function showResult() {
  const { questions, correct, wrongList } = state;
  const pct = Math.round((correct / questions.length) * 100);
  const best = getJSON(BEST_KEY, {});
  const key = `${state.indId}|${state.catId}`;
  const isNewBest = pct > (best[key] ?? -1);
  if (isNewBest) { best[key] = pct; setJSON(BEST_KEY, best); }
  document.getElementById("progress").firstElementChild.style.width = "100%";
  document.getElementById("quiz-content").innerHTML = `
    <div class="result">
      <h2>${pct === 100 ? "🎉 满分！太棒了" : pct >= 80 ? "👍 成绩不错" : "💪 继续加油"}</h2>
      <div class="score">${correct} / ${questions.length}</div>
      <p style="color:var(--muted)">正确率 ${pct}%${isNewBest ? " · 🏅 新纪录" : ` · 历史最佳 ${best[key]}%`}</p>
      <div style="margin-top:24px">
        <a class="btn" href="quiz.html?id=${state.indId}&cat=${catIndex()}" style="margin-right:10px">再练一次</a>
        <a class="btn ghost" href="quiz.html?id=${state.indId}&cat=${catIndex()}&wrong=1">只练错题</a>
        <a class="btn ghost" href="industry.html?id=${state.indId}" style="margin-left:10px">返回分类</a>
      </div>
      ${wrongList.length ? `
      <div class="wrong-list">
        <h3 style="margin-bottom:8px">本次错题（${wrongList.length}）</h3>
        ${wrongList.map(q => `
          <div class="wrong-item">
            <b>【${TYPE_LABEL[typeOf(q)]}】${q.q}</b><br>
            正确答案：${answerText(q)}<br>
            ${q.explain || ""}
          </div>`).join("")}
      </div>` : ""}
    </div>`;
}

function catIndex() { return new URLSearchParams(location.search).get("cat"); }

document.addEventListener("DOMContentLoaded", initQuiz);
