const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const todayKey = () => new Date().toISOString().slice(0,10);

let state = JSON.parse(localStorage.getItem("lvlup") || "{}");

// --- Defaults ---
state.profile ??= { level: 1, xp: 0, coins: 0, spinTokens: 0, shield: 0 };
state.settings ??= { waterGoal: 8 };
state.days ??= {};
state.arcade ??= { reaction: { times: [], falseStarts: 0, attempts: 0 } };

function save(){ localStorage.setItem("lvlup", JSON.stringify(state)); }

function getDay(iso){
  state.days[iso] ??= {
    quests: { medsAM:false, medsPM:false, move1:false, move2:false, rest:false },
    waterCups: 0,
    checkSaved: false,
    locked: false
  };
  return state.days[iso];
}

// --- Scoring ---
const QUEST_KEYS = ["medsAM","medsPM","move1","move2","rest"];

function dailyScore(day){
  const qDone = QUEST_KEYS.filter(k => day.quests[k]).length;
  const qScore = (qDone / QUEST_KEYS.length) * 60;

  const goal = state.settings.waterGoal || 0;
  const water = Math.min(day.waterCups || 0, goal);
  const wScore = goal > 0 ? (water / goal) * 25 : 0;

  const cScore = day.checkSaved ? 15 : 0;

  return Math.round(qScore + wScore + cScore);
}

// --- Level curve ---
function xpNeededForLevel(level){
  return 100 + (level - 1) * 30;
}

function gainRewards(xp, coins){
  // streak bonus multiplier (coins only)
  const mult = 1 + Math.min(0.30, (getStreak("dailyRun") * 0.05)); // +5%/day up to +30%
  coins = Math.round(coins * mult);

  state.profile.xp += xp;
  state.profile.coins += coins;

  // level up loop
  while(state.profile.xp >= xpNeededForLevel(state.profile.level)){
    state.profile.xp -= xpNeededForLevel(state.profile.level);
    state.profile.level += 1;
    state.profile.coins += 10; // level bonus
  }

  save();
  render();
}

function updateHeader(){
  $("#levelVal").textContent = state.profile.level;
  $("#xpVal").textContent = state.profile.xp;
  $("#coinsVal").textContent = state.profile.coins;
  $("#todayDate").textContent = todayKey();
}

// --- Streaks ---
function lastNDays(n){
  const out = [];
  const now = new Date();
  for(let i=n-1;i>=0;i--){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

function getStreak(type){
  const days = lastNDays(120);
  let streak = 0;

  // allow one “shield” miss (doesn't count as streak break)
  let shieldAvailable = state.profile.shield || 0;
  let usedShield = false;

  for(let i=days.length-1;i>=0;i--){
    const iso = days[i];
    const day = state.days[iso];
    const ok = day ? checkType(type, day) : false;

    if(ok){
      streak++;
      continue;
    }

    // miss
    if(shieldAvailable > 0 && !usedShield){
      usedShield = true;
      shieldAvailable--;
      continue;
    }

    break;
  }
  return streak;
}

function checkType(type, day){
  const score = dailyScore(day);
  const qDone = QUEST_KEYS.filter(k => day.quests[k]).length;
  const goal = state.settings.waterGoal || 0;

  if(type === "dailyRun") return score > 0;
  if(type === "quests") return qDone >= 3;
  if(type === "hydration") return goal > 0 ? (day.waterCups || 0) >= Math.ceil(goal * 0.8) : false;
  if(type === "check") return !!day.checkSaved;
  return false;
}

function awardShieldIfNeeded(){
  // award a shield every 5 days of dailyRun streak
  const s = getStreak("dailyRun");
  if(s > 0 && s % 5 === 0){
    const today = todayKey();
    const day = getDay(today);
    if(!day._shieldAwarded){
      state.profile.shield = (state.profile.shield || 0) + 1;
      day._shieldAwarded = true;
      save();
    }
  }
}

// --- UI Actions ---
function toggleQuest(key){
  const day = getDay(todayKey());
  if(day.locked) return;

  day.quests[key] = !day.quests[key];

  // rewards only when toggling ON
  if(day.quests[key]){
    // small, consistent rewards
    gainRewards(15, 4);
  } else {
    // no penalties (just removes completion)
    save();
    render();
  }

  awardShieldIfNeeded();
}

function waterPlus(){
  const day = getDay(todayKey());
  if(day.locked) return;

  day.waterCups = (day.waterCups || 0) + 1;

  // reward up to goal only
  const goal = state.settings.waterGoal || 0;
  if(goal === 0 || day.waterCups <= goal){
    gainRewards(3, 1);
  } else {
    save();
    render();
  }

  awardShieldIfNeeded();
}

function waterMinus(){
  const day = getDay(todayKey());
  if(day.locked) return;
  day.waterCups = Math.max(0, (day.waterCups || 0) - 1);
  save();
  render();
}

function saveBrainCheck(){
  const day = getDay(todayKey());
  if(day.locked) return;
  if(!day.checkSaved){
    day.checkSaved = true;
    gainRewards(10, 2);
    awardShieldIfNeeded();
  } else {
    save();
    render();
  }
}

function setView(view){
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#view-"+view).classList.remove("hidden");
}

// --- Scoreboard chart ---
function renderScoreboard(){
  const wrap = $("#chart7");
  if(!wrap) return;

  const days = lastNDays(7);
  const scores = days.map(d => state.days[d] ? dailyScore(state.days[d]) : 0);
  const max = Math.max(10, ...scores);

  // streak summary
  const sDaily = getStreak("dailyRun");
  const sQuest = getStreak("quests");
  const sHydro = getStreak("hydration");
  const sCheck = getStreak("check");
  const shields = state.profile.shield || 0;

  const hints = [];
  const lowWaterDays = days.filter(d => (state.days[d]?.waterCups || 0) < Math.ceil((state.settings.waterGoal||0)*0.6)).length;
  if(lowWaterDays >= 4) hints.push("Hydration trend is low (4+ days).");
  if(hints.length === 0) hints.push("No major negative trends flagged this week.");

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div>
        <div style="font-size:20px;font-weight:900">Last 7 Days</div>
        <div style="opacity:.8;font-size:12px">${hints.join(" ")}</div>
      </div>
      <div style="text-align:right;font-size:12px;opacity:.9">
        <div><b>Daily:</b> ${sDaily} • <b>Quests:</b> ${sQuest}</div>
        <div><b>Hydration:</b> ${sHydro} • <b>Check:</b> ${sCheck}</div>
        <div><b>Shields:</b> ${shields}</div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:8px;height:160px">
      ${days.map((d,i)=> {
        const h = Math.round((scores[i]/max)*100);
        return `
          <div style="flex:1;position:relative;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(96,165,250,.18);height:${h}%">
            <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:11px">${scores[i]}</div>
            <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:11px;opacity:.8">${d.slice(5)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// --- Render ---
function render(){
  const day = getDay(todayKey());

  updateHeader();

  // quests
  $$(".quest").forEach(q => {
    const key = q.dataset.quest;
    if(key === "water") return;
    const done = !!day.quests[key];
    q.style.opacity = done ? "1" : "0.9";
    const btn = q.querySelector(".qbtn");
    btn.textContent = done ? "Done" : "Complete";
  });

  // water
  $("#waterCount").textContent = day.waterCups || 0;
  $("#waterGoal").textContent = state.settings.waterGoal || 0;

  // daily score
  $("#dailyScore").textContent = dailyScore(day);

  // scoreboard
  renderScoreboard();
}

function wireEvents(){
  // tabs
  $$(".tab").forEach(b => {
    b.addEventListener("click", () => setView(b.dataset.view));
  });

  // quest buttons
  $$(".quest .qbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".quest").dataset.quest;
      if(key && key !== "water") toggleQuest(key);
    });
  });

  // water
  $$(".mini").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = btn.dataset.action;
      if(a === "waterPlus") waterPlus();
      if(a === "waterMinus") waterMinus();
    });
  });

  // brain check
  $("#saveCheck").addEventListener("click", saveBrainCheck);

  // settings
  $("#saveSettings")?.addEventListener("click", () => {
    const v = parseInt($("#waterGoalInput").value, 10);
    state.settings.waterGoal = Number.isFinite(v) ? Math.max(0, Math.min(20, v)) : 8;
    save();
    render();
  });

  // initial view
  setView("today");
}

wireEvents();
render();
