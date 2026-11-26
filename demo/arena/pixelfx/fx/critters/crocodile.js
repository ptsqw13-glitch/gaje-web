import { fit, hex, mix, clamp, wrap, lerp, smooth, seg, ease, rng, P, TAU } from "../../core/index.js";
import { Grid, Swarm, shift, shadow, spring } from "./_lib.js";

// [가제] 악어(2026-11-26): 낮게 엎드려 네 다리를 대각선으로 엇갈리며 기다가, 멈춰 입을 천천히 크게 벌리고, 순식간에 콱 다물며
// 앞으로 튀어 나간다(먼지·흰 번쩍임). 꼬리를 한 번 휘두르고 다시 긴다. 등은 짙은 녹색 + 돌기 줄, 배는 누런 비늘, 노란 눈에 세로 동공.
export const meta = {
  name: "Crocodile",
  desc: "A crocodile crawls low on a diagonal gait, stops, opens its toothy jaws wide, then snaps them shut with a lunge, a puff of dust and a white flash, whips its tail and crawls on.",
  tags: ["critter", "crocodile", "reptile", "ground", "bite", "loop"],
  size: [168, 64],
  origin: [84, 56],
  duration: 3,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#081208", "#14301a", "#1f4826", "#2f6a34", "#4a8c40", "#80b858", "#d8f0a0"],
    belly: ["#4e4620", "#a89a5c", "#e8dca0"],
    seed: 1,
  },
};

const D = meta.duration, SNOUT = 46, LEN = 104, HINGE = 24, LEG = 5, GRID = new Grid(-64, -40, 120, 42), SWARM = new Swarm();
const T_STOP = 1.45, T_OPEN = 1.6, T_WIDE = 2.05, T_SNAP = 2.3, T_GO = 2.7;
const MOUTH = ["#3a0c14", "#7a1e2a", "#c8505a"].map(hex), TOOTH = hex("#f6f2e2"), EYE = ["#3a2a08", "#d0a020", "#ffe070"].map(hex), DUST = hex("#8a7f92");

// 걷는 정도(1 = 기는 중, 0 = 멈춤): 멈춰서 물고, 다시 걷는다. 0 과 D 에서 1 이라 이음매가 없다
const walk = (t) => 1 - smooth(T_STOP - 0.2, T_STOP, t) * (1 - smooth(T_GO, T_GO + 0.25, t));
// 입 벌림 0..1: 천천히 열고(살짝 떨며 버티고) 0.05초 만에 닫는다
function gape(t) {
  if (t < T_OPEN || t >= T_SNAP + 0.05) return 0;
  if (t < T_WIDE) return ease.inOutSine(seg(t, T_OPEN, T_WIDE));
  if (t < T_SNAP) return 1 + 0.04 * Math.sin((t - T_WIDE) * 70);
  return 1 - seg(t, T_SNAP, T_SNAP + 0.05);
}
// 몸 전체의 앞뒤 움직임: 열 때 살짝 물러났다가, 물 때 튀어 나가고 용수철처럼 돌아온다
function lunge(t) {
  if (t < T_OPEN) return 0;
  if (t < T_SNAP) return -2 * ease.outSine(seg(t, T_OPEN, T_WIDE));
  const a = t - T_SNAP;
  return a < 0.05 ? lerp(-2, 7, a / 0.05) : 7 * Math.exp(-a * 5) * Math.cos(a * 9) * (1 - smooth(0.4, 0.7, a));
}
// 꼬리: 입을 벌리는 동안 들리고, 물고 나서 한 번 휘두른다
const tailUp = (t) => (t > T_OPEN && t < T_SNAP ? 0.7 * ease.outSine(seg(t, T_OPEN, T_WIDE)) : 0) + (t >= T_SNAP ? 1.4 * spring(t - T_SNAP, 2.2, 4.5) * (1 - smooth(T_SNAP + 0.5, T_SNAP + 0.65, t)) : 0);
// 굵기(위아래 반지름): 가는 주둥이 → 넓은 머리 → 목 → 불룩한 몸통 → 가늘어지는 꼬리
function radius(u) {
  if (u < HINGE) return lerp(2.3, 4.4, (u / HINGE) ** 1.4);
  if (u < 30) return lerp(4.4, 4, (u - HINGE) / 6);
  if (u < 58) return 4 + 2.6 * Math.sin(Math.PI * ((u - 30) / 28)) ** 0.8;
  return lerp(4, 0.6, ((u - 58) / (LEN - 58)) ** 0.9);
}
// 가운데 줄의 높이(위가 음수): 다리로 들린 몸, 바닥에 닿는 꼬리 끝, 숨 쉬는 몸통, 들리는 꼬리
function centre(u, t) {
  const r = radius(u), w = walk(t), sway = Math.sin(TAU * (t / D) * 4 - u * 0.12) * 0.6 * w;
  let y = -(LEG + r);
  if (u < HINGE) y += 0.8 * (1 - u / HINGE);          // 주둥이는 조금 낮다
  if (u > 70) y += Math.min(LEG, (u - 70) * 0.12);          // 꼬리 끝은 바닥으로
  if (u > 58) y -= tailUp(t) * ((u - 58) / (LEN - 58)) ** 2 * 10 + sway;
  if (u > 30 && u < 58) y += 0.4 * Math.sin(TAU * (t / D) * 2);          // 숨
  return y;
}

function croc(g, C, B, t) {
  g.clear();
  const gp = gape(t), lift = (u) => (u < HINGE ? (HINGE - u) * Math.tan(gp * 0.62) : 0), drop = (u) => (u < HINGE ? (HINGE - u) * Math.tan(gp * 0.12) : 0);
  const legsAt = (far) => legs(g, C, B, t, far);
  legsAt(true);          // 먼 쪽 다리는 몸 뒤에
  for (let u = LEN; u >= 0; u -= 0.5) {
    const x = SNOUT - u, r = radius(u), cy = centre(u, t), up = lift(u), dn = drop(u);
    const top = cy - r - up, lip = cy - up, jaw = cy + dn, bot = cy + r + dn;
    for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
      const yy = y + 0.5;
      if (yy < top || yy > bot) continue;
      // 벌린 입 안: 위아래 잇몸 사이는 붉은 입속, 가장자리에 하얀 이빨
      if (u < HINGE && yy > lip && yy < jaw) {
        // 앞쪽은 턱 사이가 빈 공간(이빨만), 입속은 경첩 가까이 삼각형으로만 보인다
        const inside = u > HINGE - 12 && (yy - lip) > (HINGE - u) * 0.05 && (jaw - yy) > 0;
        if (!inside) {
          if (u > 1 && Math.floor(u) % 3 === 0 && yy - lip < 1.2) g.set(x, y, TOOTH);
          else if (u > 1 && (Math.floor(u) + 2) % 3 === 0 && jaw - yy < 1.2) g.set(x, y, TOOTH);
          continue;
        }
        const k = (yy - lip) / Math.max(0.5, jaw - lip);
        let c = k < 0.25 || k > 0.75 ? MOUTH[1] : MOUTH[0];
        if (Math.floor(u) % 3 === 0 && yy - lip < 1.2) c = TOOTH;
        if ((Math.floor(u) + 2) % 3 === 0 && jaw - yy < 1.2) c = TOOTH;
        if (u > HINGE - 6 && k > 0.4 && k < 0.7) c = MOUTH[2];          // 목구멍 쪽 혀
        g.set(x, y, c);
        continue;
      }
      const upper = yy <= lip, v = upper ? (yy - lip) / (r || 1) : (yy - jaw) / (r || 1);          // 위 턱: -1..0, 아래 턱: 0..1
      let c;
      if (v < -0.6) c = C[4];
      else if (v < 0.05) c = C[3];
      else if (v < 0.4) c = C[2];
      else c = v < 0.75 ? B[1] : B[0];
      // 등의 얼룩(짙은 띠), 배의 비늘 줄
      if (v < 0.05 && v > -0.85 && u > 26 && (Math.floor(u / 5) % 2 === 0) && v > -0.5) c = C[2];
      if (v >= 0.4 && Math.floor(u) % 3 === 0) c = v < 0.75 ? B[2] : B[1];
      // 다문 입의 이빨: 입술 선을 따라 위아래 엇갈린 하얀 점
      if (u < HINGE - 2 && u > 2 && gp < 0.05 && Math.abs(yy - cy) < 0.6 && Math.floor(u) % 3 === 0) c = TOOTH;
      if (u < HINGE - 2 && Math.abs(yy - cy) < 0.5 && c !== TOOTH) c = C[1];
      g.set(x, y, c);
    }
    // 등 돌기: 몸통과 꼬리를 따라 세 칸마다 솟은 비늘(꼬리는 두 줄처럼 크게)
    if (u > 28 && u < LEN - 4 && Math.floor(u) % 3 === 0 && u % 1 === 0) {
      const h = u > 58 ? 2 : 1;
      for (let k = 1; k <= h; k++) g.set(x, Math.floor(top) - k, k === h ? C[5] : C[3]);
    }
  }
  // 눈: 머리 위로 솟은 혹, 노란 눈동자에 세로 동공, 가끔 깜빡임
  const eu = HINGE - 4, ex = SNOUT - eu, ey = centre(eu, t) - radius(eu) - lift(eu);
  const blink = (t > 0.62 && t < 0.7) || (t > 2.85 && t < 2.93);
  g.ellipse(ex, ey - 0.5, 2.6, 2, (nx, ny) => (ny < -0.3 ? C[5] : C[4]));
  if (blink) { g.line(ex - 1.5, ey - 1, ex + 1.5, ey - 1, C[2]); }
  else {
    g.set(ex - 1, ey - 1, EYE[1]); g.set(ex, ey - 1, EYE[0]); g.set(ex + 1, ey - 1, EYE[2]);
    g.set(ex, ey - 2, EYE[0]); g.set(ex + 1, ey - 2, EYE[1]);
  }
  // 콧구멍 혹
  const nx = SNOUT - 1.5, ny = centre(1.5, t) - radius(1.5) - lift(1.5);
  g.set(nx, ny - 1, C[4]); g.set(nx - 1, ny - 1, C[3]);
  legsAt(false);          // 가까운 쪽 다리는 몸 앞에
  g.outline(C[0]);
}

// 다리 넷: 대각선끼리 같은 박자(앞-가까운·뒤-먼 / 앞-먼·뒤-가까운). 팔꿈치가 옆으로 벌어진 굽은 다리, 발가락 셋
function legs(g, C, B, t, far) {
  const w = walk(t), base = TAU * (t / D) * 4;
  for (const [u, front] of [[33, true], [55, false]]) {
    const ph = base + (front === far ? 0 : Math.PI), hipX = SNOUT - u + (far ? -1 : 0), hipY = centre(u, t) + radius(u) * 0.35;
    const step = 5 * Math.sin(ph) * w, liftY = Math.max(0, Math.cos(ph)) * 3 * w;
    // 앞다리는 팔꿈치가 뒤로, 뒷다리는 무릎이 앞으로 굽는다
    const fx = hipX + (front ? 3 : -2) + step, fy = -0.8 - liftY, kx = hipX + (front ? -3 : 4) + step * 0.35, ky = Math.min(-2.5, hipY + 3.4) - liftY * 0.4;
    const col = far ? [C[1], C[2], C[3]] : [C[2], C[3], C[4]];
    g.tube([[hipX, hipY - 1.5], [kx, ky], [fx, fy]], (q) => lerp(far ? 2.4 : 3, 1.2, q), (q, v) => (Math.abs(v) > 0.88 ? C[1] : v > 0.45 ? col[0] : v < -0.25 ? col[2] : col[1]));
    for (const k of [0, 1.6, 3.2]) g.set(fx + (front ? 1 : -1) * (1 + k * 0.5), fy + (k > 0 ? 0.3 : 0), col[1]);
  }
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), B = fit(o.belly, 3), dx = lunge(t);
  const g = GRID;
  croc(g, C, B, t);
  g.draw(p, 1, Math.round(dx), 0);
  const sw = SWARM.begin(t), a = t - T_SNAP;
  // 물 때: 턱 밑에서 먼지가 낮게 퍼지고, 주둥이 끝에 하얀 번쩍임과 짧은 선 넷
  if (a >= 0 && a < 0.7) {
    const sx = SNOUT + Math.round(dx), R = rng(o.seed * 13 + 5);
    for (let k = 0; k < 10; k++) {
      const dir = R.next() < 0.6 ? 1 : -1, sp = R.range(14, 40), life = R.range(0.35, 0.7);
      if (a > life) continue;
      sw.add(P.SMOKE, sx - R.range(4, 16) + dir * sp * a, -0.5 - a * R.range(4, 10), 0, 0, a, life, DUST, R.range(2, 3.6));
    }
    if (a < 0.12) {
      const k = 1 - a / 0.12;
      p.glow(sx + 1, -6, 9 * k, TOOTH, 0.7 * k);
      for (const [ux, uy] of [[1, -0.9], [1.2, 0], [1, 0.8], [0.4, -1.2]]) p.line(sx + 3 + ux * 2, -6 + uy * 2, sx + 3 + ux * (3 + 6 * k), -6 + uy * (3 + 6 * k), TOOTH);
    }
  }
  // 기어갈 때 뒷발에서 이는 옅은 먼지
  const w = walk(t);
  if (w > 0.5) for (let n = 0; n < 4; n++) {
    const born = Math.floor((t * 4) / D * 2 + n) * D / 8, age = t - born;
    if (age < 0 || age > 0.5) continue;
    const R = rng(o.seed, n, Math.floor(born * 100));
    sw.add(P.SMOKE, SNOUT - 55 - R.range(2, 8) - age * 10, -0.5 - age * 4, 0, 0, age, 0.5, DUST, R.range(1.4, 2.4));
  }
  sw.draw(p);
  // 눈의 반짝임
  if (gape(t) > 0.3) p.glow(SNOUT - (HINGE - 4) + Math.round(dx), -14, 3, EYE[2], 0.3);
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), dx = Math.round(lunge(t));
  // 몸을 따라 긴 그림자
  for (let u = 2; u <= LEN; u += 3) shadow(p, SNOUT - u + dx, -0.2, 2.6 + radius(u) * 0.5, 1.2, C[0], 0.45);
}
