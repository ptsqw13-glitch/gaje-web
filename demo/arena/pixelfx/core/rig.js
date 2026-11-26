// The character who acts: a real skeleton in 3D, drawn down to pixels the way Dead Cells makes its sprites. Bones have
// fixed lengths and hang from each other, pelvis to spine to chest to shoulders, so the body can twist, bend and turn round,
// and depth decides what's in front. A pose only says where the hands and feet should be and how the body is carrying
// itself; the solver works out every joint, and the renderer shades it into a few flat tones with one clean ink line.
//
// Coordinates: x right, y up, z towards the viewer, in pixels, the feet at the origin. Poses are in screen terms (y negative
// is up), as effects are. The character faces +x with his right side towards the viewer, so the right hand is the near one.
//
// A rendered pose also knows, for each of its pixels, which pixel of the standing character it came from (`src`). That
// is what lets an effect drawn on the standing body (frost, poison, a scan line) follow the body wherever it goes.

import { hex } from "./color.js";
import { DUMMY_PAL } from "./actor.js";

const PAL = Object.fromEntries(Object.entries(DUMMY_PAL).map(([k, v]) => [k, hex(v) >>> 0]));
const INK = PAL.k, SEAM = PAL.J, MARK = PAL.m;
// plates and joints: lit to dark
const SHELL = [PAL.A, PAL.B, PAL.C, PAL.D], CORE = [PAL.E, PAL.F, PAL.G, PAL.G];
const DEG = Math.PI / 180, W0 = 24, H0 = 38;
// ---- [가제] 생김새 입히기: ramps 부위 이름 -> 색 넷(밝은 쪽부터), bulk·arm·leg 굵기, scale 전체 배율, shag 털 결을 넣을 부위, extras 덧붙이는 덩어리
let SKIN = null;
export function setSkin(skin) {
  SKIN = skin ? { bulk: 1, arm: 1, leg: 1, scale: 1, head: 1, ...skin, ramps: Object.fromEntries(Object.entries(skin.ramps ?? {}).map(([k, v]) => [k, v.map((c) => hex(c) >>> 0)])) } : null;
  M = { ...M0, ...(skin && skin.bones ? skin.bones : {}) };
  CACHE.clear();
}

// ---- vectors and turns
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1e-6));
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (A, B) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return o; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const tv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- the body's measurements, in pixels
let M = {
  pelvis: 19.7, spine1: 2.8, spine2: 4.6, shoulderUp: 2.5, shoulderOut: 5.9, neckUp: 4.0, headUp: 3.1,
  hipDown: 1.1, hipOut: 2.8, thigh: 8.6, shin: 8.3, upper: 7.6, fore: 7.4, turn: 36 * DEG,
};
const M0 = { ...M };
/** Standing easy, in screen terms: hands and feet are where they should end up, y negative is up. */
export const STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };

// ---- solving a pose: from where the hands and feet should be, to every joint
function ik(a, target, L1, L2, pole) {
  let to = sub(target, a), d = len(to);
  const reach = L1 + L2 - 0.02;
  if (d > reach) { to = mul(to, reach / d); d = reach; }
  const u = unit(to), along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  let v = sub(pole, mul(u, dot(pole, u)));
  v = len(v) < 1e-4 ? unit(cross(u, [0, 0, 1])) : unit(v);
  return { joint: add(a, add(mul(u, along), mul(v, h))), end: add(a, to), u, v };
}
function frame(t, R) {
  return { t, R };
}
// a frame along a bone: its local x runs down the bone
function boneFrame(a, b, pole) {
  const x = unit(sub(b, a));
  let y = sub(pole, mul(x, dot(pole, x)));
  y = len(y) < 1e-4 ? unit(cross(x, [0, 0, 1])) : unit(y);
  const z = cross(x, y);
  return frame(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}
const weaponOf = (name) => WEAPONS[name];

function solve(pose) {
  const q = { ...STAND, ...pose }, lean = q.lean, W = q.weapon && weaponOf(q.weapon), OW = q.offWeapon && weaponOf(q.offWeapon);
  const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
  const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
  const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5);
  // how the chest is turned follows the hands: a hand driving forward brings its shoulder round; one drawn back opens him up
  const fwd = (q.fx - STAND.fx) / 24, farFwd = two ? 0 : (q.bx - STAND.bx) / 22;
  let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
  turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
  if (q.turn !== undefined) turn = q.turn;
  const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13);
  const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
  // feet first: the pelvis sinks if that's what it takes for both legs to reach them
  const ankleN = [q.ffx, -q.ffy - 1.8, q.fzz ?? 2.4], ankleF = [q.fbx, -q.fby - 1.8, q.bzz ?? -2.4];
  let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
  const hipAt = (s) => add(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
  const maxLeg = (M.thigh + M.shin) * 0.995;
  for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
    const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
    if (flat < maxLeg * maxLeg) {
      const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
      if (h[1] > top) pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
    }
  }
  const waist = add(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
  const chest = add(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
  const neck = add(chest, mv(Rc, [0, M.neckUp, 0]));
  // the head keeps looking where he's going: it takes only part of the lean and part of the turn
  const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
  const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
  const head = add(neck, mv(Rh, [0.15, M.headUp, 0]));
  // the arms: shoulders reach a little towards a far hand
  const pick = (s, target) => {
    const base = add(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
    return add(base, mul(unit(to), Math.min(1.8, Math.max(0, d - 11) * 0.35)));
  };
  const nearT = [q.fx, -q.fy, nearZ];
  const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5)];
  const sN = pick(1, nearT), sF = pick(-1, farT);
  const pole = (s, T, shoulder, hold) => {
    // elbows hang down and back; overhead they go out and forward
    const up = clamp01((T[1] - shoulder[1] + 2) / 10);
    const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5)];
    if (!hold) return base;
    // holding something, the forearm wants to meet the handle side on: try round the circle, keep the best
    const u = unit(sub(T, shoulder));
    let best = base, score = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = unit(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
      const A = ik(shoulder, T, M.upper, M.fore, v), f = unit(sub(A.end, A.joint));
      const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit(base), v)) * 0.55;
      if (cost < score) { score = cost; best = v; }
    }
    return best;
  };
  const holdN = W ? (W.across ? side : axis) : null, holdF = two ? (W.across ? side : axis) : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
  const armN = ik(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
  // the legs: knees forward, a little out
  const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
  const hipN = hipAt(1), hipF = hipAt(-1);
  const legN = ik(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
  const footDir = (s) => { const t = hipTurn * 0.6 + s * 8 * DEG; return [Math.cos(t), 0, Math.sin(t)]; };
  const B = {
    pelvis: frame(pelvis, Rp), waist: frame(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))), chest: frame(chest, Rc), head: frame(head, Rh), neck: frame(neck, Rh),
    upperN: boneFrame(sN, armN.joint, armN.v), foreN: boneFrame(armN.joint, armN.end, armN.v), upperF: boneFrame(sF, armF.joint, armF.v), foreF: boneFrame(armF.joint, armF.end, armF.v),
    thighN: boneFrame(hipN, legN.joint, legN.v), shinN: boneFrame(legN.joint, legN.end, legN.v), thighF: boneFrame(hipF, legF.joint, legF.v), shinF: boneFrame(legF.joint, legF.end, legF.v),
  };
  B.footN = frame(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
  B.footF = frame(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
  return { B, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn };
}

// ---- drawing: every part goes through one depth buffer
const BW = 300, BH = 240, OX = 150, OY = 180; // the scratch grid, big enough for a raised scythe; feet at (OX, OY)
const Zb = new Float32Array(BW * BH), Tone = new Float32Array(BW * BH), Part = new Int8Array(BW * BH), Mat = new Int8Array(BW * BH), Fr = new Int8Array(BW * BH), LX = new Float32Array(BW * BH), LY = new Float32Array(BW * BH), Col = new Uint32Array(BW * BH);
const touched = [];
const LIGHT = unit([-0.55, 0.72, 0.5]);
let clipBody = false, clipWeapon = false, curFrameIndex = 0, curDim = 0, onlyPart = 0;
const FRAME_IDS = ["pelvis", "waist", "chest", "head", "neck", "upperN", "foreN", "upperF", "foreF", "thighN", "shinN", "thighF", "shinF", "footN", "footF"];
function plot(i, z, tone, part, mat, wx, wy, color) {
  if (onlyPart && part !== onlyPart) return;
  if (Part[i] === 0) touched.push(i);
  else if (z <= Zb[i]) return;
  Zb[i] = z;
  Tone[i] = tone;
  Part[i] = part;
  Mat[i] = mat;
  Fr[i] = curFrameIndex;
  LX[i] = wx;
  LY[i] = wy;
  Col[i] = color;
}
function sphere(c, r, part, mat) {
  const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
      if (d2 > r * r || (clipBody && wy < 1.5)) continue;
      const dz = Math.sqrt(r * r - d2), n = [dx / r, dy / r, dz / r], i = (OY - wy) * BW + (OX + wx);
      plot(i, c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
function sweep(a, b, ra, rb, part, mat, bulge = 0) {
  const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    sphere(add(a, mul(sub(b, a), u)), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, mat);
  }
}
// an ellipsoid with radii r along the axes of frame R, seen along z
function ellipsoid(c, R, r, part, mat) {
  const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
  // A = R diag(D) R^T
  const A = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
  void Rt;
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      if (clipBody && wy < 1.5) continue;
      const dx = wx - c[0], dy = wy - c[1];
      const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
      const n = unit([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
      plot((OY - wy) * BW + (OX + wx), c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
// parts: each has its own number, so edges between them can be seen
const PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
Object.assign(PART, { mouth: 93, brow: 94, hood: 60, snout: 61, nose: 62, ear: 63, beard: 64, cape: 65, fur: 66, belt: 67, braid: 68, claw: 69, beast: 70, bhead: 71, legN: 72, legF: 73, moss: 74, trunk: 75, leaf: 76, crown: 77, eye: 78,
  strap: 80, skirt: 81, tooth: 82, earIn: 83, buckle: 84, ruff: 85, moss2: 86, rock: 87, fern: 88, leafD: 89, antler: 90, crystal: 91, wrap: 92 });
const PNAME = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
const useFrame = (name) => { curFrameIndex = FRAME_IDS.indexOf(name); };

function drawBody(S) {
  const kk = SKIN ? SKIN.scale : 1, EL = (c0, R0, r, pt, m) => ellipsoid(mul(c0, kk), R0, mul(r, kk), pt, m), SW = (a0, b0, ra, rb, pt, m, bu = 0) => sweep(mul(a0, kk), mul(b0, kk), ra * kk, rb * kk, pt, m, bu * kk), SP = (c0, r, pt, m) => sphere(mul(c0, kk), r * kk, pt, m);
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF, turn } = S, F_ = (name) => B[name];
  const K = SKIN ? SKIN.bulk : 1, KA = SKIN ? SKIN.arm : 1, KL = SKIN ? SKIN.leg : 1, KH = SKIN ? SKIN.head : 1;
  useFrame("pelvis");
  EL(add(F_("pelvis").t, mv(F_("pelvis").R, [0, -0.2, 0])), F_("pelvis").R, [2.9 * K, 2.6, 4.2 * K], PART.pelvis, 0);
  useFrame("waist");
  SW(F_("pelvis").t, F_("chest").t, 3 * K, 3.3 * K, PART.waist, 1);
  useFrame("chest");
  EL(add(F_("chest").t, mv(F_("chest").R, [0.2, 0.9, 0])), F_("chest").R, [3.4 * K, 4.2 * Math.sqrt(K), 5.5 * K], PART.chest, 0);
  useFrame("neck");
  SW(F_("neck").t, add(F_("neck").t, mv(F_("head").R, [0, 1.6, 0])), 1.25, 1.15, PART.neck, 1);
  useFrame("head");
  EL(F_("head").t, F_("head").R, [3, 3.3, 2.8], PART.head, 0);
  EL(add(F_("head").t, mv(F_("head").R, [0.85, -0.45, 0])), F_("head").R, [2.4, 2.7, 2.35], PART.face, 0);
  const arm = (far, A, sh, up, el, fo, ha, nameU, nameF) => {
    curDim = far ? 1 : 0;
    useFrame(nameU);
    SP(sh, 2.5 * KA, up, 0);
    SW(sh, A.joint, 2.1 * KA, 1.7 * KA, up, 0);
    SP(A.joint, 1.45 * KA, el, 1);
    useFrame(nameF);
    SW(A.joint, A.end, 1.7 * KA, 1.4 * KA, fo, 0, 0.15);
    SP(A.end, 1.9 * (KA > 1.5 ? KA * 0.82 : Math.sqrt(KA)), ha, 0);
    curDim = 0;
  };
  arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN, "upperN", "foreN");
  arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF, "upperF", "foreF");
  const leg = (far, L, hip, th, kn, sh, fo, nameT, nameS, nameFt) => {
    useFrame(nameT);
    SW(hip, L.joint, 3.2 * KL, 2.2 * KL, th, 0);
    SP(L.joint, 1.9, kn, 1);
    useFrame(nameS);
    SW(L.joint, L.end, 2.15 * KL, 1.5 * KL, sh, 0, 0.4);
    useFrame(nameFt);
    const R = F_(nameFt).R, a = F_(nameFt).t;
    SW(add(a, mv(R, [-1.5, -0.6, 0])), add(a, mv(R, [4.6, -1.1, 0])), 1.7 * Math.sqrt(KL), 1.25 * Math.sqrt(KL), fo, 0);
  };
  leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "thighN", "shinN", "footN");
  leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "thighF", "shinF", "footF");
  void turn;
  void KH;
  const X = SKIN && SKIN.extras;
  if (X) {
    const H = F_("head"), C = F_("chest"), P = F_("pelvis"), at = (f, v) => add(f.t, mv(f.R, v));
    if (X.bearHood) {            // 기본 모습: 곰 가죽 두건. 머리 위와 뒤를 덮고, 주둥이가 이마 위로 나온다
      useFrame("head");
      EL(at(H, [-1.0, 1.5, 0]), H.R, [3.9, 3.2, 3.8], PART.hood, 0);
      EL(at(H, [2.7, 2.2, 0]), H.R, [2.7, 1.5, 2.2], PART.snout, 0);
      SP(at(H, [5.2, 2.2, 0]), 0.95, PART.nose, 0);
      SP(at(H, [-1.4, 4.7, 2.3]), 1.35, PART.ear, 0);
      SP(at(H, [-1.4, 4.7, -2.3]), 1.35, PART.ear, 0);
    }
    if (X.bearHead) {            // 1차 각성: 머리가 통째로 곰. 몸에 비해 작고, 입을 벌려 송곳니를 드러낸다
      useFrame("head");
      EL(at(H, [1.0, 0.6, 0]), H.R, [5.2, 4.6, 4.8], PART.hood, 0);
      SW(at(H, [3.4, 0.3, 0]), at(H, [8.4, -0.5, 0]), 2.6, 2.0, PART.snout, 0);          // 윗턱
      SP(at(H, [9.9, 0.1, 0]), 1.25, PART.nose, 0);
      SW(at(H, [3.6, -2.5, 0]), at(H, [8.0, -3.3, 0]), 1.9, 1.5, PART.mouth, 0);         // 입 속
      SW(at(H, [3.2, -4.7, 0]), at(H, [7.4, -6.3, 0]), 1.7, 1.2, PART.snout, 0);         // 벌린 아래턱
      for (const z of [1.7, -1.7]) {
        SW(at(H, [7.6, -1.5, z]), at(H, [7.9, -3.7, z]), 0.62, 0.2, PART.tooth, 0);      // 위 송곳니
        SW(at(H, [6.6, -5.1, z]), at(H, [6.9, -3.4, z]), 0.52, 0.2, PART.tooth, 0);      // 아래 송곳니
        SP(at(H, [5.6, -1.9, z * 1.2]), 0.45, PART.tooth, 0);
      }
      for (const z of [3.0, -3.0]) { SP(at(H, [-1.2, 4.6, z]), 1.7, PART.ear, 0); SP(at(H, [-0.8, 4.5, z * 1.4]), 0.8, PART.earIn, 0); }
      for (const z of [3.6, -3.6]) {
        SW(at(H, [1.6, 3.6, z * 1.1]), at(H, [5.4, 1.9, z * 0.8]), 0.95, 0.7, PART.brow, 0);   // 치켜 내려온 눈썹
        SP(at(H, [4.3, 1.3, z * 1.08]), 0.5, PART.eye, 0);
      }
      for (let i = 1; i < 5; i++) for (const z of [2.4, 0, -2.4]) SW(at(H, [-3.4 - i * 0.5, 2.6 - i * 1.9, z]), at(H, [-6.4 - i * 0.4, 3.6 - i * 2.0, z * 1.4]), 1.5, 0.2, PART.ruff, 0);   // 곤두선 털
    }
    if (X.mane) {                // 어깨와 등의 털: 찢어진 옷 밖으로 솟는다
      useFrame("chest");
      EL(at(C, [-3.0 * K, 3.2, 0]), C.R, [2.4 * K, 3.4, 4.6 * K], PART.fur, 0);   // 등 위로만 솟는다(가슴은 가리지 않는다)
      for (let i = 0; i < 7; i++) { const z = (i - 3) * 1.7 * K; SW(at(C, [-2.6 * K, 3.6, z]), at(C, [-4.8 * K, 6.4 - Math.abs(i - 3) * 0.6, z * 1.25]), 1.8, 0.2, PART.fur, 0); }   // 등줄기의 가시 같은 털
      for (const [A, nm, sh] of [[armN, "upperN", sN], [armF, "upperF", sF]]) {
        useFrame(nm);
        const back = unit(sub(A.joint, A.end));
        for (const k of [-1, 0, 1]) SW(add(A.joint, [0, k * 0.8, 0]), add(add(A.joint, mul(back, 3.6 * KA)), [-1.2, k * 1.8 - 1.2, 0]), 1.4 * KA, 0.2, PART.fur, 0);   // 팔꿈치 뒤로 뻗친 털
        SW(sh, add(sh, [-1.4, 4.4 * KA, 0]), 1.6 * KA, 0.2, PART.fur, 0);
      }
    }
    if (X.straps) {              // 가슴을 가로지르는 가죽 끈 둘과 금색 고리
      useFrame("chest");
      const a0 = at(C, [2.3 * K, 4.2, 4.1 * K]), am = at(C, [3.7 * K, 0.4, 0.3 * K]), a1 = at(P, [2.6 * K, 2.6, -3.5 * K]);
      SW(a0, am, 1.0, 1.0, PART.strap, 0);
      SW(am, a1, 1.0, 1.0, PART.strap, 0);
      const b0 = at(C, [2.3 * K, 3.8, -4.1 * K]), bm = at(C, [3.75 * K, -0.2, -0.4 * K]), b1 = at(C, [2.6 * K, -2.6, 3.9 * K]);
      SW(b0, bm, 0.95, 0.95, PART.strap, 0);
      SW(bm, b1, 0.95, 0.95, PART.strap, 0);
      for (const [q0, q1, u] of [[a0, am, 0.45], [am, a1, 0.5], [b0, bm, 0.5]]) SP(add(add(q0, mul(sub(q1, q0), u)), mv(C.R, [0.7, 0, 0])), 0.78, PART.buckle, 0);
      SP(add(am, mv(C.R, [0.8, 0, 0])), 1.15, PART.buckle, 0);                          // 끈이 엇갈리는 자리의 고리
    }
    if (X.skirt) {               // 허리 아래로 늘어진 찢어진 옷자락
      useFrame("pelvis");
      EL(at(P, [0.2, -1.6, 0]), P.R, [3.3 * K, 3.8, 4.6 * K], PART.skirt, 0);
      for (const [k, dn] of [[-1, 6.4], [-0.55, 9.6], [-0.1, 7.2], [0.35, 10.4], [0.75, 6.8], [1, 8.6]]) SW(at(P, [2.2 - Math.abs(k) * 1.2, -3.4, k * 4.2 * K]), at(P, [2.9 - Math.abs(k) * 1.4, -dn, k * 4.5 * K]), 1.7, 0.35, PART.skirt, 0);   // 들쭉날쭉 찢어진 옷자락
      useFrame("chest");
      SW(add(sF, mv(C.R, [0.4, 1.6, 0.6])), add(sF, mv(C.R, [0.8, -2.4, -0.6])), 1.75 * KA, 0.6, PART.skirt, 0);   // 먼 쪽 어깨에 남은 찢어진 소매
      useFrame("pelvis");
      EL(at(P, [-1.8 * K, 0.4, 4.4 * K]), P.R, [2.2, 2.0, 1.5], PART.strap, 0);       // 허리 주머니
      SW(at(P, [3.0 * K, 2.0, 1.4 * K]), at(P, [3.3 * K, -6.2, 1.5 * K]), 0.85, 0.7, PART.strap, 0);   // 늘어진 띠
      SP(at(P, [3.3 * K, -7.0, 1.5 * K]), 0.85, PART.buckle, 0);
    }
    if (X.claws) {               // 큰 앞발의 상아색 발톱
      for (const [A, nm] of [[armN, "foreN"], [armF, "foreF"]]) {
        useFrame(nm);
        const d = unit(sub(A.end, A.joint)), up = unit(cross(d, [0, 0, 1])), r = 1.9 * KA * 0.82;
        for (const k of [-1.5, -0.5, 0.5, 1.5]) SW(add(A.end, add(mul(d, r * 0.7), mul(up, k * 1.0))), add(A.end, add(mul(d, r + 6.8), mul(up, k * 1.7 - 1.4))), 0.92, 0.25, PART.claw, 0);
      }
    }
    if (X.wraps) {               // 장화에 감은 끈
      for (const [L, nm] of [[legN, "shinN"], [legF, "shinF"]]) {
        useFrame(nm);
        for (const u of [0.35, 0.62]) SP(add(L.joint, mul(sub(L.end, L.joint), u)), 2.05 * KL, PART.wrap, 0);
      }
    }
    if (X.beard) {               // 수염: 가슴 덩어리에 묻히지 않게 앞(x)과 보는 사람 쪽(z)으로 내민다
      useFrame("head");
      SW(at(H, [2.9, -1.6, 0.8]), at(H, [5.2, -6.0, 2.6]), 2.6, 1.7, PART.beard, 0);
      SW(at(H, [5.2, -6.0, 2.6]), at(H, [5.6, -9.4, 3.0]), 1.2, 0.8, PART.braid, 0);
      SP(at(H, [5.35, -7.4, 2.8]), 1.25, PART.belt, 0);
    }
    if (X.cape) {                // 곰 가죽 망토: 어깨를 덮고 등 뒤로 무릎까지 늘어진다(항상 땅 쪽으로)
      useFrame("chest");
      EL(at(C, [-0.9, 3.3, 0]), C.R, [4.9 * K, 2.3, 6.6 * K], PART.fur, 0);
      const top = at(C, [-3.2 * K, 1.5, 0]), low = [top[0] - 2.6, Math.max(4.5, top[1] - 19), top[2] - 0.5];
      SW(top, low, 4.4 * K, 3.0, PART.cape, 0, 0.8);
    }
    if (X.belt) {
      useFrame("pelvis");
      EL(at(P, [0, 2.3, 0]), P.R, [3.25 * K, 1.0, 4.6 * K], PART.belt, 0);
      if (X.straps) SP(at(P, [2.9 * K, 2.3, 2.4 * K]), 1.05, PART.buckle, 0);
    }
  }
}

// ---- what they hold: drawn along the handle from the fist, through the same depth buffer
function along(H, axis, side, part) {
  const n = cross(axis, side);
  const T = (i, k, c, lift = 0) => {
    const x = H[0] + axis[0] * i + side[0] * k + n[0] * lift, y = H[1] + axis[1] * i + side[1] * k + n[1] * lift, z = H[2] + axis[2] * i + side[2] * k + n[2] * lift;
    const wx = Math.round(x), wy = Math.round(y);
    if (clipWeapon && wy < 0) return;
    const idx = (OY - wy) * BW + (OX + wx);
    if (idx < 0 || idx >= BW * BH) return;
    curFrameIndex = -1;
    plot(idx, z + 0.05, 2, part, 2, wx, wy, c);
  };
  T.at = (i, k) => [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k];
  return T;
}
const STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" }).map(([k, v]) => [k, hex(v) >>> 0]));
function blade(T, from, length, w) {
  for (let i = from; i <= from + length + 0.01; i += 0.4) {
    const r = i - from, wd = r > length - 5 ? Math.max(0, ((length - r) / 5) * w) : w;
    for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
  }
}
const haft = (T, from, to, a, d, r = 0.8) => {
  for (let i = from; i <= to; i += 0.4) for (let k = -r; k <= r + 0.01; k += 0.4) T(i, k, k > 0.1 ? d : a);
};
export const WEAPONS = {
  // the fist is at i = 0; `two` is where the other hand goes; `across`: the handle lies across the weapon's length
  sword: { two: -4.4, draw(T, q) {
    const end = q.two ? -6.5 : -2.6;
    haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.4; k <= 1.4; k += 0.4) T(end - 0.4, k, STEEL.gold);
    for (let k = -4.6; k <= 4.6; k += 0.4) (T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 25, 2.2);
  } },
  greatsword: { two: -4.8, draw(T) {
    haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.8; k <= 1.8; k += 0.4) T(-7.6, k, STEEL.gold);
    for (let k = -6.6; k <= 6.6; k += 0.4) (T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 31, 3);
    for (let i = 4; i <= 28; i += 0.4) T(i, 0, STEEL.b);
  } },
  dagger: { draw(T) {
    haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
    for (let k = -2.6; k <= 2.6; k += 0.4) T(2.2, k, STEEL.goldD);
    blade(T, 2.6, 10, 1.3);
  } },
  spear: { two: -12, draw(T) {
    haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
    blade(T, 36, 11, 2);
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, STEEL.goldD);
  } },
  hammer: { two: -7, draw(T) {
    for (const lift of [-0.8, 0, 0.8]) for (let i = -10; i <= 18; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
    // the head is a block: its two faces, and the steel between them
    for (let i = 18; i <= 28; i += 0.4) for (let k = -9; k <= 9; k += 0.4) {
      const face = Math.abs(k) > 7.4 ? (k < 0 ? STEEL.a : STEEL.d) : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
      T(i, k, face, 4.5);
      T(i, k, face, -4.5);
      if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6) for (let l = -4; l <= 4; l += 0.4) T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
    }
  } },
  scythe: { two: -11, draw(T) {
    haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
      for (let k = -w; k <= w; k += 0.4) T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
    }
  } },
  claw: { draw(T) {
    for (const q0 of [-2.4, 0, 2.4])
      for (let i = 2; i <= 9.5; i += 0.4) {
        const u = (i - 2) / 7.5, k = q0 + u * u * 1.8;
        T(i, k, u > 0.55 ? STEEL.hi : STEEL.a);
        if (u < 0.6) T(i, k + 0.8, STEEL.d);
      }
  } },
  bow: { across: true, draw(T, q, off) {
    for (let u = -1; u <= 1.001; u += 0.025) {
      const k = u * 17, i = 6 * (1 - u * u) - 1;
      T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
      T(i + 0.8, k, STEEL.woodD);
    }
    const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
    const line = (A, B, c) => {
      const n = Math.max(2, Math.ceil(len(sub(B, A)) / 0.4)), Z = STEEL.a;
      for (let k = 0; k <= n; k++) {
        const P = add(A, mul(sub(B, A), k / n)), wx = Math.round(P[0]), wy = Math.round(P[1]), idx = (OY - wy) * BW + (OX + wx);
        curFrameIndex = -1;
        plot(idx, P[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
      }
    };
    line(tipA, mid);
    line(tipB, mid);
    if (q.nocked) {
      const nock = mid, tip = T.at(13, 0);
      line(nock, tip, STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  } },
  pistol: { across: true, draw(T) {
    for (let i = -1; i <= 9.5; i += 0.4) for (let k = -4.2; k <= -2.4; k += 0.4) T(i, k, k < -3.6 ? STEEL.a : k > -2.9 ? STEEL.d : STEEL.b);
    for (let i = -1.2; i <= 1.2; i += 0.4) for (let k = -2.4; k <= 2.4; k += 0.4) T(i, k, STEEL.gripD);
    T(9, -4.6, STEEL.hi);
  } },
  launcher: { two: -9, draw(T) {
    for (let i = -14; i <= 22; i += 0.4) for (let k = -6; k <= -1; k += 0.4) T(i, k, k < -4.8 ? STEEL.oliveA : k > -2.2 ? STEEL.oliveD : Math.abs(i - 3) < 1.4 ? STEEL.gold : STEEL.olive);
    for (let k = -6.8; k <= -0.2; k += 0.4) (T(22.4, k, STEEL.b), T(-14.4, k, STEEL.d));
  } },
  handle: { draw(T) {
    haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
    for (let k = -1.6; k <= 1.6; k += 0.4) (T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold));
  } },
};

const LOGC = Object.fromEntries(Object.entries({ hi: "#c89858", a: "#9a6a3a", d: "#6a4424", k: "#4a2c16", band: "#e68c2c", bandD: "#a85a1c", leaf: "#8cc840" }).map(([k, v]) => [k, hex(v) >>> 0]));
WEAPONS.log = { two: -6, draw(T) {
  for (let i = -9; i <= 31; i += 0.4) {
    const r = 0.9 + Math.max(0, i - 4) * 0.105 + (i > 29 ? -(i - 29) * 0.5 : 0);
    for (const lift of [-0.7, 0, 0.7]) for (let k = -r; k <= r + 0.01; k += 0.4) {
      const band = i > 19 && i < 21.6;
      T(i, k, band ? (k > r * 0.3 ? LOGC.bandD : LOGC.band) : k < -r * 0.45 ? LOGC.hi : k > r * 0.45 ? LOGC.d : LOGC.a, lift * r);
    }
  }
  for (let j = 0; j < 4; j++) (T(24 + j * 0.8, -3.6 - j * 0.9, LOGC.d), T(25 + j * 0.8, -3.8 - j * 0.9, j > 1 ? LOGC.leaf : LOGC.d));   // 잔가지와 잎
} };

// ---- flat tones, seams, and one clean ink line
function finish(S, restFrames) {
  const dim = (part) => part >= PART.upperF && part <= PART.handF ? 1 : part >= PART.thighF && part <= PART.footF ? 1 : 0;
  const toneOf = (v, part) => {
    let t = SKIN && SKIN.grim ? (v > 0.9 ? 0 : v > 0.6 ? 1 : v > 0.26 ? 2 : 3) : (v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3);
    t = Math.min(3, t + dim(part));
    return t;
  };
  const tones = new Map();
  for (const i of touched) tones.set(i, toneOf(Tone[i], Part[i]));
  // a lone pixel of a tone, with no neighbour like it on the same part, takes its neighbours' tone
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    const t = tones.get(i), votes = [0, 0, 0, 0];
    let same = false;
    for (const d of [-1, 1, -BW, BW]) {
      const j = i + d;
      if (Part[j] !== Part[i] || !tones.has(j)) continue;
      const u = tones.get(j);
      votes[u]++;
      if (u === t) same = true;
    }
    if (!same && votes.some((v) => v > 0)) tones.set(i, votes.indexOf(Math.max(...votes)));
  }
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    const pn = PNAME[Part[i]], rp = SKIN && (SKIN.ramps[pn] || SKIN.ramps[Mat[i] === 1 ? "joint" : "default"]);
    let tn = tones.get(i);
    if (SKIN && SKIN.shag && SKIN.shag.includes(pn)) {
      const v = Math.sin(LX[i] * 12.9898 + Math.floor((LY[i] + LX[i] * 0.5) / 3) * 78.233) * 43758.5453, h = v - Math.floor(v);
      tn = Math.max(0, Math.min(3, tn + (h < 0.13 ? -1 : h > 0.78 ? 1 : 0)));
    }
    Col[i] = rp ? rp[tn] : (Mat[i] === 1 ? CORE : SHELL)[tn];
  }
  // where two parts meet: a soft seam if they touch, ink if one stands in front of the other
  const marks = new Map();
  for (const i of touched) {
    for (const d of [1, BW]) {
      const j = i + d;
      if (Part[j] === 0 || Part[j] === Part[i]) continue;
      const far = Zb[i] < Zb[j] ? i : j, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] === 2 || Mat[j] === 2;
      if (Mat[far] === 2 && dz < 1) continue;
      const ink = steel || dz > 2.2;
      if (ink) marks.set(far, INK);
      else if (!SKIN && !marks.has(far)) marks.set(far, SEAM);
    }
  }
  for (const [i, c] of marks) Col[i] = c;
  // the mark on his chest, when it's facing us
  const { B } = S, chestAt = add(B.chest.t, mv(B.chest.R, [3, 1.6, -1.8]));
  if (!SKIN && mv(B.chest.R, [1, 0, 0])[2] > 0.15) {
    const i = (OY - Math.round(chestAt[1])) * BW + (OX + Math.round(chestAt[0]));
    if (Part[i] === PART.chest) Col[i] = MARK;
  }
  // the outline, and everything into a small list of pixels
  const list = touched.slice(), ring = new Map();
  for (const i of list) for (const d of [-1, 1, -BW, BW]) { const j = i + d; if (Part[j] === 0 && !ring.has(j)) ring.set(j, i); }
  const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), src: new Int16Array(n), ink: new Uint8Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
  const srcFor = (i) => {
    const f = Fr[i];
    if (f < 0 || !restFrames) return -1;
    const name = FRAME_IDS[f], A = B[name], R0 = restFrames[name], wx = (i % BW) - OX, wy = OY - ((i / BW) | 0), P = [wx, wy, Zb[i]];
    const lp = tv(A.R, sub(P, A.t)), rp = add(R0.t, mv(R0.R, lp)), c = Math.round(rp[0]) + 12, r = 38 - Math.round(rp[1]);
    return c < 0 || r < 0 || c >= W0 || r >= H0 ? -1 : r * W0 + c;
  };
  let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const push = (i, c, s, isInk) => {
    const x = (i % BW) - OX, y = ((i / BW) | 0) - OY;
    out.xs[k] = x; out.ys[k] = y; out.color[k] = c; out.src[k] = s; out.ink[k] = isInk ? 1 : 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    k++;
  };
  for (const i of list) push(i, Col[i], srcFor(i), Col[i] === INK);
  for (const [j, i] of ring) push(j, INK, srcFor(i), true);
  let zs = 0;
  for (const i of list) zs += Zb[i];
  Object.assign(out, { x0, y0, x1, y1, z: list.length ? zs / list.length : 0 });
  for (const i of list) Part[i] = 0;
  touched.length = 0;
  return out;
}

const turnAll = (S, a) => {
  // the whole figure turned about the vertical through the feet
  const R = rotY(-a), P = (v) => mv(R, v);
  for (const f of Object.values(S.B)) { f.t = P(f.t); f.R = mm(R, f.R); }
  for (const A of [S.armN, S.armF, S.legN, S.legF]) { A.joint = P(A.joint); A.end = P(A.end); }
  S.sN = P(S.sN); S.sF = P(S.sF); S.hipN = P(S.hipN); S.hipF = P(S.hipF);
  S.axis = P(S.axis); S.side = P(S.side);
};
function renderBeast(q) {
  const kk = SKIN ? SKIN.scale : 1, Ry = rotY(-(((q.yaw ?? 0) || (SKIN.yaw ?? 0)))), TP = (v) => mul(mv(Ry, v), kk), EL = (c0, R0, r, pt, m) => ellipsoid(TP(c0), mm(Ry, R0), mul(r, kk), pt, m), SW = (a0, b0, ra, rb, pt, m, bu = 0) => sweep(TP(a0), TP(b0), ra * kk, rb * kk, pt, m, bu * kk), SP = (c0, r, pt, m) => sphere(TP(c0), r * kk, pt, m);
  const rear = ((q.rear ?? 0) / 100) * 0.95, ph = ((q.walk ?? 0) / 100) * Math.PI * 2, go = (q.go ?? 0) / 100, nod = (q.nod ?? 0) / 100, jaw = (q.jaw ?? 0) / 100, sink = q.crouch ?? 0;
  const X = SKIN.extras ?? {}, I = [1, 0, 0, 0, 1, 0, 0, 0, 1], R = rotZ(rear), piv = [-15, 16 - sink], c = Math.cos(rear), sn = Math.sin(rear);
  const Tf = (v) => { const dx = v[0] - piv[0], dy = v[1] - sink - piv[1]; return [piv[0] + dx * c - dy * sn, piv[1] + dx * sn + dy * c, v[2]]; };   // 앞몸: 엉덩이를 축으로 일어선다
  const Th = (v) => [v[0], v[1] - sink, v[2]];                                                                                                  // 뒷몸
  clipBody = false;
  curFrameIndex = -1;
  curDim = 0;
  const bob = Math.sin(ph * 2) * 0.8 * go;
  // 다리: 굵고, 대각선끼리 같이 나간다. 큰 발과 긴 발톱
  const leg = (hx, zz, phase, front, part) => {
    const dx = Math.sin(ph + phase) * 6.5 * go, lift = Math.max(0, Math.cos(ph + phase)) * 3.6 * go;
    const hip = (front ? Tf : Th)([hx, 19 + bob, zz]);
    let paw = front ? Tf([hx + 2 + dx, 3.0 + lift + sink, zz]) : [hx + dx, 3.0 + lift, zz];
    if (front && rear < 0.04) paw = [hx + 2 + dx, 3.0 + lift, zz];
    const mid = [(hip[0] + paw[0]) / 2 + (front ? 1.8 : -3.2), (hip[1] + paw[1]) / 2, zz];
    SW(hip, mid, 7.8, 6.2, part, 0);
    SW(mid, paw, 6.0, 4.8, part, 0);
    for (const u of [0.25, 0.6, 0.9]) SP([mid[0] + (paw[0] - mid[0]) * u - 3.6, mid[1] + (paw[1] - mid[1]) * u, zz + 1], 1.7, part, 0);      // 다리 뒤쪽의 털 뭉치
    const up = front && rear > 0.2, toe = up ? [paw[0] + 3.2 * c + 1.4 * sn, paw[1] + 3.2 * sn - 1.9 * c, zz] : [paw[0] + 4.2, paw[1] - 0.9, zz];
    SW(paw, toe, 4.3, 3.6, part, 0);
    for (const k of [-2.0, -0.4, 1.2, 2.6]) {
      const b0 = [toe[0] + 2.2, toe[1] - 0.4, zz + k * 1.3], b1 = up ? [toe[0] + 8.2 * c, toe[1] + 8.2 * sn - 2.2, zz + k * 1.5] : [toe[0] + 8.6, toe[1] - 2.9, zz + k * 1.5];
      SW(b0, b1, 1.15, 0.25, PART.claw, 0);
    }
  };
  leg(-15, -6.8, Math.PI, false, PART.legF);
  leg(17, -6.8, 0, true, PART.legF);
  // 몸통: 엉덩이, 통, 어깨의 혹, 목덜미의 갈기. 아랫배에 털이 늘어진다
  EL(Th([-15, 23.5 + bob, 0]), I, [12, 12, 11], PART.beast, 0);
  EL(Tf([-1, 24.5 + bob, 0]), R, [21.5, 13, 11.5], PART.beast, 0);
  EL(Tf([14, 30 + bob, 0]), R, [13.5, 15, 12.2], PART.beast, 0);
  for (let i = 0; i < 6; i++) { const z = ((i % 3) - 1) * 3.4; SW(Tf([24 - i * 2.4, 41 - i * 0.5 + bob, z]), Tf([19.5 - i * 2.4, 48.5 - i * 0.6 + bob, z * 1.2]), 2.6, 0.25, PART.ruff, 0); }   // 어깨 위로 곤두선 털
  for (let i = 0; i < 11; i++) SP(Tf([-17 + i * 3.4, 12.3 + bob - ((i * 7) % 3) * 0.7, 3 + (i % 3) * 2.2]), 2.0, PART.beast, 0);
  EL(Tf([24, 24 + bob, 0]), R, [10.5, 13, 11.4], PART.ruff, 0);
  for (let i = 0; i < 6; i++) SP(Tf([18 + i * 1.5, 14 + bob - (i % 2) * 1.2, 4 + (i % 3) * 1.6]), 2.2, PART.ruff, 0);
  leg(-15, 6.8, 0, false, PART.legN);
  leg(17, 6.8, Math.PI, true, PART.legN);
  // 머리: 크고, 주둥이는 밝고, 턱 밑에 수염처럼 털이 늘어진다. 눈이 빛난다
  const hx = 38, hy = 20 + bob - nod * 7, hyaw = (SKIN.headYaw ?? 0), hc_ = Math.cos(hyaw), hs_ = Math.sin(hyaw), jw = Math.max(jaw, SKIN.snarl ?? 0);
  const hp = (dx, dy, dz) => Tf([hx + dx * hc_ - dz * hs_ * 0.35, hy + dy, dz * hc_ + dx * hs_]);   // 머리에 달린 것: 머리 가운데를 축으로 우리 쪽으로 돌린다
  EL(Tf([hx, hy, 0]), R, [10.2, 9.4, 9.2], PART.bhead, 0);
  SW(hp(6.0, -1.4, 0), hp(13.0, -2.8 - nod, 0), 5.4, 4.3, PART.snout, 0);                       // 윗턱
  SP(hp(16.8, -1.4 - nod, 0), 2.6, PART.nose, 0);
  SW(hp(6, -5.6 - jw, 0), hp(12.4, -6.4 - nod - jw * 2.2, 0), 3.2, 2.5, PART.mouth, 0);          // 입 속
  SW(hp(5, -8.2 - jw * 2.4, 0), hp(11.4, -9.8 - nod - jw * 5.4, 0), 3.2, 2.2, PART.snout, 0);    // 아래턱
  for (const z of [3.4, -3.4]) {
    SW(hp(12.2, -4.8 - nod, z), hp(12.7, -8.4 - nod - jw, z), 1.05, 0.25, PART.tooth, 0);        // 위 송곳니
    SW(hp(10.2, -8.8 - nod - jw * 4.6, z), hp(10.6, -5.8 - nod - jw * 3, z), 0.85, 0.25, PART.tooth, 0);
    SP(hp(8.4, -5.2 - nod * 0.6, z * 1.15), 0.7, PART.tooth, 0);
  }
  for (const z of [5.6, -5.6]) { SP(hp(-5, 8.4, z), 2.7, PART.ear, 0); SP(hp(-4.6, 8.2, z * 1.35), 1.25, PART.earIn, 0); }
  for (const z of [7.6, -7.6]) {
    SW(hp(1.4, 5.6, z * 1.05), hp(8.8, 2.5, z * 0.86), 1.95, 1.3, PART.brow, 0);                 // 치켜 내려온 눈썹
    SP(hp(6.7, 1.4, z * 1.1), 1.0, PART.eye, 0);
  }
  for (const [x, y, z] of [[-6, -6, 6], [-2, -9, 5], [2.4, -10.5, 2.5], [-8.6, -2, 7.4], [-9, 3.4, 7], [-2, -9, -5], [-8.6, -2, -7.4], [-9.6, 7, 4], [-10.6, 9.5, 0], [-9.6, 7, -4]]) SW(hp(x, y, z), hp(x * 1.5 - 1.5, y * 1.45 - (y < 0 ? 2.5 : -2), z * 1.25), 3.0, 0.3, PART.ruff, 0);   // 볼·턱·목의 곤두선 털

  if (X.forest) {
    // 등을 뒤덮은 이끼, 옆구리로 흘러내린 이끼 조각, 박힌 바위, 고사리
    EL(Tf([-3, 35.6 + bob, 0]), R, [18, 4.6, 10.2], PART.moss, 0);
    EL(Tf([12.5, 38.6 + bob, 0]), R, [9.5, 3.8, 9.2], PART.moss, 0);
    EL(Th([-18, 33.6 + bob, 0]), I, [9, 3.8, 9], PART.moss, 0);
    for (const [x, y, r] of [[-9, 29, 3.8], [3, 27, 3.2], [-20, 27, 3], [10, 31.5, 3.4], [16, 22, 2.4], [-14, 19, 2.2], [-3, 21, 2], [-24, 20, 2.2]]) EL((x < -12 ? Th : Tf)([x, y + bob, 9.4]), R, [r, r * 0.85, 2.6], PART.moss2, 0);
    EL(Tf([7, 34 + bob, 5.5]), R, [4.6, 3.4, 4], PART.rock, 0);
    EL(Tf([-10, 37.4 + bob, 3]), R, [3.4, 2.6, 3.2], PART.rock, 0);
    EL(Tf([11, 27 + bob, 9.4]), R, [3.6, 3, 2.6], PART.rock, 0);
    for (const k of [-2, -1, 0, 1, 2]) SW(Tf([1, 37 + bob, 7]), Tf([1 + k * 3.4, 43.5 - Math.abs(k) * 1.5 + bob, 7.6]), 1.0, 0.4, PART.fern, 0);
    for (const k of [-1, 0, 1]) SW(Tf([-15, 36 + bob, 6]), Tf([-15 + k * 3, 41.5 - Math.abs(k) * 1.2 + bob, 6.6]), 0.9, 0.4, PART.fern, 0);
    // 구불구불한 나무들: 뿌리가 등을 움켜쥐고, 줄기가 꺾이며, 납작한 잎 덩어리가 층층이 얹힌다
    const sway = Math.sin(ph) * 1.0 * go;
    for (const [x, h, ln, r] of [[-29, 13, -0.55, 6], [-20, 23, -0.3, 8.4], [-8, 33, 0.12, 10.4], [3, 26, -0.14, 8.6], [14, 18, 0.34, 6.4]]) {
      const T_ = x < -12 ? Th : Tf, base = T_([x, 36 + bob, 0]), mid = T_([x + ln * h * 0.35 + 2.2, 36 + h * 0.5 + bob, 0.6]), tx = x + ln * h + sway, ty = 36 + h + bob, top = T_([tx, ty, 0]);
      SW(base, mid, 2.2, 1.6, PART.trunk, 0);
      SW(mid, top, 1.6, 1.0, PART.trunk, 0);
      SW(base, T_([x - 3.6, 34 + bob, 2.4]), 1.3, 0.6, PART.trunk, 0);
      SW(base, T_([x + 4, 34.4 + bob, 2.4]), 1.3, 0.6, PART.trunk, 0);
      SW(mid, T_([tx - r * 0.8, ty - h * 0.22, 1.2]), 1.0, 0.6, PART.trunk, 0);
      EL(T_([tx - r * 0.78, ty - h * 0.2 + 1.4, 1.6]), R, [r * 0.62, r * 0.36, r * 0.6], PART.leafD, 0);
      EL(T_([tx + r * 0.72, ty - 1.4, -1]), R, [r * 0.6, r * 0.36, r * 0.6], PART.leafD, 0);
      EL(T_([tx, ty + 1.6, 0]), R, [r, r * 0.5, r * 0.86], PART.leaf, 0);
      EL(T_([tx - r * 0.2, ty + r * 0.36 + 1.6, 0.6]), R, [r * 0.56, r * 0.3, r * 0.5], PART.leaf, 0);
    }
    // 나뭇가지 뿔과 호박색 수정 왕관
    const cr = (v) => hp(-1.5 + v[0], 8.8 + v[1], v[2]);
    for (const [dx, len] of [[-8, 6.5], [-5.4, 10], [3.4, 9], [6.4, 6], [-10.5, 3.6]]) {
      SW(cr([dx * 0.45, 0, 1]), cr([dx, len * 0.6, 1.4]), 1.15, 0.8, PART.antler, 0);
      SW(cr([dx, len * 0.6, 1.4]), cr([dx * 1.15 + 0.8, len, 1.4]), 0.8, 0.35, PART.antler, 0);
      SW(cr([dx, len * 0.6, 1.4]), cr([dx * 1.3 - 1.4, len * 0.86, 1.4]), 0.7, 0.3, PART.antler, 0);
    }
    for (const [dx, len, w] of [[-3.4, 9.5, 1.5], [-0.4, 14.5, 2.0], [2.4, 10, 1.5], [-6.2, 6.4, 1.1], [4.9, 6.2, 1.1]]) SW(cr([dx * 0.7, 0.6, 2.6]), cr([dx, len, 2.6]), w, 0.3, PART.crystal, 0);
  }
  return finish({ B: { chest: frame([0, 0, 0], I) } }, null);
}
let REST_FRAMES = null;
function render(pose) {
  if (SKIN && SKIN.beast) return renderBeast({ ...STAND, ...pose });
  const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const air = (q.y ?? 0) < -0.5;
  clipBody = !air;
  clipWeapon = !air;
  drawBody(S);
  clipBody = false;
  if (S.W) S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon), q, S.armF.end);
  if (S.OW) {
    const sb = q.sb ?? Math.PI;
    let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
    if (whole) { const R = rotY(-whole); ax = mv(R, ax); sd = mv(R, sd); }
    S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon), q, S.armF.end);
  }
  clipWeapon = false;
  return finish(S, REST_FRAMES);
}
REST_FRAMES = solve({}).B;

const CACHE = new Map();
const keyOf = (p) => {
  let s = (p.y ?? 0) < -0.5 ? "air," : "";
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === undefined || k === "x" || k === "y" || k === "ghost") continue;
    s += k + (typeof v === "number" ? (k === "sa" || k === "sb" || k === "wl" || k === "yaw" || k === "turn" ? Math.round(v * 20) : Math.round(v)) : v) + ",";
  }
  return s;
};
/** How far short of where the pose wants them the hands fall, in px: arms don't stretch. */
export function shortfall(pose) {
  const S = solve(pose), q = S.q, near = len(sub(S.armN.end, [q.fx, -q.fy, S.armN.end[2]])), far = q.two ? 0 : len(sub(S.armF.end, [q.bx, -q.by, S.armF.end[2]]));
  return Math.max(near, far);
}
/** The pixels of a pose: { n, xs, ys, color, src, ink, x0, y0, x1, y1 }, in local space with the feet at (0, 0). */
export function posed(pose) {
  const key = keyOf(pose);
  let r = CACHE.get(key);
  if (!r) {
    if (CACHE.size > 6000) CACHE.clear();
    CACHE.set(key, (r = render(pose)));
  }
  return r;
}

/**
 * The skeleton of a pose, in the same local space as posed(): x right, y down, feet at (0, 0), z toward the viewer, whole
 * figure turned by its yaw. { joints: { name: [x, y, z] }, bones: [[from, to], ...], handles: [name, ...] }: the handles
 * are what a pose moves (hands and feet); everything else is solved from them.
 */
export function skeleton(pose) {
  const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF } = S, at = (f, v) => add(f.t, mv(f.R, v));
  const J = {
    pelvis: B.pelvis.t, waist: B.waist.t, chest: B.chest.t, neck: B.neck.t, head: B.head.t, crown: at(B.head, [0, 3.3, 0]),
    shoulderN: sN, elbowN: armN.joint, handN: armN.end, shoulderF: sF, elbowF: armF.joint, handF: armF.end,
    hipN, kneeN: legN.joint, ankleN: legN.end, toeN: at(B.footN, [4.6, -1.1, 0]), hipF, kneeF: legF.joint, ankleF: legF.end, toeF: at(B.footF, [4.6, -1.1, 0]),
  };
  const joints = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, [v[0], -v[1], v[2]]]));
  const bones = [["pelvis", "waist"], ["waist", "chest"], ["chest", "neck"], ["neck", "head"], ["head", "crown"], ["chest", "shoulderN"], ["shoulderN", "elbowN"], ["elbowN", "handN"], ["chest", "shoulderF"], ["shoulderF", "elbowF"], ["elbowF", "handF"], ["pelvis", "hipN"], ["hipN", "kneeN"], ["kneeN", "ankleN"], ["ankleN", "toeN"], ["pelvis", "hipF"], ["hipF", "kneeF"], ["kneeF", "ankleF"], ["ankleF", "toeF"]];
  return { joints, bones, handles: ["handN", "handF", "ankleN", "ankleF"] };
}
/** The figure taken apart: each part drawn alone, with its own outline, and where its middle is. For exploded views. */
export function posedParts(pose) {
  const out = [];
  for (const [name, part] of Object.entries(PART)) {
    onlyPart = part;
    const r = render(pose);
    onlyPart = 0;
    if (!r.n) continue;
    let cx = 0, cy = 0;
    for (let i = 0; i < r.n; i++) { cx += r.xs[i]; cy += r.ys[i]; }
    out.push({ name, part, n: r.n, xs: r.xs, ys: r.ys, color: r.color, cx: cx / r.n, cy: cy / r.n, z: r.z });
  }
  return out;
}
