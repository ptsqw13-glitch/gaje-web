// 배경: 천하제일 무술대회 무대(언덕 게임의 돌 광장을 옆에서 본 모습). 한 번만 그려 점 배열(Uint32)로 돌려준다.
// 색은 pixelfx 처럼 몇 단계로 끊고, 글자는 반투명 가장자리를 잘라 도트로 만든다.
const rnd = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();

export function buildBackdrop(W, H, FLOOR, banner = true) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
  // 하늘: 해 질 녘, 띠마다 점을 섞어(디더) 이어 붙인다
  const SKY = ["#2a2448", "#3b2f5c", "#5a3d6e", "#83506f", "#b4686b", "#e08c64", "#f2b072"];
  const band = 16;
  for (let i = 0; i < SKY.length; i++) {
    rect(0, i * band, W, band, SKY[i]);
    if (i + 1 < SKY.length) for (let y = 0; y < 4; y++) for (let x = (y & 1); x < W; x += 2) rect(x, i * band + band - 4 + y, 1, 1, SKY[i + 1]);
  }
  rect(0, SKY.length * band, W, H, SKY[SKY.length - 1]);
  // 해
  g.fillStyle = "#ffd890"; g.beginPath(); g.arc(300, 96, 18, 0, 7); g.fill();
  // 먼 산 두 겹
  const hills = (base, amp, col, seed) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, base - Math.abs(Math.sin(x * 0.018 + seed) * amp) - Math.abs(Math.sin(x * 0.051 + seed * 2)) * amp * 0.35);
    g.lineTo(W, H); g.fill();
  };
  hills(120, 34, "#6b4a72", 1.3);
  hills(136, 22, "#4a3658", 4.1);
  // 관중석(돌 계단) + 사람 머리 점들
  for (let r = 0; r < 4; r++) {
    const y = 128 + r * 8;
    rect(0, y, W, 8, r % 2 ? "#5d5466" : "#6c6276");
    rect(0, y, W, 1, "#7d7388");
    for (let x = 2; x < W; x += 5 + ((rnd() * 3) | 0)) {
      if (rnd() < 0.25) continue;
      const c = ["#2b2333", "#3a2a2a", "#4a3520", "#1f2a38"][(rnd() * 4) | 0];
      rect(x, y - 3, 3, 3, c); rect(x - 1, y, 5, 3, ["#8a2a36", "#2a4a8a", "#6a5a20", "#3a6a3a", "#7a7a86"][(rnd() * 5) | 0]);
    }
  }
  // 무대 바닥 윗면(살짝 비스듬히 보이는 돌판)
  const TOP = FLOOR - 12;
  rect(0, TOP, W, FLOOR - TOP + 2, "#a7a3a0");
  for (let y = TOP; y < FLOOR + 2; y += 4) rect(0, y, W, 1, "#8f8b89");
  for (let row = 0, y = TOP; y < FLOOR + 2; row++, y += 4) for (let x = (row % 2) * 9; x < W; x += 18) rect(x, y, 1, 4, "#8f8b89");
  for (let i = 0; i < 160; i++) rect(rnd() * W, TOP + rnd() * 13, 1, 1, rnd() < 0.5 ? "#b8b4b0" : "#93908c");
  // 가운데 원 무늬(대회 무대의 표시)
  g.strokeStyle = "#c9a26c"; g.lineWidth = 1;
  g.beginPath(); g.ellipse(W / 2, FLOOR - 5, 70, 5, 0, 0, 7); g.stroke();
  // 무대 앞면: 돌 벽돌 + 붉은 벽돌 띠 두 줄 + 지층
  rect(0, FLOOR + 2, W, H - FLOOR, "#7c7672");
  rect(0, FLOOR + 2, W, 2, "#c8c3bd");
  const brick = (y, h, cA, cB, line) => {
    for (let x = 0; x < W; x += 12) rect(x, y, 12, h, rnd() < 0.5 ? cA : cB);
    rect(0, y + h - 1, W, 1, line);
    for (let x = 0; x < W; x += 12) rect(x, y, 1, h, line);
  };
  brick(FLOOR + 4, 6, "#8a8480", "#958f8a", "#5e5956");
  brick(FLOOR + 10, 5, "#9a3a32", "#a8463a", "#5c2420");
  brick(FLOOR + 15, 6, "#8a8480", "#827c78", "#5e5956");
  brick(FLOOR + 21, 5, "#9a3a32", "#8c342e", "#5c2420");
  for (let y = FLOOR + 26; y < H; y += 3) rect(0, y, W, 3, ["#6e5a48", "#7a6450", "#5e4c3e"][(y / 3) % 3 | 0]);
  if (!banner) return new Uint32Array(g.getImageData(0, 0, W, H).data.buffer.slice(0));
  // 현수막: 장대 둘 + 흰 천 + "천하제일 무술대회"
  const L = 78, R = W - 78, top = 34, clothTop = 40, clothH = 26;
  for (const x of [L, R]) { rect(x - 2, top, 4, 128 - top, "#4e331f"); rect(x - 2, top, 1, 128 - top, "#724c2e"); rect(x - 4, top - 4, 8, 4, "#c9a26c"); }
  for (let x = L + 2; x < R - 2; x++) {
    const sag = Math.round(Math.sin(((x - L) / (R - L)) * Math.PI) * 3);
    rect(x, clothTop + sag, 1, clothH, "#f2ede2");
    rect(x, clothTop + sag + clothH - 2, 1, 2, "#cfc8b8");
    rect(x, clothTop + sag, 1, 1, "#ffffff");
  }
  rect(L + 2, clothTop, R - L - 4, 1, "#3a2a20");
  // 글자: 따로 그려 반투명을 잘라 붙인다
  const tc = document.createElement("canvas"); tc.width = W; tc.height = 40;
  const t = tc.getContext("2d");
  t.font = "22px Galmuri11B"; t.textAlign = "center"; t.textBaseline = "top"; t.fillStyle = "#000";
  t.fillText("천하제일 무술대회", W / 2, 4);
  const td = t.getImageData(0, 0, W, 40).data, out = g.getImageData(0, 0, W, H);
  for (let y = 0; y < 40; y++) for (let x = 0; x < W; x++) {
    if (td[(y * W + x) * 4 + 3] < 120) continue;
    const sag = Math.round(Math.sin(((x - L) / (R - L)) * Math.PI) * 3), py = clothTop + 1 + sag + y, j = (py * W + x) * 4;
    if (py >= H) continue;
    out.data[j] = 0x9a; out.data[j + 1] = 0x22; out.data[j + 2] = 0x2a; out.data[j + 3] = 255;
  }
  return new Uint32Array(out.data.buffer.slice(0));
}
