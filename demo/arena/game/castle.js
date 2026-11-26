// 성 지키기(2026-11-27 초안): 왼쪽 성을 아군 넷(성기사·마왕·마법사·궁수)이 지키고, 오른쪽에서 소환수 13종이 몰려온다.
// 흐름: 배치(자리 여섯 중에 직접 놓기 / 자동 배치) → 전투(아군은 자동으로 기본 공격과 스킬 셋) → 단계 클리어 → 다시 배치.
// 적은 단계마다 두 배: 10 → 20 → 40 → 80 → 100(5단계). 참고: 스팀 「나인 킹즈」의 "놓고 자동으로 싸운다"는 틀만.
// 본체(main.js)가 그리기 도구를 api 로 넘긴다. 이 파일은 규칙·그리기 순서만 가진다.

export const CASTLE_X = 30, SPOTS = [62, 100, 138, 176, 214, 252];
export const COUNTS = [10, 20, 40, 80, 100];
const ACT_SPEED = 1.8, CD_K = 0.7, FX_SPEED = 1.4;          // 시전 속도(2026-11-27 사용자 요청: 빠르게)

// 적: 우리 소환수. fly = 공중 높이(기준점이 몸 가운데인 것), hp·spd(점/초)·dmg(성·아군에게 주는 피해)
const FOES = {
  slime: { hp: 34, spd: 13, dmg: 5 }, frog: { hp: 28, spd: 20, dmg: 5 }, butterfly: { hp: 16, spd: 24, dmg: 3, fly: 32 },
  snake: { hp: 40, spd: 17, dmg: 6 }, bat: { hp: 22, spd: 30, dmg: 4, fly: 34 }, bird: { hp: 24, spd: 32, dmg: 4, fly: 38 },
  wisp: { hp: 32, spd: 26, dmg: 6 }, eyeball: { hp: 55, spd: 12, dmg: 8 }, "fish-school": { hp: 38, spd: 22, dmg: 6, fly: 28 },
  "flying-skull": { hp: 46, spd: 24, dmg: 8 }, ghost: { hp: 60, spd: 15, dmg: 9 }, jellyfish: { hp: 48, spd: 11, dmg: 8, fly: 64 },
  crocodile: { hp: 260, spd: 9, dmg: 20, big: true },
};
const POOLS = [["slime", "frog", "butterfly"], ["snake", "bat", "bird"], ["wisp", "eyeball", "fish-school"], ["flying-skull", "ghost", "jellyfish"], ["crocodile"]];

// 아군: set = 외형 세트(looks.js), weapon = 쥐는 무기, basic = 기본 공격, skills = 스킬 셋(cd 재사용 초)
//   act: 인형이 연기하는 동작(맞는 순간 앞쪽 reach 안의 적에게 dmg) / fx: 효과를 그 자리에 놓기(at: enemy·self·front, r 반지름)
export const HEROES = [
  { key: "holy", ko: "성기사", set: 1, weapon: "holysword", hp: 320, range: 70,
    basic: { act: "melee/sword-slash", dmg: 16, reach: 70, single: true },
    skills: [
      { ko: "성스러운 일격", cd: 7, act: "moves/holy-smite", dmg: 30, reach: 130, speed: 1.4 },
      { ko: "신성 방패", cd: 14, fx: "holy/divine-shield", at: "self", heal: 60, castle: 8, life: 1.6 },
      { ko: "빛의 기둥", cd: 11, fx: "holy/holy-pillar", at: "enemy", r: 34, dmg: 55, delay: 0.5 },
    ] },
  { key: "dark", ko: "마왕", set: 0, weapon: "demonsword", hp: 280, range: 72,
    basic: { act: "melee/heavy-cleave", dmg: 26, reach: 76, speed: 1.3, single: true },
    skills: [
      { ko: "어둠 폭발", cd: 8, fx: "shadow/dark-explosion", at: "front", r: 46, dmg: 48, delay: 0.35 },
      { ko: "생명력 흡수", cd: 10, act: "shadow/life-steal", dmg: 24, reach: 110, heal: 50, speed: 1.3 },
      { ko: "블랙홀", cd: 16, fx: "shadow/black-hole", at: "enemy", r: 60, dot: 14, pull: 55, life: 3 },
    ] },
  { key: "wizard", ko: "마법사", set: 2, weapon: "staff", hp: 150, range: 170,
    basic: { act: "arcane/arcane-missiles", dmg: 9, reach: 165, force: true, single: true },
    skills: [
      { ko: "운석 부르기", cd: 14, act: "moves/meteor-call", dmg: 40, reach: 180, speed: 1.8, force: true },
      { ko: "번개 부르기", cd: 9, act: "moves/lightning-call", dmg: 30, reach: 140, speed: 1.4, force: true },
      { ko: "서리 폭발", cd: 12, fx: "ice/frost-nova", at: "enemy", r: 48, dmg: 20, slow: 4, delay: 0.3 },
    ] },
  { key: "elf", ko: "궁수", set: 4, weapon: "elfbow", hp: 160, range: 200,
    basic: { act: "moves/arrow-shot", dmg: 22, reach: 200, speed: 1.6, single: true },
    skills: [
      { ko: "독구름", cd: 10, fx: "nature/poison-cloud", at: "enemy", r: 40, dot: 9, life: 3.5 },
      { ko: "뿌리 속박", cd: 12, fx: "nature/root-snare", at: "enemy", r: 44, dmg: 10, stop: 3, delay: 0.4 },
      { ko: "나뭇잎 폭풍", cd: 15, fx: "nature/leaf-storm", at: "enemy", r: 56, dot: 12, life: 3 },
    ] },
];

export function createCastle(api) {
  const { W, FLOOR, frame, frameC, load, mods, createAct, createFx, setSkin, posed, STAND, buildSkin, SETS, hex, shadowAt, nums, feed, ui } = api;
  const C = {
    phase: "place", stage: 1, hp: 200, max: 200, spawned: 0, left: 0, spawnT: 0, foes: [], acts: [], fields: [], allies: [], pick: -1, clearT: 0, result: "",
  };
  const skins = HEROES.map((h) => buildSkin(SETS[h.set], {}, {}, 2));
  const grip = (q, h, force) => {
    let o = q.weapon ? { ...q, weapon: h.weapon } : q;
    if (force && !q.weapon) o = { ...o, weapon: h.weapon, sa: -1.2 };
    return o;
  };
  const preload = () => Promise.all([...new Set(HEROES.flatMap((h) => [h.basic, ...h.skills].map((s) => s.act ?? s.fx)).concat(Object.keys(FOES).map((k) => "critters/" + k), ["spawn/poof", "impacts/hit-spark", "explosions/small-explosion"]))].map(load));

  // ---- 배치
  function place(heroIdx, spot) {
    C.allies = C.allies.filter((a) => a.hero !== heroIdx && a.spot !== spot);
    if (heroIdx >= 0) C.allies.push(makeAlly(heroIdx, spot));
    ui();
  }
  function makeAlly(i, spot) {
    const h = HEROES[i];
    return { hero: i, h, spot, x: SPOTS[spot], hp: h.hp, max: h.hp, cd: h.skills.map((s, k) => 2 + k * 2.5), basicCd: 0.5 + Math.random(), act: null, cast: 0, down: false, shield: 0 };
  }
  function autoPlace() {          // 근접(성기사·마왕)은 앞, 원거리(궁수·마법사)는 뒤
    C.allies = [];
    [[0, 4], [1, 5], [2, 1], [3, 0]].forEach(([i, s]) => C.allies.push(makeAlly(i, s)));
    ui();
  }
  function startBattle() {
    if (!C.allies.length) return feed("아군을 한 명 이상 놓으세요");
    for (const a of C.allies) Object.assign(a, { hp: a.max, down: false, act: null, cd: a.h.skills.map((s, k) => 2 + k * 2.5) });
    C.phase = "fight";
    C.spawned = 0;
    C.left = COUNTS[C.stage - 1];
    C.spawnT = 0.5;
    feed(`${C.stage}단계 · 적 ${C.left}마리`);
    ui();
  }

  // ---- 적
  function spawnFoe() {
    const pool = POOLS.slice(0, C.stage).flat(), crocs = C.stage >= 5 && C.spawned % 20 === 19;
    const kind = crocs ? "crocodile" : pool.filter((k) => k !== "crocodile")[(Math.random() * (pool.length - (C.stage >= 5 ? 1 : 0))) | 0];
    const d = FOES[kind], k = 2.7 * (1 + 0.7 * (C.stage - 1)), mod = mods["critters/" + kind];
    if (!mod) return;
    const fx = createFx(mod, { x: W + 30, y: FLOOR - (d.fly ?? 0), flip: true, seed: (Math.random() * 1e5) | 0 });
    C.foes.push({ kind, d, fx, x: W + 30, hp: d.hp * k, max: d.hp * k, spd: d.spd * (0.85 + Math.random() * 0.3), slowT: 0, stopT: 0, dotT: 0, dot: 0, block: null, hitT: 0 });
    C.spawned++;
  }
  function hurt(f, dmg, from) {
    if (f.dead) return;
    dmg = Math.round(dmg);
    f.hp -= dmg;
    f.hitT = 0.08;
    nums.push({ x: f.x, y: FLOOR - (f.d.fly ?? 0) - 26, v: dmg, t: 0 });
    if (f.hp <= 0) kill(f);
  }
  function kill(f) {
    f.dead = true;
    C.foes = C.foes.filter((g) => g !== f);
    burst("spawn/poof", f.x, FLOOR - (f.d.fly ?? 0) * 0.6, 1.1);
  }
  function burst(id, x, y, life) {
    const m = mods[id];
    if (m) C.fields.push({ fx: createFx(m, { x: Math.round(x), y: Math.round(y), seed: (Math.random() * 999) | 0 }), t: 0, life, done: true });
  }
  const inFront = (a, reach) => C.foes.filter((f) => f.x > a.x - 12 && f.x < a.x + reach);
  const nearest = (a, reach) => inFront(a, reach).sort((p, q) => p.x - q.x)[0];
  const densest = (a, reach, r) => {          // 반지름 r 안에 적이 가장 많은 자리
    let best = null, bn = 0;
    for (const f of inFront(a, reach)) { const n = C.foes.filter((g) => Math.abs(g.x - f.x) < r).length; if (n > bn) { bn = n; best = f; } }
    return best;
  };

  // ---- 아군의 공격·스킬
  function playAct(a, spec, onHitExtra) {
    const mod0 = mods[spec.act];
    if (!mod0) return;
    const mod = { ...mod0, act: { ...mod0.act, poses: mod0.act.poses.map(([t, q, hw]) => [t, grip(q, a.h, spec.force), hw]) } };
    const act = createAct(mod, { x: Math.round(a.x), y: FLOOR, flip: false, seed: (Math.random() * 1e6) | 0 });
    const rec = { act, a, spec, speed: (spec.speed ?? 1) * ACT_SPEED };
    act.onHit = (hh) => {
      if (hh.target === false) return;
      const ts = spec.single ? [nearest(a, spec.reach)].filter(Boolean) : inFront(a, spec.reach);          // 기본 공격은 가장 가까운 하나, 스킬은 범위
      for (const f of ts) hurt(f, spec.dmg * (0.6 + (hh.push ?? 1.2) * 0.35), a);
      onHitExtra?.();
    };
    a.act = rec;
    C.acts.push(rec);
  }
  function castFx(a, s) {
    const m = mods[s.fx];
    if (!m) return;
    let x = a.x + 40;
    if (s.at === "self") x = a.x;
    else if (s.at === "enemy") { const f = densest(a, a.h.range + 60, s.r ?? 40) ?? nearest(a, a.h.range + 60); if (f) x = f.x; }
    else if (s.at === "front") x = a.x + (s.r ?? 40) * 0.7;
    const fx = createFx(m, { x: Math.round(x), y: FLOOR, seed: (Math.random() * 999) | 0, actor: undefined });
    const loop = !!m.meta.loop, life = s.life ?? (loop ? 2.4 : m.meta.duration);
    C.fields.push({ fx, t: 0, life, x, s, done: !s.dmg && !s.slow && !s.stop, dmgAt: s.delay ?? 0.3, loop });
    if (s.heal) {          // 신성 방패: 아군 모두와 성을 조금 회복
      for (const b of C.allies) if (!b.down) b.hp = Math.min(b.max, b.hp + s.heal);
      if (s.castle) C.hp = Math.min(C.max, C.hp + s.castle);
    }
    a.cast = 0.45;
  }
  function stepAlly(a, dt) {
    if (a.down) return;
    if (a.cast > 0) a.cast -= dt;
    for (let k = 0; k < 3; k++) a.cd[k] -= dt;
    a.basicCd -= dt;
    if (a.act || a.cast > 0) return;
    const near = nearest(a, a.h.range + 40);
    if (!near) return;
    for (let k = 0; k < 3; k++) {          // 준비된 스킬부터
      const s = a.h.skills[k];
      if (a.cd[k] > 0) continue;
      if (s.act && !nearest(a, s.reach)) continue;
      a.cd[k] = s.cd * CD_K;
      feed(`${a.h.ko} · ${s.ko}`);
      if (s.act) playAct(a, s, s.heal ? () => { a.hp = Math.min(a.max, a.hp + s.heal / 3); } : null);
      else castFx(a, s);
      return;
    }
    if (a.basicCd <= 0 && nearest(a, a.h.basic.reach)) { a.basicCd = 0.35; playAct(a, a.h.basic); }
  }

  // ---- 한 장면
  function step(dt) {
    if (C.mineCd > 0) C.mineCd -= dt;
    if (C.phase !== "fight") return;
    if (C.left > 0 && (C.spawnT -= dt) <= 0 && C.foes.length < 26) {
      C.spawnT = Math.max(0.14, 1.05 - C.stage * 0.19) * (0.6 + Math.random() * 0.8);
      C.left--;
      spawnFoe();
    }
    for (const r of C.acts) r.act.update(dt * r.speed);
    for (const r of C.acts.slice()) if (r.act.done()) { C.acts.splice(C.acts.indexOf(r), 1); if (r.a.act === r) r.a.act = null; }
    for (const a of C.allies) stepAlly(a, dt);
    for (const f of C.foes.slice()) {
      f.fx.update(dt);
      if (f.hitT > 0) f.hitT -= dt;
      if (f.slowT > 0) f.slowT -= dt;
      if (f.stopT > 0) f.stopT -= dt;
      if (f.dotT > 0) { f.dotT -= dt; f.dacc = (f.dacc ?? 0) + f.dot * dt; if (f.dacc >= 4) { hurt(f, f.dacc); f.dacc = 0; } }
      if (f.dead) continue;
      // 길을 막은 아군(살아 있는)을 만나면 멈춰 때린다
      const wall = f.d.fly ? null : C.allies.find((a) => !a.down && f.x > a.x && f.x - a.x < (f.d.big ? 30 : 16));          // 날짐승은 땅의 아군을 넘어 날아간다
      if (wall) {
        wall.hp -= f.d.dmg * dt * 1.6 * (1 + 0.35 * (C.stage - 1));
        if (wall.hp <= 0) { wall.down = true; wall.act = null; feed(`${wall.h.ko} 쓰러짐`); burst("explosions/small-explosion", wall.x, FLOOR - 14, 1.2); }
        continue;
      }
      const sp = f.stopT > 0 ? 0 : f.spd * (f.slowT > 0 ? 0.4 : 1);
      f.x -= sp * dt;
      f.fx.options.x = Math.round(f.x);
      if (f.x < CASTLE_X + 14) {          // 성에 닿음
        C.hp -= f.d.dmg * (1 + 0.2 * (C.stage - 1));
        kill(f);
        if (C.hp <= 0) { C.hp = 0; C.phase = "over"; C.result = "성이 무너졌습니다"; ui(); }
      }
    }
    for (const r of C.fields) {
      r.t += dt * (r.mine ? 1 : FX_SPEED);
      r.fx.update(dt * (r.mine ? 1 : FX_SPEED));
      const s = r.s;
      if (s && !r.done && r.t >= r.dmgAt) {
        r.done = !r.loop || (!s.dot && !s.pull);
        for (const f of C.foes.slice()) if (Math.abs(f.x - r.x) < (s.r ?? 40)) {
          if (s.dmg && !r.hitOnce) hurt(f, s.dmg);
          if (s.slow) f.slowT = s.slow;
          if (s.stop) f.stopT = s.stop;
        }
        r.hitOnce = true;
      }
      if (s && r.loop && (s.dot || s.pull) && r.t > (s.delay ?? 0.2)) {          // 독구름·블랙홀: 머무는 동안 계속
        for (const f of C.foes.slice()) {
          const d = r.x - f.x;
          if (Math.abs(d) > (s.r ?? 40)) continue;
          if (s.pull) f.x += Math.sign(d) * Math.min(Math.abs(d), s.pull * dt);
          if (s.dot) { f.dotT = 0.6; f.dot = s.dot; }
        }
      }
      if (r.loop && r.t >= r.life && !r.stopped) { r.fx.stop(); r.stopped = true; }
    }
    C.fields = C.fields.filter((r) => !(r.fx.done() || r.t > (r.life ?? 2) + 1.5));
    if (C.phase === "fight" && C.left === 0 && !C.foes.length) {
      if (C.stage >= COUNTS.length) { C.phase = "over"; C.result = "승리! 성을 지켰습니다"; }
      else { C.phase = "place"; C.stage++; C.hp = Math.min(C.max, C.hp + 40); C.acts = []; for (const a of C.allies) a.act = null; feed(`단계 클리어! 다음은 ${C.stage}단계(적 ${COUNTS[C.stage - 1]}마리)`); }
      ui();
    }
  }

  // ---- 그리기
  function drawCastle() {
    const Cc = frame.color, P = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < api.H) Cc[y * W + x] = c; };
    const stone = [hex("#c8c2ba"), hex("#a8a29a"), hex("#86807a"), hex("#5e5854")], ink = hex("#1c1820"), wood = hex("#5a3a22"), red = hex("#b02a34");
    const top = FLOOR - 74;
    for (let y = top; y <= FLOOR; y++) for (let x = 0; x <= 44; x++) {
      let c = stone[(((x + (Math.floor((y - top) / 6) % 2) * 5) % 10) === 0 || (y - top) % 6 === 0) ? 3 : x < 6 ? 1 : x > 38 ? 2 : 1];
      if ((y - top) % 6 === 1 && x % 10 > 2 && x % 10 < 8) c = stone[0];
      P(x, y, c);
    }
    for (let k = 0; k < 4; k++) for (let y = top - 8; y < top; y++) for (let x = k * 12; x < k * 12 + 8; x++) P(x, y, y === top - 8 || x === k * 12 ? stone[0] : stone[1]);          // 성가퀴
    for (let y = FLOOR - 30; y <= FLOOR; y++) for (let x = 16; x <= 34; x++) {          // 아치 문
      const dx = x - 25, dy = y - (FLOOR - 22);
      if (dy < 0 && dx * dx + dy * dy * 1.4 > 92) continue;
      P(x, y, Math.abs(dx) > 8 || (dy < 0 && dx * dx + dy * dy * 1.4 > 70) ? ink : x % 3 === 0 ? hex("#3a2416") : wood);
    }
    for (const wx of [8, 36]) for (let y = top + 14; y < top + 24; y++) for (let x = wx; x < wx + 4; x++) P(x, y, ink);          // 창
    for (let y = top - 30; y < top - 8; y++) P(22, y, wood);          // 깃발
    for (let y = top - 30; y < top - 20; y++) for (let x = 23; x < 23 + 12 - Math.abs(y - (top - 25)); x++) P(x, y, red);
    // 성 체력 막대(성 위)
    const bw = 40, fill = Math.round((bw * C.hp) / C.max);
    for (let i = 0; i < bw; i++) for (let j = 0; j < 3; j++) P(3 + i, top - 40 + j, j !== 1 ? ink : i < fill ? hex("#58d068") : hex("#2a3a2a"));
  }
  function drawSpots() {          // 배치 중: 자리 여섯을 바닥에 빛나는 고리로
    const L = frameC.light, g = hex("#5ab0ff"), hot = hex("#ffd860"), t = performance.now() / 300;
    SPOTS.forEach((sx, i) => {
      const taken = C.allies.some((a) => a.spot === i);
      for (let a = 0; a < 40; a++) {
        const px = Math.round(sx + Math.cos((a / 40) * 6.283) * 12), py = Math.round(FLOOR + Math.sin((a / 40) * 6.283) * 3.5);
        if ((a + Math.floor(t)) % 5 === 0) continue;
        if (px >= 0 && py >= 0 && px < W && py < api.H) { L[py * W + px] = C.pick >= 0 && !taken ? hot : g; frameC.color[py * W + px] = C.pick >= 0 && !taken ? hot : g; }
      }
    });
  }
  function draw() {
    drawCastle();
    for (const f of C.foes) { if (f.d.big || !f.d.fly) shadowAt(f.x, FLOOR, f.d.big ? 22 : 8); f.fx.draw(frame); }
    for (const r of C.fields) r.fx.draw(frame, "back");
    if (C.phase === "place") drawSpots();
    for (const a of C.allies) {          // 아군: 두 배 층의 인형, 머리 위 체력 막대
      const rec = a.act, q = rec ? rec.act.pose ?? STAND : idlePose(a), bx2 = Math.round(a.x * 2) + (rec ? Math.round((q.x ?? 0) * 2) : 0), by2 = FLOOR * 2 + Math.round((q.y ?? 0) * 2);
      shadowAt(bx2 / 2, FLOOR, 10);
      const sk = skins[a.hero], down = a.down;
      api.hiPush(() => { setSkin(sk); api.plot2(posed(down ? { ...STAND, crouch: 9, lean: 6 } : q), bx2, by2, false, down ? (c) => (c & 0xff000000) | ((c >>> 1) & 0x7f7f7f) : null); });
      if (!down && C.phase !== "place") bar(a.x, FLOOR - 46, a.hp / a.max, hex("#58b8f0"));
    }
    for (const r of C.acts) r.act.draw(frameC, { body: false, target: false });
    for (const r of C.fields) r.fx.draw(frameC, "front");
    for (const f of C.foes) if (f.hp < f.max) bar(f.x, FLOOR - (f.d.fly ?? 0) - 22 - (f.d.big ? 8 : 0), f.hp / f.max, hex("#e0485a"));
  }
  function idlePose(a) {
    const m = mods[a.h.basic.act], q0 = m?.act?.poses?.[0]?.[1] ?? STAND;
    let q = grip({ ...q0, x: 0, y: 0, ghost: false }, a.h, a.h.basic.force);
    if (a.cast > 0) q = { ...q, fx: 15, fy: -26, bx: 13, by: -27 };
    return q;
  }
  function bar(x, y, k, col) {
    const L = frameC.color, ink = hex("#0b0a10"), bw = 18;
    for (let i = 0; i < bw; i++) for (let j = 0; j < 3; j++) {
      const px = Math.round(x) - 9 + i, py = Math.round(y) + j;
      if (px >= 0 && py >= 0 && px < W && py < api.H) L[py * W + px] = j !== 1 ? ink : i < Math.round(bw * k) ? col : hex("#3a2430");
    }
  }
  // 내 마법(액티브 스킬): 효과 245개 중 고른 것을 무대에서 누른 자리에. 성질에 따라 피해·느리게·묶기·지속 피해
  const MINE_CD = 4;
  C.mineCd = 0;
  async function playerCast(entry, x) {
    if (C.mineCd > 0 || C.phase !== "fight") return false;
    const m = await load(entry.id);
    const life = entry.loop ? 3 : entry.dur, y = entry.cat === "weather" || entry.cat === "transitions" ? FLOOR + 10 : FLOOR;
    const big = entry.dur > 2.5 || ["explosions", "weather"].includes(entry.cat);
    const s = { r: big ? 60 : 42, dmg: big ? 70 : 45, delay: Math.min(entry.dur * 0.35, 0.6) };
    if (entry.loop) Object.assign(s, { dot: 14, dmg: 20 });
    if (["ice", "water"].includes(entry.cat)) s.slow = 4;
    if (entry.cat === "nature" || entry.id.includes("frozen") || entry.id.includes("stunned") || entry.id.includes("sleep")) s.stop = 2.5;
    if (["holy", "pickups"].includes(entry.cat)) { for (const b of C.allies) if (!b.down) b.hp = Math.min(b.max, b.hp + 40); C.hp = Math.min(C.max, C.hp + 10); }
    const fx = createFx(m, { x: Math.round(x), y, seed: (Math.random() * 1e5) | 0 });
    C.fields.push({ fx, t: 0, life, x, s, mine: true, done: false, dmgAt: s.delay, loop: entry.loop });
    C.mineCd = MINE_CD;
    return true;
  }
  const shake = () => C.acts.reduce((s, r) => { const [a, b] = r.act.shake; return [s[0] + a, s[1] + b]; }, [0, 0]);
  function reset() { Object.assign(C, { phase: "place", stage: 1, hp: C.max, spawned: 0, left: 0, foes: [], acts: [], fields: [], allies: [], pick: -1, result: "" }); ui(); }
  return { C, preload, place, autoPlace, startBattle, step, draw, shake, reset, playerCast, MINE_CD };
}
