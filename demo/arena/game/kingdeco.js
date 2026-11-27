// 왕 장식(손 도트 조각): 왕관(각성 0·1·2)과 어깨 장식을 뼈대 관절 자리에 찍는다.
// 조각은 왼쪽 절반 + 가운데 줄만 적고 오른쪽은 거울로 만든다(오른쪽은 한 단계 어둡게: 빛이 왼쪽 위).
// 에이세프라이트 확인용 파일은 tools/king_deco_sheet.mjs → art/ase/king_deco.aseprite
const PAL = {
  K: 0x140f1c, Y: 0xfff0a0, G: 0xffd84a, g: 0xc89a2a, d: 0x8a6418, L: 0x9ad860, l: 0x5cb040, m: 0x2a7030, E: 0xd0fff0, e: 0x40e090,
  I: 0x7a7286, i: 0x4a4458, j: 0x26222e, R: 0xff7a6a, r: 0xe0303a, q: 0x8a1020, B: 0xf4eedc, b: 0xb8ac90, F: 0xffe070, f: 0xff6a20,
  s: 0xf2c9a0, S: 0xc8906c, w: 0xffffff, h: 0x9a6a2a,
};
const DARKER = { Y: "G", G: "g", L: "l", l: "m", E: "e", I: "i", i: "j", R: "r", B: "b", F: "f" };
function mirror(half) {
  return half.map((row) => row + [...row.slice(0, -1)].reverse().map((c) => DARKER[c] ?? c).join(""));
}
export const DECO = {
  elf: {
    crown: [
      mirror(["..L....L", ".lLl..lL", ".lml..lm", "KYGGGGGe", "KGggggdE", ".KKKKKKK"]),
      mirror(["........L", "...L...lL", "..lLl..lm", "..lml...G", "L..G...GE", "lL.G..GeE", "KYGGGGGGE", "KGggggggd", ".KKKKKKKK"]),
      mirror([".....L.....", "....lLl...E", "..L.lml..EE", ".lLl.G...eE", ".lml.G..GeE", "..G..GG.GGE", "L.GG..G..GG", "lL.GG.GG.Gg", ".lL.GGGGGGG", "KYGGGGGGGGE", "KGgggggggdE", "KGddddddddd", ".KKKKKKKKKK"]),
    ],
    mantle: ["....KKKK.....", "..KKlLLlKK...", ".KlLLLLLlmK..", "KlLLlLLlLlmK.", "KlLlmlLlmlmK.", ".KmlKmlKmlK..", "..KmGKm.KmK..", "...KEK...K..."],
  },
  dark: {
    crown: [
      mirror([".i.....i", ".ij...iI", ".Iij..II", "KIiiiiir", "KIiiiirR", "Kjjjjjjq", ".KKKKKKK"]),
      mirror(["B.........", "Bb........", ".Bb......i", ".Bb.....iI", "..Bb.i..II", "..BbIij..r", ".KIiiiiirR", ".KIiiiiRRR", ".Kjjjjjjjq", "..KKKKKKKK"]),
      mirror([".F.........F", ".fF.......fF", "B.f.......fR", "Bb......i.fR", ".Bb....iIj.r", ".Bbb.i.IIj.R", "..BbbIij.IIi", "...BbIiiiiir", "..KIiiiiiirR", "..KIiiiiiRRF", "..KIiiiiiirR", "..Kjjjjjjjjq", "...KKKKKKKKK"]),
    ],
    mantle: ["..B.......B....", "..Bb..B..bB....", ".KbBKKBbKKbK...", "KIiiiBBBiiiijK.", "KIiiBKBKBiiijK.", "KIiiiBBBiiiijK.", ".KjjjbBbjjjjK..", "..KKKKKKKKKK..."],
  },
};
// 자리 보정(그림 점 단위): 왕관은 머리 꼭대기, 어깨 갑옷은 앞 어깨
export const OFF = { elf: { crown: [1, -2], mantle: [0, -1], face: [4, -3] }, dark: { crown: [0, 0], mantle: [0, -1], face: [9, -2] } };
// 얼굴 조각(거울 없음, 오른쪽을 봄). 엘프: 눈썹·초록 눈·코·입 / 흑기사: 투구 틈의 눈빛(각성할수록 길게 끌린다)
export const FACE = {
  elf: [["hh..", "KeE.", "sss.", "ssS.", ".Ss.", ".qs."], ["hh..", "KeE.", "sss.", "ssS.", ".Ss.", ".qs."], ["hhh.", "KEE.", "sss.", "ssS.", ".Ss.", ".qs."]],
  dark: [["rRR"], ["..rRF", "...r."], ["r.rRFF", "..rRF.", "....r."]],
};
function stamp(rows, cx, cy, ax, ay, put) {
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (PAL[c] !== undefined) put(Math.round(cx - ax + x), Math.round(cy - ay + y), PAL[c]); }));
}
const abgr = (c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff)) >>> 0;
// sk = skeleton(pose), scale = 인형 배율. put(x, y, 색) — 색은 인형 그림과 같은 형식(ABGR). 오른쪽을 보는 좌표(뒤집기는 부르는 쪽에서)
export function kingDeco(king, aw, sk, scale, put) {
  const D = DECO[king];
  if (!D) return;
  const J = sk.joints, P = (x, y, c) => put(x, y, abgr(c));
  const O = OFF[king], m = D.mantle, n = J.shoulderN;
  stamp(m, n[0] * scale + O.mantle[0], n[1] * scale + O.mantle[1], 6, 2, P);
  const f = FACE[king][Math.min(2, aw)], h = J.head, fa = king === "dark" ? [f[0].length - 1, 0] : [0, 0];
  stamp(f, h[0] * scale + O.face[0], h[1] * scale + O.face[1], fa[0], fa[1], P);
  const c = D.crown[Math.min(2, aw)], t = J.crown;
  stamp(c, t[0] * scale + O.crown[0], t[1] * scale + O.crown[1], (c[0].length - 1) / 2, c.length - 1, P);
}

// 망토 무늬(인형의 칠하기 규칙): 가슴 뼈 기준 좌표 x(앞+ 뒤-), y(위+), z(옆). 뒤 가장자리·밑단 테두리, 주름 줄, 가운데 문장
export function capePaint(king) {
  const elf = king === "elf", edge0 = elf ? -6.4 : -8.1, edgeMin = elf ? -9 : -10.7, hem = elf ? -18.5 : -19.5;
  return (x, y, z, t) => {
    const e = Math.max(edgeMin, edge0 + y * 0.17), cx = (e - 1.6) / 2;
    if (x < e + 0.9) return ["capeTrim", Math.min(3, t)];          // 뒤 가장자리 테두리
    if (y < hem + (elf ? 0 : (Math.floor(x * 1.5) & 1) * 1.2)) return ["capeTrim", Math.min(3, t + 1)];          // 밑단(흑기사는 들쭉날쭉)
    const dx = x - (elf ? cx : e * 0.62), dy = y + (elf ? 8 : 6);
    if (elf) {          // 잎 문장: 마름모 잎 + 잎맥, 아래로 덩굴
      if (Math.abs(dx) / 1.5 + Math.abs(dy) / 2.6 < 1) return Math.abs(dx) < 0.3 ? ["capeTrim", 2] : ["capeSigil", 1];
      if (dy < -2.6 && dy > -10 && Math.abs(dx - Math.sin(dy * 0.9) * 1.1) < 0.35) return ["capeSigil", 2];
    } else {          // 역삼각 마검 문장 + 가운데 눈
      if (dy < 3 && dy > -3.4 && Math.abs(dx) < (dy + 3.4) * 0.45) return Math.abs(dx) < 0.5 && Math.abs(dy - 0.6) < 0.6 ? ["capeTrim", 0] : ["capeSigil", 1];
    }
    const fold = (((x - e) / 2.3) % 1 + 1) % 1;
    if (fold < 0.16 && y < 0) return ["cape", Math.min(3, t + 1)];          // 세로 주름
    return null;
  };
}
export const CAPE_RAMPS = { elf: { capeTrim: "#f0c040", capeSigil: "#9ad860" }, dark: { capeTrim: "#d8ccb0", capeSigil: "#ff4a3a" } };
