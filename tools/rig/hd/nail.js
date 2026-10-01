/**
 * 못(nail) HD — 록맨 X풍 갑옷 캐릭터를 고해상도 SVG 로 그린다.
 *
 * 파츠마다 국소 좌표(관절이 원점, 팔다리는 +y 로 뻗음)로 모양·셀 그늘·
 * 광택·외곽선을 갖고, 자세는 관절 각도와 발 위치(IK)로만 정한다. 같은 몸을
 * 돌려 쓰므로 프레임마다 그림이 달라지지 않는다.
 *
 * 단위는 게임 픽셀 1칸(발바닥 가운데 0,0 / 위가 -y / 앞이 +x). 렌더는
 * render.mjs 가 S 배로 한다.
 */
(() => {
  const OUT = '#0c1230';
  const LW = 0.42;
  const C = {
    blue: { L: '#7cc2ff', B: '#2f78ea', S: '#1c4bb4', D: '#10296e', G: '#e8f7ff' },
    navy: { L: '#3c4e92', B: '#222f68', S: '#141b44' },
    gold: { L: '#fff0b0', B: '#f4b53e', S: '#b0700f' },
    white: { L: '#ffffff', B: '#e4eaf4', S: '#a7b4cc', D: '#6c7996' },
    skin: { L: '#ffdcc4', B: '#f6b48c', S: '#d4825a' },
    silver: { L: '#ffffff', B: '#cfd8e6', S: '#8793ad' },
  };
  const L = { up: 4.2, fore: 5.8, thigh: 7.2, shin: 7.0, ankle: 5.4 };

  let uid = 0;
  /** 한 파츠: 바탕 → (바탕 안에서) 그늘·빛·광택·디테일 → 외곽선 */
  function part(transform, d, base, layers = '', opts = {}) {
    const id = `p${uid++}`;
    const stroke = opts.noLine ? '' : `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${opts.lw ?? LW}" stroke-linejoin="round"/>`;
    return `<g transform="${transform}"><clipPath id="${id}"><path d="${d}"/></clipPath>`
      + `<path d="${d}" fill="${base}"/><g clip-path="url(#${id})">${layers}</g>${stroke}${opts.over ?? ''}</g>`;
  }
  const P = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
  const E = (cx, cy, rx, ry, fill, rot = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  const S = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const tr = (x, y, a = 0) => `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${a.toFixed(3)})`;

  // ---------------------------------------------------------------- 파츠
  const thigh = (t) => part(t,
    'M-3.6,-0.6 C-3.9,2.4 -3.4,5 -3.0,7.4 L3.0,7.4 C3.4,5 3.9,2.4 3.6,-0.6 Z', C.navy.B,
    P('M1.1,-1 L4,-1 L4,8 L0.9,8 C1.4,5 1.5,2 1.1,-1 Z', C.navy.S)
    + P('M-3.8,-1 L-2.3,-1 C-2.5,2 -2.4,5 -2.1,8 L-3.8,8 Z', C.navy.L));

  const shin = (t) => part(t,
    'M-3.6,-1.0 C-3.9,-3.6 3.9,-3.6 3.6,-1.0 L4.4,6.2 C4.5,7.6 -4.5,7.6 -4.4,6.2 Z', C.blue.B,
    P('M1.5,-4 L5,-4 L5,8 L1.9,8 C2.5,5 2.1,1 1.5,-4 Z', C.blue.S)
    + P('M-5,5.4 L5,5.4 L5,8 L-5,8 Z', C.blue.S)
    + P('M-4.4,-3 L-2.6,-3 L-3.0,6 L-4.8,6 Z', C.blue.L)
    + E(-0.4, -1.9, 2.5, 1.4, C.blue.L)
    + E(-1.2, -2.3, 1.1, 0.5, C.blue.G, -10)
    + P('M-4.2,0.7 L4.2,0.7 L4.3,2.0 L-4.3,2.0 Z', C.gold.B)
    + P('M-4.2,0.7 L4.2,0.7 L4.25,1.15 L-4.25,1.15 Z', C.gold.L)
    + S('M-4.3,0.7 L4.3,0.7 M-4.3,2.0 L4.3,2.0', OUT, 0.3)
    + S('M-2.0,3.4 L-2.3,5.6', C.blue.G, 0.55));

  const boot = (t) => part(t,
    'M-4.6,-0.8 L3.4,-1.2 C5.4,-0.6 7.4,0.8 9.2,1.8 C10.9,2.8 11.0,5.4 9.8,5.4 L-4.8,5.4 C-5.8,5.4 -5.8,1.4 -4.6,-0.8 Z', C.blue.B,
    P('M-6,3.0 L12,3.0 L12,6 L-6,6 Z', C.blue.S)
    + P('M-6,4.5 L12,4.5 L12,6 L-6,6 Z', C.blue.D)
    + P('M-5,-1 L-3.4,-1 L-3.6,3 L-5.4,3 Z', C.blue.L)
    + P('M5.8,1.3 C7.6,1.8 9.6,2.8 10.0,3.6 C8,3.4 6.6,2.8 5.8,1.3 Z', C.blue.G)
    + P('M-4.8,-0.4 L3.6,-0.8 L3.9,0.9 L-5.0,1.3 Z', C.gold.B)
    + P('M-4.8,-0.4 L3.6,-0.8 L3.65,-0.3 L-4.85,0.1 Z', C.gold.L)
    + S('M-5,1.3 L3.9,0.9', OUT, 0.3));

  const upper = (t) => part(t,
    'M-2.1,-0.6 L2.1,-0.6 L1.9,4.8 L-1.9,4.8 Z', C.navy.B,
    P('M0.6,-1 L3,-1 L3,5 L0.5,5 Z', C.navy.S));

  const fore = (t) => part(t,
    'M-3.0,0.2 C-3.2,-0.9 3.2,-0.9 3.0,0.2 L3.8,5.4 C3.9,6.5 -3.9,6.5 -3.8,5.4 Z', C.blue.B,
    P('M1.2,-1 L5,-1 L5,7 L1.6,7 C2,4 1.8,1.5 1.2,-1 Z', C.blue.S)
    + P('M-4,-1 L-2.4,-1 L-2.8,7 L-4.4,7 Z', C.blue.L)
    + S('M-1.8,0.6 L-2.1,3.2', C.blue.G, 0.6)
    + P('M-3.8,4.1 L3.8,4.1 L3.95,5.4 L-3.95,5.4 Z', C.gold.B)
    + P('M-3.8,4.1 L3.8,4.1 L3.85,4.55 L-3.85,4.55 Z', C.gold.L)
    + S('M-4,4.1 L4,4.1 M-4,5.4 L4,5.4', OUT, 0.3));

  const fist = (t) => part(t,
    'M-3.3,0.1 L3.3,0.1 C4.2,0.2 4.4,4.6 2.7,5.1 L-2.7,5.1 C-4.4,4.6 -4.2,0.2 -3.3,0.1 Z', C.blue.B,
    P('M0.8,-1 L5,-1 L5,6 L0.6,6 Z', C.blue.S)
    + P('M-5,3.6 L5,3.6 L5,6 L-5,6 Z', C.blue.S)
    + E(-1.6, 1.4, 1.3, 0.8, C.blue.L)
    + S('M-2.4,2.4 L2.6,2.4 M-2.2,3.6 L2.4,3.6', C.blue.D, 0.35));

  /** 주먹 대신 나오는 못 총 — 총구 길이를 함께 돌려준다 */
  const gun = (t, r = 0) => part(t,
    `M-3.4,${0.1 - r} L3.4,${0.1 - r} L3.1,${5 - r} L-3.1,${5 - r} Z`, C.blue.B,
    P(`M0.8,-2 L5,-2 L5,6 L0.6,6 Z`, C.blue.S)
    + P(`M-3.6,${2.6 - r} L3.6,${2.6 - r} L3.6,${3.7 - r} L-3.6,${3.7 - r} Z`, C.gold.B)
    + S(`M-3.6,${2.6 - r} L3.6,${2.6 - r} M-3.6,${3.7 - r} L3.6,${3.7 - r}`, OUT, 0.3))
    + part(t, `M-0.95,${4.6 - r} L0.95,${4.6 - r} L0.95,${14.6 - r} L-0.95,${14.6 - r} Z`, C.silver.B,
      P(`M0.2,0 L2,0 L2,20 L0.2,20 Z`, C.silver.S) + P(`M-1.2,0 L-0.5,0 L-0.5,20 L-1.2,20 Z`, C.silver.L), { lw: 0.32 })
    + part(t, `M-2.7,${14.3 - r} L2.7,${14.3 - r} L2.4,${15.8 - r} L-2.4,${15.8 - r} Z`, C.silver.B,
      P(`M-3,${15.1 - r} L3,${15.1 - r} L3,17 L-3,17 Z`, C.silver.S), { lw: 0.32 });

  const pad = (t, near) => part(t,
    'M-5.8,0.6 C-6.0,-4.2 -2.4,-5.8 0.6,-5.8 C3.8,-5.8 6.4,-3.6 6.2,0.6 C6.1,2.8 4.2,4.4 0.2,4.4 C-3.8,4.4 -5.7,2.8 -5.8,0.6 Z', near ? C.blue.B : C.blue.S,
    P('M-7,0.6 C-3,3.0 3,2.6 7,-1.4 L7,6 L-7,6 Z', near ? C.blue.S : C.blue.D)
    + P('M-6.2,-0.6 C-5.2,-4.6 -1.2,-6.4 2.2,-5.8 C-1,-5.2 -4,-3.2 -4.8,0.2 Z', near ? C.blue.L : C.blue.B)
    + (near ? E(-1.6, -3.4, 1.5, 0.7, C.blue.G, -28) : '')
    + P('M-5.7,1.5 C-2,3.6 2.6,3.6 6.1,1.3 L6.1,2.7 C2.8,4.9 -2.2,4.9 -5.6,2.9 Z', near ? C.gold.B : C.gold.S)
    + S('M-5.7,1.5 C-2,3.6 2.6,3.6 6.1,1.3', OUT, 0.3));

  const fins = (t) => part(t,
    'M-2.6,-3.2 L-11.8,-6.6 L-7.6,-1.8 L-13.0,-1.4 L-7.0,1.6 L-11.2,3.6 L-3.8,3.2 Z', C.white.B,
    P('M-14,0 L-2,0 L-2,5 L-14,5 Z', C.white.S)
    + P('M-14,2.4 L-2,2.4 L-2,5 L-14,5 Z', C.white.D)
    + S('M-3,-2.6 L-10.6,-5.8', C.white.L, 0.45));

  function torso(t) {
    return part(t, 'M-5.2,-0.4 L5.6,-0.4 L5.2,-6.4 L-4.8,-6.4 Z', C.navy.B,
      P('M1.8,-7 L6,-7 L6,0 L2.2,0 Z', C.navy.S)
      + S('M-4.4,-2.4 L4.8,-2.4 M-4.2,-4.3 L4.6,-4.3', '#0b1234', 0.35)
      + S('M-4.4,-2.8 L1.6,-2.8 M-4.2,-4.7 L1.4,-4.7', C.navy.L, 0.3))
      + part(t, 'M-6.0,-1.2 L6.6,-1.2 L6.2,2.8 C3,3.8 -3,3.8 -5.6,2.8 Z', C.blue.B,
        P('M2.4,-2 L7,-2 L7,4 L2.6,4 Z', C.blue.S)
        + P('M-7,1.8 L7,1.8 L7,4 L-7,4 Z', C.blue.S)
        + P('M-6.4,-1.2 L6.8,-1.2 L6.7,0.3 L-6.3,0.3 Z', C.navy.B)
        + P('M-0.7,-1.7 L2.5,-1.7 L2.5,1.4 L-0.7,1.4 Z', C.gold.B)
        + P('M-0.7,-1.7 L2.5,-1.7 L2.5,-0.9 L-0.7,-0.9 Z', C.gold.L)
        + S('M-0.7,-1.7 L2.5,-1.7 L2.5,1.4 L-0.7,1.4 Z', OUT, 0.3))
      + part(t, 'M-2.2,-15.6 L2.8,-15.6 L2.6,-13 L-2,-13 Z', C.navy.B)
      + part(t, 'M-8.4,-12.6 C-9.0,-9.8 -7.8,-7.2 -5.2,-5.6 L5.8,-5.6 C8.6,-7.2 9.6,-9.8 8.8,-12.6 C5.0,-14.4 -4.6,-14.4 -8.4,-12.6 Z', C.blue.B,
        P('M2.8,-16 L10,-16 L10,-5 L3.2,-5 C4.6,-8 4.4,-12 2.8,-16 Z', C.blue.S)
        + P('M-9,-7.2 L10,-7.2 L10,-5 L-9,-5 Z', C.blue.S)
        + P('M-9,-6.2 L10,-6.2 L10,-5 L-9,-5 Z', C.blue.D)
        + P('M-8.8,-12.8 C-5,-14.6 -1,-14.4 0.6,-14 L0,-12.6 C-3,-13 -6,-12.6 -8.4,-11.6 Z', C.blue.L)
        + P('M-6.6,-11.2 C-7,-9.8 -6.4,-8.4 -5.6,-7.6 L-5,-8 C-5.6,-9 -6,-10 -5.8,-11.2 Z', C.blue.G)
        + S('M-5.8,-13 L0.6,-9.0 L6.8,-13', C.gold.S, 1.25)
        + S('M-5.8,-13 L0.6,-9.0 L6.8,-13', C.gold.B, 0.75)
        + S('M-5.8,-13.25 L0.6,-9.25 L6.8,-13.25', C.gold.L, 0.25)
        + P('M0.6,-10.9 L1.8,-9.4 L0.6,-7.9 L-0.6,-9.4 Z', C.gold.B)
        + P('M0.6,-10.9 L1.2,-10.1 L0.6,-9.4 L0,-10.1 Z', C.gold.L));
  }

  function head(t) {
    const crest = part(t,
      'M8.6,-15.6 L9.6,-21.0 L5.8,-18.4 L4.4,-24.2 L1.0,-19.2 L-1.6,-24.6 L-3.4,-18.8 L-7.6,-22.8 L-7.4,-17.2 L-12.4,-19.6 L-10.4,-14.2 L-15.4,-14.8 L-11.0,-10.2 L-14.2,-8.2 L-8.4,-7.6 L-3,-12.8 Z', C.white.B,
      P('M-16,-12.6 L-6,-12.6 L-6,-7 L-16,-7 Z', C.white.S)
      + P('M-16,-9.6 L-8,-9.6 L-8,-7 L-16,-7 Z', C.white.D)
      + P('M-0.6,-21 L1.6,-21 L1.0,-15 L-1.4,-15 Z', C.white.S)
      + P('M-6.4,-19.6 L-4.4,-19.6 L-5.0,-15 L-7.0,-15 Z', C.white.S)
      + P('M5.6,-20 L7.6,-20 L7.4,-15 L5.2,-15 Z', C.white.S)
      + P('M-11.6,-17.4 L-9.6,-17.4 L-9.8,-13 L-12,-13 Z', C.white.S)
      + S('M4.2,-23.2 L2.6,-18.4 M-1.6,-23.6 L-2.6,-18.6 M-7.4,-21.8 L-6.8,-17.6 M9.2,-20.2 L7.6,-17.0 M-12,-18.8 L-10.4,-15', C.white.L, 0.5));
    const helmet = part(t,
      'M-9.0,-9.6 C-9.0,-15.0 -4.6,-19.2 0.8,-19.2 C6.2,-19.2 10.6,-15.0 10.6,-9.6 C10.6,-4.2 6.2,0.0 0.8,0.0 C-4.6,0.0 -9.0,-4.2 -9.0,-9.6 Z', C.blue.B,
      P('M-10,-3.6 C-3,0.6 6,0 11,-7 L11,1 L-10,1 Z', C.blue.S)
      + P('M-10,-1.2 C-3,1.4 5,1 11,-4 L11,1 L-10,1 Z', C.blue.D)
      + P('M-9.4,-8 C-9.2,-14.6 -4.6,-19.4 1.6,-19.4 C-3,-18.2 -7,-14.2 -7.6,-8 Z', C.blue.L)
      + S('M-6.0,-14.2 C-4.0,-16.6 -1.2,-17.8 1.4,-17.9', C.blue.G, 1.1));
    // 귀 장치
    const ear = part(t, 'M-7.6,-7.8 a3.6,3.6 0 1,0 7.2,0 a3.6,3.6 0 1,0 -7.2,0 Z', C.blue.L,
      P('M-8,-6 C-6,-4.4 -3,-4.4 -0.2,-6.4 L0,-3 L-8,-3 Z', C.blue.B)
      + E(-4.0, -7.8, 2.2, 2.2, C.blue.S)
      + E(-4.0, -7.8, 1.0, 1.0, C.gold.B)
      + E(-4.3, -8.1, 0.4, 0.4, C.gold.L)
      + S('M-4,-7.8 m-2.2,0 a2.2,2.2 0 1,0 4.4,0 a2.2,2.2 0 1,0 -4.4,0', OUT, 0.3));
    // 얼굴
    const face = part(t,
      'M1.2,-10.4 L10.9,-10.4 L11.1,-2.8 C9.6,0.4 4.6,0.6 2.4,-1.2 C1.0,-2.8 0.6,-6.8 1.2,-10.4 Z', C.skin.B,
      P('M0,-10.6 L12,-10.6 L12,-8.9 L0,-8.9 Z', C.skin.S)
      + P('M9.8,-8 L12,-8 L12,0 L9.4,0 C10.4,-3 10.4,-5 9.8,-8 Z', C.skin.S)
      + P('M2.0,-8.6 L4.0,-8.6 L3.6,-3 L1.6,-3 Z', C.skin.L)
      // 눈
      + P('M5.5,-9.3 L8.7,-8.3 C9.5,-8.1 9.6,-4.0 8.7,-3.8 L5.9,-3.8 C5.1,-4.0 4.9,-9.3 5.5,-9.3 Z', '#ffffff')
      + E(7.6, -6.2, 1.25, 2.0, '#2a78d8')
      + E(7.7, -5.6, 1.0, 1.2, '#1a4ea8')
      + E(7.85, -6.0, 0.55, 1.15, '#0a1838')
      + E(7.15, -7.0, 0.5, 0.55, '#ffffff')
      + E(8.3, -4.9, 0.25, 0.25, '#ffffff')
      + S('M5.1,-9.5 L9.3,-8.2', OUT, 0.85)
      + S('M4.6,-10.0 L9.6,-8.9', '#5a2410', 0.5)
      + S('M9.4,-1.8 L10.5,-2.0', '#7a3418', 0.45)
      + S('M10.9,-4.6 L10.6,-3.8', C.skin.S, 0.4));
    const cheek = part(t,
      'M0.4,-10.6 C2.8,-8.4 3.4,-4.2 2.1,-0.4 L-1.2,-0.6 C-0.8,-4.0 -0.6,-7.8 0.4,-10.6 Z', C.blue.B,
      P('M-2,-3 L4,-3 L4,1 L-2,1 Z', C.blue.S));
    const brow = part(t,
      'M0.4,-11.2 C3.6,-14.4 9.0,-14.6 11.2,-11.4 L11.2,-10.0 L0.4,-10.0 Z', C.blue.L,
      P('M0,-11 L12,-11 L12,-9.6 L0,-9.6 Z', C.blue.B)
      + S('M2.4,-12.4 C4.6,-13.6 7.6,-13.7 9.4,-12.6', '#ffffff', 0.45),
      { over: E(6.2, -12.4, 1.5, 1.35, C.gold.B) + E(5.8, -12.85, 0.55, 0.45, C.gold.L)
          + `<ellipse cx="6.2" cy="-12.4" rx="1.5" ry="1.35" fill="none" stroke="${OUT}" stroke-width="0.3"/>` });
    return crest + helmet + ear + face + cheek + brow;
  }

  // ---------------------------------------------------------------- 뼈대
  const D2R = Math.PI / 180;
  const rotp = (x, y, a) => [x * Math.cos(a * D2R) - y * Math.sin(a * D2R), x * Math.sin(a * D2R) + y * Math.cos(a * D2R)];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  function ik(h, f, l1, l2) {
    let dx = f[0] - h[0], dy = f[1] - h[1];
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.001;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    const a = Math.atan2(dy, dx);
    const b = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const k1 = [h[0] + l1 * Math.cos(a - b), h[1] + l1 * Math.sin(a - b)];
    const k2 = [h[0] + l1 * Math.cos(a + b), h[1] + l1 * Math.sin(a + b)];
    const knee = k1[0] > k2[0] ? k1 : k2;
    const end = [h[0] + dx, h[1] + dy];
    const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]) / D2R - 90;
    return { knee, end, a1: ang(h, knee), a2: ang(knee, end) };
  }

  function svg(pose, view) {
    uid = 0;
    const pel = pose.pelvis;
    const ta = pose.torso;
    const tp = add(pel, [0, pose.lift ?? 0]);
    const T = tr(tp[0], tp[1], ta);
    const at = (x, y) => add(tp, rotp(x, y, ta));
    const neck = at(0.4, -15.4);
    const shN = at(8.8, -11.8), shF = at(-8.2, -11.8);
    const arm = (sh, a) => {
      const el = add(sh, rotp(0, L.up, a[0]));
      const wr = add(el, rotp(0, L.fore, a[0] + a[1]));
      return { U: tr(sh[0], sh[1], a[0]), F: tr(el[0], el[1], a[0] + a[1]), W: tr(wr[0], wr[1], a[0] + a[1] + (a[2] ?? 0)), wr, a: a[0] + a[1] + (a[2] ?? 0) };
    };
    const aN = arm(shN, pose.armN), aF = arm(shF, pose.armF);
    const leg = (hx, foot) => {
      const h = add(pel, [hx, 0]);
      const s = ik(h, [foot[0], foot[1]], L.thigh, L.shin);
      return { Th: tr(h[0], h[1], s.a1), Sh: tr(s.knee[0], s.knee[1], s.a2), Ft: tr(s.end[0], s.end[1], foot[2] ?? 0) };
    };
    const lN = leg(4.0, pose.footN), lF = leg(-4.0, pose.footF);
    const padT = (sh) => tr(sh[0], sh[1], ta);

    let body = '';
    body += upper(aF.U);
    if (!pose.farFront) body += fore(aF.F) + fist(aF.W);
    body += fins(padT(shF)) + pad(padT(shF), false);
    body += thigh(lF.Th) + shin(lF.Sh) + boot(lF.Ft);
    body += torso(T);
    if (pose.farFront) body += fore(aF.F) + fist(aF.W);
    body += thigh(lN.Th) + shin(lN.Sh) + boot(lN.Ft);
    body += pad(padT(shN), true);
    body += head(tr(neck[0], neck[1], ta + (pose.head ?? 0)));
    body += upper(aN.U) + fore(aN.F) + (pose.gun ? gun(aN.W, pose.recoil ?? 0) : fist(aN.W));

    const muzzle = pose.gun ? add(aN.wr, rotp(0, 16 - (pose.recoil ?? 0), aN.a)) : add(aN.wr, rotp(0, 3, aN.a));
    const { w, h, s } = view;
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w * s}" height="${h * s}" viewBox="${-w / 2} ${-h + 0.5} ${w} ${h}">${body}</svg>`,
      muzzle,
    };
  }

  // ---------------------------------------------------------------- 자세
  const A = L.ankle;
  const idle = { pelvis: [0, -19.6], torso: 0, head: 0, lift: 0, armN: [-12, -94], armF: [22, -86], farFront: true, footN: [9.4, -A, 0], footF: [-8.8, -A, 0] };

  window.HD = { svg, poses: { idle }, view: { w: 96, h: 64 } };
})();
