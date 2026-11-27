// 성 지키기 2판(2026-11-27, 사용자와 그릴로 정한 계획: docs/castle_plan.md)
// 나인 킹즈식 카드 운영 + 옆에서 본 3줄 무대(핸드폰 세로, 화면 384×300 / 인형은 두 배 층 768×600).
// 흐름: 왕 고르기 → [웨이브 사이: 카드 3장 중 1장 → 칸에 건물·강화·땅 넓히기 / 마법은 손에] → 웨이브(자동 전투) → … 20웨이브.
// 건물이 웨이브마다 레벨만큼 병사를 자기 줄로 내보내고, 왕은 성 앞에서 싸운다. 적은 소환수 13종 + 5웨이브마다 보스.
import { createFrame, clearFrame, composite, hex, poseAt } from "../pixelfx/core/index.js";
import { rasterText } from "../pixelfx/core/font.js";
import { ramp } from "./looks.js?v=14";

export const W = 384, H = 300, W2 = 768, H2 = 600;
const LANE_Y = [170, 216, 262], COL_X = [86, 120, 154, 188], KING_X = 224, CASTLE_X = 56, RALLY = 246;
const MAX_WAVE = 20, BOSS_WAVES = { 5: { kind: "slime", k: 2, hp: 700 }, 10: { kind: "crocodile", k: 1.8, hp: 2200 }, 15: { kind: "flying-skull", k: 2, hp: 2600 }, 20: { kind: "crocodile", k: 2.3, hp: 6000 } };
const waveCount = (w) => Math.round(6 + 94 * ((w - 1) / 19) ** 1.5);

// ---- 적: 우리 소환수(fly = 공중 높이, 날짐승은 병사를 넘어 간다)
const FOES = {
  slime: { hp: 34, spd: 13, dmg: 5 }, frog: { hp: 28, spd: 20, dmg: 5 }, butterfly: { hp: 16, spd: 24, dmg: 3, fly: 30 },
  snake: { hp: 40, spd: 17, dmg: 6 }, bat: { hp: 22, spd: 30, dmg: 4, fly: 32 }, bird: { hp: 24, spd: 32, dmg: 4, fly: 36 },
  wisp: { hp: 32, spd: 26, dmg: 6 }, eyeball: { hp: 55, spd: 12, dmg: 8 }, "fish-school": { hp: 38, spd: 22, dmg: 6, fly: 26 },
  "flying-skull": { hp: 46, spd: 24, dmg: 8 }, ghost: { hp: 60, spd: 15, dmg: 9 }, jellyfish: { hp: 48, spd: 11, dmg: 8, fly: 56 },
  crocodile: { hp: 220, spd: 9, dmg: 18 },
};
const POOLS = [["slime", "frog", "butterfly"], ["snake", "bat", "bird"], ["wisp", "eyeball", "fish-school"], ["flying-skull", "ghost", "jellyfish"], ["crocodile"]];

// ---- 병사(건물이 내보내는 것): rig = 인형 외형, beast = 네 발 짐승, fx = pixelfx 생물
const UNITS = {
  elfArcher: { ko: "엘프 궁수", rig: "elf", hp: 44, dmg: 11, range: 130, rate: 0.95, spd: 26, ranged: true, pose: "moves/arrow-shot", weapon: "bow" },
  spirit: { ko: "숲 정령", fx: "critters/wisp", hp: 40, dmg: 9, range: 18, rate: 0.8, spd: 32, palette: ["#08301c", "#0e5a30", "#1e8a48", "#40c070", "#8ff0a8", "#e0fff0"] },
  wolf: { ko: "늑대", beast: "wolf", hp: 72, dmg: 12, range: 18, rate: 0.75, spd: 44 },
  skeleton: { ko: "해골 병사", rig: "bone", hp: 46, dmg: 8, range: 18, rate: 0.9, spd: 22, pose: "melee/sword-slash", weapon: "sword" },
  hound: { ko: "지옥견", beast: "hound", hp: 50, dmg: 11, range: 18, rate: 0.62, spd: 50, burn: true },
};
// ---- 건물: spawn = 병사를 낳음, tower = 직접 쏨, aura = 이웃 칸 강화, curse = 그 줄의 적 약화
const BUILD = {
  barracks: { ko: "궁수 막사", kind: "spawn", unit: "elfArcher", desc: "웨이브마다 레벨만큼 엘프 궁수" },
  spring: { ko: "숲 정령의 샘", kind: "spawn", unit: "spirit", desc: "웨이브마다 레벨만큼 숲 정령" },
  atower: { ko: "궁수 탑", kind: "tower", proj: "arrow", range: 160, dmg: 11, rate: 1.0, desc: "그 줄의 적을 직접 쏜다" },
  tree: { ko: "생명의 나무", kind: "aura", aura: "hp", desc: "이웃 칸 병사 체력↑, 웨이브 끝에 성 회복" },
  lodge: { ko: "사냥꾼 오두막", kind: "spawn", unit: "wolf", desc: "웨이브마다 레벨만큼 늑대" },
  grave: { ko: "해골 무덤", kind: "spawn", unit: "skeleton", desc: "웨이브마다 레벨만큼 해골 병사" },
  kennel: { ko: "지옥견 우리", kind: "spawn", unit: "hound", desc: "웨이브마다 레벨만큼 지옥견(불태움)" },
  dtower: { ko: "어둠 탑", kind: "tower", proj: "dark", range: 140, dmg: 15, rate: 1.4, desc: "그 줄의 적에게 어둠 구슬" },
  altar: { ko: "피의 제단", kind: "aura", aura: "dmg", desc: "이웃 칸 병사 공격력↑" },
  obelisk: { ko: "저주 오벨리스크", kind: "curse", desc: "그 줄의 가까운 적이 더 아프게 맞는다" },
};
const SPELL = {
  poison: { ko: "독구름", fx: "nature/poison-cloud", r: 46, dot: 12, life: 3.5 },
  roots: { ko: "뿌리 속박", fx: "nature/root-snare", r: 48, dmg: 14, stop: 3 },
  leaves: { ko: "나뭇잎 폭풍", fx: "nature/leaf-storm", r: 58, dot: 14, life: 3 },
  dexp: { ko: "어둠 폭발", fx: "shadow/dark-explosion", r: 52, dmg: 70 },
  bhole: { ko: "블랙홀", fx: "shadow/black-hole", r: 62, dot: 16, pull: 50, life: 3 },
  drain: { ko: "생명력 흡수", fx: "shadow/soul-drain", r: 46, dmg: 34, heal: 25 },
};
// 카드 묶음(왕마다). b: 건물, s: 마법, expand: 땅 넓히기, up: 강화
const DECKS = {
  elf: ["b:barracks", "b:barracks", "b:spring", "b:atower", "b:atower", "b:tree", "b:lodge", "s:poison", "s:roots", "s:leaves", "expand", "expand", "up"],
  dark: ["b:grave", "b:grave", "b:kennel", "b:dtower", "b:dtower", "b:altar", "b:obelisk", "s:dexp", "s:bhole", "s:drain", "expand", "expand", "up"],
};
export const KINGS = {
  elf: { ko: "엘프 왕", set: 4, hp: 420, crown: "leaf", weapons: ["elfbow", "elfbow2", "worldbow"], basic: "moves/arrow-shot", reach: 240, dmg: 24, ranged: true,
    ability: "화살비", abilityDesc: "10초마다 적이 가장 많은 곳에 화살비", cape: "#2a7a34", aura: ["#7af070", "#e8ffb0"] },
  dark: { ko: "흑기사 왕", set: 0, hp: 620, crown: "horned", weapons: ["demonsword", "demonsword2", "demonking"], basic: "melee/heavy-cleave", reach: 84, dmg: 42, ranged: false,
    ability: "마검 해방", abilityDesc: "15초마다 한 줄 전체에 붉은 참격", cape: "#9a1c28", aura: ["#ff4030", "#ffb070"] },
};
const cardInfo = (c) => {
  if (c === "expand") return { ko: "땅 넓히기", type: "땅", desc: "잠긴 칸 하나를 연다" };
  if (c === "up") return { ko: "강화", type: "강화", desc: "건물 하나의 레벨 +1" };
  const [t, k] = c.split(":");
  return t === "b" ? { ...BUILD[k], type: "건물", key: k } : { ...SPELL[k], type: "마법", key: k, desc: "손에 들었다가 전투 중에 원하는 자리에" };
};

export function createCastle(api) {
  const { cv, load, mods, createFx, setSkin, posed, STAND, READY, buildSkin, SETS, walkPose, getLook } = api;
  const ctx = cv.getContext("2d");
  const frame = createFrame(W, H), buf = new Uint8ClampedArray(W * H * 4), B32 = new Uint32Array(buf.buffer);
  let img = null, out32 = null, bg2 = null;
  const G = { on: false, phase: "king", king: null, wave: 0, hp: 600, max: 600, deck: [], hand: [], spells: [], plots: [], units: [], foes: [], queue: [], spawnT: 0,
    fields: [], shots: [], fx: [], nums: [], kingU: null, pick: null, armed: -1, speed: 1, awaken: 0, shards: 0, bosses: 0, t: 0, result: "", flash: [] };
  try { G.shards = +(localStorage.getItem("arena.shards") || 0); } catch {}

  // ---- 외형(인형 피부): 왕·병사·짐승
  const skins = {};
  let kingSkinCache = null, kingSkinKey = "";
  function kingSkin() {
    const K = KINGS[G.king], L = getLook(), key = G.king + G.awaken + JSON.stringify(L);
    if (kingSkinKey === key) return kingSkinCache;
    const set = SETS[K.set], mine = L.set === K.set;
    const base = buildSkin(set, mine ? L.color : {}, mine ? L.shape : {}, 2 * 1.2);
    base.extras = { ...set.extras, crown: K.crown, crownBig: G.awaken, cloak: true };
    base.ramps.crown = ramp(G.king === "elf" ? "#f0c040" : "#2a2230");
    base.ramps.crownGem = ramp(G.king === "elf" ? "#80ff90" : "#ff2a3a");
    if (!mine) base.ramps.cape = base.ramps.cloth = ramp(K.cape);
    kingSkinKey = key;
    return (kingSkinCache = base);
  }
  function soldierSkin(kind, elite) {
    const key = kind + (elite ? "+" : "");
    if (skins[key]) return skins[key];
    let s;
    if (kind === "elf") {
      s = buildSkin(SETS[4], { body: "#6ab858", arms: "#6ab858", gear: "#5aa84a", cloth: "#8a5a32", legs: "#6a5232", trim: elite ? "#ffd040" : "#8a6a3a" }, { bulk: 0.85, arm: 0.85, head: 1.05 }, 2 * 0.85);
      s.extras = { hood: true, elfEars: true, boots: true, belt: true };
    } else {
      s = buildSkin(SETS[0], { skin: "#e6dcc2", body: "#d8ccb0", arms: "#e2d6bc", legs: "#d8ccb0", feet: "#b8ac90", gear: "#5a5462", trim: elite ? "#ffd040" : "#6a6070" }, { bulk: 0.8, arm: 0.8, leg: 0.85 }, 2 * 0.85);
      s.extras = { helm: true };
      s.ramps.visor = ramp("#1a1420");
      s.paint = {};
    }
    return (skins[key] = s);
  }
  function beastSkin(kind) {
    if (skins[kind]) return skins[kind];
    const c = kind === "wolf" ? { a: "#a8a4b0", d: "#4a4656", s: "#e8e4f0", eye: "#ffe060" } : { a: "#4a2a2a", d: "#1a0e10", s: "#c83a2a", eye: "#ffb020" };
    const R = ramp(c.a), D = ramp(c.d), S = ramp(c.s);
    return (skins[kind] = { beast: true, scale: 0.8, yaw: 0, headYaw: 0.1, grim: true, snarl: 0.3, shag: ["beast", "bhead", "legN", "legF", "ruff"],
      ramps: { default: R, joint: R, beast: R, bhead: R, legN: R, legF: D, ruff: D, snout: S, ear: R, earIn: D, nose: ramp("#1a1418"), tooth: ramp("#f4eedc"), eye: ramp(c.eye), mouth: ramp("#5a1a20"), brow: D, claw: S } });
  }

  // ---- 칸
  function initPlots() {
    G.plots = [];
    for (let l = 0; l < 3; l++) for (let c = 0; c < 4; c++) G.plots.push({ lane: l, col: c, x: COL_X[c], y: LANE_Y[l], open: c < 2, b: null, lvl: 0, cd: 0 });
  }
  const plotAt = (x, y) => {
    let best = null, bd = 1e9;
    for (const p of G.plots) { const d = Math.hypot((p.x - x) * 0.8, p.y - 8 - y); if (d < bd) { bd = d; best = p; } }
    return bd < 24 ? best : null;
  };
  const neighbors = (p) => G.plots.filter((q) => q !== p && q.b && Math.abs(q.lane - p.lane) + Math.abs(q.col - p.col) === 1);
  function validFor(card, p) {
    if (!p || !card) return false;
    if (card === "expand") return !p.open && G.plots.some((q) => q.open && q.lane === p.lane && q.col === p.col - 1);
    if (card === "up") return p.open && !!p.b && p.lvl < 5;
    const k = card.split(":")[1];
    return p.open && (!p.b || (p.b === k && p.lvl < 5));
  }
  function applyCard(card, p) {
    if (card === "expand") p.open = true;
    else if (card === "up") p.lvl++;
    else { const k = card.split(":")[1]; if (p.b === k) p.lvl++; else { p.b = k; p.lvl = 1; } }
    burst("spawn/poof", p.x, p.y, 1);
  }

  // ---- 카드 단계(웨이브 사이)
  function draw3(pool) {
    const out = [], src = [...pool];
    while (out.length < 3 && src.length) out.push(src.splice((Math.random() * src.length) | 0, 1)[0]);
    return out;
  }
  function between() {
    G.phase = "cards";
    G.hand = draw3(G.deck);
    G.pick = null;
    panel();
  }
  function chooseCard(i) {
    const c = G.hand[i];
    if (c.startsWith("s:")) {
      if (G.spells.length >= 3) G.spells.shift();
      G.spells.push(c.split(":")[1]);
      G.hand = [];
      G.phase = "ready";
    } else if (!G.plots.some((p) => validFor(c, p))) { api.toast("놓을 수 있는 칸이 없어요"); return; }
    else { G.pick = c; G.phase = "place"; }
    panel();
  }
  function startWave() {
    G.wave++;
    G.phase = "fight";
    if (G.wave === MAX_WAVE && G.awaken < 2) awaken(2);
    const n = waveCount(G.wave), boss = BOSS_WAVES[G.wave], pool = POOLS.slice(0, Math.min(5, 1 + Math.floor((G.wave - 1) / 3))).flat().filter((k) => k !== "crocodile" || G.wave >= 12);
    G.queue = [];
    const minions = boss ? Math.round(n * 0.6) : n;
    for (let i = 0; i < minions; i++) G.queue.push({ kind: pool[(Math.random() * pool.length) | 0], lane: (Math.random() * 3) | 0 });
    if (boss) G.queue.splice(Math.floor(minions * 0.4), 0, { kind: boss.kind, lane: 1, boss });
    G.spawnT = 0.6;
    // 건물이 병사를 내보낸다(레벨만큼), 이웃 칸 강화를 반영
    G.units = G.units.filter((u) => u.king);
    for (const p of G.plots) {
      if (!p.b) continue;
      const bd = BUILD[p.b];
      p.cd = 0.5;
      if (bd.kind !== "spawn") continue;
      const nb = neighbors(p), hpK = 1 + nb.filter((q) => q.b === "tree").reduce((s, q) => s + 0.15 * q.lvl, 0), dmgK = 1 + nb.filter((q) => q.b === "altar").reduce((s, q) => s + 0.15 * q.lvl, 0);
      for (let i = 0; i < p.lvl; i++) spawnUnit(bd.unit, p, i, hpK, dmgK);
    }
    if (G.kingU) { if (G.kingU.down) G.kingU.hp = G.kingU.max * 0.6; G.kingU.down = false; }
    panel();
  }
  function spawnUnit(kind, p, i, hpK, dmgK) {
    const U = UNITS[kind], lv = p.lvl, k = 1.45 * (1 + 0.4 * (lv - 1));          // 균형: 카드가 웨이브마다 한 장이라 병사 하나하나가 세야 한다
    const u = { kind, U, lane: p.lane, x: p.x + 6 + i * 3, y: p.y, hp: U.hp * k * hpK, max: U.hp * k * hpK, dmg: U.dmg * k * dmgK, cd: 0.3 + Math.random() * 0.5, at: 0, walk: Math.random() * 6, elite: lv >= 3, lv5: lv >= 5,
      home: U.ranged ? 196 + Math.random() * 20 : RALLY + Math.random() * 26, revive: kind === "skeleton" && lv >= 5 };
    if (U.fx && mods[U.fx]) u.fx = createFx(mods[U.fx], { x: Math.round(u.x), y: u.y - 6, palette: U.palette, seed: (Math.random() * 1e5) | 0 });
    G.units.push(u);
  }
  function awaken(n) {
    G.awaken = n;
    const K = KINGS[G.king];
    api.toast(n === 1 ? `${K.ko} 1차 각성! 무기가 깨어납니다` : `${K.ko} 2차 각성! ${G.king === "elf" ? "세계수 활" : "마왕검"}`);
    if (G.kingU) burst("ui/level-up", KING_X, G.kingU.y, 2.5);
  }

  // ---- 적
  function spawnFoe(q) {
    const d = FOES[q.kind], wk = 1 + 0.1 * (G.wave - 1), mod = mods["critters/" + q.kind];
    if (!mod) return;
    const y = LANE_Y[q.lane] - (d.fly ?? 0) * (q.boss ? 1.4 : 1);
    const f = { kind: q.kind, d, lane: q.lane, x: W + 30, y, hp: q.boss ? q.boss.hp : d.hp * wk, spd: d.spd * (q.boss ? 0.7 : 0.85 + Math.random() * 0.3), dmg: d.dmg * (1 + 0.06 * (G.wave - 1)) * (q.boss ? 3 : 1),
      boss: q.boss, scale: q.boss ? q.boss.k : 1, fly: !!d.fly, slowT: 0, stopT: 0, dotT: 0, dot: 0, burnT: 0, hitT: 0 };
    f.max = f.hp;
    f.fx = createFx(mod, { x: Math.round(f.x), y: Math.round(y), flip: true, seed: (Math.random() * 1e5) | 0 });
    if (q.boss) api.toast(`보스 등장! 거대 ${q.kind === "slime" ? "슬라임" : q.kind === "crocodile" ? "악어" : "해골"}`);
    G.foes.push(f);
  }
  function hurt(f, dmg, opt = {}) {
    if (f.dead) return;
    const curse = G.plots.filter((p) => p.b === "obelisk" && p.lane === f.lane && Math.abs(p.x - f.x) < 130).reduce((s, p) => s + 0.12 * p.lvl, 0);
    dmg = Math.round(dmg * (1 + curse));
    f.hp -= dmg;
    f.hitT = 0.08;
    if (opt.burn) f.burnT = 3;
    if (opt.push && !f.boss) f.x += opt.push;
    G.nums.push({ x: f.x, y: f.y - 22 * f.scale, v: dmg, t: 0, big: dmg >= 40 });
    if (f.hp <= 0) kill(f);
  }
  function kill(f) {
    f.dead = true;
    G.foes = G.foes.filter((g) => g !== f);
    burst("spawn/poof", f.x, f.y, 1);
    if (f.boss) { G.bosses++; burst("explosions/big-explosion", f.x, LANE_Y[f.lane], 2); }
  }
  function burst(id, x, y, life) {
    const m = mods[id];
    if (m) G.fx.push({ fx: createFx(m, { x: Math.round(x), y: Math.round(y), seed: (Math.random() * 999) | 0 }), t: 0, life });
  }

  // ---- 왕
  function makeKing() {
    const K = KINGS[G.king];
    G.kingU = { king: true, K, lane: 1, y: LANE_Y[1], hp: K.hp, max: K.hp, act: null, cd: 0.5, ab: 4, manualT: 0, target: 1, down: false };
  }
  const kingWeapon = () => KINGS[G.king].weapons[G.awaken];
  const nearestLane = (y) => LANE_Y.reduce((b, ly, i) => (Math.abs(ly - y) < Math.abs(LANE_Y[b] - y) ? i : b), 0);
  function kingStep(k, dt) {
    if (k.down) return;
    // 줄 고르기: 누른 줄이 있으면 따르고, 아니면 성에 가장 가까운 땅의 적이 있는 줄
    if (k.manualT > 0) k.manualT -= dt;
    else {
      let best = k.target, bx = 1e9;
      for (const f of G.foes) if (!f.fly && f.x < bx) { bx = f.x; best = f.lane; }
      k.target = best;
    }
    const ty = LANE_Y[k.target];
    if (Math.abs(k.y - ty) > 1 && !k.act) { k.y += Math.sign(ty - k.y) * Math.min(Math.abs(ty - k.y), 130 * dt); k.moving = true; k.lane = nearestLane(k.y); return; }
    if (!k.act) { k.y = ty; k.lane = k.target; }
    k.moving = false;
    k.ab -= dt;
    if (k.ab <= 0 && G.foes.length) { k.ab = G.king === "elf" ? 10 : 15; ability(k); }
    if (k.act) return;
    k.cd -= dt;
    const K = k.K, tgt = G.foes.filter((f) => f.lane === k.lane && f.x > KING_X - 10 && f.x < KING_X + K.reach).sort((a, b) => a.x - b.x)[0];
    if (k.cd <= 0 && tgt) {
      const mod0 = mods[K.basic], w = kingWeapon();
      if (!mod0) return;
      const mod = { ...mod0, act: { ...mod0.act, poses: mod0.act.poses.map(([t, q, h]) => [t, q.weapon ? { ...q, weapon: w } : q, h]) } };
      const act = api.createAct(mod, { x: KING_X, y: Math.round(k.y), flip: false, seed: (Math.random() * 1e6) | 0 });
      act.onHit = (hh) => {
        if (hh.target === false) return;
        const near = G.foes.filter((f) => f.lane === k.lane && f.x > KING_X - 10 && f.x < KING_X + K.reach).sort((a, b) => a.x - b.x);
        const hit = K.ranged ? near.slice(0, 1) : near.slice(0, 3);
        for (const f of hit) {
          hurt(f, K.dmg * 1.35 * (1 + 0.5 * G.awaken) * (0.7 + (hh.push ?? 1.2) * 0.25), G.king === "dark" && G.awaken ? { push: 10, burn: true } : {});
          if (G.king === "elf" && G.awaken) { for (const g of G.foes.filter((g) => g.lane === f.lane && Math.abs(g.x - f.x) < 26 && g !== f)) hurt(g, 10 * G.awaken); burst("nature/thorns", f.x, LANE_Y[f.lane], 0.8); }
        }
      };
      k.act = { act, speed: 1.7 };
      k.cd = K.ranged ? 0.25 : 0.15;
    }
  }
  function ability(k) {
    if (G.king === "elf") {          // 화살비: 적이 가장 많이 모인 자리(줄 하나)
      let best = null, bn = 0;
      for (const f of G.foes) { const n = G.foes.filter((g) => g.lane === f.lane && Math.abs(g.x - f.x) < 40).length; if (n > bn) { bn = n; best = f; } }
      if (!best) return;
      const n = [12, 18, 28][G.awaken], dmg = [28, 38, 52][G.awaken];
      G.flash.push({ type: "rain", x: best.x, lane: best.lane, t: 0, n, life: 0.9, dmg, done: false });
      api.toast("엘프 왕 · 화살비");
    } else {          // 마검 해방: 왕의 줄 전체(2차 각성에서 적이 가장 많은 다른 줄까지 2줄)
      const lanes = [k.lane];
      if (G.awaken >= 2) lanes.push([0, 1, 2].filter((l) => l !== k.lane).sort((a, b) => G.foes.filter((f) => f.lane === b).length - G.foes.filter((f) => f.lane === a).length)[0]);
      const dmg = [80, 120, 170][G.awaken];
      for (const l of lanes) { G.flash.push({ type: "slash", lane: l, t: 0, life: 0.55 }); for (const f of G.foes.slice()) if (f.lane === l && f.x > KING_X - 20) hurt(f, dmg, { push: 14, burn: G.awaken > 0 }); }
      api.toast("흑기사 왕 · 마검 해방");
    }
  }

  // ---- 한 장면(배속 반영)
  function step(dt0) {
    if (!G.on) return;
    const dt = dt0 * G.speed;
    G.t += dt;
    for (const n of G.nums) n.t += dt0;
    G.nums = G.nums.filter((n) => n.t < 0.8);
    for (const fl of G.flash) {
      fl.t += dt;
      if (fl.type === "rain" && !fl.done && fl.t > 0.45) { fl.done = true; for (const f of G.foes.slice()) if (f.lane === fl.lane && Math.abs(f.x - fl.x) < 46) hurt(f, fl.dmg); }
    }
    G.flash = G.flash.filter((fl) => fl.t < fl.life);
    for (const r of G.fx) { r.t += dt; r.fx.update(dt); }
    G.fx = G.fx.filter((r) => r.t < r.life);
    for (const u of G.units) if (u.fx) u.fx.update(dt);
    if (G.phase !== "fight") { if (G.kingU) G.kingU.act = null; return; }
    if (G.queue.length && (G.spawnT -= dt) <= 0 && G.foes.length < 34) {
      G.spawnT = Math.max(0.12, 1.1 - G.wave * 0.045) * (0.5 + Math.random());
      spawnFoe(G.queue.shift());
    }
    const k = G.kingU;
    if (k.act) { k.act.act.update(dt * k.act.speed); if (k.act.act.done()) k.act = null; }
    kingStep(k, dt);
    for (const p of G.plots) {          // 탑
      if (!p.b || BUILD[p.b].kind !== "tower") continue;
      const bd = BUILD[p.b];
      if ((p.cd -= dt) > 0) continue;
      const tg = G.foes.filter((f) => f.lane === p.lane && f.x > p.x && f.x - p.x < bd.range + p.lvl * 12).sort((a, b) => a.x - b.x)[0];
      if (!tg) continue;
      p.cd = bd.rate / (1 + 0.15 * (p.lvl - 1));
      const shots = p.lvl >= 3 ? 2 : 1;
      for (let s = 0; s < shots; s++) G.shots.push({ kind: bd.proj, x: p.x + 4, y: p.y - 30, tg, dmg: bd.dmg * 1.5 * (1 + 0.4 * (p.lvl - 1)), spd: bd.proj === "arrow" ? 260 : 170, lane: p.lane, delay: s * 0.12, aoe: p.lvl >= 5 });
    }
    for (const u of G.units) {          // 병사
      if (u.king || u.dead) continue;
      u.cd -= dt;
      if (u.at > 0) u.at -= dt;
      if (u.hitT > 0) u.hitT -= dt;
      const tg = G.foes.filter((f) => f.lane === u.lane && f.x > u.x - 6 && (!f.fly || u.U.ranged)).sort((a, b) => a.x - b.x)[0];
      const reach = u.U.range;
      if (tg && tg.x - u.x < reach) {
        u.moving = false;
        if (u.cd <= 0) {
          u.cd = u.U.rate; u.at = 0.45;
          if (u.U.ranged) { G.shots.push({ kind: "arrow", x: u.x + 8, y: u.y - 22, tg, dmg: u.dmg, spd: 240, lane: u.lane, delay: 0.15 }); if (u.lv5) G.shots.push({ kind: "arrow", x: u.x + 8, y: u.y - 24, tg, dmg: u.dmg, spd: 240, lane: u.lane, delay: 0.3 }); }
          else hurt(tg, u.dmg, { burn: u.U.burn });
        }
      } else {
        const goal = tg ? Math.min(u.home + 60, tg.x - reach + 4) : u.home;
        if (Math.abs(goal - u.x) > 2) { u.x += Math.sign(goal - u.x) * u.U.spd * dt; u.moving = true; u.walk += dt * 9; } else u.moving = false;
      }
      if (u.fx) u.fx.options.x = Math.round(u.x);
    }
    for (const s of G.shots) {          // 화살·구슬
      if (s.delay > 0) { s.delay -= dt; continue; }
      const alive = !s.tg.dead, tx = alive ? s.tg.x : s.tx ?? s.x + 80, ty = alive ? s.tg.y - 10 : s.ty ?? s.y;
      s.tx = tx; s.ty = ty;
      const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      if (d < 6) { s.hit = true; if (alive) hurt(s.tg, s.dmg); if (s.aoe) for (const f of G.foes.slice()) if (f.lane === s.lane && Math.abs(f.x - tx) < 24 && f !== s.tg) hurt(f, s.dmg * 0.5); continue; }
      s.x += (dx / d) * s.spd * dt; s.y += (dy / d) * s.spd * dt;
    }
    G.shots = G.shots.filter((s) => !s.hit && s.x < W + 40);
    for (const f of G.foes.slice()) {          // 적: 막히면 때리고, 성에 닿으면 성이 깎인다
      f.fx.update(dt);
      if (f.hitT > 0) f.hitT -= dt;
      if (f.slowT > 0) f.slowT -= dt;
      if (f.stopT > 0) f.stopT -= dt;
      if (f.dotT > 0) { f.dotT -= dt; f.dacc = (f.dacc ?? 0) + f.dot * dt; if (f.dacc >= 5) { hurt(f, f.dacc); f.dacc = 0; } }
      if (f.burnT > 0) { f.burnT -= dt; f.bacc = (f.bacc ?? 0) + 6 * dt; if (f.bacc >= 4) { hurt(f, f.bacc); f.bacc = 0; } }
      if (f.dead) continue;
      const reachF = f.boss ? 26 * f.scale : 16;
      let wall = null;
      if (!f.fly) {
        wall = G.units.find((u) => !u.king && !u.dead && u.lane === f.lane && f.x > u.x && f.x - u.x < reachF);
        if (!wall && !k.down && k.lane === f.lane && !k.moving && f.x > KING_X && f.x - KING_X < reachF + 4) wall = k;
      }
      if (wall) {
        wall.hp -= f.dmg * dt;
        wall.hitT = 0.05;
        if (wall.hp <= 0) {
          if (wall.king) { wall.down = true; wall.act = null; api.toast("왕이 쓰러졌다! 다음 웨이브에 일어납니다"); }
          else if (wall.revive) { wall.revive = false; wall.hp = wall.max * 0.5; burst("spawn/summon-rise", wall.x, wall.y, 1.2); }
          else { wall.dead = true; burst("spawn/poof", wall.x, wall.y, 1); }
        }
        continue;
      }
      const sp = f.stopT > 0 ? 0 : f.spd * (f.slowT > 0 ? 0.4 : 1);
      f.x -= sp * dt;
      f.fx.options.x = Math.round(f.x);
      if (f.x < CASTLE_X + 6) {
        G.hp -= f.dmg * (f.boss ? 2 : 1);
        kill(f);
        if (G.hp <= 0) { G.hp = 0; finishRun(false); return; }
      }
    }
    G.units = G.units.filter((u) => u.king || !u.dead);
    for (const r of G.fields) {          // 마법 자리
      r.t += dt; r.fx.update(dt);
      const s = r.s;
      if (!r.hit && r.t >= 0.35) {
        r.hit = true;
        for (const f of G.foes.slice()) { const dl = Math.abs(f.lane - r.lane); if (dl > 1 || Math.abs(f.x - r.x) > s.r) continue; const m = dl ? 0.5 : 1; if (s.dmg) hurt(f, s.dmg * m); if (s.stop) f.stopT = s.stop * m; }
        if (s.heal) G.hp = Math.min(G.max, G.hp + s.heal);
      }
      if ((s.dot || s.pull) && r.t > 0.3 && r.t < r.life) for (const f of G.foes) { if (Math.abs(f.lane - r.lane) > 1 || Math.abs(f.x - r.x) > s.r) continue; if (s.dot) { f.dotT = 0.6; f.dot = s.dot; } if (s.pull && !f.boss) f.x += Math.sign(r.x - f.x) * Math.min(Math.abs(r.x - f.x), s.pull * dt); }
      if (r.t >= r.life && !r.stopped) { r.fx.stop?.(); r.stopped = true; }
    }
    G.fields = G.fields.filter((r) => r.t < r.life + 1.2);
    if (!G.queue.length && !G.foes.length) {          // 웨이브 끝
      for (const p of G.plots) if (p.b === "tree") G.hp = Math.min(G.max, G.hp + 6 * p.lvl);
      G.units = G.units.filter((u) => u.king);
      if (G.wave >= MAX_WAVE) return finishRun(true);
      if (BOSS_WAVES[G.wave]) {
        if (G.wave === 10) awaken(1);
        G.phase = "reward"; G.hand = draw3(DECKS[G.king]); panel();
      } else between();
    }
  }
  function finishRun(win) {
    G.phase = "over";
    const got = Math.max(0, G.wave - (win ? 0 : 1)) + G.bosses * 3 + (win ? 10 : 0);
    G.shards += got;
    try { localStorage.setItem("arena.shards", G.shards); } catch {}
    G.result = win ? `승리! 20웨이브를 막았습니다 · 별 조각 +${got}` : `성이 무너졌습니다 (${G.wave}웨이브) · 별 조각 +${got}`;
    panel();
  }
  function castSpell(idx, x, y) {
    const key = G.spells[idx], s = SPELL[key], m = mods[s.fx];
    if (!m) return;
    const lane = nearestLane(y);
    G.fields.push({ fx: createFx(m, { x: Math.round(x), y: LANE_Y[lane], seed: (Math.random() * 1e5) | 0 }), x, lane, s, t: 0, life: s.life ?? m.meta.duration });
    G.spells.splice(idx, 1);
    G.armed = -1;
    api.toast(`마법 · ${s.ko}`);
    panel();
  }

  // ---- 그리기
  function px(fr, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) fr.color[y * W + x] = c; }
  function lightAt(fr, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) fr.light[y * W + x] = c; }
  function rect(fr, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(fr, x, y, c); }
  function buildBg() {
    const C = document.createElement("canvas"); C.width = W; C.height = H;
    const g = C.getContext("2d");
    ["#2a2448", "#3b2f5c", "#5a3d6e", "#83506f", "#b4686b", "#e08c64"].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 16, W, 16); });
    g.fillStyle = "#e08c64"; g.fillRect(0, 96, W, 40);
    g.fillStyle = "#ffd890"; g.beginPath(); g.arc(300, 78, 14, 0, 7); g.fill();
    const hills = (base, amp, col, sd) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 4) g.lineTo(x, base - Math.abs(Math.sin(x * 0.02 + sd)) * amp); g.lineTo(W, H); g.fill(); };
    hills(104, 26, "#6b4a72", 1.1); hills(120, 16, "#4a3658", 3.7);
    g.fillStyle = "#3e5a32"; g.fillRect(0, 126, W, H - 126);
    let sd = 7; const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.5 ? "#4a6a3a" : "#34502a"; g.fillRect((rnd() * W) | 0, 126 + ((rnd() * (H - 126)) | 0), 1, 1); }
    LANE_Y.forEach((y, i) => {
      g.fillStyle = ["#7a6248", "#86684c", "#927252"][i]; g.fillRect(0, y - 12, W, 16);
      g.fillStyle = "#5e4a36"; g.fillRect(0, y - 12, W, 1); g.fillRect(0, y + 3, W, 1);
      for (let x = (i * 7) % 11; x < W; x += 11) { g.fillStyle = "#6a543c"; g.fillRect(x, y - 6 + ((x * 3) % 7), 2, 1); }
    });
    const stone = ["#d0cac2", "#a8a29a", "#86807a", "#5e5854"];
    for (let y = 70; y < H; y++) for (let x = 0; x < 50; x++) { g.fillStyle = stone[((x + (Math.floor(y / 7) % 2) * 6) % 12 === 0 || y % 7 === 0) ? 3 : x < 8 ? 0 : x > 42 ? 2 : 1]; g.fillRect(x, y, 1, 1); }
    for (let k = 0; k < 5; k++) { g.fillStyle = stone[1]; g.fillRect(k * 11, 62, 7, 8); }
    LANE_Y.forEach((y) => { g.fillStyle = "#3a2416"; g.fillRect(34, y - 26, 16, 26); g.fillStyle = "#1c1820"; g.fillRect(34, y - 26, 16, 2); });
    g.fillStyle = "#5a3a22"; g.fillRect(22, 30, 2, 34); g.fillStyle = "#b02a34"; g.beginPath(); g.moveTo(24, 30); g.lineTo(38, 35); g.lineTo(24, 40); g.fill();
    const d = g.getImageData(0, 0, W, H), src = new Uint32Array(d.data.buffer);
    bg2 = new Uint32Array(W2 * H2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = src[y * W + x], o = y * 2 * W2 + x * 2; bg2[o] = bg2[o + 1] = bg2[o + W2] = bg2[o + W2 + 1] = c; }
  }
  const COL = Object.fromEntries(Object.entries({ wood: "#8a5a32", woodD: "#5a3820", woodL: "#b07a48", leaf: "#4aa040", leafD: "#2a6a28", leafL: "#8ad060", stone: "#a8a29a", stoneD: "#6e6862", stoneL: "#d0cac2", gold: "#ffd84a", water: "#5ad0c0", waterL: "#c8fff0", dark: "#2a2232", darkD: "#16101c", purple: "#8a4ad0", purpleL: "#d0a0ff", red: "#c02a34", redL: "#ff6a5a", bone: "#e6dcc2", iron: "#4a4a56", ink: "#0b0a10", roof: "#3a7a3a" }).map(([k, v]) => [k, hex(v)]));
  function drawBuilding(fr, p, t) {
    const x = p.x, y = p.y, L = p.lvl, b = p.b, R = (dx, dy, w, h, c) => rect(fr, Math.round(x + dx), Math.round(y + dy), w, h, c);
    if (b === "barracks" || b === "lodge") {          // 나무 막사 / 통나무 오두막
      R(-11, -16, 22, 16, b === "lodge" ? COL.woodD : COL.wood);
      for (let i = 0; i < 4; i++) R(-11, -15 + i * 4, 22, 1, COL.woodD);
      for (let i = 0; i < 12; i++) R(-13 + i, -17 - i, 26 - i * 2, 1, b === "lodge" ? COL.wood : COL.roof);
      R(-3, -9, 6, 9, COL.ink);
      if (b === "lodge") { R(-6, -26, 2, 5, COL.bone); R(4, -26, 2, 5, COL.bone); R(-4, -24, 8, 1, COL.bone); }
    } else if (b === "spring") {          // 돌 샘 + 빛나는 물
      R(-12, -6, 24, 6, COL.stone); R(-12, -6, 24, 1, COL.stoneL); R(-10, -9, 20, 3, COL.water);
      for (let i = 0; i < 3; i++) lightAt(fr, x - 6 + i * 6, y - 11 - ((t * 6 + i * 3) % 8), COL.waterL);
    } else if (b === "atower" || b === "dtower") {          // 높은 탑
      const dk = b === "dtower";
      R(-6, -34, 12, 34, dk ? COL.dark : COL.wood); R(-8, -38, 16, 4, dk ? COL.darkD : COL.woodD);
      for (let i = 0; i < 6; i++) R(-6, -32 + i * 6, 12, 1, dk ? COL.darkD : COL.woodD);
      R(-2, -30, 4, 5, COL.ink);
      if (dk) { R(-2, -44, 4, 4, COL.purple); lightAt(fr, x, y - 42, COL.purpleL); }
      else { R(-9, -40, 2, 4, COL.woodD); R(7, -40, 2, 4, COL.woodD); }
    } else if (b === "tree") {          // 생명의 나무
      R(-2, -16, 4, 16, COL.woodD);
      for (let a = 0; a < 6.28; a += 0.05) for (let r = 0; r < 11 + L; r += 1.3) px(fr, x + Math.cos(a) * r, y - 22 + Math.sin(a) * r * 0.75, r > 9 + L ? COL.leafD : (a + r) % 2 < 1 ? COL.leaf : COL.leafL);
      for (let i = 0; i < L + 1; i++) lightAt(fr, x - 7 + ((i * 5) % 14), y - 26 + ((i * 3) % 8), COL.gold);
    } else if (b === "grave") {          // 묘비와 십자가
      R(-10, -12, 7, 12, COL.stone); R(-10, -12, 7, 1, COL.stoneL); R(3, -10, 7, 10, COL.stoneD);
      R(-1, -20, 2, 12, COL.stone); R(-4, -17, 8, 2, COL.stone);
      lightAt(fr, x, y - 4, COL.purpleL);
    } else if (b === "kennel") {          // 쇠창살 우리 + 붉은 눈
      R(-12, -14, 24, 14, COL.darkD);
      for (let i = 0; i < 7; i++) R(-12 + i * 4, -14, 1, 14, COL.iron);
      R(-12, -15, 24, 2, COL.iron);
      if (Math.floor(t * 2) % 3) { lightAt(fr, x - 3, y - 6, COL.redL); lightAt(fr, x + 2, y - 6, COL.redL); }
    } else if (b === "altar") {          // 피의 제단 + 불꽃
      R(-10, -8, 20, 8, COL.stoneD); R(-12, -10, 24, 3, COL.stone); R(-5, -12, 10, 2, COL.red);
      for (let i = 0; i < 5; i++) { const h = 3 + (((Math.sin(t * 9 + i) + 1) * 3) | 0); R(-4 + i * 2, -12 - h, 1, h, i % 2 ? COL.redL : COL.gold); }
    } else if (b === "obelisk") {          // 저주 오벨리스크 + 빛나는 룬
      for (let i = 0; i < 34; i++) R(-4 + Math.floor(i / 12), -i, 8 - Math.floor(i / 12) * 2, 1, i % 6 === 0 ? COL.darkD : COL.dark);
      for (let i = 0; i < 4; i++) lightAt(fr, x, y - 6 - i * 7, (Math.floor(t * 4) + i) % 4 ? COL.purple : COL.purpleL);
    }
    for (let i = 0; i < L; i++) px(fr, x - 6 + i * 3, y + 4, COL.gold);          // 레벨: 금빛 점
    if (L >= 3) { R(9, -30, 1, 12, COL.woodD); R(10, -30, 5, 4, COL.gold); }          // 3레벨: 금 깃발
    if (L >= 5) for (let a = 0; a < 20; a++) if ((a + Math.floor(t * 8)) % 3 === 0) lightAt(fr, x + Math.cos(a / 3.18) * 15, y - 12 + Math.sin(a / 3.18) * 6, COL.gold);          // 5레벨: 빛
  }
  function drawText(fr, str, x, y, c) {
    rasterText(str, "mini", (a, b) => px(fr, x + a + 1, y + b + 1, COL.ink));
    rasterText(str, "mini", (a, b) => px(fr, x + a, y + b, c));
  }
  function bar(fr, x, y, k, col) { for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) px(fr, x - 8 + i, y + j, j !== 1 ? COL.ink : i < Math.round(16 * k) ? col : hex("#3a2430")); }
  function blend() {          // 보통 층(투명) → 두 배로 키워 얹기
    composite(frame, buf, null);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = B32[y * W + x], a = c >>> 24;
      if (!a) continue;
      const o = y * 2 * W2 + x * 2;
      for (const j of [o, o + 1, o + W2, o + W2 + 1]) {
        if (a === 255) { out32[j] = c; continue; }
        const d = out32[j], k = a / 255, ch = (n) => Math.round(((c >>> n) & 255) * k + ((d >>> n) & 255) * (1 - k));
        out32[j] = (255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
      }
    }
  }
  function figure(skin, q, x, y, colorFn) {          // 두 배 층에 인형 하나(발 자리 x, y 는 보통 좌표)
    setSkin(skin);
    const r = posed(q), bx = Math.round(x * 2), by = Math.round(y * 2);
    for (let i = 0; i < r.n; i++) {
      const X = bx + r.xs[i], Y = by + r.ys[i];
      if (X < 0 || Y < 0 || X >= W2 || Y >= H2) continue;
      out32[Y * W2 + X] = colorFn ? colorFn(r.color[i]) : r.color[i];
    }
    setSkin(null);
  }
  const bigFrames = {};
  function bigFx(f) {          // 보스: 소환수 그림을 따로 그려 몇 배로 키워 얹는다
    const meta = f.fx.meta, [w, h] = meta.size, [ox, oy] = meta.origin, key = w + "x" + h;
    const fr = bigFrames[key] ?? (bigFrames[key] = { f: createFrame(w, h), b: new Uint8ClampedArray(w * h * 4) });
    clearFrame(fr.f);
    const ox0 = f.fx.options.x, oy0 = f.fx.options.y;
    f.fx.options.x = ox; f.fx.options.y = oy;
    f.fx.draw(fr.f);
    f.fx.options.x = ox0; f.fx.options.y = oy0;
    composite(fr.f, fr.b, null);
    const S32 = new Uint32Array(fr.b.buffer), k = Math.round(f.scale * 2), X0 = Math.round(f.x * 2 - ox * k), Y0 = Math.round(f.y * 2 - oy * k);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = S32[y * w + x];
      if ((c >>> 24) < 128) continue;
      const cc = f.hitT > 0 ? 0xffffffff : c;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const X = X0 + x * k + a, Y = Y0 + y * k + b; if (X >= 0 && Y >= 0 && X < W2 && Y < H2) out32[Y * W2 + X] = cc; }
    }
  }
  function soldierPose(u) {
    const U = u.U, m = U.pose && mods[U.pose];
    if (u.at > 0 && m) {
      const keys = m.act.poses, t0 = keys[0][0], t1 = keys[keys.length - 1][0], ph = 1 - u.at / 0.45;
      const q = poseAt(keys, t0 + (t1 - t0) * Math.min(0.75, ph * 0.75));
      return { ...q, x: 0, y: 0, ghost: false, weapon: q.weapon ? U.weapon : q.weapon };
    }
    const first = m ? { ...m.act.poses[0][1], x: 0, y: 0, ghost: false } : { ...READY };
    const q = first.weapon ? { ...first, weapon: U.weapon } : first;
    return u.moving ? walkPose(q, u.walk) : q;
  }
  function kingIdle() {
    const m = mods[KINGS[G.king].basic], q0 = m ? { ...m.act.poses[0][1], x: 0, y: 0, ghost: false } : { ...READY };
    return q0.weapon ? { ...q0, weapon: kingWeapon() } : q0;
  }
  function render() {
    if (!img || !G.on) return;
    out32.set(bg2);
    const t = G.t, k = G.kingU;
    for (let l = 0; l < 3; l++) {          // 뒤 줄부터: 보통 층(건물·적·탄) → 두 배 층(병사·왕·보스)
      clearFrame(frame);
      for (const p of G.plots) {
        if (p.lane !== l) continue;
        if (!p.open) {
          if (G.phase === "place" && G.pick === "expand" && validFor("expand", p)) for (let a = 0; a < 30; a++) if ((a + Math.floor(t * 6)) % 4) lightAt(frame, p.x + Math.cos(a / 4.77) * 13, p.y + Math.sin(a / 4.77) * 4, COL.gold);
          else for (let a = 0; a < 30; a += 3) px(frame, p.x + Math.cos(a / 4.77) * 13, p.y + Math.sin(a / 4.77) * 4, hex("#3a4a30"));
          continue;
        }
        if (p.b) drawBuilding(frame, p, t);
        if (G.phase !== "fight") {          // 칸 표시
          const ok = G.phase === "place" && validFor(G.pick, p);
          if (!p.b || ok) for (let a = 0; a < 30; a++) if ((a + Math.floor(t * 6)) % 4) lightAt(frame, p.x + Math.cos(a / 4.77) * 13, p.y + Math.sin(a / 4.77) * 4, ok ? COL.gold : hex("#5ab0ff"));
        }
      }
      for (const f of G.foes) if (f.lane === l && !f.boss) f.fx.draw(frame);
      for (const u of G.units) if (u.lane === l && u.fx) u.fx.draw(frame);
      for (const s of G.shots) if (s.lane === l && s.delay <= 0) {
        if (s.kind === "arrow") { for (let i = 0; i < 6; i++) px(frame, s.x - i, s.y, i ? COL.woodL : COL.stoneL); }
        else { for (let a = 0; a < 6.28; a += 0.8) px(frame, s.x + Math.cos(a) * 2, s.y + Math.sin(a) * 2, COL.purple); lightAt(frame, s.x, s.y, COL.purpleL); }
      }
      for (const r of G.fields) if (r.lane === l) r.fx.draw(frame, "back");
      blend();
      for (const f of G.foes) if (f.lane === l && f.boss) bigFx(f);
      for (const u of G.units) {
        if (u.king || u.lane !== l || u.fx) continue;
        const white = u.hitT > 0 ? () => 0xffffffff : null;
        if (u.U.beast) figure(beastSkin(u.U.beast), { walk: Math.round((u.walk * 16) % 100), go: u.moving ? 100 : 0, jaw: u.at > 0 ? 70 : 0, rear: u.at > 0.25 ? 25 : 0 }, u.x, u.y, white);
        else figure(soldierSkin(u.U.rig, u.elite), soldierPose(u), u.x, u.y, white);
      }
      if (k && nearestLane(k.y) === l) {
        const q = k.act ? k.act.act.pose ?? STAND : k.down ? { ...STAND, crouch: 9, lean: 6 } : kingIdle();
        figure(kingSkin(), k.moving ? walkPose(q, t * 9) : q, KING_X + (k.act ? q.x ?? 0 : 0), k.y + (k.act ? q.y ?? 0 : 0), k.down ? (c) => (c & 0xff000000) | ((c >>> 1) & 0x7f7f7f) : null);
      }
    }
    // 앞 층: 왕 기운, 왕 동작 효과, 마법, 터짐, 화살비·참격, 숫자, 체력 막대
    clearFrame(frame);
    if (k && !k.down) {
      const [a1, a2] = KINGS[G.king].aura.map(hex), n = 6 + G.awaken * 8;
      for (let i = 0; i < n; i++) { const ph = (t * (0.6 + (i % 3) * 0.2) + i * 0.37) % 1; lightAt(frame, KING_X - 10 + ((i * 7) % 22), k.y - ph * (34 + G.awaken * 12), i % 2 ? a1 : a2); }
      if (G.awaken) for (let a = 0; a < 26; a++) if ((a + Math.floor(t * 10)) % 3 === 0) lightAt(frame, KING_X + Math.cos(a / 4.1) * (16 + G.awaken * 3), k.y - 2 + Math.sin(a / 4.1) * 4, a1);
      if (k.act) k.act.act.draw(frame, { body: false, target: false });
    }
    for (const r of G.fields) r.fx.draw(frame, "front");
    for (const r of G.fx) r.fx.draw(frame);
    for (const fl of G.flash) {
      const ly = LANE_Y[fl.lane], u = fl.t / fl.life;
      if (fl.type === "rain") for (let i = 0; i < fl.n; i++) { const x = fl.x - 40 + ((i * 37) % 80), yy = ly - 70 + ((u * 1.6 + (i % 5) * 0.13) % 1) * 70; for (let j = 0; j < 5; j++) px(frame, x - j * 0.4, yy - j, j ? COL.leafL : COL.stoneL); lightAt(frame, x, yy, COL.leafL); }
      else for (let x = KING_X; x < W; x++) for (let j = -3; j <= 3; j++) { if (Math.abs(j) >= 3 * (1 - u) + 0.5) continue; const yy = ly - 14 + j + Math.sin(x * 0.08) * 2; if (Math.abs(j) < 1) lightAt(frame, x, yy, hex("#ffd0c0")); else px(frame, x, yy, COL.red); }
    }
    for (const f of G.foes) if (f.hp < f.max) bar(frame, f.x, f.y - (f.boss ? 30 * f.scale : 24), f.hp / f.max, hex("#e0485a"));
    for (const u of G.units) if (!u.king && u.hp < u.max) bar(frame, u.x, u.y - 34, u.hp / u.max, hex("#58b8f0"));
    if (k) bar(frame, KING_X, k.y - 54, k.hp / k.max, hex("#ffd84a"));
    for (const n of G.nums) drawText(frame, String(n.v), Math.round(n.x) - 4, Math.round(n.y - n.t * 20), n.big ? hex("#ffe14a") : hex("#ffffff"));
    blend();
    ctx.putImageData(img, 0, 0);
  }

  // ---- 화면(아래 판·손패·배속)
  const ui = document.createElement("div");
  ui.id = "c2";
  ui.hidden = true;
  ui.innerHTML = `<div id="c2top"><button id="c2speed">1배</button></div><div id="c2hand"></div><div id="c2panel"></div>`;
  document.body.appendChild(ui);
  const $ = (id) => document.getElementById(id);
  $("c2speed").onclick = () => { G.speed = G.speed >= 3 ? 1 : G.speed + 1; $("c2speed").textContent = G.speed + "배"; };
  function panel() {
    const P = $("c2panel"), hand = $("c2hand");
    P.innerHTML = "";
    hand.innerHTML = "";
    hand.hidden = G.phase !== "fight" || !G.spells.length;
    G.spells.forEach((key, i) => {
      const b = document.createElement("button");
      b.textContent = SPELL[key].ko;
      if (G.armed === i) b.className = "on";
      b.onclick = () => { G.armed = G.armed === i ? -1 : i; panel(); api.toast(G.armed >= 0 ? "무대를 누르면 그 자리에 시전" : "취소"); };
      hand.appendChild(b);
    });
    const add = (html, cls, fn) => { const b = document.createElement("button"); b.innerHTML = html; if (cls) b.className = cls; b.onclick = fn; P.appendChild(b); return b; };
    const note = (t) => { const d = document.createElement("div"); d.className = "c2note"; d.textContent = t; P.appendChild(d); };
    P.hidden = G.phase === "fight";
    if (G.phase === "king") {
      note("왕을 고르세요");
      for (const key of ["elf", "dark"]) { const K = KINGS[key]; add(`<b>${K.ko}</b><small>${K.ability}: ${K.abilityDesc}<br>카드: ${[...new Set(DECKS[key])].map((c) => cardInfo(c).ko).join(" · ")}</small>`, "c2card", () => begin(key)); }
      note(`별 조각 ${G.shards}`);
    } else if (G.phase === "cards" || G.phase === "reward") {
      note(G.phase === "reward" ? "보스 처치! 새 카드 하나를 묶음에 더하세요" : `${G.wave + 1}웨이브 준비 · 적 ${waveCount(G.wave + 1)}마리${BOSS_WAVES[G.wave + 1] ? " · 보스" : ""} · 카드 하나를 고르세요`);
      G.hand.forEach((c, i) => { const ci = cardInfo(c); add(`<b>${ci.ko}</b><i>${ci.type}</i><small>${ci.desc}</small>`, "c2card", () => { if (G.phase === "reward") { G.deck.push(c); api.toast(`${ci.ko} 카드를 얻었다`); between(); } else chooseCard(i); }); });
      if (G.phase === "cards") add("건너뛰기", "c2skip", () => { G.phase = "ready"; panel(); });
    } else if (G.phase === "place") {
      note(`「${cardInfo(G.pick).ko}」 놓을 칸을 누르세요(빛나는 칸)`);
      add("다른 카드 고르기", "c2skip", () => { G.phase = "cards"; G.pick = null; panel(); });
    } else if (G.phase === "ready") {
      note(G.spells.length ? `손에 든 마법: ${G.spells.map((key) => SPELL[key].ko).join(" · ")}` : "준비 끝");
      add(`${G.wave + 1}웨이브 시작`, "red", () => startWave());
    } else if (G.phase === "over") {
      note(G.result);
      add("다시 하기", "red", () => enter());
      add("메뉴로", "", () => api.menu());
    }
  }
  function begin(key) {
    G.king = key;
    G.deck = [...DECKS[key]];
    Object.assign(G, { wave: 0, hp: G.max, spells: [], foes: [], fields: [], shots: [], fx: [], flash: [], awaken: 0, bosses: 0, armed: -1, queue: [] });
    initPlots();
    makeKing();
    G.units = [G.kingU];
    between();
  }
  // 무대 누르기: 칸 고르기 / 마법 시전 / 왕 줄 옮기기
  cv.addEventListener("pointerdown", (e) => {
    if (!G.on) return;
    const r = cv.getBoundingClientRect(), s = Math.min(r.width / W2, r.height / H2), ox = (r.width - W2 * s) / 2, oy = (r.height - H2 * s) / 2;
    const x = (e.clientX - r.left - ox) / s / 2, y = (e.clientY - r.top - oy) / s / 2;
    if (G.phase === "place") {
      const p = plotAt(x, y);
      if (p && validFor(G.pick, p)) { applyCard(G.pick, p); G.pick = null; G.hand = []; G.phase = "ready"; panel(); }
      return;
    }
    if (G.phase !== "fight") return;
    if (G.armed >= 0) return castSpell(G.armed, x, y);
    if (y > 130 && G.kingU && !G.kingU.down) { G.kingU.target = nearestLane(y); G.kingU.manualT = 8; api.toast(`왕을 ${["윗", "가운데", "아랫"][G.kingU.target]} 줄로`); }
  });

  async function preload() {
    const ids = new Set(["spawn/poof", "spawn/summon-rise", "explosions/big-explosion", "ui/level-up", "nature/thorns", ...Object.keys(FOES).map((key) => "critters/" + key), ...Object.values(SPELL).map((s) => s.fx),
      ...Object.values(UNITS).map((u) => u.pose ?? u.fx).filter(Boolean), ...Object.values(KINGS).map((K) => K.basic)]);
    await Promise.all([...ids].map(load));
  }
  async function enter() {
    await preload();
    if (!bg2) buildBg();
    cv.width = W2; cv.height = H2;
    img = ctx.createImageData(W2, H2); out32 = new Uint32Array(img.data.buffer);
    Object.assign(G, { on: true, phase: "king", king: null, kingU: null, units: [], foes: [], queue: [], fields: [], shots: [], fx: [], flash: [], spells: [], wave: 0, hp: G.max, speed: 1 });
    $("c2speed").textContent = "1배";
    initPlots();
    ui.hidden = false;
    panel();
  }
  function exit() { G.on = false; ui.hidden = true; }
  function info() { return G.king ? `${G.wave}/${MAX_WAVE}웨이브 · 성 ${Math.ceil(G.hp)}/${G.max}${G.phase === "fight" ? ` · 남은 적 ${G.queue.length + G.foes.length}` : ""}` : "성 지키기"; }
  return { G, enter, exit, step, render, info, begin, startWave, chooseCard, applyCard, validFor, between, panel, plotAt, castSpell, awaken, finishRun };
}
