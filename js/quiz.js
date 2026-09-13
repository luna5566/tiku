// 刷题页逻辑：逐题作答、即时判分、错题/收藏记录
// 共享工具（存储键、题型、稳定 ID、记录读写等）定义在 js/app.js，本文件只做页面逻辑
const REPO_ISSUES = "https://github.com/luna5566/tiku/issues/new";

let state = { questions: [], idx: 0, correct: 0, wrongList: [], indId: "", catId: "", indName: "", catName: "", order: [], fullCount: 0, results: [], done: [] };

async function initQuiz() {
  const params = new URLSearchParams(location.search);
  const indId = params.get("id"), catIdx = +params.get("cat") || 0;
  const onlyWrong = params.get("wrong") === "1";
  const onlyFav = params.get("fav") === "1";
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

  let qs = cat.questions.map((q, i) => ({ ...q, _i: i, _id: questionId(indId, cat.id, q) }));
  const modeName = onlyWrong ? "错题" : onlyFav ? "收藏" : "";
  if (onlyWrong || onlyFav) {
    const key = onlyWrong ? WRONG_KEY : FAV_KEY;
    const saved = new Set((readBook(key)[indId]?.[cat.id] || []));
    qs = qs.filter(q => saved.has(q._id));
    if (!qs.length) {
      document.getElementById("quiz-root").classList.remove("hidden");
      document.getElementById("quiz-content").innerHTML =
        `<div class="result"><h2>🎉 没有${modeName}记录！</h2><p style="color:var(--muted);margin:12px 0">${onlyWrong ? "该分类你还没有答错过。" : "在刷题页点击题目旁的 ☆ 即可收藏。"}</p>
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
  state.results = new Array(qs.length).fill(null);
  state.done = new Array(qs.length).fill(false);
  state.order = qs.map((_, i) => i).sort(() => Math.random() - 0.5);
  const sub = state.fullCount > qs.length ? `（本组 ${qs.length} 题 / 共 ${state.fullCount} 题）` : "";
  document.getElementById("crumb").innerHTML += `<span style="color:var(--muted)">${sub}</span>`;
  document.getElementById("quiz-root").classList.remove("hidden");
  renderQuestion();
}

// 按已作答结果渲染题目（用于"上一题"回看）
function answeredBodyHTML(q, res) {
  const t = typeOf(q);
  const mark = (i) => {
    const isAns = t === "single" ? i === q.answer
      : t === "judge" ? i === (q.answer ? 0 : 1)
      : t === "multi" ? q.answers.includes(i)
      : false;
    const isPick = t === "multi" ? (res.picked || []).includes(i) : i === res.picked;
    if (isAns) return " correct";
    if (isPick && !res.ok) return " wrong";
    return "";
  };
  if (t === "blank") {
    return `<input class="blank-input ${res.ok ? "correct" : "wrong"}" type="text" value="${(res.picked || "").replace(/"/g, "&quot;")}" disabled>
      <p class="hint">回看模式：本题已作答。</p>`;
  }
  const opts = t === "judge"
    ? [["0", "√", "正确"], ["1", "×", "错误"]]
    : q.options.map((o, i) => [String(i), LETTERS[i], o]);
  return opts.map(([i, pre, text]) => `
    <button class="option${mark(+i)}" data-i="${i}" disabled><span class="prefix">${pre}.</span>${text}</button>`).join("");
}

function reportLinkHTML(q) {
  const body = `行业：${state.indName}\n分类：${state.catName}\n题目：${q.q}\n系统判定答案：${answerText(q)}\n\n问题描述：`;
  return `<a class="report" href="${REPO_ISSUES}?title=${encodeURIComponent("题目纠错：" + q.q.slice(0, 40))}&body=${encodeURIComponent(body)}" target="_blank" rel="noopener">⚠ 报告此题有误</a>`;
}

function renderQuestion() {
  const { questions, order, idx } = state;
  const q = questions[order[idx]];
  const t = typeOf(q);
  const reviewed = state.done[idx];
  const root = document.getElementById("quiz-content");
  const pct = Math.round((idx / questions.length) * 100);
  document.getElementById("progress").firstElementChild.style.width = pct + "%";
  document.getElementById("progress-num").textContent = `${idx + 1} / ${questions.length}`;

  let body;
  if (reviewed) {
    body = answeredBodyHTML(q, state.results[idx]);
  } else if (t === "single") {
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

  const favSet = new Set((readBook(FAV_KEY)[state.indId]?.[state.catId] || []));
  const faved = favSet.has(q._id);
  const needSubmit = !reviewed && (t === "multi" || t === "blank");
  root.innerHTML = `
    <div class="question">
      <span class="q-tag">${state.indName} · ${state.catName} · ${TYPE_LABEL[t]}</span>
      <button class="fav-btn${faved ? " on" : ""}" id="fav-btn" title="收藏本题">${faved ? "★ 已收藏" : "☆ 收藏"}</button>
      <div class="q-text">${idx + 1}. ${q.q}</div>
      ${body}
      <div class="explain${reviewed ? " show" : ""}" id="explain"><b>正确答案：${answerText(q)}</b><br>${q.explain || ""}${reviewed ? reportLinkHTML(q) : ""}</div>
    </div>
    <div class="quiz-actions">
      <button class="btn ghost" id="prev-btn" ${idx === 0 ? "disabled" : ""}>← 上一题</button>
      ${needSubmit ? `<button class="btn ghost" id="submit-btn" disabled>确认答案</button>` : "<span></span>"}
      <button class="btn${reviewed ? "" : " hidden"}" id="next-btn">${idx === questions.length - 1 ? "查看成绩" : "下一题"}</button>
    </div>`;

  document.getElementById("fav-btn").addEventListener("click", () => {
    const on = !document.getElementById("fav-btn").classList.contains("on");
    recordMark(FAV_KEY, state.indId, state.catId, q._id, on);
    const btn = document.getElementById("fav-btn");
    btn.classList.toggle("on", on);
    btn.textContent = on ? "★ 已收藏" : "☆ 收藏";
  });

  const prevBtn = document.getElementById("prev-btn");
  if (prevBtn) prevBtn.addEventListener("click", () => {
    if (state.idx > 0) { state.idx--; renderQuestion(); }
  });

  if (reviewed) {
    document.getElementById("next-btn").addEventListener("click", () => {
      if (state.idx === state.questions.length - 1) showResult();
      else { state.idx++; renderQuestion(); }
    });
    return;
  }
  bindEvents(q, t);
}

function bindEvents(q, t) {
  const root = document.getElementById("quiz-content");
  const nextBtn = document.getElementById("next-btn");
  const submitBtn = document.getElementById("submit-btn");
  let answered = false;

  function finish(isWrong, picked) {
    if (answered) return;
    answered = true;
    if (isWrong) state.wrongList.push(q); else state.correct++;
    recordMark(WRONG_KEY, state.indId, state.catId, q._id, isWrong);
    if (typeof statsRecord === "function") statsRecord(state.indId, state.catId, q._id, !isWrong);
    state.results[state.idx] = { picked, ok: !isWrong };
    state.done[state.idx] = true;
    const explain = document.getElementById("explain");
    explain.classList.add("show");
    explain.insertAdjacentHTML("beforeend", reportLinkHTML(q));
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
        finish(i !== correctIdx, i);
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
      finish(!ok, [...selected].sort((a, b) => a - b));
    });
  } else if (t === "blank") {
    const input = document.getElementById("blank-input");
    input.addEventListener("input", () => { submitBtn.disabled = input.value.trim() === ""; });
    submitBtn.addEventListener("click", () => {
      input.disabled = true;
      const ok = q.answers.some(a => normBlank(a) === normBlank(input.value));
      input.classList.add(ok ? "correct" : "wrong");
      finish(!ok, input.value);
    });
  }

  nextBtn.addEventListener("click", () => {
    if (state.idx === state.questions.length - 1) showResult();
    else { state.idx++; renderQuestion(); }
  });
}

// 键盘快捷键：1~6 / A~F 选择选项，Enter 确认/下一题，← 上一题
document.addEventListener("keydown", e => {
  const root = document.getElementById("quiz-content");
  if (!root || !root.querySelector(".question")) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  let idx = -1;
  if (/^[1-6]$/.test(e.key)) idx = +e.key - 1;
  else if (/^[A-Fa-f]$/.test(e.key)) idx = e.key.toUpperCase().charCodeAt(0) - 65;
  if (idx >= 0) {
    const btn = root.querySelector(`.option[data-i="${idx}"]:not(:disabled)`);
    if (btn) { btn.click(); e.preventDefault(); }
    return;
  }
  if (e.key === "Enter") {
    const sub = document.getElementById("submit-btn");
    const next = document.getElementById("next-btn");
    if (sub && !sub.disabled && !sub.classList.contains("hidden")) sub.click();
    else if (next && !next.classList.contains("hidden")) next.click();
    e.preventDefault();
  } else if (e.key === "ArrowLeft") {
    const prev = document.getElementById("prev-btn");
    if (prev && !prev.disabled) { prev.click(); e.preventDefault(); }
  }
});

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
        <a class="btn ghost" href="quiz.html?id=${state.indId}&cat=${catIndex()}&fav=1">练收藏</a>
        <a class="btn ghost" href="wrong.html" style="margin-left:10px">错题本</a>
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
