// 주인공 외형(2026-11-27, 사용자 시안 다섯 장): 세트 = 부위별 색 + 체형 + 장식 덩어리 + 무늬 규칙.
// 사용자는 세트를 고른 뒤 색 칸과 체형 막대로 바꾼다. 색은 칸마다 기준색 하나 → 밝은 쪽부터 네 단계(ramp).
// 무늬 규칙(paint): 부위 이름 → (뼈 기준 x 앞뒤, y 위아래, z 옆, 명암 t, 땅 높이 wy) → [색 칸, 명암] 또는 없음.
//   머리 부위는 머리 크기로 나눈 값이 온다(머리를 키워도 무늬 자리가 같다).
import { hex } from "../pixelfx/core/index.js";

export const SLOTS = [
  { key: "skin", ko: "피부", parts: ["head", "face", "neck", "handN", "handF", "ear"] },
  { key: "body", ko: "몸통", parts: ["chest", "waist", "pelvis", "default", "joint", "plate", "fauld"] },
  { key: "arms", ko: "팔", parts: ["upperN", "upperF", "foreN", "foreF", "elbowN", "elbowF", "gauntlet"] },
  { key: "legs", ko: "다리", parts: ["thighN", "thighF", "shinN", "shinF", "kneeN", "kneeF", "greave", "kneecop"] },
  { key: "feet", ko: "신발", parts: ["footN", "footF", "boot"] },
  { key: "gear", ko: "투구·모자", parts: ["helm", "hood", "hat", "hatbrim", "pauldron", "quiver", "bracer"] },
  { key: "cloth", ko: "망토·옷", parts: ["cape", "robe", "sleeve", "collar", "skirt", "sash", "vest"] },
  { key: "hair", ko: "머리카락", parts: ["hair", "beard"] },
  { key: "trim", ko: "장식", parts: ["horn", "wing", "plume", "band", "belt", "buckle", "visor", "gem", "strap"] },
];
const T = (k, d = 0) => (x, y, z, t) => [k, Math.max(0, Math.min(3, t + d))];          // 그 칸 색으로, 명암을 d 만큼 옮겨서
const dark = (x, y, z, t) => [null, t + 1];
const hash = (a, b, c) => { const v = Math.sin(a * 12.99 + b * 78.23 + c * 37.71) * 43758.55; return v - Math.floor(v); };
// 갑옷 무늬(흑기사·성기사 공통): 가슴판 테두리와 가운데 등줄, 허리판 줄, 보호대 테두리, 투구 이마띠·등줄·리벳
const armorPaint = (emblem) => ({
  plate: (x, y, z, t) => {
    if (emblem && x > 2.3) { const e = emblem(y, z); if (e) return e; }
    if (y < -2.75 || y > 4.25) return ["trim", Math.min(3, t)];
    if (x > 2.6 && Math.abs(z) < 0.55) return ["body", Math.max(0, t - 1)];
    if (Math.abs(Math.abs(z) - 3.6) < 0.45 && y < 3) return ["body", Math.min(3, t + 1)];
    return null;
  },
  fauld: (x, y, z, t) => (y < -2.3 ? ["trim", t] : Math.floor((y + 4) / 1.25) % 2 ? ["body", Math.min(3, t + 1)] : null),
  pauldron: (x, y, z, t) => (y < 0.35 ? ["trim", t] : Math.floor((y + 2) / 1.1) % 2 ? ["gear", Math.min(3, t + 1)] : null),
  gauntlet: (x, y, z, t) => (t >= 3 ? null : Math.abs(y) > 0 && Math.floor(x * 0.9) % 3 === 0 ? ["trim", t] : null),
  greave: (x, y, z, t) => (Math.abs(z) < 0.45 ? ["legs", Math.max(0, t - 1)] : null),
  kneecop: T("trim"),
  helm: (x, y, z, t) => {
    if (y > 0.9 && y < 1.55 && x > -1) return ["trim", t];
    if (Math.abs(z) < 0.45 && y > 1.5) return ["gear", Math.max(0, t - 1)];
    if (y > -1.6 && y < -1.0 && Math.round(z * 1.4) % 2 === 0 && x > 0.5) return ["trim", Math.max(0, t - 1)];
    return null;
  },
  cape: (x, y, z, t, wy) => (wy < 4.6 ? ["trim", t] : Math.floor(z * 1.25 + 40) % 3 === 0 ? ["cloth", Math.min(3, t + 1)] : null),
});
export const SETS = [
  { key: "dark", ko: "흑기사", color: { skin: "#c08a6a", body: "#3a3442", arms: "#332f3a", legs: "#2e2a34", feet: "#24202a", gear: "#2c2832", cloth: "#9a1c28", hair: "#2a2420", trim: "#7a1e2c" },
    only: { visor: "#ff2a3a", horn: "#4a4250", emblem: "#d02838" }, shape: { bulk: 1.18, arm: 1.12, leg: 1.08, head: 1.0 },
    extras: { helm: "crest", horns: true, pauldrons: "spiked", cloak: true, armor: true, belt: true },
    paint: armorPaint((y, z) => (Math.abs(y - (0.6 + Math.abs(z) * 0.9)) < 0.5 && Math.abs(z) < 2.4 ? ["emblem", 1] : null)) },
  { key: "holy", ko: "성기사", color: { skin: "#e8b890", body: "#e6e9f2", arms: "#d8dce8", legs: "#d2d6e2", feet: "#b8bccc", gear: "#f0f0f6", cloth: "#2a4aa8", hair: "#e0c070", trim: "#e8b830" },
    only: { visor: "#1c2240", plume: "#3a5ad0", wing: "#f4d050" }, shape: { bulk: 1.1, arm: 1.05, leg: 1.05, head: 1.05 },
    extras: { helm: true, wings: true, plume: true, pauldrons: true, cloak: true, armor: true, belt: true },
    paint: { ...armorPaint((y, z) => ((Math.abs(z) < 0.6 && y > -1.6 && y < 3.4) || (Math.abs(y - 1.7) < 0.55 && Math.abs(z) < 2.1) ? ["trim", 0] : null)),
      wing: (x, y, z, t) => (Math.floor(y * 1.6) % 2 ? ["wing", Math.min(3, t + 1)] : null),
      plume: (x, y, z, t) => (Math.floor(z * 2 + y) % 2 ? ["plume", Math.min(3, t + 1)] : null) } },
  { key: "wizard", ko: "마법사", color: { skin: "#e8b890", body: "#2a3a8a", arms: "#2a3a8a", legs: "#3a2a6a", feet: "#3a2a4a", gear: "#4a2a8a", cloth: "#2a3a8a", hair: "#eceef4", trim: "#e8c040" },
    only: { gem: "#60d0ff" }, shape: { bulk: 0.95, arm: 0.92, leg: 0.95, head: 1.1 },
    extras: { hat: true, longBeard: true, robe: true, sash: true, belt: false },
    paint: {
      robe: (x, y, z, t, wy) => (wy < 3.8 ? ["trim", t] : x > 2.4 && Math.abs(z) < 0.7 ? ["trim", t] : hash(Math.floor(x * 1.5), Math.floor(y * 1.5), Math.floor(z * 1.5)) > 0.965 ? ["trim", 0] : null),
      hat: (x, y, z, t) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4), Math.floor(z * 1.4)) > 0.94 ? ["trim", 0] : null),
      sleeve: (x, y, z, t) => (Math.floor(x * 2) % 7 === 0 ? ["trim", t] : null),
      beard: (x, y, z, t) => (Math.floor(z * 2.4 + y * 0.3) % 2 ? ["hair", Math.min(3, t + 1)] : null),
      chest: (x, y, z, t) => (x > 2 && Math.abs(z) < 0.6 ? ["trim", t] : null),
      sash: T("trim"),
    } },
  { key: "summoner", ko: "소환사", color: { skin: "#d8a888", body: "#1e4a30", arms: "#1c442e", legs: "#183a28", feet: "#2a2a20", gear: "#2a6a40", cloth: "#1e4a30", hair: "#3a2a20", trim: "#d0a848" },
    only: { horn: "#5a4630", rune: "#58f0b0", glow: "#8ffff0" }, shape: { bulk: 1.0, arm: 0.95, leg: 1.0, head: 1.05 },
    extras: { hood: "horned", robe: true, sash: true },
    paint: {
      // 두건 속 얼굴은 그늘지고, 두 눈만 하늘빛으로 빛난다
      face: (x, y, z, t) => (y > -0.3 && y < 0.8 && x > 1.2 && Math.abs(Math.abs(z) - 1.05) < 0.55 ? ["glow", 0] : ["skin", 3]),
      head: (x, y, z, t) => ["skin", 3],
      robe: (x, y, z, t, wy) => (wy < 3.2 ? ["trim", t] : wy < 5.2 ? (Math.floor(z * 1.6 + 30) % 2 ? ["rune", 1] : ["cloth", 3]) : x > 2.5 && Math.abs(z) < 0.6 ? ["trim", t] : null),
      hood: (x, y, z, t) => (x > 1.4 ? ["trim", t] : Math.floor(z * 1.3 + 20) % 3 === 0 ? ["gear", Math.min(3, t + 1)] : null),
      sleeve: (x, y, z, t) => (Math.floor(x * 2) % 7 === 0 ? ["trim", t] : null),
      chest: (x, y, z, t) => (x > 1.6 && Math.abs(y - 2.4 + Math.abs(z) * 1.1) < 0.55 && Math.abs(z) < 2.6 ? ["trim", t] : x > 2.2 && Math.abs(z) < 0.5 ? ["trim", t] : null),
      horn: (x, y, z, t) => (Math.floor((y + z) * 1.8) % 2 ? ["horn", Math.min(3, t + 1)] : null),
      sash: T("trim"),
    } },
  { key: "elf", ko: "엘프 궁수", color: { skin: "#f4cca4", body: "#3f8c44", arms: "#3f8c44", legs: "#5e4a2c", feet: "#5a3418", gear: "#3a8a40", cloth: "#7a4826", hair: "#f2d478", trim: "#d0a040" },
    only: { quiver: "#7a4826", plume: "#ece4d4", strap: "#4a2c18", bracer: "#7a4826" }, shape: { bulk: 0.86, arm: 0.86, leg: 0.92, head: 1.08 },
    extras: { hood: true, hair: true, elfEars: true, vest: true, quiver: true, belt: true, boots: true, bracers: true },
    paint: {
      hood: (x, y, z, t) => (x > 1.5 ? ["trim", t] : null),
      // 가죽 조끼: 아래·위 금테, 앞의 엇갈린 끈
      vest: (x, y, z, t) => (y < -2.6 || y > 3.4 ? ["trim", t] : x > 2.3 && Math.abs(z) < 1.1 && (Math.abs(z - (y % 1.6) * 0.6) < 0.35 || Math.abs(z + (y % 1.6) * 0.6) < 0.35) ? ["trim", Math.min(3, t + 1)] : Math.abs(Math.abs(z) - 3.2) < 0.35 ? ["cloth", Math.min(3, t + 1)] : null),
      hair: (x, y, z, t) => (Math.floor(z * 2.2 + x) % 2 ? ["hair", Math.min(3, t + 1)] : null),
      chest: (x, y, z, t) => null,
      boot: (x, y, z, t) => (t < 3 && Math.floor(x * 1.3 + 20) % 4 === 0 ? ["trim", t] : null),
      bracer: (x, y, z, t) => (Math.floor(x * 1.5 + 20) % 3 === 0 ? ["trim", t] : null),
      quiver: (x, y, z, t) => (Math.floor(y * 1.0 + 20) % 4 === 0 ? ["trim", t] : null),
    } },
];
export const SHAPE_RANGE = { bulk: [0.8, 1.35, "덩치"], arm: [0.8, 1.35, "팔 굵기"], leg: [0.8, 1.3, "다리 굵기"], head: [0.85, 1.35, "머리 크기"] };

// 기준색 하나 → 밝은 쪽부터 네 단계. 어두운 쪽은 살짝 푸른 보라로 기울여 도트 느낌을 낸다
function ramp(h) {
  const c = hex(h), r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  const to = (k, shift) => "#" + [r, g, b].map((v, i) => Math.max(0, Math.min(255, Math.round(v * k + (i === 2 ? shift : -shift * 0.3))))).map((v) => v.toString(16).padStart(2, "0")).join("");
  const lit = (k) => "#" + [r, g, b].map((v) => Math.round(v + (255 - v) * k)).map((v) => v.toString(16).padStart(2, "0")).join("");
  return [lit(0.35), h, to(0.66, 8), to(0.4, 14)];
}
// 세트 + 사용자가 바꾼 색·체형 → 인형에 넘길 외형(skin). scale: 그리는 세밀도(2 = 두 배)
export function buildSkin(set, color = {}, shape = {}, scale = 1) {
  const ramps = {}, col = { ...set.color, ...color };
  for (const sl of SLOTS) { ramps[sl.key] = ramp(col[sl.key]); for (const p of sl.parts) ramps[p] = ramps[sl.key]; }
  for (const [p, h] of Object.entries(set.only ?? {})) if (!(color.trim && ["horn", "wing", "plume"].includes(p))) ramps[p] = ramp(h);
  const paint = {};
  for (const [p, fn] of Object.entries(set.paint ?? {})) paint[p] = (x, y, z, t, wy, i) => { const r = fn(x, y, z, t, wy, i); return r && r[0] === null ? [p, r[1]] : r; };
  return { ramps, ...set.shape, ...shape, extras: set.extras, paint, scale };
}
