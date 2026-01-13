const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const today = () => new Date().toISOString().slice(0,10);

let state = JSON.parse(localStorage.getItem("lvlup")||"{}");
state.profile ??= {level:1,xp:0,coins:0,spinTokens:3};
state.days ??= {};
state.arcade ??= {reaction:{times:[]}};

function save(){localStorage.setItem("lvlup",JSON.stringify(state));}

function gain(xp,coins){state.profile.xp+=xp;state.profile.coins+=coins;save();render();}
function render(){
  $("#levelVal").textContent=state.profile.level;
  $("#xpVal").textContent=state.profile.xp;
  $("#coinsVal").textContent=state.profile.coins;
}
render();

$$(".tab").forEach(b=>b.onclick=()=>{
  $$(".view").forEach(v=>v.classList.add("hidden"));
  $("#view-"+b.dataset.view).classList.remove("hidden");
});

$("#spinBtn").onclick=()=>{
  const rewards=["+20 XP","+10 Coins","+Boost"];
  const r=rewards[Math.floor(Math.random()*rewards.length)];
  $("#spinResult").textContent="Won "+r;
  if(r.includes("XP"))gain(20,0);
  if(r.includes("Coins"))gain(0,10);
};

let waiting=false,start=0;
$("#rtStart").onclick=()=>{
  $("#rtState").textContent="WAIT";
  waiting=true;
  setTimeout(()=>{
    start=performance.now();
    $("#rtState").textContent="TAP";
  },Math.random()*2000+1000);
};
$("#rtBox").onclick=()=>{
  if(!waiting)return;
  const ms=Math.round(performance.now()-start);
  state.arcade.reaction.times.push(ms);
  gain(5,2);
  $("#rtState").textContent=ms+" ms";
  save();
};
