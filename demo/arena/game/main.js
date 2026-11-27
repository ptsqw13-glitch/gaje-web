// 천하제일 무술대회(가제): pixelfx 로 만든 한 화면 결투장.
// 주인공은 pixelfx 의 뼈대 인형(rig), 적은 pixelfx 의 지푸라기 과녁(Target). 효과 244개를 모두 마법으로, 무기 12종을 모두 공격으로 쓴다.
// 그림은 전부 pixelfx 가 점 단위로 그린다(색 판 + 빛 판 → composite). 화면은 384×216 점을 화면 크기에 맞춰 키운다.
import { createAct, createFx, createFrame, clearFrame, composite, posed, setSkin, Target, READY, STAND, SKINS, stockActor, hex, mix, luma } from "../pixelfx/core/index.js";
import { SETS, SLOTS, SHAPE_RANGE, buildSkin } from "./looks.js?v=18";
import { createCastle } from "./castle.js?v=18";
import { rasterText } from "../pixelfx/core/font.js";
import { FX, CATS } from "./fxlist.js?v=18";
import { buildBackdrop } from "./backdrop.js";

const W = 384, H = 216, FLOOR = 188, LEFT = 22, RIGHT = W - 22, W2 = W * 2, H2 = H * 2;
// 화면은 두 층: 배경·효과·허수아비·숫자는 384×216 점, 인형(뼈대로 움직이는 사람)은 그 위에 두 배 세밀하게(768×432)
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const frame = createFrame(W, H), frameC = createFrame(W, H);
const img = ctx.createImageData(W2, H2), out32 = new Uint32Array(img.data.buffer);
const bufA = new Uint8ClampedArray(W * H * 4), bufC = new Uint8ClampedArray(W * H * 4), A32 = new Uint32Array(bufA.buffer), C32 = new Uint32Array(bufC.buffer);
const STOCK2 = { scale: 2 };          // 기본 인형을 두 배 세밀하게
let hi = [];          // 두 배 층에 그릴 인형들(배경 층을 키운 뒤 그린다)
const BYID = Object.fromEntries(FX.map((e) => [e.id, e]));

// ---- 무기 12종(+맨손): 공격 단추를 누를 때마다 목록의 다음 동작
const WEAPONS = [
  { key: "fist", ko: "맨손", moves: ["melee/uppercut"] },
  { key: "sword", ko: "칼", moves: ["melee/sword-slash", "melee/double-slash", "melee/thrust", "melee/spin-slash", "moves/dash-strike", "moves/sword-combo"] },
  { key: "greatsword", ko: "대검", moves: ["melee/heavy-cleave"] },
  { key: "dagger", ko: "단검", moves: ["melee/dagger-flurry"] },
  { key: "spear", ko: "창", moves: ["melee/spear-sweep"] },
  { key: "hammer", ko: "망치", moves: ["melee/hammer-smash"] },
  { key: "scythe", ko: "낫", moves: ["melee/scythe-reap"] },
  { key: "claw", ko: "손톱", moves: ["melee/claw-swipe"] },
  { key: "handle", ko: "채찍", moves: ["melee/whip-crack"] },
  { key: "log", ko: "통나무", moves: ["melee/hammer-smash"], as: "log" },
  { key: "bow", ko: "활", moves: ["moves/arrow-shot"] },
  { key: "pistol", ko: "권총", moves: ["moves/pistol-shots"] },
  { key: "launcher", ko: "로켓", moves: ["moves/rocket-launcher"] },
  // 추가 무기(2026-11-27): 세트 무기. force = 무기가 없는 자세(마법 시전)에도 쥐여 줄 것
  { key: "staff", ko: "지팡이", tag: "마법사", moves: ["melee/spear-sweep", "moves/lightning-call", "arcane/arcane-missiles"], as: "staff", force: { weapon: "staff", sa: -1.2 } },
  { key: "book", ko: "마도서", tag: "소환사", moves: ["moves/fireball-throw", "arcane/arcane-missiles", "moves/holy-smite"], float: true },          // 손 앞에 떠 있는 책 + 발밑 마법진
  { key: "holysword", ko: "성검", tag: "성기사", moves: ["melee/sword-slash", "melee/double-slash", "melee/thrust", "melee/spin-slash", "moves/dash-strike", "moves/sword-combo"], as: "holysword" },
  { key: "demonsword", ko: "마검", tag: "흑기사", moves: ["melee/sword-slash", "melee/double-slash", "melee/thrust", "melee/spin-slash", "moves/dash-strike", "moves/sword-combo"], as: "demonsword" },
  { key: "elfbow", ko: "엘프 활", tag: "궁수", moves: ["moves/arrow-shot"], as: "elfbow" },
];
// 무기에 맞게 자세 고치기: 원래 무기를 바꿔 쥐고(as), 빈손 자세에는 정해 둔 무기를 쥐여 준다(force)
function gripPose(q, w) {
  if (!w) return q;
  let o = q;
  if (w.as && o.weapon) o = { ...o, weapon: w.as };
  if (w.force) for (const [k, v] of Object.entries(w.force)) if (k === "offWeapon" || k === "sb" || !q.weapon) o = { ...o, [k]: v };
  return o;
}
// 몸에 입히는 효과 중 적에게 거는 것(나머지는 나에게: 치유·보호막·가속 등)
const DEBUFF = new Set(["ice/freeze", "shadow/curse", "impacts/hit-flash", "spawn/disintegrate", "spawn/dissolve-burn", "spawn/shatter-death", "spawn/soul-rise", "scifi/glitch", "scifi/scanner",
  ...["bleeding", "burning", "charmed", "confused", "cursed", "frozen", "petrified", "poisoned", "sleep", "slowed", "stunned"].map((s) => "status/" + s)]);
// 상태 이상이 적에게 하는 일: dot 초당 피해, skin 과녁 덧칠, stop 못 움직임, slow 느려짐, away 딴 데로, weak 받는 피해 배율, burst 바로 피해
const STATUS = {
  "status/burning": { dot: 5, skin: "char" }, "status/poisoned": { dot: 4, skin: "poison" }, "status/bleeding": { dot: 5, skin: "red" },
  "status/frozen": { stop: 1, skin: "ice" }, "ice/freeze": { stop: 1, skin: "ice", burst: 12 }, "status/petrified": { stop: 1, skin: "shadow" },
  "status/sleep": { stop: 1 }, "status/stunned": { stop: 1, skin: "shock" }, "status/slowed": { slow: 1 }, "status/charmed": { away: 1, skin: "holy" },
  "status/confused": { away: 1 }, "scifi/glitch": { away: 1, skin: "shock" }, "status/cursed": { weak: 1.6, skin: "shadow" }, "shadow/curse": { weak: 1.6, skin: "shadow", burst: 8 },
  "scifi/scanner": { weak: 1.4 }, "impacts/hit-flash": { burst: 14 }, "spawn/disintegrate": { burst: 45 }, "spawn/dissolve-burn": { burst: 40, dot: 4, skin: "char" },
  "spawn/shatter-death": { burst: 45, skin: "ice" }, "spawn/soul-rise": { burst: 35, skin: "holy" },
};
// 나에게 거는 효과가 주는 것
const BUFF = { "holy/heal": { heal: 35 }, "holy/resurrection": { heal: 100 }, "holy/blessing": { heal: 15, dmg: 1.3 }, "holy/divine-shield": { shield: 6 }, "holy/halo": { shield: 4 },
  "status/haste": { speed: 1.7 }, "status/rage": { dmg: 1.6 }, "lightning/charge-up": { dmg: 1.4 }, "lightning/electrified": { dmg: 1.3 }, "ui/level-up": { heal: 20, dmg: 1.2 },
  "spawn/respawn-beam": { heal: 40 }, "scifi/warp-in": { shield: 2 }, "arcane/blink-in": { shield: 2 } };

// ---- 효과 모듈은 쓸 때 불러온다(244개를 처음에 다 읽지 않는다)
const mods = {};
const load = async (id) => (mods[id] ??= await import(`../pixelfx/fx/${id}.js`));

// ---- 적 허수아비 모양을 효과용 "몸"으로: 상태 이상 효과가 허수아비의 윤곽을 감싼다
const dummyActor = (() => {
  const f = createFrame(38, 52), t = new Target(0, 1);
  t.draw(f.color, 38, 52, 19, 52, false);
  const data = new Uint8Array(38 * 52);
  for (let i = 0; i < data.length; i++) data[i] = f.color[i] ? 1 : 0;
  return { mask: { w: 38, h: 52, data }, pixels: f.color.slice(), x: -19, y: -52, w: 38, h: 52, k: 2, head: [0, -52], chest: [0, -30], eyes: [[14, 7], [23, 7]] };
})();

// ---- 상태
// mode: menu(시작 화면) · practice(연습: 고정 허수아비) · horde(1 대 100: 마네킹이 오른쪽에서 하나씩) · duel(1 대 1: 색만 다른 상대)
const S = {
  mode: "menu", ko: 0, foes: [], acts: [], fields: [], shots: [], nums: [], over: false, left: 0, spawnT: 0, nextT: 99, round: 0, stat: { sum: 0, last: 0, recent: [] },
  p: { x: 110, jy: 0, vy: 0, face: 1, hp: 100, max: 100, hurt: 0, inv: 0, walk: 0, act: null, cast: 0, wi: 1, combo: 0, buff: { dmg: 0, speed: 0, shield: 0 }, buffK: { dmg: 1, speed: 1 } },
  spell: null, input: { l: false, r: false },
};
const P = S.p;
let bg = null, bgMenu = null;

// ---- 그리기 도우미
function plotPose(pose, X, Y, flip, tint) {
  const r = posed(pose), C = frame.color;
  for (let i = 0; i < r.n; i++) {
    const px = flip ? X - r.xs[i] - 1 : X + r.xs[i], py = Y + r.ys[i];
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    C[py * W + px] = tint ? tint : r.color[i];
  }
}
function shadowAt(x, y, hw) {
  const C = frame.color;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = -hw + dy * 2; dx <= hw - dy * 2; dx++) {
      const px = Math.round(x + dx), i = (y + dy) * W + px;
      if (px >= 0 && px < W && y + dy < H) C[i] = (C[i] & 0xffffff) | (Math.max(C[i] >>> 24, 110) << 24);
    }
}
function text(str, x, y, c, font = "mini", fr = frame) {
  const C = fr.color, ink = hex("#0b0a10");
  const put = (px, py, col) => { if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = col; };
  rasterText(str, font, (a, b) => { put(x + a + 1, y + b + 1, ink); });
  rasterText(str, font, (a, b) => { put(x + a, y + b, c); });
}

// ---- 주인공 자세
const weapon = () => WEAPONS[P.wi];
function idlePose() {
  const w = weapon(), first = mods[w.moves[0]]?.act?.poses?.[0]?.[1];
  let q = first ? { ...first, x: 0, y: 0, ghost: false } : { ...READY };
  return gripPose(q, w);
}
function walkPose(q, ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return { ...q, ffx: 5 * s + 1, fbx: -5 * s - 1, ffy: -4 - Math.max(0, c) * 3, fby: -4 - Math.max(0, -c) * 3, crouch: (q.crouch ?? 0) + (Math.abs(s) > 0.7 ? 0 : 1) };
}
function playerPose() {
  let q = idlePose();
  if (P.cast > 0) q = { ...q, fx: 15, fy: -25, bx: 13, by: -27, crouch: 1 };
  if (P.jy > 0) return { ...q, crouch: 0, ffy: -9, fby: -7, ffx: 3, fbx: -4 };
  if ((S.input.l || S.input.r) && !P.act) return walkPose(q, P.walk);
  return q;
}

// ---- 공격(무기)와 동작이 있는 마법: 인형이 연기하는 act
async function perform(id, opts = {}) {
  if (P.act || S.over || S.mode === "menu") return;
  const e = BYID[id];
  let mod = await load(id);
  if (P.act) return;
  if (opts.w) mod = { ...mod, act: { ...mod.act, poses: mod.act.poses.map(([t, q, h]) => [t, gripPose(q, opts.w), h]) } };
  const flip = P.face < 0, act = createAct(mod, { x: Math.round(P.x), y: FLOOR, flip, seed: (Math.random() * 1e6) | 0, actor: undefined });
  const reach = Math.max(50, e.reach || 60) + 26;
  const rec = { act, id, x0: P.x, face: P.face, reach, buff: BUFF[id], lastHit: 0, hits: (mod.act?.hits ?? []).length };
  act.onHit = (h) => {
    rec.lastHit = act.t;
    if (h.target === false) return;
    const dmg = (6 + (h.push ?? 1.2) * 4) * P.buffK.dmg;
    for (const f of S.foes) {
      const rel = (foeX(f) - rec.x0) * rec.face;
      if (rel > -14 && rel < reach) hitFoe(f, dmg, h, rec.face);
    }
    if (id === "shadow/life-steal") heal(8);
  };
  P.act = rec;
  S.acts.push(rec);
}
function endAct(rec) {
  const q = rec.act.pose;
  if (rec.enemy) {          // 상대의 공격이 끝남
    const f = rec.foe;
    if (f.act === rec) { f.x = clampX(rec.x0 + (q?.x ?? 0) * rec.face); f.act = null; f.cd = 0.6 + Math.random() * 0.9; }
    return;
  }
  if (P.act === rec) {
    P.x = clampX(rec.x0 + (q?.x ?? 0) * rec.face);
    P.act = null;
    if (rec.buff) applyBuff(rec.buff);
  }
}

// ---- 몸 없는 마법: 갈래에 따라 놓는 곳이 다르다
async function castFx(id) {
  if (P.act || S.over || S.mode === "menu") return;
  const e = BYID[id], mod = await load(id);
  const target = nearestFoe(), fx = (o) => createFx(mod, { seed: (Math.random() * 1e6) | 0, ...o });
  P.cast = 0.4;
  const front = P.x + P.face * 70;
  if (e.body && DEBUFF.has(id)) {
    const f = target ?? null;
    const rec = { fx: fx({ x: f ? f.x : front, y: FLOOR, actor: f ? actorOf(f) : dummyActor }), foe: f, life: e.loop ? 4 : e.dur, follow: true };
    S.fields.push(rec);
    if (f) applyStatus(f, id);
    return;
  }
  if (e.body) return perform(id);          // 나에게 거는 것: 인형 위에 그린다
  if (e.cat === "projectiles" && e.loop) {          // 날아가는 탄: 앞으로 날아가 맞으면 터진다
    S.shots.push({ fx: fx({ x: P.x + P.face * 14, y: FLOOR - 20, flip: P.face < 0 }), x: P.x + P.face * 14, vx: P.face * 240, life: 2.2, dmg: 14 });
    return;
  }
  let x, y = FLOOR, flip = P.face < 0, dmgAt = Math.min(e.dur * 0.4, 0.7), radius = 46, dmg = 18, all = false;
  if (e.cat === "projectiles") { x = P.x + P.face * 12; y = FLOOR - 14; radius = 160; }
  else if (e.cat === "weather" || e.cat === "transitions" || id === "ui/achievement" || id === "ui/quest-complete" || id === "ui/countdown") {
    x = W / 2 - e.size[0] / 2 + e.origin[0]; y = H / 2 - e.size[1] / 2 + e.origin[1];
    if (e.cat === "weather") { x = W / 2; y = FLOOR + 12; }
    all = true; dmg = e.cat === "transitions" ? 22 : 10; flip = false;
  } else if (e.cat === "pickups" || e.cat === "ui") { x = P.x; y = e.cat === "ui" ? FLOOR - 40 : FLOOR; dmg = 0; flip = false; if (e.cat === "pickups") heal(10); }
  else if (["fire/fire-breath", "fire/flamethrower", "ice/frost-breath", "water/water-jet", "scifi/tractor-beam"].includes(id)) { x = P.x + P.face * 10; y = FLOOR - 18; radius = 150; }
  else { x = target ? target.x : front; }
  const rec = { fx: fx({ x, y, flip }), life: e.loop ? 2.6 : e.dur, t: 0, dmgAt, done: dmg === 0, dot: e.loop && dmg ? 6 : 0, cx: x, radius, dmg, all, face: P.face, src: e.cat };
  if (e.cat === "projectiles" || radius === 150) rec.cx = P.x + P.face * radius * 0.6;
  if (id === "critters/crocodile") {          // 악어: 주둥이가 적을 향하게 놓고, 콱 무는 순간(2.3초)에 큰 피해
    const tx = target ? target.x : front;
    rec.fx.options.x = Math.round(tx - P.face * 50); rec.fx.options.flip = P.face < 0;
    Object.assign(rec, { cx: tx, dmgAt: 2.3, dmg: 40, dot: 0, life: 3, radius: 30 });
  }
  S.fields.push(rec);
}
function castSelected() {
  const e = S.spell;
  if (!e) return toast("마법을 먼저 고르세요");
  if (e.poses && !e.body) return perform(e.id);
  castFx(e.id);
}

// ---- 적: 허수아비(dummy)와 마네킹(man). 둘 다 pixelfx 과녁(Target)의 맞는 반응을 그대로 쓴다:
//   용수철 흔들림(theta·omega) · 0.05초 번쩍 · 덧칠(skin) · 덜덜 떨기 · 짚 부스러기. 마네킹은 그 흔들림만큼 몸을 줄마다 밀어 그린다.
const RAMPS = [["#ffd0c8", "#e0485a", "#8a2030", "#4a1020"], ["#d8ffd0", "#58c46a", "#2a7a3a", "#103a1c"], ["#d0e4ff", "#4a8ae0", "#2a4a9a", "#101c4a"], ["#fff0b0", "#e0b040", "#9a6a20", "#4a3010"]].map((r) => r.map(hex));
const recolors = RAMPS.map(() => new Map());
function recolor(c, k) {          // 1 대 1 상대: 같은 인형을 밝기 단계별로 다른 색으로(외형만 다름)
  const m = recolors[k];
  let v = m.get(c);
  if (v === undefined) { const l = luma(c); v = l < 0.12 ? c : RAMPS[k][l > 0.72 ? 0 : l > 0.5 ? 1 : l > 0.3 ? 2 : 3]; m.set(c, v); }
  return v;
}
const manActor = stockActor(2);
const actorOf = (f) => (f.kind === "dummy" ? dummyActor : manActor);
const foeX = (f) => (f.act ? f.act.x0 + (f.act.act.pose?.x ?? 0) * f.act.face : f.x);
const clampF = (x) => Math.max(LEFT, Math.min(W + 14, x));
const DUEL_MOVES = ["melee/sword-slash", "melee/double-slash", "melee/thrust", "melee/spin-slash", "moves/dash-strike"];
function makeFoe(kind, x, hp, o = {}) {
  const f = { kind, x, t: new Target(0, (Math.random() * 1e5) | 0), hp, max: hp, flip: false, face: -1, jy: 0, cd: 1, st: {}, weak: 1, stun: 0, walk: 0, wind: 0, punch: 0, ...o };
  S.foes.push(f);
  return f;
}
async function poof(x) {
  const m = await load("spawn/poof");
  S.fields.push({ fx: createFx(m, { x: Math.round(x), y: FLOOR, seed: (Math.random() * 999) | 0 }), life: 1.2, t: 0, done: true });
}
function nextDuel() {
  S.round++;
  const f = makeFoe("man", P.x > W / 2 ? 70 : W - 70, 110 + S.round * 40, { ai: "duel", tint: (S.round - 1) % RAMPS.length, range: 44 });
  poof(f.x);
  toast(`${S.round}번째 상대`);
}
function manPose(f) {
  if (f.act) return f.act.act.pose ?? STAND;
  let q = f.ai === "duel" ? { ...(mods["melee/sword-slash"]?.act?.poses?.[0]?.[1] ?? READY), x: 0, y: 0, ghost: false } : { ...STAND };
  if (f.wind > 0) q = { ...q, fx: -7, fy: -25, lean: -2 };          // 주먹을 뒤로 뺀다(예고)
  else if (f.punch > 0) q = { ...q, fx: 17, fy: -25, lean: 3 };          // 내지른다
  if (f.moving) q = walkPose(q, f.walk);
  return q;
}
function drawFoe(f) {
  const C = frame.color, T = f.t;
  let top = 60;
  if (f.kind === "dummy") {
    shadowAt(f.x, FLOOR, 12);
    T.draw(C, W, H, Math.round(f.x), FLOOR, f.flip);
  } else {
    const q = manPose(f), tan = Math.tan(T.theta), sv = T.shiver > 0 ? (Math.floor(T.clock * 30) & 1 ? 2 : -2) : 0;
    const name = T.flashT > 0 ? "flash" : T.skin, sk = name ? SKINS[name] : null, dir = f.flip ? -1 : 1, mir = f.act ? f.act.face < 0 : f.face < 0;
    const base = f.act ? f.act.x0 : f.x, face = f.act ? f.act.face : f.face;
    const bx2 = Math.round(base) * 2 + Math.round((q.x ?? 0) * 2) * face, by2 = FLOOR * 2 + Math.round((q.y ?? 0) * 2);
    shadowAt(bx2 / 2, FLOOR, 10);
    hi.push(() => {
      setSkin(STOCK2);
      const r = posed(q);
      plot2(r, bx2, by2, mir, (c, i) => {
        if (f.tint !== undefined) c = recolor(c, f.tint);
        return sk ? mix(c, sk[0], sk[1]) : c;
      }, (i) => Math.round(-r.ys[i] * tan * 0.8) * dir + sv);
    });
    top = 48;
  }
  T.drawStraw(C, W, H, Math.round(foeX(f)), FLOOR, f.flip);
  if (f.ai === "still") return;          // 연습용 허수아비는 체력 막대가 없다
  const bw = 24, fill = Math.max(0, Math.round((bw * f.hp) / f.max)), y = FLOOR - top, cx = Math.round(foeX(f));
  for (let i = 0; i < bw; i++) for (let j = 0; j < 3; j++) {
    const px = cx - 12 + i, py = y + j;
    if (px >= 0 && px < W) C[py * W + px] = j === 0 || j === 2 ? hex("#0b0a10") : i < fill ? hex("#e0485a") : hex("#3a2430");
  }
}
function nearestFoe() {
  let best = null, bd = 1e9;
  for (const f of S.foes) {
    const d = Math.abs(f.x - P.x) + ((f.x - P.x) * P.face < 0 ? 60 : 0);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
function hitFoe(f, dmg, h = {}, face = 1) {
  if (f.dead) return;
  const k = f.weak * (f.st.weakT > 0 ? f.st.weakK : 1), push = h.push ?? 1.2;
  dmg = Math.round(dmg * k);
  f.flip = face < 0;
  f.t.hit({ push, straw: h.straw ?? 8, skin: h.skin, shiver: h.shiver ?? 0, flash: 0.05 });
  S.nums.push({ x: foeX(f), y: FLOOR - (f.kind === "dummy" ? 58 : 46), v: dmg, t: 0 });
  if (f.ai === "still") {          // 연습: 체력은 줄지 않고 수치만 센다
    const now = performance.now() / 1000;
    S.stat.last = dmg; S.stat.sum += dmg; S.stat.recent.push([now, dmg]);
    return;
  }
  f.hp -= dmg;
  if (f.act && push >= 1.4) { f.x = clampX(foeX(f)); f.act.dead = true; f.act = null; f.cd = 0.8; }          // 센 타격은 상대의 공격을 끊는다
  f.stun = Math.max(f.stun, 0.3);
  f.wind = 0;
  if (!f.st.stopT && !f.act) f.x = clampF(f.x + face * push * 3);
  if (f.hp <= 0) killFoe(f);
}
async function killFoe(f) {
  f.dead = true;
  if (f.act) { f.act.dead = true; f.act = null; }
  S.ko++;
  S.foes = S.foes.filter((g) => g !== f);
  const ids = ["spawn/shatter-death", "spawn/dissolve-burn", "spawn/disintegrate", "spawn/soul-rise"], id = ids[(Math.random() * ids.length) | 0];
  const x = Math.min(RIGHT, Math.round(foeX(f)));
  if (S.mode === "horde" && S.ko >= 100) finish("100명 격파!");
  if (S.mode === "duel") { S.nextT = 2.2; toast("승리!"); heal(25); }
  const m = await load(id);
  S.fields.push({ fx: createFx(m, { x, y: FLOOR, actor: actorOf(f), seed: S.ko }), life: BYID[id].dur, t: 0, done: true });
}
function applyStatus(f, id) {
  const s = STATUS[id];
  if (!s) return;
  if (s.skin) f.t.skin = s.skin;
  if (s.dot) { f.st.dotT = 4; f.st.dot = s.dot; }
  if (s.stop) f.st.stopT = 3.5;
  if (s.slow) f.st.slowT = 5;
  if (s.away) f.st.awayT = 4;
  if (s.weak) { f.st.weakT = 6; f.st.weakK = s.weak; }
  if (s.burst) hitFoe(f, s.burst * P.buffK.dmg, { push: 1.4, straw: 10, skin: s.skin }, Math.sign(f.x - P.x) || 1);
}
function foeAttack(f) {          // 1 대 1 상대의 공격: 주인공과 같은 무기 동작을 그대로 쓴다(예고 동작이 있어 피할 수 있다)
  const id = DUEL_MOVES[(Math.random() * DUEL_MOVES.length) | 0], mod = mods[id];
  if (!mod) return;
  const act = createAct(mod, { x: Math.round(f.x), y: FLOOR, flip: f.face < 0, seed: (Math.random() * 1e6) | 0 });
  const rec = { act, id, x0: f.x, face: f.face, reach: Math.max(50, BYID[id].reach || 60) + 20, foe: f, enemy: true, lastHit: 0 };
  act.onHit = (h) => {
    if (h.target === false || rec.dead) return;
    const rel = (P.x - rec.x0) * rec.face;
    if (rel > -14 && rel < rec.reach && P.jy < 18) hurtPlayer(Math.round(5 + (h.push ?? 1.2) * 3), rec.face);
  };
  f.act = rec;
  S.acts.push(rec);
}
function stepFoe(f, dt) {
  const st = f.st;
  for (const k of ["dotT", "stopT", "slowT", "awayT", "weakT"]) if (st[k] > 0) st[k] -= dt;
  if (st.dotT > 0) { st.acc = (st.acc ?? 0) + st.dot * dt; if (st.acc >= 3) { hitFoe(f, st.acc, { push: 0.3, straw: 2 }, 1); st.acc = 0; } }
  if (!(st.dotT > 0) && !(st.weakT > 0) && !(st.stopT > 0) && f.t.skin && f.t.skin !== "flash") f.t.skin = null;
  f.t.step(dt);
  f.moving = false;
  if (f.stun > 0) { f.stun -= dt; return; }
  if (st.stopT > 0 || f.ai === "still" || f.act || S.over) return;
  const slow = st.slowT > 0 ? 0.4 : 1, away = st.awayT > 0, d = P.x - f.x, dist = Math.abs(d);
  f.face = d >= 0 ? 1 : -1;
  f.cd -= dt * slow;
  if (f.ai === "walk") {          // 마네킹: 천천히 걸어와 주먹을 뒤로 뺐다가(0.35초) 내지른다
    if (f.wind > 0) { if ((f.wind -= dt) <= 0) { f.punch = 0.2; if (Math.abs(P.x - f.x) < 26 && P.jy < 16) hurtPlayer(6, f.face); } return; }
    if (f.punch > 0) { f.punch -= dt; return; }
    if (!away && dist < 20) { if (f.cd <= 0) { f.cd = 1.5; f.wind = 0.35; } return; }
    f.moving = true;
    f.walk += dt * 7 * slow;
    f.x = clampF(f.x + (away ? -1 : 1) * f.face * 16 * slow * dt);
  } else if (f.ai === "duel") {          // 상대: 쉬는 동안은 거리를 두고, 준비되면 다가와 벤다
    if (!away && dist < f.range && f.cd <= 0) return foeAttack(f);
    const want = f.cd > 0.45 ? 72 : f.range - 8, mv = away ? -1 : dist > want + 4 ? 1 : dist < want - 12 ? -1 : 0;
    if (mv) { f.moving = true; f.walk += dt * 10 * slow; f.x = clampX(f.x + mv * f.face * 50 * slow * dt); }
  }
}
function finish(title) {
  S.over = true;
  document.getElementById("otitle").textContent = title;
  document.getElementById("over").hidden = false;
}
function hurtPlayer(d, dir) {
  if (P.inv > 0 || S.over) return;
  if (P.buff.shield > 0) { toast("막았다!"); P.inv = 0.4; return; }
  P.hp = Math.max(0, P.hp - d);
  P.hurt = 0.25;
  P.inv = 0.7;
  if (!P.act) P.x = clampX(P.x + dir * 16);
  if (P.hp <= 0) finish("패배");
}
function heal(n) { P.hp = Math.min(P.max, P.hp + n); }
function applyBuff(b) {
  if (b.heal) heal(b.heal);
  if (b.shield) P.buff.shield = b.shield;
  if (b.dmg) { P.buff.dmg = 8; P.buffK.dmg = b.dmg; }
  if (b.speed) { P.buff.speed = 8; P.buffK.speed = b.speed; }
}
const clampX = (x) => Math.max(LEFT, Math.min(RIGHT, x));

// ---- 한 장면
let last = performance.now(), toastT = 0;
function toast(s) { const el = document.getElementById("toast"); el.textContent = s; el.style.opacity = 1; toastT = 1.4; }
function tick(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const frozen = S.acts.some((r) => r.act.frozen);
  // 효과 시간
  for (const r of S.acts) r.act.update(dt);
  for (const r of S.acts.slice()) {
    const done = r.act.done();
    // 마지막 타격이 지나고 조금 뒤에는 움직여서 끊을 수 있다(효과는 제자리에서 마저 끝난다)
    const cancel = P.act === r && (S.input.l || S.input.r) && r.lastHit > 0 && r.act.t > r.lastHit + 0.25;
    if (r.dead) { S.acts.splice(S.acts.indexOf(r), 1); continue; }
    if (done || cancel) { endAct(r); if (done) S.acts.splice(S.acts.indexOf(r), 1); else r.detached = true; }
  }
  if (!frozen) {
    // 주인공
    for (const k of ["dmg", "speed", "shield"]) if (P.buff[k] > 0 && (P.buff[k] -= dt) <= 0 && k !== "shield") P.buffK[k] = 1;
    if (P.inv > 0) P.inv -= dt;
    if (P.hurt > 0) P.hurt -= dt;
    if (P.cast > 0) P.cast -= dt;
    if (!P.act && !S.over && S.mode !== "menu") {
      const mv = (S.input.r ? 1 : 0) - (S.input.l ? 1 : 0);
      if (mv) { P.face = mv; P.x = clampX(P.x + mv * 72 * P.buffK.speed * dt); P.walk += dt * 11 * P.buffK.speed; }
    }
    if (P.jy > 0 || P.vy) { P.vy -= 430 * dt; P.jy += P.vy * dt; if (P.jy <= 0) { P.jy = 0; P.vy = 0; } }
    for (const f of S.foes.slice()) stepFoe(f, dt);
    if (S.mode === "castle") castle.step(dt);
    if (bookCircle) bookCircle.update(dt);
    for (const r of S.fields) {
      r.t = (r.t ?? 0) + dt;
      r.fx.update(dt);
      if (r.follow && r.foe && !r.foe.dead) r.fx.options.x = Math.round(r.foe.x);
      if (!r.done && r.t >= r.dmgAt) {
        r.done = true;
        for (const f of S.foes.slice()) if (r.all || Math.abs(f.x - r.cx) < r.radius) hitFoe(f, r.dmg * P.buffK.dmg, { push: 1.6, straw: 12 }, Math.sign(f.x - P.x) || 1);
      }
      if (r.dot && r.t > r.dmgAt) { r.acc = (r.acc ?? 0) + dt; if (r.acc > 0.5) { r.acc = 0; for (const f of S.foes.slice()) if (Math.abs(f.x - r.cx) < r.radius * 0.7) hitFoe(f, r.dot * 0.5, { push: 0.4, straw: 2 }, 1); } }
      if (r.t >= r.life && r.fx.meta.loop && !r.stopped) { r.fx.stop(); r.stopped = true; }
    }
    S.fields = S.fields.filter((r) => !(r.fx.done() || r.t > r.life + 1.5));
    for (const s of S.shots) {
      s.life -= dt; s.x += s.vx * dt; s.fx.options.x = Math.round(s.x); s.fx.update(dt);
      for (const f of S.foes) if (!s.hit && Math.abs(f.x - s.x) < 12) { s.hit = true; hitFoe(f, s.dmg * P.buffK.dmg, { push: 1.8, straw: 12 }, Math.sign(s.vx)); burst(s.x); }
    }
    S.shots = S.shots.filter((s) => !s.hit && s.life > 0 && s.x > -40 && s.x < W + 40);
    for (const n of S.nums) n.t += dt;
    S.nums = S.nums.filter((n) => n.t < 0.8);
    if (S.mode === "horde" && !S.over && S.left > 0 && (S.spawnT -= dt) <= 0 && S.foes.length < 6) { S.left--; S.spawnT = 2.4; makeFoe("man", W + 10, 34, { ai: "walk" }); }
    if (S.mode === "duel" && !S.over && !S.foes.length && (S.nextT -= dt) <= 0) { S.nextT = 99; nextDuel(); }
  }
  if (toastT > 0 && (toastT -= dt) <= 0) document.getElementById("toast").style.opacity = 0;
  draw();
  requestAnimationFrame(tick);
}
async function burst(x) {
  const m = await load("impacts/hit-spark");
  S.fields.push({ fx: createFx(m, { x: Math.round(x), y: FLOOR - 24, seed: (Math.random() * 999) | 0 }), life: 0.6, t: 0, done: true });
}

// 두 배 층에 인형 하나: r = 두 배로 그린 자세, (bx2, by2) = 발 자리(두 배 좌표), colorFn·shiftFn = 색 바꾸기·줄마다 밀기
function plot2(r, bx2, by2, mirror, colorFn, shiftFn) {
  for (let i = 0; i < r.n; i++) {
    const px = (mirror ? bx2 - r.xs[i] - 1 : bx2 + r.xs[i]) + (shiftFn ? shiftFn(i) : 0), py = by2 + r.ys[i];
    if (px < 0 || py < 0 || px >= W2 || py >= H2) continue;
    out32[py * W2 + px] = colorFn ? colorFn(r.color[i], i) : r.color[i];
  }
}
const BOOKC = { cover: hex("#1c5a34"), coverD: hex("#0f3620"), page: hex("#f6eed6"), pageD: hex("#d6c8a0"), pageK: hex("#a89870"), rune: hex("#6affc0"), runeHi: hex("#d8fff0"), gold: hex("#f0c850"), glow: hex("#2aa870") };
function bookJob(x1, y1, face, now) {          // (x1, y1): 책 가운데(보통 좌표). 펼친 책을 살짝 기울여 둥실 띄운다
  const bob = Math.sin(now * 2.6) * 2.2, cx = Math.round(x1 * 2), cy = Math.round(y1 * 2 + bob), tilt = 0.18 * face;
  // 빛: 앞 층의 빛판에 둥근 초록 빛(보통 좌표)
  for (let dy = -7; dy <= 7; dy++) for (let dx = -9; dx <= 9; dx++) {
    const d = Math.hypot(dx / 1.3, dy), px = Math.round(x1) + dx, py = Math.round(y1 + bob / 2) + dy;
    if (d > 7 || px < 0 || py < 0 || px >= W || py >= H) continue;
    const k = (1 - d / 7) ** 2 * 0.55, g = BOOKC.glow, j = py * W + px, o = frameC.light[j];
    const add = (n) => Math.min(255, ((o >>> n) & 255) + ((g >>> n) & 255) * k);
    frameC.light[j] = (255 << 24) | (add(16) << 16) | (add(8) << 8) | add(0);
  }
  hi.push(() => {
    const put = (x, y, c) => { const px = cx + x, py = cy + y + Math.round(x * tilt); if (px >= 0 && py >= 0 && px < W2 && py < H2) out32[py * W2 + px] = c; };
    for (let x = -13; x <= 13; x++) {          // 표지(아래)와 책장(위): 가운데 등이 낮게 접힌 V 모양
      const ax = Math.abs(x), sag = Math.round(ax * 0.22);
      for (let y = -8; y <= 7; y++) {
        const top = -7 + sag - (ax < 2 ? 0 : 1), bot = 6 + Math.round(ax * 0.1);
        if (y < top - 1 || y > bot + 1) continue;
        let c;
        if (y > bot || ax === 13) c = y > bot ? BOOKC.coverD : BOOKC.cover;          // 표지 테두리
        else if (y < top) c = BOOKC.cover;
        else if (ax <= 1) c = BOOKC.pageK;          // 책등
        else c = (y - top) % 3 === 2 && ax > 2 && ax < 12 ? BOOKC.pageD : y > bot - 2 ? BOOKC.pageD : BOOKC.page;
        if ((ax === 13 || y > bot) && (ax > 10) && (y > bot || y < top + 2)) c = BOOKC.gold;          // 금 모서리
        put(x, y, c);
      }
    }
    // 빛나는 룬: 양쪽 책장에 작은 원과 획, 반짝임
    const ph = now * 3;
    for (const sx of [-1, 1]) for (let a = 0; a < 6.283; a += 0.35) {
      const r = 2.6 + Math.sin(a * 3 + ph) * 0.4, x = sx * 6.5 + Math.cos(a) * r, y = -1 + Math.sin(a) * r * 0.75;
      put(Math.round(x), Math.round(y), (a * 3 + ph) % 6.283 < 1 ? BOOKC.runeHi : BOOKC.rune);
    }
    for (let k = 0; k < 4; k++) {          // 책 둘레를 도는 반짝이 넷
      const a = now * 1.8 + k * 1.571, x = Math.round(Math.cos(a) * 17), y = Math.round(Math.sin(a) * 6 - 6);
      put(x, y, BOOKC.runeHi); put(x + 1, y, BOOKC.rune); put(x - 1, y, BOOKC.rune); put(x, y + 1, BOOKC.rune); put(x, y - 1, BOOKC.rune);
    }
  });
}
let bookCircle = null;
async function ensureCircle() {
  if (bookCircle) return;
  const m = await load("arcane/rune-circle-s");
  bookCircle = createFx(m, { x: 0, y: FLOOR, palette: ["#06140c", "#0e3a24", "#1a6a40", "#2aa860", "#58e0a0", "#b8ffe0", "#f0fff8"], seed: 3 });
}
function heroJob() {
  if (weapon().float && S.mode !== "menu") {          // 마도서: 발밑 마법진과 손 앞에 뜬 책
    ensureCircle();
    const rec = P.act && !P.act.detached ? P.act : null, q = rec ? rec.act.pose ?? STAND : playerPose(), face = rec ? rec.face : P.face;
    const bx = rec ? rec.x0 + (q.x ?? 0) * face : P.x, by = rec ? FLOOR + (q.y ?? 0) : FLOOR - P.jy;
    if (bookCircle) { bookCircle.options.x = Math.round(bx); bookCircle.draw(frame); }
    const hx = (q.fx ?? 11) + 9, hy = (q.fy ?? -21) - 7;
    bookJob(bx + face * hx, by + hy, face, performance.now() / 1000);
  }          // 주인공: 서 있거나 걷는 자세, 또는 연기 중인 자세를 두 배 층에
  const skin = pskin ?? STOCK2;
  if (P.act && !P.act.detached) {
    const rec = P.act, q = rec.act.pose ?? STAND, flip = rec.face < 0, X = Math.round(rec.x0);
    const bx2 = X * 2 + (flip ? -1 : 1) * Math.round((q.x ?? 0) * 2), by2 = FLOOR * 2 + Math.round((q.y ?? 0) * 2);
    shadowAt(bx2 / 2, FLOOR, 10);
    hi.push(() => { setSkin(skin); plot2(posed(q), bx2, by2, flip); });
    return;
  }
  const blink = P.inv > 0 && Math.floor(P.inv * 20) % 2 === 0, q = playerPose(), white = P.hurt > 0 ? hex("#ffffff") : 0;
  shadowAt(P.x, FLOOR, 10);
  if (blink) return;
  const bx2 = Math.round(P.x * 2), by2 = (FLOOR - Math.round(P.jy)) * 2;
  hi.push(() => { setSkin(skin); plot2(posed(q), bx2, by2, P.face < 0, white ? () => white : null); });
}
function draw() {
  if (S.mode === "castle") { castle.render(); document.getElementById("info").textContent = castle.info(); return; }          // 성 지키기는 제 화면(384×300)으로
  clearFrame(frame);
  clearFrame(frameC);
  hi = [];
  setSkin(null);
  for (const f of S.foes) drawFoe(f);
  for (const r of S.fields) r.fx.draw(frame, "back");
  heroJob();
  // 앞 층: 연기의 효과(칼빛·불꽃), 앞에 그리는 효과, 날아가는 탄, 피해 숫자, 보호막
  for (const r of S.acts) r.act.draw(frameC, { body: false, target: false });
  for (const r of S.fields) r.fx.draw(frameC, "front");
  for (const s of S.shots) s.fx.draw(frameC);
  const keep = frame;
  if (P.buff.shield > 0 && !P.act) ring(P.x, FLOOR - 19, 20, hex("#fff4c0"));
  for (const n of S.nums) text(String(n.v), Math.round(n.x) - 4, Math.round(n.y - n.t * 22), n.v >= 25 ? hex("#ffe14a") : hex("#ffffff"), "mini", frameC);
  void keep;
  // 배경 층을 두 배로 키우고 → 인형 → 앞 층을 얹는다
  composite(frame, bufA, S.mode === "menu" ? bgMenu : bg);
  for (let y = 0; y < H; y++) {
    const r0 = y * W, o0 = y * 2 * W2;
    for (let x = 0; x < W; x++) { const c = A32[r0 + x], o = o0 + x * 2; out32[o] = c; out32[o + 1] = c; out32[o + W2] = c; out32[o + W2 + 1] = c; }
  }
  for (const job of hi) job();
  setSkin(null);
  composite(frameC, bufC, null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = C32[y * W + x], a = c >>> 24;
    if (!a) continue;
    const o = y * 2 * W2 + x * 2;
    for (const j of [o, o + 1, o + W2, o + W2 + 1]) {
      if (a === 255) { out32[j] = c; continue; }
      const d = out32[j], k = a / 255, ch = (n) => Math.round(((c >>> n) & 255) * k + ((d >>> n) & 255) * (1 - k));
      out32[j] = (255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
  }
  let sx = 0, sy = 0;
  for (const r of S.acts) { const [a, b] = r.act.shake; sx += a; sy += b; }
  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(0, 0, W2, H2);
  ctx.putImageData(img, sx * 2, sy * 2);
  // 체력·정보
  document.getElementById("hpbar").style.width = (100 * P.hp) / P.max + "%";
  document.getElementById("hptxt").textContent = `${Math.ceil(P.hp)} / ${P.max}`;
  let info = "";
  if (S.mode === "practice") {
    const now = performance.now() / 1000, R = S.stat.recent;
    while (R.length && R[0][0] < now - 3) R.shift();
    info = `방금 ${S.stat.last} · 합계 ${S.stat.sum} · 초당 ${Math.round(R.reduce((a, b) => a + b[1], 0) / 3)}`;
  } else if (S.mode === "horde") info = `쓰러뜨림 ${S.ko} / 100`;
  else if (S.mode === "duel") info = `${S.round}번째 상대 · 이긴 판 ${S.ko}`;
  document.getElementById("info").textContent = info;
}
function ring(cx, cy, r, c) {
  for (let a = 0; a < 64; a++) {
    const px = Math.round(cx + Math.cos((a / 64) * 6.283) * r), py = Math.round(cy + Math.sin((a / 64) * 6.283) * r * 1.1);
    if (px >= 0 && py >= 0 && px < W && py < H && (a + Math.floor(performance.now() / 80)) % 4) frameC.light[py * W + px] = c;
  }
}

// ---- 조작
function attack() {
  if (P.act || S.over || P.jy > 0 || S.mode === "menu") return;
  const w = weapon(), id = w.moves[P.combo % w.moves.length];
  P.combo++;
  perform(id, { w });
}
function jump() { if (P.jy === 0 && !P.act && !S.over && S.mode !== "menu") { P.vy = 165; P.jy = 0.01; } }
function hold(el, key) {
  const on = (e) => { e.preventDefault(); S.input[key] = true; el.classList.add("on"); };
  const off = (e) => { e.preventDefault(); S.input[key] = false; el.classList.remove("on"); };
  el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off);
}
function tap(el, fn) { el.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); }); }
hold(document.getElementById("bl"), "l");
hold(document.getElementById("br"), "r");
tap(document.getElementById("bj"), jump);
tap(document.getElementById("ba"), attack);
tap(document.getElementById("bs"), castSelected);
document.getElementById("oagain").onclick = () => startMode(S.mode);
document.getElementById("omenu").onclick = () => showMenu();
document.getElementById("bm").onclick = () => showMenu();
for (const b of document.querySelectorAll("#menu [data-mode]")) b.onclick = () => startMode(b.dataset.mode);
const KEYS = { ArrowLeft: "l", ArrowRight: "r" };
addEventListener("keydown", (e) => {
  if (KEYS[e.key]) S.input[KEYS[e.key]] = true;
  else if (e.key === "ArrowUp" || e.key === " ") jump();
  else if (e.key === "z" || e.key === "Z") attack();
  else if (e.key === "x" || e.key === "X") castSelected();
  else if (e.key === "q") setWeapon((P.wi + WEAPONS.length - 1) % WEAPONS.length);
  else if (e.key === "e") setWeapon((P.wi + 1) % WEAPONS.length);
});
addEventListener("keyup", (e) => { if (KEYS[e.key]) S.input[KEYS[e.key]] = false; });

function reset() {
  for (const f of S.foes) f.dead = true;
  Object.assign(S, { ko: 0, foes: [], acts: [], fields: [], shots: [], nums: [], over: false, left: 0, spawnT: 0, nextT: 99, round: 0, stat: { sum: 0, last: 0, recent: [] } });
  Object.assign(P, { x: 110, face: 1, hp: P.max, act: null, inv: 0.6, jy: 0, vy: 0, buff: { dmg: 0, speed: 0, shield: 0 }, buffK: { dmg: 1, speed: 1 } });
  document.getElementById("over").hidden = true;
}
async function startMode(m) {
  await Promise.all(["spawn/poof", "impacts/hit-spark", ...DUEL_MOVES].map(load));
  reset();
  S.mode = m;
  document.getElementById("menu").hidden = true;
  document.body.classList.remove("inmenu");
  document.body.classList.toggle("castle", m === "castle");
  if (m === "castle") { await castle.enter(); toast("성 지키기"); } else { castle.exit(); cv.width = W2; cv.height = H2; }
  if (m === "practice") { makeFoe("dummy", 250, 1, { ai: "still" }); toast("연습 모드"); }
  if (m === "horde") { S.left = 100; S.spawnT = 1; toast("1 대 100"); }
  if (m === "duel") nextDuel();
}
function showMenu() {
  reset();
  document.body.classList.remove("castle");
  castle.exit();
  cv.width = W2; cv.height = H2;
  S.mode = "menu";
  makeFoe("dummy", 250, 1, { ai: "still" });
  document.getElementById("menu").hidden = false;
  document.body.classList.add("inmenu");
}

// ---- 성 지키기(2판): 규칙·그리기·화면은 castle.js. 여기서는 도구만 넘긴다
const castle = createCastle({
  cv, load, mods, createAct, createFx, setSkin, posed, STAND, READY, buildSkin, SETS, walkPose,
  getLook: () => LOOK, toast: (m) => toast(m), menu: () => showMenu(),
});

// ---- 무기·마법 고르기 창
const picker = document.getElementById("picker"), plist = document.getElementById("plist"), tabs = document.getElementById("tabs");
let pickMode = "w", pickCat = "moves";
async function setWeapon(i) {
  P.wi = i;
  P.combo = 0;
  document.getElementById("wname").textContent = WEAPONS[i].ko;
  await Promise.all(WEAPONS[i].moves.map(load));
}
function setSpell(e) {
  S.spell = e;
  document.getElementById("sname").textContent = e.ko;
  const cs = document.getElementById("cspname");
  if (cs) cs.textContent = e.ko;
  load(e.id);
  try { localStorage.setItem("arena.spell", e.id); } catch {}
}
function openPicker(mode) {
  pickMode = mode;
  picker.hidden = false;
  document.getElementById("ptitle").textContent = mode === "w" ? "무기 고르기" : "마법 고르기 (244)";
  tabs.innerHTML = "";
  if (mode === "s") {
    const cats = ["all", ...Object.keys(CATS)];
    for (const c of cats) {
      const b = document.createElement("button");
      const n = c === "all" ? FX.length : FX.filter((e) => e.cat === c).length;
      b.textContent = `${c === "all" ? "전체" : CATS[c]} ${n}`;
      b.className = c === pickCat ? "on" : "";
      b.onclick = () => { pickCat = c; openPicker("s"); };
      tabs.appendChild(b);
    }
  }
  plist.innerHTML = "";
  const items = mode === "w" ? WEAPONS.map((w, i) => ({ label: w.tag ? w.ko + " ✦" : w.ko, sub: (w.tag ? "추가 · " + w.tag + " · " : "") + w.moves.map((m) => BYID[m].ko).join(" · "), sel: i === P.wi, go: () => setWeapon(i) }))
    : FX.filter((e) => pickCat === "all" || e.cat === pickCat).map((e) => ({ label: e.ko, sub: `${CATS[e.cat]} · ${e.poses && !e.body ? "동작" : e.body ? (DEBUFF.has(e.id) ? "적에게" : "나에게") : e.cat === "projectiles" && e.loop ? "날리기" : "효과"}`, sel: S.spell === e, go: () => setSpell(e) }));
  for (const it of items) {
    const b = document.createElement("button");
    b.innerHTML = `${it.label}<small>${it.sub}</small>`;
    if (it.sel) b.className = "sel";
    b.onclick = () => { it.go(); picker.hidden = true; };
    plist.appendChild(b);
  }
}
tap(document.getElementById("pickW"), () => openPicker("w"));
tap(document.getElementById("pickS"), () => openPicker("s"));

// ---- 외형 바꾸기: 세트(기본 + 다섯) · 색 칸 일곱 · 체형 막대 넷. 고른 것은 이 브라우저에 저장된다
let LOOK = { set: -1, color: {}, shape: {} }, pskin = null;
try { LOOK = { ...LOOK, ...JSON.parse(localStorage.getItem("arena.look") || "{}") }; } catch {}
function applyLook() {
  pskin = LOOK.set < 0 ? null : buildSkin(SETS[LOOK.set], LOOK.color, LOOK.shape, 2);
  try { localStorage.setItem("arena.look", JSON.stringify(LOOK)); } catch {}
}
applyLook();
const lookp = document.getElementById("lookp"), lprev = document.getElementById("lprev"), lctx = lprev.getContext("2d"), limg = lctx.createImageData(144, 144);
function lookUI() {
  const sets = document.getElementById("lsets"), cols = document.getElementById("lcolors"), shp = document.getElementById("lshape");
  sets.innerHTML = "";
  [{ ko: "기본 인형" }, ...SETS].forEach((st, i) => {
    const b = document.createElement("button");
    b.textContent = st.ko;
    if (i - 1 === LOOK.set) b.className = "on";
    b.onclick = () => { LOOK = { set: i - 1, color: {}, shape: {} }; applyLook(); lookUI(); };
    sets.appendChild(b);
  });
  cols.innerHTML = ""; shp.innerHTML = "";
  const set = SETS[LOOK.set];
  document.getElementById("lreset").hidden = !set;
  if (!set) { cols.innerHTML = '<span class="lnote">기본 인형은 색·체형을 바꿀 수 없어요. 위에서 세트를 고르세요.</span>'; return; }
  for (const sl of SLOTS) {
    const lab = document.createElement("label"), inp = document.createElement("input");
    inp.type = "color";
    inp.value = LOOK.color[sl.key] ?? set.color[sl.key];
    inp.oninput = () => { LOOK.color[sl.key] = inp.value; applyLook(); };
    lab.append(inp, sl.ko);
    cols.appendChild(lab);
  }
  for (const [k, [lo, hi, ko]] of Object.entries(SHAPE_RANGE)) {
    const lab = document.createElement("label"), inp = document.createElement("input");
    inp.type = "range"; inp.min = lo; inp.max = hi; inp.step = 0.05;
    inp.value = LOOK.shape[k] ?? set.shape[k] ?? 1;
    inp.oninput = () => { LOOK.shape[k] = +inp.value; applyLook(); };
    lab.append(ko, inp);
    shp.appendChild(lab);
  }
}
let lookT = 0;
function lookPreview(now) {          // 미리보기: 서기 → 무기 겨눔 → 걷기를 번갈아
  if (lookp.hidden) return;
  const k = Math.floor(now / 1100) % 3, base = idlePose(), q = k === 0 ? { ...STAND } : k === 1 ? base : walkPose(base, now / 90);
  setSkin(pskin ?? STOCK2);
  const r = posed(q);
  setSkin(null);
  const D = new Uint32Array(limg.data.buffer);
  D.fill(0xff2f2226);
  for (let x = 8; x < 136; x++) D[128 * 144 + x] = 0xff50404a;
  for (let i = 0; i < r.n; i++) { const x = 58 + r.xs[i], y = 127 + r.ys[i]; if (x >= 0 && y >= 0 && x < 144 && y < 144) D[y * 144 + x] = r.color[i]; }
  lctx.putImageData(limg, 0, 0);
  requestAnimationFrame(lookPreview);
}
function openLook() { lookp.hidden = false; lookUI(); requestAnimationFrame(lookPreview); }
document.getElementById("lclose").onclick = () => (lookp.hidden = true);
document.getElementById("lreset").onclick = () => { LOOK.color = {}; LOOK.shape = {}; applyLook(); lookUI(); };
document.getElementById("blk").onclick = openLook;
document.getElementById("mlook").onclick = openLook;
document.getElementById("pclose").onclick = () => (picker.hidden = true);

// ---- 시작
(async () => {
  await document.fonts.load("11px Galmuri11B");
  bg = buildBackdrop(W, H, FLOOR);
  bgMenu = buildBackdrop(W, H, FLOOR, false);
  await setWeapon(1);
  let first = "moves/fireball-throw";
  try { first = localStorage.getItem("arena.spell") || first; } catch {}
  setSpell(BYID[first] ?? BYID["moves/fireball-throw"]);
  // 시험용 주소 인수: ?w=무기번호 &s=효과 &auto=1(자동으로 공격·마법)
  const q = new URLSearchParams(location.search);
  if (q.get("w")) await setWeapon(+q.get("w"));
  if (q.get("s") && BYID[q.get("s")]) setSpell(BYID[q.get("s")]);
  window.__castle = castle;
  window.__arena = { S, P, attack, castSelected, setWeapon, setSpell, BYID, perform, castFx, startMode, showMenu, setLook: (i, c = {}, sh = {}) => { LOOK = { set: i, color: c, shape: sh }; applyLook(); }, openLook };
  showMenu();
  if (q.get("mode")) await startMode(q.get("mode"));
  requestAnimationFrame((t) => { last = t; tick(t); });
})();
