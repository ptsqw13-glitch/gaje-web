// 성 지키기 3판(2026-11-27, 2차 그릴 계획: docs/castle_plan2.md)
// 세로 화면에 딱 맞는 무대. 적은 위에서 아래로 3줄을 따라 내려오고, 성은 맨 아래, 왕국 칸 구역은 아래 3분의 1.
// 왕은 손가락으로 끌어 옮기고 스킬 단추 3개, 기력으로 손패(마법·강화)를 전투 중에 낸다. 건물은 진화·합치기.
// 층: 보통 층 240×432(바탕·건물·적·병사·탄을 높이 순서로) → 왕 인형만 두 배 층 480×864 → 앞 층(효과·숫자·막대). 카메라는 화면에 잘라 키워 그린다.
import { createFrame, clearFrame, composite, hex, poseAt, skeleton } from "../pixelfx/core/index.js";
import { kingDeco, capePaint, CAPE_RAMPS } from "./kingdeco.js?v=19";
import { rasterText } from "../pixelfx/core/font.js";
import { ramp } from "./looks.js?v=19";

export const W = 240, H = 432, W2 = 480, H2 = 864;
const LANE_X = [50, 120, 190], ROW_Y = [372, 346, 320, 294], CASTLE_Y = 394, FIELD_TOP = 18, FIELD_BOT = 282;
const MAX_WAVE = 20, BOSS_WAVES = { 5: { kind: "slime", k: 2, hp: 700 }, 10: { kind: "crocodile", k: 1.4, hp: 2400 }, 15: { kind: "flying-skull", k: 2, hp: 2800 }, 20: { kind: "crocodile", k: 1.8, hp: 6500 } };
const waveCount = (w) => Math.round(6 + 94 * ((w - 1) / 19) ** 1.5);

// ---- 적(우리 소환수). fly = 공중(병사를 넘어 감)
const FOES = {
  slime: { hp: 34, spd: 13, dmg: 5 }, frog: { hp: 28, spd: 20, dmg: 5 }, butterfly: { hp: 16, spd: 24, dmg: 3, fly: 1 },
  snake: { hp: 40, spd: 17, dmg: 6 }, bat: { hp: 22, spd: 30, dmg: 4, fly: 1 }, bird: { hp: 24, spd: 32, dmg: 4, fly: 1 },
  wisp: { hp: 32, spd: 26, dmg: 6 }, eyeball: { hp: 55, spd: 12, dmg: 8 }, "fish-school": { hp: 38, spd: 22, dmg: 6, fly: 1 },
  "flying-skull": { hp: 46, spd: 24, dmg: 8 }, ghost: { hp: 60, spd: 15, dmg: 9 }, jellyfish: { hp: 48, spd: 11, dmg: 8, fly: 1 },
  crocodile: { hp: 220, spd: 9, dmg: 18 },
};
const POOLS = [["slime", "frog", "butterfly"], ["snake", "bat", "bird"], ["wisp", "eyeball", "fish-school"], ["flying-skull", "ghost", "jellyfish"]];

// ---- 병사. sprite = 손 도트 그림 이름(없으면 임시로 인형·생물)
const UNITS = {
  elfArcher: { ko: "엘프 궁수", sprite: "elf_archer", rig: "elf", hp: 64, dmg: 15, range: 92, rate: 0.95, spd: 26, ranged: true },
  ranger: { ko: "레인저", sprite: "ranger", rig: "elf", hp: 110, dmg: 22, range: 110, rate: 0.7, spd: 30, ranged: true, double: true },
  spirit: { ko: "숲 정령", sprite: "spirit", fx: "critters/wisp", hp: 58, dmg: 13, range: 14, rate: 0.8, spd: 32, palette: ["#08301c", "#0e5a30", "#1e8a48", "#40c070", "#8ff0a8", "#e0fff0"] },
  wolf: { ko: "늑대", sprite: "wolf", rig: "wolf", hp: 104, dmg: 17, range: 14, rate: 0.75, spd: 44 },
  alpha: { ko: "늑대 왕", sprite: "alpha_wolf", rig: "wolf", hp: 220, dmg: 30, range: 16, rate: 0.7, spd: 48, big: true },
  skeleton: { ko: "해골 병사", sprite: "skeleton", rig: "bone", hp: 67, dmg: 12, range: 14, rate: 0.9, spd: 22 },
  skelKnight: { ko: "망자 기사", sprite: "skel_knight", rig: "bone", hp: 170, dmg: 24, range: 15, rate: 0.85, spd: 24, revive: true },
  hound: { ko: "지옥견", sprite: "hound", rig: "hound", hp: 72, dmg: 16, range: 14, rate: 0.62, spd: 50, burn: true },
  hellhound: { ko: "지옥 사냥개", sprite: "hellhound", rig: "hound", hp: 150, dmg: 26, range: 15, rate: 0.55, spd: 54, burn: true, big: true },
};
// ---- 건물. evo = 5레벨에서 진화, 진화 건물은 evolved
const BUILD = {
  barracks: { ko: "궁수 막사", kind: "spawn", unit: "elfArcher", evo: "rangerhq", desc: "웨이브마다 레벨만큼 엘프 궁수" },
  spring: { ko: "숲 정령의 샘", kind: "spawn", unit: "spirit", desc: "웨이브마다 레벨만큼 숲 정령" },
  atower: { ko: "궁수 탑", kind: "tower", proj: "arrow", range: 150, dmg: 16, rate: 1.0, desc: "가까운 적을 직접 쏜다" },
  tree: { ko: "생명의 나무", kind: "aura", aura: "hp", desc: "이웃 칸 병사 체력↑, 웨이브 끝에 성 회복" },
  lodge: { ko: "사냥꾼 오두막", kind: "spawn", unit: "wolf", evo: "wolfden", desc: "웨이브마다 레벨만큼 늑대" },
  grave: { ko: "해골 무덤", kind: "spawn", unit: "skeleton", evo: "citadel", desc: "웨이브마다 레벨만큼 해골 병사" },
  kennel: { ko: "지옥견 우리", kind: "spawn", unit: "hound", evo: "hellgate", desc: "웨이브마다 레벨만큼 지옥견(불태움)" },
  dtower: { ko: "어둠 탑", kind: "tower", proj: "dark", range: 140, dmg: 22, rate: 1.4, desc: "가까운 적에게 어둠 구슬" },
  altar: { ko: "피의 제단", kind: "aura", aura: "dmg", desc: "이웃 칸 병사 공격력↑" },
  obelisk: { ko: "저주 오벨리스크", kind: "curse", desc: "그 줄의 적이 더 아프게 맞는다" },
  rangerhq: { ko: "레인저 본부", kind: "spawn", unit: "ranger", evolved: true, desc: "진화: 두 발씩 쏘는 레인저" },
  wolfden: { ko: "늑대 왕의 굴", kind: "spawn", unit: "alpha", evolved: true, desc: "진화: 커다란 늑대 왕" },
  citadel: { ko: "망자의 성채", kind: "spawn", unit: "skelKnight", evolved: true, desc: "진화: 한 번 되살아나는 망자 기사" },
  hellgate: { ko: "지옥문", kind: "spawn", unit: "hellhound", evolved: true, desc: "진화: 불꽃 지옥 사냥개" },
  worldtower: { ko: "세계수 탑", kind: "tower", proj: "spirit", range: 190, dmg: 46, rate: 0.9, heal: true, evolved: true, desc: "합치기: 정령 화살, 성 회복" },
  voidspire: { ko: "공허의 첨탑", kind: "tower", proj: "void", range: 170, dmg: 40, rate: 1.1, chain: 3, curse: true, evolved: true, desc: "합치기: 셋을 잇는 공허 광선, 저주" },
};
const MERGES = [["atower", "tree", "worldtower"], ["dtower", "obelisk", "voidspire"]];
const SPELL = {
  poison: { ko: "독구름", fx: "nature/poison-cloud", r: 40, dot: 14, life: 3.5, cost: 4 },
  roots: { ko: "뿌리 속박", fx: "nature/root-snare", r: 40, dmg: 18, stop: 3, cost: 3 },
  leaves: { ko: "나뭇잎 폭풍", fx: "nature/leaf-storm", r: 50, dot: 16, life: 3, cost: 5 },
  dexp: { ko: "어둠 폭발", fx: "shadow/dark-explosion", r: 46, dmg: 80, cost: 5 },
  bhole: { ko: "블랙홀", fx: "shadow/black-hole", r: 54, dot: 18, pull: 50, life: 3, cost: 6 },
  drain: { ko: "생명력 흡수", fx: "shadow/soul-drain", r: 40, dmg: 40, heal: 30, cost: 4 },
};
const DECKS = {
  elf: ["b:barracks", "b:barracks", "b:spring", "b:atower", "b:atower", "b:tree", "b:lodge", "s:poison", "s:roots", "s:leaves", "expand", "expand", "up", "up"],
  dark: ["b:grave", "b:grave", "b:kennel", "b:dtower", "b:dtower", "b:altar", "b:obelisk", "s:dexp", "s:bhole", "s:drain", "expand", "expand", "up", "up"],
};
export const KINGS = {
  elf: { ko: "엘프 왕", set: 4, hp: 460, crown: "leaf", weapons: ["elfbow", "elfbow2", "worldbow"], basic: "moves/arrow-shot", reach: 120, dmg: 30, ranged: true, cape: "#2a7a34", aura: ["#7af070", "#e8ffb0"],
    skills: [{ ko: "화살비", cd: 12, id: "rain" }, { ko: "바람 걸음", cd: 9, id: "wind" }, { ko: "덩굴 감옥", cd: 14, id: "vines" }] },
  dark: { ko: "흑기사 왕", set: 0, hp: 680, crown: "horned", weapons: ["demonsword", "demonsword2", "demonking"], basic: "melee/heavy-cleave", reach: 34, dmg: 52, ranged: false, cape: "#9a1c28", aura: ["#ff4030", "#ffb070"],
    skills: [{ ko: "마검 해방", cd: 14, id: "unleash" }, { ko: "피의 돌진", cd: 8, id: "charge" }, { ko: "공포의 포효", cd: 15, id: "roar" }] },
  holy: { ko: "성기사 왕", locked: true, price: 60 }, wizard: { ko: "마법사 왕", locked: true, price: 60 }, summoner: { ko: "소환사 왕", locked: true, price: 60 },
};
const SHOP = [
  { id: "hp", ko: "성 체력 +50", price: 10, max: 5 },
  { id: "start", ko: "시작 카드 +1(1레벨 건물 하나를 놓고 시작)", price: 15, max: 3 },
  { id: "look:wood", ko: "성 모습: 나무 요새", price: 15, max: 1 }, { id: "look:dark", ko: "성 모습: 어둠 성채", price: 25, max: 1 },
];
const cardInfo = (c) => {
  if (c === "expand") return { ko: "땅 넓히기", type: "땅", desc: "잠긴 칸 한 줄을 연다" };
  if (c === "up") return { ko: "강화", type: "강화", desc: "손패로 · 기력 2 · 건물 레벨 +1", cost: 2 };
  const [t, k] = c.split(":");
  return t === "b" ? { ...BUILD[k], type: "건물", key: k } : { ...SPELL[k], type: "마법", key: k, desc: `손패로 · 기력 ${SPELL[k].cost}` };
};

export function createCastle(api) {
  const { cv, load, mods, createFx, setSkin, posed, STAND, READY, buildSkin, SETS, walkPose, getLook } = api;
  const ctx = cv.getContext("2d");
  const oc = document.createElement("canvas"); oc.width = W2; oc.height = H2;
  const octx = oc.getContext("2d");
  const frame = createFrame(W, H), buf = new Uint8ClampedArray(W * H * 4), B32 = new Uint32Array(buf.buffer);
  const img = octx.createImageData(W2, H2), out32 = new Uint32Array(img.data.buffer);
  let bg2 = null, bgLook = "";
  const G = { on: false, phase: "king", king: null, wave: 0, hp: 600, max: 600, deck: [], hand: [], cards: [], plots: [], units: [], foes: [], queue: [], spawnT: 0,
    fields: [], shots: [], fx: [], nums: [], kingU: null, pick: null, armed: -1, speed: 1, awaken: 0, bosses: 0, t: 0, result: "", flash: [], mana: 3, cds: [0, 0, 0],
    cam: { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, hold: 0 }, meta: { shards: 0, hp: 0, start: 0, looks: ["stone"], look: "stone", kings: ["elf", "dark"] } };
  try { Object.assign(G.meta, JSON.parse(localStorage.getItem("arena.meta") || "{}")); } catch {}
  try { G.meta.shards = Math.max(G.meta.shards, +(localStorage.getItem("arena.shards") || 0)); } catch {}
  const saveMeta = () => { try { localStorage.setItem("arena.meta", JSON.stringify(G.meta)); localStorage.setItem("arena.shards", G.meta.shards); } catch {} };

  // ---- 손 도트 그림 묶음(assets/castle/*.png + sprites.json). 없으면 임시 그림
  const SPR = {};
  async function loadSprites() {
    let list = {};
    try { list = await (await fetch("assets/castle/sprites.json?v=19")).json(); } catch { return; }
    await Promise.all(Object.entries(list).map(async ([name, info]) => {
      try {
        const im = new Image(); im.src = "assets/castle/" + info.file + "?v=19";
        await im.decode();
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        SPR[name] = { ...info, w: im.width, h: im.height, px: new Uint32Array(g.getImageData(0, 0, im.width, im.height).data.buffer) };
      } catch {}
    }));
  }
  // 그림 한 칸(frame 번호)을 보통 층에. ax, ay = 기준점(발). flip = 좌우 뒤집기, tint = 흰 번쩍
  function blit(fr, s, f, x, y, flip, tint) {
    const fw = s.fw ?? s.w, fh = s.fh ?? s.h, sx0 = (f % (s.cols ?? 1)) * fw, sy0 = Math.floor(f / (s.cols ?? 1)) * fh, ax = s.ax ?? fw / 2, ay = s.ay ?? fh;
    const X0 = Math.round(x - (flip ? fw - ax : ax)), Y0 = Math.round(y - ay);
    for (let j = 0; j < fh; j++) {
      const py = Y0 + j;
      if (py < 0 || py >= H) continue;
      for (let i = 0; i < fw; i++) {
        const c = s.px[(sy0 + j) * s.w + sx0 + (flip ? fw - 1 - i : i)];
        if ((c >>> 24) < 128) continue;
        const px = X0 + i;
        if (px >= 0 && px < W) fr.color[py * W + px] = tint ? 0xffffffff : c | 0xff000000;
      }
    }
  }

  // ---- 외형(임시 그림용 인형 피부와 왕)
  const skins = {};
  let kingSkinCache = null, kingSkinKey = "";
  function kingSkin() {
    const K = KINGS[G.king], L = getLook(), key = G.king + G.awaken + JSON.stringify(L);
    if (kingSkinKey === key) return kingSkinCache;
    const set = SETS[K.set], mine = L.set === K.set;
    const base = buildSkin(set, mine ? L.color : {}, mine ? L.shape : {}, 2 * 1.2);
    base.extras = { ...set.extras, crown: false, cloak: true };          // 왕관은 손 도트(kingdeco.js)
    base.ramps.crown = ramp(G.king === "elf" ? "#f0c040" : "#2a2230");
    base.ramps.crownGem = ramp(G.king === "elf" ? "#80ff90" : "#ff2a3a");
    if (!mine) base.ramps.cape = base.ramps.cloth = ramp(K.cape);
    base.ramps.cape ??= base.ramps.cloth;
    base.paint = { ...base.paint, cape: capePaint(G.king) };          // 망토 테두리·주름·문장
    for (const [n, c] of Object.entries(CAPE_RAMPS[G.king])) base.ramps[n] = ramp(c);
    kingSkinKey = key;
    return (kingSkinCache = base);
  }
  function tempSkin(kind) {          // 손 도트 그림이 없을 때 쓰는 인형(보통 층 크기)
    if (skins[kind]) return skins[kind];
    let s;
    if (kind === "elf") { s = buildSkin(SETS[4], { body: "#6ab858", arms: "#6ab858", gear: "#5aa84a", cloth: "#8a5a32", legs: "#6a5232" }, { bulk: 0.85, arm: 0.85 }, 0.8); s.extras = { hood: true, elfEars: true, boots: true }; }
    else if (kind === "bone") { s = buildSkin(SETS[0], { skin: "#e6dcc2", body: "#d8ccb0", arms: "#e2d6bc", legs: "#d8ccb0", feet: "#b8ac90", gear: "#5a5462" }, { bulk: 0.8, arm: 0.8 }, 0.8); s.extras = { helm: true }; s.paint = {}; }
    else { const c = kind === "wolf" ? ["#a8a4b0", "#4a4656", "#e8e4f0", "#ffe060"] : ["#4a2a2a", "#1a0e10", "#c83a2a", "#ffb020"]; const R = ramp(c[0]), D = ramp(c[1]), S = ramp(c[2]);
      s = { beast: true, scale: 0.42, grim: true, snarl: 0.3, ramps: { default: R, joint: R, beast: R, bhead: R, legN: R, legF: D, ruff: D, snout: S, ear: R, earIn: D, nose: ramp("#1a1418"), tooth: ramp("#f4eedc"), eye: ramp(c[3]), mouth: ramp("#5a1a20"), brow: D, claw: S } }; }
    return (skins[kind] = s);
  }

  // ---- 칸(3열 × 4행, 처음 2행)
  function initPlots() {
    G.plots = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) G.plots.push({ lane: c, row: r, x: LANE_X[c], y: ROW_Y[r], open: r < 2, b: null, lvl: 0, cd: 0 });
  }
  const plotAt = (x, y) => { let best = null, bd = 1e9; for (const p of G.plots) { const d = Math.hypot(p.x - x, (p.y - 8 - y) * 1.3); if (d < bd) { bd = d; best = p; } } return bd < 26 ? best : null; };
  const neighbors = (p) => G.plots.filter((q) => q !== p && q.b && Math.abs(q.lane - p.lane) + Math.abs(q.row - p.row) === 1);
  function validFor(card, p) {
    if (!p || !card) return false;
    if (card === "expand") return !p.open && G.plots.some((q) => q.open && q.lane === p.lane && q.row === p.row - 1);
    if (card === "up") return p.open && !!p.b && (p.lvl < 5 || (BUILD[p.b].evo && p.lvl === 5));
    const k = card.split(":")[1];
    return p.open && (!p.b || (p.b === k && p.lvl < 5) || (p.b === k && BUILD[k].evo && p.lvl === 5));
  }
  function levelUp(p) {
    if (p.lvl < 5) p.lvl++;
    if (p.lvl === 5 && BUILD[p.b].evo && !BUILD[p.b].evolved) {          // 5레벨: 진화
      const to = BUILD[p.b].evo;
      api.toast(`진화! ${BUILD[p.b].ko} → ${BUILD[to].ko}`);
      p.b = to; p.lvl = 3;
      focus(p.x, p.y - 30, 2, 1.4);
      burst("ui/level-up", p.x, p.y, 2.2);
    }
  }
  function applyCard(card, p) {
    if (card === "expand") { for (const q of G.plots) if (q.row === p.row) q.open = true; }          // 한 줄(행) 전체를 연다
    else if (card === "up") levelUp(p);
    else { const k = card.split(":")[1]; if (p.b === k || (p.b && BUILD[p.b].evolved && BUILD[k].evo === p.b)) levelUp(p); else { p.b = k; p.lvl = 1; } }
    burst("spawn/poof", p.x, p.y, 1);
  }
  function merges() {          // 이웃한 짝(둘 다 3레벨 이상)
    const out = [];
    for (const [a, b, to] of MERGES) for (const p of G.plots) if (p.b === a && p.lvl >= 3) for (const q of neighbors(p)) if (q.b === b && q.lvl >= 3) out.push({ p, q, to });
    return out;
  }
  function doMerge(m) {
    api.toast(`합치기! ${BUILD[m.to].ko}`);
    m.p.b = m.to; m.p.lvl = Math.max(m.p.lvl, m.q.lvl); m.q.b = null; m.q.lvl = 0;
    focus(m.p.x, m.p.y - 30, 2, 1.4);
    burst("ui/level-up", m.p.x, m.p.y, 2.2);
    panel();
  }

  // ---- 웨이브 사이
  const draw3 = (pool) => { const out = [], src = [...pool]; while (out.length < 3 && src.length) out.push(src.splice((Math.random() * src.length) | 0, 1)[0]); return out; };
  function between() { G.phase = "cards"; G.hand = draw3(G.deck); G.pick = null; panel(); }
  function chooseCard(i) {
    const c = G.hand[i];
    if (c.startsWith("s:") || c === "up") { if (G.cards.length >= 5) G.cards.shift(); G.cards.push(c); G.hand = []; G.phase = "ready"; }
    else if (!G.plots.some((p) => validFor(c, p))) { api.toast("놓을 수 있는 칸이 없어요"); return; }
    else { G.pick = c; G.phase = "place"; }
    panel();
  }
  function startWave() {
    G.wave++;
    G.phase = "fight";
    if (G.wave === MAX_WAVE && G.awaken < 2) awaken(2);
    const n = waveCount(G.wave), boss = BOSS_WAVES[G.wave], pool = POOLS.slice(0, Math.min(4, 1 + Math.floor((G.wave - 1) / 3))).flat();
    G.queue = [];
    const minions = boss ? Math.round(n * 0.6) : n;
    for (let i = 0; i < minions; i++) G.queue.push({ kind: pool[(Math.random() * pool.length) | 0], lane: (Math.random() * 3) | 0 });
    if (boss) G.queue.splice(Math.floor(minions * 0.4), 0, { kind: boss.kind, lane: 1, boss });
    G.spawnT = 0.6;
    G.units = G.units.filter((u) => u.king);
    for (const p of G.plots) {
      if (!p.b) continue;
      const bd = BUILD[p.b];
      p.cd = 0.5;
      if (bd.kind !== "spawn") continue;
      const nb = neighbors(p), hpK = 1 + nb.filter((q) => q.b === "tree").reduce((s, q) => s + 0.15 * q.lvl, 0), dmgK = 1 + nb.filter((q) => q.b === "altar").reduce((s, q) => s + 0.15 * q.lvl, 0);
      const count = bd.evolved ? Math.ceil(p.lvl / 2) + 1 : p.lvl;
      for (let i = 0; i < count; i++) spawnUnit(bd.unit, p, i, hpK, dmgK);
    }
    if (G.kingU) { if (G.kingU.down) G.kingU.hp = G.kingU.max * 0.6; G.kingU.down = false; }
    panel();
  }
  function spawnUnit(kind, p, i, hpK, dmgK) {
    const U = UNITS[kind], lv = p.lvl, k = 1 + 0.4 * (lv - 1);
    const u = { kind, U, lane: p.lane, x: p.x + (i % 3 - 1) * 8, y: p.y - 6, hp: U.hp * k * hpK, max: U.hp * k * hpK, dmg: U.dmg * k * dmgK, cd: 0.3 + Math.random() * 0.5, at: 0, step: Math.random() * 6, elite: lv >= 3, lv5: lv >= 5,
      homeY: U.ranged ? 268 + Math.random() * 10 : 236 + Math.random() * 20, revive: !!U.revive || (kind === "skeleton" && lv >= 5), face: 1, die: 0 };
    u.homeX = LANE_X[p.lane] + (Math.random() - 0.5) * 22;
    if (U.fx && !SPR[U.sprite] && mods[U.fx]) u.fx = createFx(mods[U.fx], { x: Math.round(u.x), y: Math.round(u.y), palette: U.palette, seed: (Math.random() * 1e5) | 0 });
    G.units.push(u);
  }
  function awaken(n) {
    G.awaken = n;
    const K = KINGS[G.king];
    api.toast(n === 1 ? `${K.ko} 1차 각성! 무기가 깨어납니다` : `${K.ko} 2차 각성! ${G.king === "elf" ? "세계수 활" : "마왕검"}`);
    if (G.kingU) { burst("ui/level-up", G.kingU.x, G.kingU.y, 2.5); focus(G.kingU.x, G.kingU.y - 20, 2.2, 1.8); }
  }

  // ---- 적
  function spawnFoe(q) {
    const d = FOES[q.kind], wk = 1 + 0.1 * (G.wave - 1), mod = mods["critters/" + q.kind];
    if (!mod) return;
    const x = LANE_X[q.lane] + (Math.random() - 0.5) * 30;
    const f = { kind: q.kind, d, lane: q.lane, x, y: -20, hp: q.boss ? q.boss.hp : d.hp * wk, spd: d.spd * (q.boss ? 0.7 : 0.85 + Math.random() * 0.3), dmg: d.dmg * (1 + 0.06 * (G.wave - 1)) * (q.boss ? 3 : 1),
      boss: q.boss, scale: q.boss ? q.boss.k : 1, fly: !!d.fly, slowT: 0, stopT: 0, dotT: 0, dot: 0, burnT: 0, hitT: 0, weakT: 0 };
    f.max = f.hp;
    f.fx = createFx(mod, { x: Math.round(x), y: -20, flip: x > W / 2, seed: (Math.random() * 1e5) | 0 });
    if (q.boss) { api.toast(`보스 등장! 거대 ${q.kind === "slime" ? "슬라임" : q.kind === "crocodile" ? "악어" : "해골"}`); f.announce = true; }
    G.foes.push(f);
  }
  function hurt(f, dmg, opt = {}) {
    if (f.dead) return;
    const curse = G.plots.filter((p) => (p.b === "obelisk" || p.b === "voidspire") && p.lane === f.lane).reduce((s, p) => s + 0.1 * p.lvl, 0) + (f.weakT > 0 ? 0.4 : 0);
    dmg = Math.round(dmg * (1 + curse));
    f.hp -= dmg;
    f.hitT = 0.08;
    if (opt.burn) f.burnT = 3;
    if (opt.push && !f.boss) f.y = Math.max(-10, f.y - opt.push);
    G.nums.push({ x: f.x, y: f.y - 20 * f.scale, v: dmg, t: 0, big: dmg >= 40 });
    if (f.hp <= 0) kill(f);
  }
  function kill(f) {
    f.dead = true;
    G.foes = G.foes.filter((g) => g !== f);
    G.mana = Math.min(10, G.mana + 0.2);
    burst("spawn/poof", f.x, f.y, 1);
    if (f.boss) { G.bosses++; burst("explosions/big-explosion", f.x, f.y, 2); focus(f.x, f.y, 1.8, 1.2); }
  }
  function burst(id, x, y, life) { const m = mods[id]; if (m) G.fx.push({ fx: createFx(m, { x: Math.round(x), y: Math.round(y), seed: (Math.random() * 999) | 0 }), t: 0, life }); }

  // ---- 카메라: 연출 확대(focus)와 손가락 확대·이동
  function focus(x, y, z, hold) { const c = G.cam; c.tx = x; c.ty = y; c.tz = z; c.hold = hold; c.auto = true; }
  function camStep(dt) {
    const c = G.cam;
    if (c.auto) { if ((c.hold -= dt) <= 0) { c.auto = false; if (!c.user) { c.tx = W / 2; c.ty = H / 2; c.tz = 1; } } }
    const k = Math.min(1, dt * 6);
    c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
    const hw = W / 2 / c.z, hh = H / 2 / c.z;
    c.x = Math.max(hw, Math.min(W - hw, c.x)); c.y = Math.max(hh, Math.min(H - hh, c.y));
  }

  // ---- 왕
  function makeKing() {
    const K = KINGS[G.king];
    G.kingU = { king: true, K, x: W / 2, y: 262, tx: W / 2, ty: 262, hp: K.hp, max: K.hp, act: null, cd: 0.5, down: false, face: 1, haste: 0, step: 0 };
    G.cds = [3, 3, 3];
  }
  const kingWeapon = () => KINGS[G.king].weapons[G.awaken];
  const nearestFoe = (x, y, r, filter) => { let best = null, bd = r; for (const f of G.foes) { if (filter && !filter(f)) continue; const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } } return best; };
  const laneOf = (x) => LANE_X.reduce((b, lx, i) => (Math.abs(lx - x) < Math.abs(LANE_X[b] - x) ? i : b), 0);
  function kingStep(k, dt) {
    if (k.down) return;
    const dx = k.tx - k.x, dy = k.ty - k.y, d = Math.hypot(dx, dy), sp = (k.dash > 0 ? 420 : 110);
    if (k.dash > 0) k.dash -= dt;
    if (d > 1.5 && !k.act) { k.x += (dx / d) * Math.min(d, sp * dt); k.y += (dy / d) * Math.min(d, sp * dt); k.moving = true; k.step += dt * 10; if (Math.abs(dx) > 1) k.face = Math.sign(dx); if (k.dash > 0) for (const f of G.foes) if (Math.hypot(f.x - k.x, f.y - k.y) < 16 && !f.dashHit) { f.dashHit = true; hurt(f, 60 * (1 + 0.5 * G.awaken), { push: 16, burn: G.awaken > 0 }); } return; }
    k.moving = false;
    if (k.haste > 0) k.haste -= dt;
    if (k.act) return;
    k.cd -= dt * (k.haste > 0 ? 2 : 1);
    const K = k.K, tgt = nearestFoe(k.x, k.y - 10, K.reach + 10);
    if (k.cd <= 0 && tgt) {
      const mod0 = mods[K.basic], w = kingWeapon();
      if (!mod0) return;
      k.face = tgt.x >= k.x ? 1 : -1;
      const mod = { ...mod0, act: { ...mod0.act, poses: mod0.act.poses.map(([t, q, h]) => [t, q.weapon ? { ...q, weapon: w } : q, h]) } };
      const act = api.createAct(mod, { x: Math.round(k.x), y: Math.round(k.y), flip: k.face < 0, seed: (Math.random() * 1e6) | 0 });
      act.onHit = (hh) => {
        if (hh.target === false) return;
        const list = G.foes.filter((f) => Math.hypot(f.x - k.x, f.y - k.y) < K.reach + 14).sort((a, b) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(b.x - k.x, b.y - k.y));
        for (const f of K.ranged ? list.slice(0, 1) : list.slice(0, 3)) {
          hurt(f, K.dmg * (1 + 0.5 * G.awaken) * (0.7 + (hh.push ?? 1.2) * 0.25), G.king === "dark" && G.awaken ? { push: 10, burn: true } : {});
          if (G.king === "elf" && G.awaken) { for (const g of G.foes.filter((g) => Math.hypot(g.x - f.x, g.y - f.y) < 22 && g !== f)) hurt(g, 10 * G.awaken); burst("nature/thorns", f.x, f.y, 0.8); }
        }
      };
      k.act = { act, speed: 1.7 };
      k.cd = K.ranged ? 0.25 : 0.15;
    }
  }
  function useSkill(i) {
    const k = G.kingU, s = KINGS[G.king].skills[i];
    if (!k || k.down || G.phase !== "fight" || G.cds[i] > 0) return;
    G.cds[i] = s.cd * (1 - 0.15 * G.awaken);
    api.toast(`${KINGS[G.king].ko} · ${s.ko}`);
    const aw = G.awaken;
    if (s.id === "rain") {          // 화살비: 적이 가장 많이 모인 곳
      let best = null, bn = 0;
      for (const f of G.foes) { const n = G.foes.filter((g) => Math.hypot(g.x - f.x, g.y - f.y) < 40).length; if (n > bn) { bn = n; best = f; } }
      if (!best) return;
      G.flash.push({ type: "rain", x: best.x, y: best.y, t: 0, n: [14, 20, 30][aw], life: 0.9, dmg: [36, 48, 64][aw], done: false });
      focus(best.x, best.y, 1.6, 0.9);
    } else if (s.id === "wind") {          // 바람 걸음: 가장 가까운 적 무리 곁으로 순식간에 + 공격 두 배 빠르게
      const f = nearestFoe(k.x, k.y, 400);
      if (f) { k.x = f.x; k.y = Math.min(FIELD_BOT, f.y + 26); k.tx = k.x; k.ty = k.y; burst("arcane/blink-in", k.x, k.y, 1); }
      k.haste = 5 + aw * 2;
    } else if (s.id === "vines") {          // 덩굴 감옥: 적이 가장 많은 줄을 묶는다
      const lane = [0, 1, 2].sort((a, b) => G.foes.filter((f) => f.lane === b).length - G.foes.filter((f) => f.lane === a).length)[0];
      for (const f of G.foes) if (f.lane === lane) { f.stopT = 3 + aw; hurt(f, 12 + aw * 8); }
      G.flash.push({ type: "vines", lane, t: 0, life: 1.2 });
    } else if (s.id === "unleash") {          // 마검 해방: 왕이 선 줄 전체(2차 각성: 이웃 줄까지)
      const lane = laneOf(k.x), lanes = aw >= 2 ? [lane, lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1] : [lane];
      for (const l of lanes) { G.flash.push({ type: "slash", lane: l, t: 0, life: 0.55 }); for (const f of G.foes.slice()) if (f.lane === l) hurt(f, [90, 130, 180][aw], { push: 14, burn: aw > 0 }); }
      focus(LANE_X[lane], 150, 1.4, 0.7);
    } else if (s.id === "charge") {          // 피의 돌진: 위로 내달리며 길의 적을 벤다
      for (const f of G.foes) f.dashHit = false;
      k.ty = Math.max(FIELD_TOP + 20, k.y - 110); k.tx = k.x; k.dash = 0.4;
    } else if (s.id === "roar") {          // 공포의 포효: 주변 적이 물러나고 더 아프게 맞는다
      for (const f of G.foes) if (Math.hypot(f.x - k.x, f.y - k.y) < 70 + aw * 20) { f.weakT = 5; if (!f.boss) f.y = Math.max(-10, f.y - 34); f.stopT = 0.6; }
      G.flash.push({ type: "roar", x: k.x, y: k.y, t: 0, life: 0.7 });
    }
    panel();
  }

  // ---- 손패(전투 중, 기력)
  function playCard(i, x, y) {
    const c = G.cards[i], info = cardInfo(c), cost = info.cost ?? 3;
    if (G.mana < cost) return api.toast(`기력이 모자라요(${cost} 필요)`);
    if (c === "up") {
      const p = plotAt(x, y);
      if (!p || !validFor("up", p)) return api.toast("강화할 건물을 누르세요");
      levelUp(p);
    } else {
      const s = SPELL[c.split(":")[1]], m = mods[s.fx];
      if (!m) return;
      G.fields.push({ fx: createFx(m, { x: Math.round(x), y: Math.round(y), seed: (Math.random() * 1e5) | 0 }), x, y, s, t: 0, life: s.life ?? m.meta.duration });
      api.toast(`마법 · ${s.ko}`);
    }
    G.mana -= cost;
    G.cards.splice(i, 1);
    G.armed = -1;
    panel();
  }

  // ---- 한 장면
  function step(dt0) {
    if (!G.on) return;
    camStep(dt0);
    const dt = dt0 * G.speed;
    G.t += dt;
    for (const n of G.nums) n.t += dt0;
    G.nums = G.nums.filter((n) => n.t < 0.8);
    for (const fl of G.flash) {
      fl.t += dt;
      if (fl.type === "rain" && !fl.done && fl.t > 0.45) { fl.done = true; for (const f of G.foes.slice()) if (Math.hypot(f.x - fl.x, f.y - fl.y) < 44) hurt(f, fl.dmg); }
    }
    G.flash = G.flash.filter((fl) => fl.t < fl.life);
    for (const r of G.fx) { r.t += dt; r.fx.update(dt); }
    G.fx = G.fx.filter((r) => r.t < r.life);
    for (const u of G.units) if (u.fx) u.fx.update(dt);
    if (G.phase !== "fight") { if (G.kingU) G.kingU.act = null; return; }
    G.mana = Math.min(10, G.mana + dt * 0.5);
    for (let i = 0; i < 3; i++) if (G.cds[i] > 0) G.cds[i] -= dt;
    if (G.queue.length && (G.spawnT -= dt) <= 0 && G.foes.length < 34) {
      G.spawnT = Math.max(0.12, 1.1 - G.wave * 0.045) * (0.5 + Math.random());
      const q = G.queue.shift();
      spawnFoe(q);
      if (q.boss) focus(LANE_X[1], 60, 1.8, 1.4);
    }
    const k = G.kingU;
    if (k.act) { k.act.act.update(dt * k.act.speed); if (k.act.act.done()) k.act = null; }
    kingStep(k, dt);
    for (const p of G.plots) {          // 탑
      if (!p.b || BUILD[p.b].kind !== "tower") continue;
      const bd = BUILD[p.b];
      if ((p.cd -= dt) > 0) continue;
      if (bd.heal && G.phase === "fight") G.hp = Math.min(G.max, G.hp + dt * 0);
      const tg = nearestFoe(p.x, p.y - 30, bd.range + p.lvl * 12);
      if (!tg) continue;
      p.cd = bd.rate / (1 + 0.15 * (p.lvl - 1));
      if (bd.heal) G.hp = Math.min(G.max, G.hp + 1 + p.lvl * 0.5);
      const shots = p.lvl >= 3 ? 2 : 1, dmg = bd.dmg * 1.5 * (1 + 0.4 * (p.lvl - 1));
      if (bd.chain) {          // 공허의 첨탑: 가까운 적 셋을 잇는 광선
        const hit = [tg, ...G.foes.filter((f) => f !== tg).sort((a, b) => Math.hypot(a.x - tg.x, a.y - tg.y) - Math.hypot(b.x - tg.x, b.y - tg.y)).slice(0, bd.chain - 1)];
        let px0 = p.x, py0 = p.y - 40;
        for (const f of hit) { G.flash.push({ type: "beam", x0: px0, y0: py0, x1: f.x, y1: f.y - 8, t: 0, life: 0.25 }); hurt(f, dmg * 0.7); f.weakT = 2; px0 = f.x; py0 = f.y - 8; }
        continue;
      }
      for (let s = 0; s < shots; s++) G.shots.push({ kind: bd.proj, x: p.x, y: p.y - 34, tg, dmg, spd: bd.proj === "dark" ? 170 : 260, delay: s * 0.12, aoe: p.lvl >= 5 || bd.proj === "spirit" });
    }
    for (const u of G.units) {          // 병사: 위로 올라가 자리 잡고, 가까운 적과 싸운다
      if (u.king || u.dead) continue;
      u.cd -= dt;
      if (u.at > 0) u.at -= dt;
      if (u.hitT > 0) u.hitT -= dt;
      const tg = nearestFoe(u.x, u.y, u.U.ranged ? u.U.range : 70, (f) => !f.fly || u.U.ranged);
      const dist = tg ? Math.hypot(tg.x - u.x, tg.y - u.y) : 1e9;
      if (tg && dist < u.U.range + (tg.boss ? 14 * tg.scale : 0)) {
        u.moving = false;
        u.face = tg.x >= u.x ? 1 : -1;
        if (u.cd <= 0) {
          u.cd = u.U.rate; u.at = 0.45;
          if (u.U.ranged) { G.shots.push({ kind: "arrow", x: u.x, y: u.y - 20, tg, dmg: u.dmg, spd: 240, delay: 0.15 }); if (u.U.double || u.lv5) G.shots.push({ kind: "arrow", x: u.x, y: u.y - 22, tg, dmg: u.dmg, spd: 240, delay: 0.3 }); }
          else hurt(tg, u.dmg, { burn: u.U.burn });
        }
      } else {
        const gx = tg && !u.U.ranged ? tg.x : u.homeX, gy = tg && !u.U.ranged ? tg.y + 12 : u.homeY;
        const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy);
        if (d > 1.5) { const v = u.U.spd * dt; u.x += (dx / d) * Math.min(d, v); u.y += (dy / d) * Math.min(d, v); u.moving = true; u.step += dt * 9; if (Math.abs(dx) > 0.5) u.face = Math.sign(dx); } else u.moving = false;
      }
      if (u.fx) { u.fx.options.x = Math.round(u.x); u.fx.options.y = Math.round(u.y); }
    }
    for (const s of G.shots) {          // 화살·구슬
      if (s.delay > 0) { s.delay -= dt; continue; }
      const alive = !s.tg.dead, tx = alive ? s.tg.x : s.tx ?? s.x, ty = alive ? s.tg.y - 8 : s.ty ?? s.y - 60;
      s.tx = tx; s.ty = ty;
      const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      s.ang = Math.atan2(dy, dx);
      if (d < 6) { s.hit = true; if (alive) hurt(s.tg, s.dmg); if (s.aoe) for (const f of G.foes.slice()) if (Math.hypot(f.x - tx, f.y - ty) < 22 && f !== s.tg) hurt(f, s.dmg * 0.5); continue; }
      s.x += (dx / d) * s.spd * dt; s.y += (dy / d) * s.spd * dt;
    }
    G.shots = G.shots.filter((s) => !s.hit && s.y > -40);
    for (const f of G.foes.slice()) {          // 적: 내려오다 막히면 때리고, 성에 닿으면 성이 깎인다
      f.fx.update(dt);
      for (const key of ["hitT", "slowT", "stopT", "weakT"]) if (f[key] > 0) f[key] -= dt;
      if (f.dotT > 0) { f.dotT -= dt; f.dacc = (f.dacc ?? 0) + f.dot * dt; if (f.dacc >= 5) { hurt(f, f.dacc); f.dacc = 0; } }
      if (f.burnT > 0) { f.burnT -= dt; f.bacc = (f.bacc ?? 0) + 6 * dt; if (f.bacc >= 4) { hurt(f, f.bacc); f.bacc = 0; } }
      if (f.dead) continue;
      const reachF = f.boss ? 18 * f.scale : 13;
      let wall = null;
      if (!f.fly) {
        wall = G.units.find((u) => !u.king && !u.dead && Math.abs(u.x - f.x) < reachF && u.y > f.y && u.y - f.y < reachF + 4);
        if (!wall && !k.down && Math.abs(k.x - f.x) < reachF + 2 && k.y > f.y && k.y - f.y < reachF + 6) wall = k;
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
      f.y += sp * dt;
      f.x += (LANE_X[f.lane] - f.x) * Math.min(1, dt * 0.4);
      f.fx.options.x = Math.round(f.x); f.fx.options.y = Math.round(f.y);
      if (f.y > CASTLE_Y - 4) {
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
        for (const f of G.foes.slice()) { if (Math.hypot(f.x - r.x, f.y - r.y) > s.r) continue; if (s.dmg) hurt(f, s.dmg); if (s.stop) f.stopT = s.stop; }
        if (s.heal) G.hp = Math.min(G.max, G.hp + s.heal);
      }
      if ((s.dot || s.pull) && r.t > 0.3 && r.t < r.life) for (const f of G.foes) { const d = Math.hypot(f.x - r.x, f.y - r.y); if (d > s.r) continue; if (s.dot) { f.dotT = 0.6; f.dot = s.dot; } if (s.pull && !f.boss && d > 2) { f.x += ((r.x - f.x) / d) * s.pull * dt; f.y += ((r.y - f.y) / d) * s.pull * dt; } }
      if (r.t >= r.life && !r.stopped) { r.fx.stop?.(); r.stopped = true; }
    }
    G.fields = G.fields.filter((r) => r.t < r.life + 1.2);
    if (!G.queue.length && !G.foes.length) {          // 웨이브 끝
      for (const p of G.plots) if (p.b === "tree") G.hp = Math.min(G.max, G.hp + 6 * p.lvl);
      G.units = G.units.filter((u) => u.king);
      if (G.wave >= MAX_WAVE) return finishRun(true);
      if (BOSS_WAVES[G.wave]) { if (G.wave === 10) awaken(1); G.phase = "reward"; G.hand = draw3(DECKS[G.king]); panel(); }
      else between();
    }
  }
  function finishRun(win) {
    G.phase = "over";
    const got = Math.max(0, G.wave - (win ? 0 : 1)) + G.bosses * 3 + (win ? 10 : 0);
    G.meta.shards += got;
    saveMeta();
    G.result = win ? `승리! 20웨이브를 막았습니다 · 별 조각 +${got}` : `성이 무너졌습니다 (${G.wave}웨이브) · 별 조각 +${got}`;
    panel();
  }

  // ---- 그리기
  const COL = Object.fromEntries(Object.entries({ wood: "#8a5a32", woodD: "#5a3820", woodL: "#b07a48", leaf: "#4aa040", leafD: "#2a6a28", leafL: "#8ad060", stone: "#a8a29a", stoneD: "#6e6862", stoneL: "#d0cac2", gold: "#ffd84a", water: "#5ad0c0", waterL: "#c8fff0", dark: "#2a2232", darkD: "#16101c", purple: "#8a4ad0", purpleL: "#d0a0ff", red: "#c02a34", redL: "#ff6a5a", bone: "#e6dcc2", iron: "#4a4a56", ink: "#0b0a10", roof: "#3a7a3a", spirit: "#b8fff0", void: "#6a2aff" }).map(([k, v]) => [k, hex(v)]));
  function px(fr, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) fr.color[y * W + x] = c; }
  function lightAt(fr, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) fr.light[y * W + x] = c; }
  function rect(fr, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(fr, x, y, c); }
  function buildBg() {
    const look = G.meta.look;
    const C = document.createElement("canvas"); C.width = W; C.height = H;
    const g = C.getContext("2d");
    let sd = 11; const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // 전장: 위가 먼 땅(어둡고 안개), 아래로 올수록 밝은 풀밭. 3줄 흙길이 위에서 아래로
    for (let y = 0; y < H; y++) { const k = y / H; g.fillStyle = `rgb(${Math.round(40 + 30 * k)},${Math.round(56 + 44 * k)},${Math.round(44 + 18 * k)})`; g.fillRect(0, y, W, 1); }
    for (let i = 0; i < 1400; i++) { const y = (rnd() * H) | 0; g.fillStyle = rnd() < 0.5 ? "rgba(90,130,70,.55)" : "rgba(30,50,30,.5)"; g.fillRect((rnd() * W) | 0, y, 1, 1); }
    LANE_X.forEach((x) => {
      for (let y = 0; y < CASTLE_Y; y++) { const w = 13 + (y / H) * 10; g.fillStyle = "#7a6248"; g.fillRect(x - w, y, w * 2, 1); g.fillStyle = "#5e4a36"; g.fillRect(x - w, y, 1, 1); g.fillRect(x + w - 1, y, 1, 1); }
      for (let y = 6; y < CASTLE_Y; y += 9) { g.fillStyle = "#6a543c"; g.fillRect(x - 6 + ((y * 7) % 11), y, 2, 1); }
    });
    // 왕국 칸 구역 바탕: 돌을 깐 마당
    g.fillStyle = "rgba(60,52,44,.55)"; g.fillRect(0, ROW_Y[3] - 22, W, CASTLE_Y - ROW_Y[3] + 22);
    g.fillStyle = "#8a7a62"; g.fillRect(0, ROW_Y[3] - 23, W, 1);
    // 성벽(아래): 모습 세 가지
    const pal = look === "wood" ? ["#b07a48", "#8a5a32", "#5a3820", "#3a2414"] : look === "dark" ? ["#4a4258", "#322a40", "#221a2c", "#120c18"] : ["#d0cac2", "#a8a29a", "#86807a", "#5e5854"];
    for (let y = CASTLE_Y; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = pal[((x + (Math.floor(y / 6) % 2) * 6) % 12 === 0 || (y - CASTLE_Y) % 6 === 0) ? 3 : y < CASTLE_Y + 3 ? 0 : 1]; g.fillRect(x, y, 1, 1); }
    for (let x = 0; x < W; x += 12) { g.fillStyle = pal[1]; g.fillRect(x, CASTLE_Y - 6, 8, 6); g.fillStyle = pal[0]; g.fillRect(x, CASTLE_Y - 6, 8, 1); }
    LANE_X.forEach((x) => { g.fillStyle = look === "dark" ? "#3a0a14" : "#3a2416"; g.fillRect(x - 9, CASTLE_Y + 4, 18, H - CASTLE_Y - 4); g.fillStyle = "#1c1820"; g.fillRect(x - 9, CASTLE_Y + 4, 18, 2); });
    if (look === "dark") for (const x of [20, 220]) { g.fillStyle = "#ff3a2a"; g.fillRect(x, CASTLE_Y + 10, 2, 3); }
    const d = g.getImageData(0, 0, W, H), src = new Uint32Array(d.data.buffer);
    bg2 = new Uint32Array(W2 * H2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = src[y * W + x], o = y * 2 * W2 + x * 2; bg2[o] = bg2[o + 1] = bg2[o + W2] = bg2[o + W2 + 1] = c; }
    bgLook = look;
  }
  function drawBuilding(fr, p, t) {
    const s = SPR["b_" + p.b];
    if (s) blit(fr, s, 0, p.x, p.y + 4, false);
    else {          // 임시: 코드 도트
      const x = p.x, y = p.y, b = p.b, R = (dx, dy, w, h, c) => rect(fr, Math.round(x + dx), Math.round(y + dy), w, h, c), ev = BUILD[b].evolved;
      const base = { barracks: COL.wood, lodge: COL.woodD, spring: COL.stone, atower: COL.wood, dtower: COL.dark, tree: COL.leaf, grave: COL.stone, kennel: COL.darkD, altar: COL.stoneD, obelisk: COL.dark, rangerhq: COL.woodL, wolfden: COL.woodD, citadel: COL.stoneL, hellgate: COL.red, worldtower: COL.leafL, voidspire: COL.void }[b];
      const tall = BUILD[b].kind === "tower" || b === "obelisk";
      R(-10, tall ? -30 : -16, 20, tall ? 30 : 16, base);
      R(-10, tall ? -30 : -16, 20, 1, COL.ink);
      for (let i = 0; i < 9; i++) R(-11 + i, (tall ? -31 : -17) - i, 22 - i * 2, 1, ev ? COL.gold : COL.woodD);
      R(-2, -7, 4, 7, COL.ink);
      if (ev) for (let a = 0; a < 10; a++) lightAt(fr, x + Math.cos(a + t * 2) * 12, y - 18 + Math.sin(a + t * 2) * 5, COL.gold);
    }
    for (let i = 0; i < p.lvl; i++) px(fr, p.x - 6 + i * 3, p.y + 6, COL.gold);          // 레벨 점
    if (p.lvl >= 3) { rect(fr, Math.round(p.x + 10), Math.round(p.y - 30), 1, 12, COL.woodD); rect(fr, Math.round(p.x + 11), Math.round(p.y - 30), 5, 4, COL.gold); }
    if (p.lvl >= 5 || BUILD[p.b].evolved) for (let a = 0; a < 20; a++) if ((a + Math.floor(t * 8)) % 3 === 0) lightAt(fr, p.x + Math.cos(a / 3.18) * 15, p.y - 10 + Math.sin(a / 3.18) * 5, COL.gold);
  }
  function drawUnit(fr, u, t) {
    const s = SPR[u.U.sprite];
    if (s) {          // 손 도트: 서기 0-1, 걷기 2-5, 공격 6-8, 쓰러짐 9-10
      const f = u.at > 0 ? 6 + Math.min(2, Math.floor((1 - u.at / 0.45) * 3)) : u.moving ? 2 + (Math.floor(u.step) % 4) : Math.floor(t * 2) % 2;
      blit(fr, s, f, u.x, u.y, u.face < 0, u.hitT > 0);
      return;
    }
    if (u.fx) { u.fx.draw(fr); return; }
    const sk = tempSkin(u.U.rig);
    setSkin(sk);
    const q = sk.beast ? { walk: Math.round((u.step * 16) % 100), go: u.moving ? 100 : 0, jaw: u.at > 0 ? 70 : 0 } : (u.moving ? walkPose({ ...READY, weapon: u.U.ranged ? "bow" : "sword", sa: 0.38 }, u.step) : { ...READY, weapon: u.U.ranged ? "bow" : "sword", sa: u.at > 0 ? -0.6 : 0.38, fx: u.at > 0 ? 14 : 11 });
    const r = posed(q);
    setSkin(null);
    for (let i = 0; i < r.n; i++) px(fr, u.face < 0 ? u.x - r.xs[i] - 1 : u.x + r.xs[i], u.y + r.ys[i], u.hitT > 0 ? 0xffffffff : r.color[i]);
  }
  function drawText(fr, str, x, y, c) {
    rasterText(str, "mini", (a, b) => px(fr, x + a + 1, y + b + 1, COL.ink));
    rasterText(str, "mini", (a, b) => px(fr, x + a, y + b, c));
  }
  function bar(fr, x, y, k, col) { for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) px(fr, x - 8 + i, y + j, j !== 1 ? COL.ink : i < Math.round(16 * k) ? col : hex("#3a2430")); }
  function blend() {
    composite(frame, buf, null);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = B32[y * W + x], a = c >>> 24;
      if (!a) continue;
      const o = y * 2 * W2 + x * 2;
      if (a === 255) { out32[o] = out32[o + 1] = out32[o + W2] = out32[o + W2 + 1] = c; continue; }
      for (const j of [o, o + 1, o + W2, o + W2 + 1]) {
        const d = out32[j], k = a / 255, ch = (n) => Math.round(((c >>> n) & 255) * k + ((d >>> n) & 255) * (1 - k));
        out32[j] = (255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
      }
    }
  }
  function figure(skin, q, x, y, mirror, colorFn, deco) {
    setSkin(skin);
    const r = posed(q), bx = Math.round(x * 2), by = Math.round(y * 2), sk = deco ? skeleton(q) : null;
    const put = (dx, dy, c) => {
      const X = mirror ? bx - dx - 1 : bx + dx, Y = by + dy;
      if (X < 0 || Y < 0 || X >= W2 || Y >= H2) return;
      out32[Y * W2 + X] = colorFn ? colorFn(c) : c;
    };
    for (let i = 0; i < r.n; i++) put(r.xs[i], r.ys[i], r.color[i]);
    setSkin(null);
    if (deco) kingDeco(deco.king, deco.aw, sk, skin.scale, put);          // 손 도트 왕관·어깨 갑옷
  }
  const bigFrames = {};
  function bigFx(f) {          // 보스: 소환수를 따로 그려 몇 배로 키워 얹는다(두 배 층)
    const meta = f.fx.meta, [w, h] = meta.size, [ox, oy] = meta.origin, key = w + "x" + h;
    const fr = bigFrames[key] ?? (bigFrames[key] = { f: createFrame(w, h), b: new Uint8ClampedArray(w * h * 4) });
    clearFrame(fr.f);
    const o0 = { x: f.fx.options.x, y: f.fx.options.y };
    f.fx.options.x = ox; f.fx.options.y = oy;
    f.fx.draw(fr.f);
    Object.assign(f.fx.options, o0);
    composite(fr.f, fr.b, null);
    const S32 = new Uint32Array(fr.b.buffer), k = Math.round(f.scale * 2), X0 = Math.round(f.x * 2 - ox * k), Y0 = Math.round(f.y * 2 - oy * k);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = S32[y * w + x];
      if ((c >>> 24) < 128) continue;
      const cc = f.hitT > 0 ? 0xffffffff : c;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const X = X0 + x * k + a, Y = Y0 + y * k + b; if (X >= 0 && Y >= 0 && X < W2 && Y < H2) out32[Y * W2 + X] = cc; }
    }
  }
  function kingIdle() {
    const m = mods[KINGS[G.king].basic], q0 = m ? { ...m.act.poses[0][1], x: 0, y: 0, ghost: false } : { ...READY };
    return q0.weapon ? { ...q0, weapon: kingWeapon() } : q0;
  }
  function render() {
    if (!G.on) return;
    if (!bg2 || bgLook !== G.meta.look) buildBg();
    out32.set(bg2);
    const t = G.t, k = G.kingU;
    clearFrame(frame);
    // 보통 층: 칸·건물·적·병사를 높이(y) 순서로
    const items = [];
    for (const p of G.plots) items.push({ y: p.y, draw: () => {
      if (!p.open) {          // 잠긴 칸: 흐린 고리(땅 넓히기를 고르면 금빛)
        const hot = G.phase === "place" && G.pick === "expand" && validFor("expand", p);
        for (let a = 0; a < 30; a++) {
          if (hot) { if ((a + Math.floor(t * 6)) % 4) lightAt(frame, p.x + Math.cos(a / 4.77) * 14, p.y + Math.sin(a / 4.77) * 5, COL.gold); }
          else if (a % 3 === 0) px(frame, p.x + Math.cos(a / 4.77) * 14, p.y + Math.sin(a / 4.77) * 5, hex("#3a3428"));
        }
        return;
      }
      if (p.b) drawBuilding(frame, p, t);
      if (G.phase !== "fight" || G.armed >= 0) { const ok = (G.phase === "place" && validFor(G.pick, p)) || (G.armed >= 0 && G.cards[G.armed] === "up" && validFor("up", p)); if (!p.b || ok) for (let a = 0; a < 30; a++) if ((a + Math.floor(t * 6)) % 4) lightAt(frame, p.x + Math.cos(a / 4.77) * 14, p.y + Math.sin(a / 4.77) * 5, ok ? COL.gold : hex("#5ab0ff")); }
    } });
    for (const f of G.foes) if (!f.boss) items.push({ y: f.y, draw: () => f.fx.draw(frame) });
    for (const u of G.units) if (!u.king) items.push({ y: u.y, draw: () => drawUnit(frame, u, t) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    for (const s of G.shots) if (s.delay <= 0) {
      if (s.kind === "arrow") { for (let i = 0; i < 6; i++) px(frame, s.x - Math.cos(s.ang ?? -1.57) * i, s.y - Math.sin(s.ang ?? -1.57) * i, i ? COL.woodL : COL.stoneL); }
      else { const c = s.kind === "spirit" ? COL.spirit : s.kind === "void" ? COL.void : COL.purple; for (let a = 0; a < 6.28; a += 0.8) px(frame, s.x + Math.cos(a) * 2, s.y + Math.sin(a) * 2, c); lightAt(frame, s.x, s.y, s.kind === "spirit" ? COL.spirit : COL.purpleL); }
    }
    for (const r of G.fields) r.fx.draw(frame, "back");
    blend();
    for (const f of G.foes) if (f.boss) bigFx(f);
    if (k) {          // 왕(두 배 층)
      const q = k.act ? k.act.act.pose ?? STAND : k.down ? { ...STAND, crouch: 9, lean: 6 } : kingIdle();
      const flip = k.act ? k.face < 0 : k.face < 0;
      figure(kingSkin(), k.moving ? walkPose(q, k.step) : q, k.x + (k.act ? (q.x ?? 0) * (flip ? -1 : 1) : 0), k.y + (k.act ? q.y ?? 0 : 0), flip, k.down ? (c) => (c & 0xff000000) | ((c >>> 1) & 0x7f7f7f) : null, { king: G.king, aw: G.awaken });
    }
    // 앞 층
    clearFrame(frame);
    if (k && !k.down) {
      const [a1, a2] = KINGS[G.king].aura.map(hex), n = 6 + G.awaken * 8;
      for (let i = 0; i < n; i++) { const ph = (t * (0.6 + (i % 3) * 0.2) + i * 0.37) % 1; lightAt(frame, k.x - 10 + ((i * 7) % 22), k.y - ph * (34 + G.awaken * 12), i % 2 ? a1 : a2); }
      if (G.awaken || k.haste > 0) for (let a = 0; a < 26; a++) if ((a + Math.floor(t * 10)) % 3 === 0) lightAt(frame, k.x + Math.cos(a / 4.1) * (14 + G.awaken * 3), k.y - 2 + Math.sin(a / 4.1) * 4, a1);
      if (k.act) k.act.act.draw(frame, { body: false, target: false });
      if (G.phase === "fight") for (let a = 0; a < 24; a++) if (a % 2) px(frame, k.x + Math.cos(a / 3.8) * 11, k.y + 2 + Math.sin(a / 3.8) * 4, hex("#ffd84a"));          // 끌 수 있다는 표시
    }
    for (const r of G.fields) r.fx.draw(frame, "front");
    for (const r of G.fx) r.fx.draw(frame);
    for (const fl of G.flash) {
      const u = fl.t / fl.life;
      if (fl.type === "rain") for (let i = 0; i < fl.n; i++) { const x = fl.x - 36 + ((i * 37) % 72), y = fl.y - 70 + ((u * 1.6 + (i % 5) * 0.13) % 1) * 70 + ((i * 13) % 20) - 10; for (let j = 0; j < 5; j++) px(frame, x - j * 0.3, y - j, j ? COL.leafL : COL.stoneL); lightAt(frame, x, y, COL.leafL); }
      else if (fl.type === "slash") for (let y = 0; y < CASTLE_Y - 10; y++) for (let j = -3; j <= 3; j++) { if (Math.abs(j) >= 3 * (1 - u) + 0.5) continue; const x = LANE_X[fl.lane] + j + Math.sin(y * 0.08) * 3; if (Math.abs(j) < 1) lightAt(frame, x, y, hex("#ffd0c0")); else px(frame, x, y, COL.red); }
      else if (fl.type === "vines") for (let y = 0; y < CASTLE_Y - 10; y += 3) px(frame, LANE_X[fl.lane] + Math.sin(y * 0.3 + fl.t * 8) * 10, y, COL.leaf);
      else if (fl.type === "roar") for (let a = 0; a < 48; a++) { const r = 10 + u * 70; lightAt(frame, fl.x + Math.cos(a / 7.6) * r, fl.y - 10 + Math.sin(a / 7.6) * r * 0.6, COL.redL); }
      else if (fl.type === "beam") for (let i = 0; i <= 20; i++) lightAt(frame, fl.x0 + (fl.x1 - fl.x0) * (i / 20), fl.y0 + (fl.y1 - fl.y0) * (i / 20), COL.void);
    }
    for (const f of G.foes) if (f.hp < f.max) bar(frame, f.x, f.y - (f.boss ? 26 * f.scale : 22), f.hp / f.max, hex("#e0485a"));
    for (const u of G.units) if (!u.king && u.hp < u.max) bar(frame, u.x, u.y - 30, u.hp / u.max, hex("#58b8f0"));
    if (k) bar(frame, k.x, k.y - 52, k.hp / k.max, hex("#ffd84a"));
    for (const n of G.nums) drawText(frame, String(n.v), Math.round(n.x) - 4, Math.round(n.y - n.t * 20), n.big ? hex("#ffe14a") : hex("#ffffff"));
    blend();
    octx.putImageData(img, 0, 0);
    // 카메라: 잘라서 키워 그린다
    const c = G.cam, sw = W2 / c.z, sh = H2 / c.z, sx = c.x * 2 - sw / 2, sy = c.y * 2 - sh / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(oc, sx, sy, sw, sh, 0, 0, W2, H2);
  }

  // ---- 화면(아래 판·손패·스킬·기력·배속)
  const ui = document.createElement("div");
  ui.id = "c3"; ui.hidden = true;
  ui.innerHTML = `<div id="c3top"><button id="c3speed">1배</button></div><div id="c3bar"><div id="c3mana"><i></i><b></b></div><div id="c3skills"></div><div id="c3cards"></div></div><div id="c3panel"></div>`;
  document.body.appendChild(ui);
  const $ = (id) => document.getElementById(id);
  $("c3speed").onclick = () => { G.speed = G.speed >= 3 ? 1 : G.speed + 1; $("c3speed").textContent = G.speed + "배"; };
  function hud() {          // 매 장면: 기력 막대와 재사용 시간
    if (!G.on || G.phase !== "fight") return;
    $("c3mana").querySelector("i").style.width = (G.mana * 10) + "%";
    $("c3mana").querySelector("b").textContent = `기력 ${Math.floor(G.mana)}/10`;
    document.querySelectorAll("#c3skills button").forEach((b, i) => { const cd = G.cds[i]; b.classList.toggle("cool", cd > 0); b.querySelector("small").textContent = cd > 0 ? Math.ceil(cd) + "초" : "준비"; });
    document.querySelectorAll("#c3cards button").forEach((b, i) => { const c = cardInfo(G.cards[i] ?? ""); b.classList.toggle("cool", G.mana < (c.cost ?? 3)); });
  }
  function panel() {
    const P = $("c3panel"), bar0 = $("c3bar");
    P.innerHTML = "";
    const fight = G.phase === "fight";
    bar0.hidden = !fight;
    P.hidden = fight;
    if (fight) {
      const sk = $("c3skills"), cards = $("c3cards");
      sk.innerHTML = ""; cards.innerHTML = "";
      KINGS[G.king].skills.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = `${s.ko}<small></small>`; b.onclick = () => useSkill(i); sk.appendChild(b); });
      G.cards.forEach((c, i) => { const ci = cardInfo(c), b = document.createElement("button"); b.innerHTML = `${ci.ko}<small>기력 ${ci.cost ?? 3}</small>`; if (G.armed === i) b.className = "on"; b.onclick = () => { G.armed = G.armed === i ? -1 : i; api.toast(G.armed >= 0 ? (c === "up" ? "강화할 건물을 누르세요" : "무대를 누르면 그 자리에 시전") : "취소"); panel(); }; cards.appendChild(b); });
      hud();
      return;
    }
    const add = (html, cls, fn) => { const b = document.createElement("button"); b.innerHTML = html; if (cls) b.className = cls; b.onclick = fn; P.appendChild(b); return b; };
    const note = (t) => { const d = document.createElement("div"); d.className = "c3note"; d.textContent = t; P.appendChild(d); };
    if (G.phase === "king") {
      note(`왕을 고르세요 · 별 조각 ${G.meta.shards}`);
      for (const key of ["elf", "dark", "holy", "wizard", "summoner"]) {
        const K = KINGS[key];
        if (K.locked) { add(`<b>${K.ko}</b><small>잠김 · 상점에서 열기(곧 추가)</small>`, "c3card dim", () => api.toast("아직 준비 중인 왕이에요")); continue; }
        add(`<b>${K.ko}</b><small>스킬: ${K.skills.map((s) => s.ko).join(" · ")}<br>카드: ${[...new Set(DECKS[key])].map((c) => cardInfo(c).ko).join(" · ")}</small>`, "c3card", () => begin(key));
      }
      add("상점", "", () => { G.phase = "shop"; panel(); });
    } else if (G.phase === "shop") {
      note(`상점 · 별 조각 ${G.meta.shards}`);
      for (const it of SHOP) {
        const own = it.id.startsWith("look:") ? (G.meta.looks.includes(it.id.slice(5)) ? 1 : 0) : G.meta[it.id] ?? 0, full = own >= it.max;
        add(`<b>${it.ko}</b><small>${full ? "다 삼" : `별 조각 ${it.price}`}${it.max > 1 ? ` · ${own}/${it.max}` : ""}</small>`, "c3card" + (full ? " dim" : ""), () => {
          if (full) return;
          if (G.meta.shards < it.price) return api.toast("별 조각이 모자라요");
          G.meta.shards -= it.price;
          if (it.id.startsWith("look:")) { G.meta.looks.push(it.id.slice(5)); G.meta.look = it.id.slice(5); } else G.meta[it.id] = own + 1;
          saveMeta(); api.toast(`${it.ko} 샀습니다`); panel();
        });
      }
      for (const lk of G.meta.looks) add(`성 모습: ${{ stone: "돌 성", wood: "나무 요새", dark: "어둠 성채" }[lk]}${G.meta.look === lk ? " ✓" : ""}`, "c3skip", () => { G.meta.look = lk; saveMeta(); panel(); });
      add("돌아가기", "red", () => { G.phase = "king"; panel(); });
    } else if (G.phase === "cards" || G.phase === "reward") {
      note(G.phase === "reward" ? "보스 처치! 새 카드 하나를 묶음에 더하세요" : `${G.wave + 1}웨이브 준비 · 적 ${waveCount(G.wave + 1)}마리${BOSS_WAVES[G.wave + 1] ? " · 보스" : ""} · 카드 하나를 고르세요`);
      G.hand.forEach((c, i) => { const ci = cardInfo(c); add(`<b>${ci.ko}</b><i>${ci.type}</i><small>${ci.desc}</small>`, "c3card", () => { if (G.phase === "reward") { G.deck.push(c); api.toast(`${ci.ko} 카드를 얻었다`); between(); } else chooseCard(i); }); });
      if (G.phase === "cards") add("건너뛰기", "c3skip", () => { G.phase = "ready"; panel(); });
    } else if (G.phase === "place") {
      note(`「${cardInfo(G.pick).ko}」 놓을 칸을 누르세요(빛나는 칸)`);
      add("다른 카드 고르기", "c3skip", () => { G.phase = "cards"; G.pick = null; panel(); });
    } else if (G.phase === "ready") {
      note(G.cards.length ? `손패: ${G.cards.map((c) => cardInfo(c).ko).join(" · ")}` : "준비 끝");
      for (const m of merges()) add(`합치기: ${BUILD[m.p.b].ko} + ${BUILD[m.q.b].ko} → <b>${BUILD[m.to].ko}</b>`, "c3skip", () => doMerge(m));
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
    G.max = 600 + 50 * (G.meta.hp ?? 0);
    Object.assign(G, { wave: 0, hp: G.max, cards: [], foes: [], fields: [], shots: [], fx: [], flash: [], awaken: 0, bosses: 0, armed: -1, queue: [], mana: 3 });
    initPlots();
    const starts = DECKS[key].filter((c) => c.startsWith("b:"));
    for (let i = 0; i < (G.meta.start ?? 0); i++) { const p = G.plots.filter((q) => q.open && !q.b)[i]; if (p) { p.b = starts[i % starts.length].split(":")[1]; p.lvl = 1; } }
    makeKing();
    G.units = [G.kingU];
    between();
  }

  // ---- 손가락: 한 손가락 = 칸 고르기 / 손패 시전 / 왕 끌기 / (확대 중) 화면 밀기, 두 손가락 = 확대·축소
  const touches = new Map();
  let drag = null, pinch = null;
  const toWorld = (e) => {
    const r = cv.getBoundingClientRect(), s = Math.min(r.width / W2, r.height / H2), ox = (r.width - W2 * s) / 2, oy = (r.height - H2 * s) / 2;
    const hx = (e.clientX - r.left - ox) / s, hy = (e.clientY - r.top - oy) / s, c = G.cam;
    return { x: (c.x * 2 - W2 / c.z / 2 + hx / c.z) / 2, y: (c.y * 2 - H2 / c.z / 2 + hy / c.z) / 2 };
  };
  cv.addEventListener("pointerdown", (e) => {
    if (!G.on) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: G.cam.z, cx: G.cam.x, cy: G.cam.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; G.cam.user = true; return; }
    const w = toWorld(e);
    if (G.phase === "place") { const p = plotAt(w.x, w.y); if (p && validFor(G.pick, p)) { applyCard(G.pick, p); G.pick = null; G.hand = []; G.phase = "ready"; panel(); } return; }
    if (G.phase !== "fight") return;
    if (G.armed >= 0) return playCard(G.armed, w.x, w.y);
    const k = G.kingU;
    if (k && !k.down && Math.hypot(w.x - k.x, w.y - (k.y - 14)) < 24) { drag = { king: true }; return; }
    if (G.cam.z > 1.05) drag = { pan: true, sx: e.clientX, sy: e.clientY, cx: G.cam.x, cy: G.cam.y };
    else if (k && !k.down) { k.tx = Math.max(10, Math.min(W - 10, w.x)); k.ty = Math.max(FIELD_TOP + 20, Math.min(FIELD_BOT, w.y)); }          // 빈 곳을 누르면 왕이 그리로 걸어간다
  });
  cv.addEventListener("pointermove", (e) => {
    if (!G.on || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect(), s = Math.min(r.width / W2, r.height / H2);
      const c = G.cam; c.tz = c.z = Math.max(1, Math.min(2.6, pinch.z * d / pinch.d));
      c.tx = c.x = pinch.cx - ((a.x + b.x) / 2 - pinch.mx) / s / 2 / c.z; c.ty = c.y = pinch.cy - ((a.y + b.y) / 2 - pinch.my) / s / 2 / c.z;
      return;
    }
    if (!drag) return;
    if (drag.king) { const w = toWorld(e), k = G.kingU; k.tx = Math.max(10, Math.min(W - 10, w.x)); k.ty = Math.max(FIELD_TOP + 20, Math.min(FIELD_BOT, w.y + 10)); }
    else if (drag.pan) { const r = cv.getBoundingClientRect(), s = Math.min(r.width / W2, r.height / H2), c = G.cam; c.tx = c.x = drag.cx - (e.clientX - drag.sx) / s / 2 / c.z; c.ty = c.y = drag.cy - (e.clientY - drag.sy) / s / 2 / c.z; }
  });
  const up = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (!touches.size) { drag = null; if (G.cam.z < 1.05) G.cam.user = false; } };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

  async function preload() {
    const ids = new Set(["spawn/poof", "spawn/summon-rise", "explosions/big-explosion", "ui/level-up", "nature/thorns", "arcane/blink-in", ...Object.keys(FOES).map((key) => "critters/" + key), ...Object.values(SPELL).map((s) => s.fx), "critters/wisp", "moves/arrow-shot", "melee/heavy-cleave"]);
    await Promise.all([...ids].map(load));
    if (!Object.keys(SPR).length) await loadSprites();
  }
  async function enter() { await preload(); show(); }
  function show() {          // 미리 불러온 뒤 한 번에 바꾼다(불러오는 동안 옛 가로 화면이 보이지 않게)
    cv.width = W2; cv.height = H2;
    Object.assign(G, { on: true, phase: "king", king: null, kingU: null, units: [], foes: [], queue: [], fields: [], shots: [], fx: [], flash: [], cards: [], wave: 0, speed: 1, cam: { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, hold: 0 } });
    $("c3speed").textContent = "1배";
    initPlots();
    ui.hidden = false;
    panel();
  }
  function exit() { G.on = false; ui.hidden = true; }
  function info() { return G.king ? `${G.wave}/${MAX_WAVE}웨이브 · 성 ${Math.ceil(G.hp)}/${G.max}${G.phase === "fight" ? ` · 남은 적 ${G.queue.length + G.foes.length}` : ""}` : "성 지키기"; }
  return { G, SPR, enter, preload, show, exit, step: (dt) => { step(dt); hud(); }, render, info, begin, startWave, chooseCard, applyCard, validFor, between, panel, plotAt, playCard, useSkill, awaken, finishRun, merges, doMerge, levelUp, focus };
}
