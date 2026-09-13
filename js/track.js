// 匿名答题埋点：把「匿名设备 ID + 题目 ID + 对错 + 日期」上报到 Upstash（与云同步共用同一数据库）
// 不收集任何个人信息；设备 ID 为浏览器本地随机生成，仅用于去重统计日活
// 站长侧报表：python tools/stats_report.py
const DEVICE_KEY = "tiku_device_id";

function trackDeviceId() {
  let v = localStorage.getItem(DEVICE_KEY);
  if (!v) {
    v = crypto.randomUUID ? crypto.randomUUID() : "d" + Date.now() + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, v);
  }
  return v;
}

// 上报一次作答（ok = 是否答对）。用 Upstash pipeline 把多条命令合成一次请求，静默失败不打扰用户
async function trackAnswer(qid, ok) {
  if (!syncConfigured() || !qid) return;
  const day = localDate(new Date());
  const cmds = [
    ["HINCRBY", "tiku:qstats", `${qid}:${ok ? "ok" : "bad"}`, 1],
    ["SADD", `tiku:dau:${day}`, trackDeviceId()],
    ["EXPIRE", `tiku:dau:${day}`, 60 * 60 * 24 * 40],
    ["SADD", "tiku:devs", trackDeviceId()],
    ["HINCRBY", `tiku:daily:${day}`, ok ? "correct" : "answered", 1],
    ["EXPIRE", `tiku:daily:${day}`, 60 * 60 * 24 * 40],
  ];
  try {
    await fetch(SYNC_API.url + "/pipeline", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_API.token}` },
      body: JSON.stringify(cmds),
    });
  } catch (e) { /* 埋点失败不影响刷题 */ }
}
