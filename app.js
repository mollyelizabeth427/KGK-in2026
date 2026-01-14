const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const todayKey = () => new Date().toISOString().slice(0, 10);

let state = JSON.parse(localStorage.getItem("lvlup") || "{}");
state.profile ??= { level: 1, xp: 0, coins: 0, spinTokens: 0, shield: 0 };
state.settings ??= { waterGoal: 8 };
state.days ??= {};
state.arcade ??= { reaction: { times: [], falseStarts: 0, attempts: 0 } };

function save() {
  localStorage.setItem("lvlup", JSON.stringify(state));
}

function showToast(title, detail = "") {
  const t = $("#toast");
  if (!t) return;
  t.innerHTML = detail ? `${title}<small>${detail}</small>` : title;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2400);
}

function setLastAction(text) {
  const el = $("#lastAction");
  if (el) el.textContent = `Last action: ${text}`;
}

// ------- Day model -------
function getDay(iso) {
  state.days[iso] ??= {
    quests: { medsAM: false, medsPM: false, move1: false, move2: false, rest: false },
    waterCups: 0,
    checkSaved: false,
  };
  return state.days[iso];
}

const QUESTS = [
  { key: "medsAM", label: "Meds (AM)", xp: 15, coins: 4, toast: "✅ Meds claimed", detail: "+XP • Stability buff" },
  { key: "medsPM", label: "Meds (PM)", xp: 15, coins: 4, toast: "✅ Meds claimed", detail: "+XP • Stability buff" },
  { key: "move1", label: "Movement 1", xp: 18, coins: 4, toast: "🏃 Movement logged", detail: "+XP • Momentum building" },
  { key: "move2", label: "Movement 2", xp: 18, coins: 4, toast: "🏃 Movement logged", detail: "+XP • Momentum building" },
  { key: "rest", label: "Intentional Rest", xp: 14, coins: 3, toast: "🛡️ Rest secured", detail: "+XP • Crash prevented" },
];

function xpNeededForLevel(level) {
  return 100 + (level - 1) * 30;
}

function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dailyScore(day) {
  const qDone = QUESTS.filter((q) => day?.quests?.[q.key]).length;
  const qScore = (qDone / QUESTS.length) * 60;

  const goal = state.settings.waterGoal ?? 8;
  const water = Math.min(day?.waterCups ?? 0, goal);
  const wScore = goal > 0 ? (water / goal) * 25 : 0;

  const cScore = day?.checkSaved ? 15 : 0;
  return Math.round(qScore + wScore + cScore);
}

function meets(type, day) {
  if (!day) return false;
  const goal = state.settings.waterGoal ?? 8;

  if (type === "daily") return dailyScore(day) > 0;
  if (type === "quests") return QUESTS.filter((q) => day.quests?.[q.key]).length >= 3;
  if (type === "water") return goal > 0 ? (day.waterCups ?? 0) >= Math.ceil(goal * 0.8) : false;
  if (type === "check") return !!day.checkSaved;

  return false;
}

function streakCount(type) {
  const days = lastNDays(120);
  let streak = 0;

  // NOTE: “shield” here is a display mechanic; we are not auto-consuming it.
  let shields = state.profile.shield ?? 0;
  let shieldUsed = false;

  for (let i = days.length - 1; i >= 0; i--) {
    const iso = days[i];
    const day = state.days[iso];
    const ok = meets(type, day);

    if (ok) {
      streak++;
      continue;
    }

    if (shields > 0 && !shieldUsed) {
      shieldUsed = true;
      shields--;
      continue;
    }

    break;
  }
  return streak;
}

function maybeAwardShield() {
  const s = streakCount("daily");
  const day = getDay(todayKey());
  if (s > 0 && s % 5 === 0 && !day._shieldAwarded) {
    state.profile.shield = (state.profile.shield ?? 0) + 1;
    day._shieldAwarded = true;
    save();
    showToast("🛡️ Shield earned!", "Streak protection added");
    setLastAction("Shield earned");
  }
}

function gainRewards(xp, coins) {
  // streak bonus coins: +5% per day, cap +30%
  const streak = streakCount("daily");
  const mult = 1 + Math.min(0.30, streak * 0.05);
  coins = Math.round(coins * mult);

  state.profile.xp += xp;
  state.profile.coins += coins;

  while (state.profile.xp >= xpNeededForLevel(state.profile.level)) {
    state.profile.xp -= xpNeededForLevel(state.profile.level);
    state.profile.level += 1;
    state.profile.coins += 10;
    showToast("⬆️ Level up!", `Level ${state.profile.level}`);
    setLastAction(`Level up → ${state.profile.level}`);
  }

  save();
  render();
}

// ------- Actions -------
function toggleQuest(qKey) {
  const day = getDay(todayKey());
  const q = QUESTS.find((x) => x.key === qKey);
  if (!q) return;

  const was = !!day.quests[qKey];
  day.quests[qKey] = !was;

  if (day.quests[qKey]) {
    gainRewards(q.xp, q.coins);
    showToast(q.toast, q.detail);
    setLastAction(`${q.label} (+XP)`);

    // Spin token rewards (3 quests, and both movements)
    const completed = QUESTS.filter((x) => day.quests[x.key]).length;
    if (completed === 3 && !day._threeQuestToken) {
      state.profile.spinTokens = (state.profile.spinTokens ?? 0) + 1;
      day._threeQuestToken = true;
      save();
      showToast("🎟️ Spin Token", "Earned for 3 quests today");
      setLastAction("Spin Token earned");
    }
    if (day.quests.move1 && day.quests.move2 && !day._bothMovesToken) {
      state.profile.spinTokens = (state.profile.spinTokens ?? 0) + 1;
      day._bothMovesToken = true;
      save();
      showToast("🎟️ Spin Token", "Both movements logged");
      setLastAction("Spin Token earned");
    }

    maybeAwardShield();
  } else {
    save();
    render();
    showToast("↩️ Undone", "No penalty • updating today");
    setLastAction(`${q.label} undone`);
  }
}

function waterPlus() {
  const day = getDay(todayKey());
  day.waterCups = (day.waterCups ?? 0) + 1;

  const goal = state.settings.waterGoal ?? 8;
  if (goal === 0 || day.waterCups <= goal) {
    gainRewards(3, 1);
    showToast("💧 Hydration +1", "+XP • Streak fuel");
    setLastAction("Hydration +1");
    maybeAwardShield();
  } else {
    save();
    render();
    showToast("💧 Logged", "Above goal • still counts");
    setLastAction("Hydration logged");
  }
}

function waterMinus() {
  const day = getDay(todayKey());
  day.waterCups = Math.max(0, (day.waterCups ?? 0) - 1);
  save();
  render();
  showToast("💧 Adjusted", "Updated water count");
  setLastAction("Hydration adjusted");
}

function saveBrainCheck() {
  const day = getDay(todayKey());
  if (!day.checkSaved) {
    day.checkSaved = true;
    gainRewards(10, 2);
    showToast("🧠 Check saved", "+XP • Trend tracking on");
    setLastAction("Brain Check saved");
    maybeAwardShield();
  } else {
    showToast("🧠 Already saved", "One per day");
    setLastAction("Brain Check already saved");
  }
  save();
  render();
}

// ------- Scoreboard render -------
function renderScoreboard() {
  const wrap = $("#chart7");
  if (!wrap) return;

  const days = lastNDays(7);
  const scores = days.map((d) => (state.days[d] ? dailyScore(state.days[d]) : 0));
  const max = Math.max(10, ...scores);

  const sDaily = streakCount("daily");
  const sQuest = streakCount("quests");
  const sWater = streakCount("water");
  const sCheck = streakCount("check");
  const shields = state.profile.shield ?? 0;

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div>
        <div style="font-size:20px;font-weight:900">Last 7 Days</div>
        <div style="opacity:.8;font-size:12px">🔥 ${sDaily} • 🧩 ${sQuest} • 💧 ${sWater} • 🧠 ${sCheck} • 🛡️ ${shields}</div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:8px;height:160px">
      ${days
        .map((d, i) => {
          const h = Math.round((scores[i] / max) * 100);
          return `
            <div style="flex:1;position:relative;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(96,165,250,.18);height:${h}%">
              <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:11px">${scores[i]}</div>
              <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:11px;opacity:.8">${d.slice(5)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// ------- Render -------
function render() {
  const iso = todayKey();
  const day = getDay(iso);

  // These are optional — only update if they exist in your HTML
  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setText("#levelVal", state.profile.level);
  setText("#xpVal", state.profile.xp);
  setText("#coinsVal", state.profile.coins);
  setText("#todayDate", iso);

  // quests UI
  $$(".quest").forEach((el) => {
    const key = el.dataset.quest;
    if (key === "water") return;
    const done = !!day.quests[key];
    const btn = el.querySelector(".qbtn");
    if (btn) btn.textContent = done ? "Done" : "Complete";
    el.style.opacity = done ? "1" : "0.92";
  });

  // water UI
  setText("#waterCount", day.waterCups ?? 0);
  setText("#waterGoal", state.settings.waterGoal ?? 8);

  // score
  setText("#dailyScore", dailyScore(day));

  // streaks
  setText("#stDaily", streakCount("daily"));
  setText("#stQuests", streakCount("quests"));
  setText("#stWater", streakCount("water"));
  setText("#stCheck", streakCount("check"));
  setText("#shieldCount", state.profile.shield ?? 0);

  renderScoreboard();
}

// ------- Events -------
function wire() {
  // tab switching (defensive — won’t crash if an id is missing)
  $$(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      const view = b.dataset.view;
      $$(".view").forEach((v) => v.classList.add("hidden"));
      const target = $("#view-" + view);
      if (target) target.classList.remove("hidden");
    });
  });

  // quest buttons
  $$(".quest .qbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".quest")?.dataset?.quest;
      if (key && key !== "water") toggleQuest(key);
    });
  });

  // water +/-
  $$(".mini").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.dataset.action;
      if (a === "waterPlus") waterPlus();
      if (a === "waterMinus") waterMinus();
    });
  });

  $("#saveCheck")?.addEventListener("click", saveBrainCheck);

  $("#saveSettings")?.addEventListener("click", () => {
    const input = $("#waterGoalInput");
    const v = input ? parseInt(input.value, 10) : 8;
    state.settings.waterGoal = Number.isFinite(v) ? Math.max(0, Math.min(20, v)) : 8;
    save();
    render();
    showToast("⚙️ Settings saved", "Water goal updated");
    setLastAction("Settings saved");
  });
}

wire();
render();
