// 주인공 외형(2026-11-27, 사용자 시안 다섯 장): 세트 = 부위별 색 + 체형 + 장식. 사용자는 세트를 고른 뒤 색 칸과 체형 막대로 바꾼다.
// 색은 칸마다 기준색 하나로 정하고, 밝은 쪽부터 네 단계(ramp)를 만들어 인형(rig)의 부위에 칠한다.
import { hex } from "../pixelfx/core/index.js";

// 색 칸: 사용자가 고르는 단위. parts = 그 칸이 칠하는 인형 부위 이름
export const SLOTS = [
  { key: "skin", ko: "피부", parts: ["head", "face", "neck", "handN", "handF", "ear"] },
  { key: "body", ko: "몸통", parts: ["chest", "waist", "pelvis", "default", "joint"] },
  { key: "arms", ko: "팔", parts: ["upperN", "upperF", "foreN", "foreF", "elbowN", "elbowF"] },
  { key: "legs", ko: "다리", parts: ["thighN", "thighF", "shinN", "shinF", "kneeN", "kneeF", "footN", "footF"] },
  { key: "gear", ko: "투구·모자", parts: ["helm", "hood", "hat", "hatbrim", "pauldron", "quiver"] },
  { key: "cloth", ko: "망토·옷", parts: ["cape", "robe", "sleeve", "collar", "skirt"] },
  { key: "trim", ko: "장식", parts: ["horn", "wing", "plume", "band", "belt", "buckle", "beard", "visor", "gem"] },
];
// 칸 하나에 따로 색을 주는 부위(세트가 정함): 예) 흑기사의 눈구멍은 장식 칸과 다른 빨강
export const SETS = [
  { key: "dark", ko: "흑기사", color: { skin: "#c08a6a", body: "#3a3640", arms: "#34303a", legs: "#2c2832", gear: "#2a2630", cloth: "#9a1c28", trim: "#4a4450" },
    only: { visor: "#ff3040", horn: "#3a3440" }, shape: { bulk: 1.18, arm: 1.12, leg: 1.08, head: 1.0 },
    extras: { helm: "crest", horns: true, pauldrons: "spiked", cloak: true, belt: true } },
  { key: "holy", ko: "성기사", color: { skin: "#e8b890", body: "#e6e8f0", arms: "#d8dce8", legs: "#d0d4e0", gear: "#f0f0f6", cloth: "#2a4aa8", trim: "#e8b830" },
    only: { visor: "#202848", plume: "#3a5ad0" }, shape: { bulk: 1.1, arm: 1.05, leg: 1.05, head: 1.05 },
    extras: { helm: true, wings: true, plume: true, pauldrons: true, cloak: true, belt: true } },
  { key: "wizard", ko: "마법사", color: { skin: "#e8b890", body: "#2a3a8a", arms: "#2a3a8a", legs: "#3a2a6a", gear: "#4a2a8a", cloth: "#2a3a8a", trim: "#e8c040" },
    only: { beard: "#e8e8f0", gem: "#60d0ff" }, shape: { bulk: 0.95, arm: 0.92, leg: 0.95, head: 1.1 },
    extras: { hat: true, longBeard: true, robe: true, belt: true } },
  { key: "summoner", ko: "소환사", color: { skin: "#d8a888", body: "#2a5a3a", arms: "#24503a", legs: "#1e402e", gear: "#2a6a40", cloth: "#2a5a3a", trim: "#c8a040" },
    only: { horn: "#3a3020" }, shape: { bulk: 1.0, arm: 0.95, leg: 1.0, head: 1.05 },
    extras: { hood: "horned", robe: true, belt: true } },
  { key: "elf", ko: "엘프 궁수", color: { skin: "#f0c8a0", body: "#7a4a28", arms: "#3a7a3a", legs: "#6a4228", gear: "#3a8a40", cloth: "#2a6a30", trim: "#c89a40" },
    only: { quiver: "#7a4a28", plume: "#e8e0d0" }, shape: { bulk: 0.88, arm: 0.88, leg: 0.95, head: 1.08 },
    extras: { hood: true, elfEars: true, quiver: true, belt: true } },
];
export const SHAPE_RANGE = { bulk: [0.8, 1.35, "덩치"], arm: [0.8, 1.35, "팔 굵기"], leg: [0.8, 1.3, "다리 굵기"], head: [0.85, 1.35, "머리 크기"] };

// 기준색 하나 → 밝은 쪽부터 네 단계(밝음·보통·어두움·아주 어두움). 어두운 쪽은 살짝 보라로 기울여 도트 느낌을 낸다
function ramp(h) {
  const c = hex(h), r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  const to = (k, shift) => "#" + [r, g, b].map((v, i) => Math.max(0, Math.min(255, Math.round(v * k + (i === 2 ? shift : -shift * 0.3))))).map((v) => v.toString(16).padStart(2, "0")).join("");
  const lit = (k) => "#" + [r, g, b].map((v) => Math.round(v + (255 - v) * k)).map((v) => v.toString(16).padStart(2, "0")).join("");
  return [lit(0.32), h, to(0.68, 8), to(0.42, 14)];
}
// 세트 + 사용자가 바꾼 색·체형 → 인형에 넘길 외형(skin)
export function buildSkin(set, color = {}, shape = {}) {
  const ramps = {}, col = { ...set.color, ...color };
  for (const sl of SLOTS) for (const p of sl.parts) ramps[p] = ramp(col[sl.key]);
  for (const [p, h] of Object.entries(set.only ?? {})) if (!color.trim || p === "visor" || p === "gem") ramps[p] = ramp(h);
  return { ramps, ...set.shape, ...shape, extras: set.extras };
}
