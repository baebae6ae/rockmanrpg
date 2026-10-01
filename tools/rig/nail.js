/**
 * 못(nail) — 파란 투구에 뒤로 뻗친 흰 머리 볏, 이마의 금색 보석, 둥근
 * 귀 장치, 금테 두른 큰 어깨 보호대와 등 뒤 흰 지느러미, 큼직한 건틀릿과
 * 장화. 공격할 땐 주먹 끝에서 은색 못 총이 나온다. (원본 삽화 12_08_50 기준)
 */
(() => {
  const PAL = {
    blue: ['#183690', '#2a5fd2', '#6ea4f6', '#0c1f5c'],
    blueDk: ['#122c7c', '#2250b8', '#4c82dc', '#0a1b52'],
    white: ['#8f9bb6', '#dfe5f0', '#ffffff', '#5e6884'],
    skin: ['#c46a3a', '#eea066', '#ffd2a3', '#93461f'],
    gold: ['#a5650f', '#e8a52a', '#ffe08a', '#6e3e06'],
    silver: ['#76819b', '#cad2e0', '#ffffff', '#4c556c'],
  };
  const LINE = '#0b1030';
  const GOLD = '#e8a52a';
  const L = { up: 4.4, fore: 5.6, thigh: 6.6, shin: 6.6, ankle: 5.4 };

  function build(pose, k) {
    const { mat, pt, world, ellipse, rpoly, capsule, ik } = k;
    const parts = [];
    const add = (group, local, m, pal, extra = {}) =>
      parts.push({ group, path: world(local, m), pal, m, ...extra });
    const stroke = (g, m, pts, color, w) => {
      g.save();
      g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      const p = new Path2D();
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      g.stroke(world(p, m));
      g.restore();
    };
    const fillIn = (g, m, local, color) => { g.fillStyle = color; g.fill(world(local, m)); };

    // ---- 뼈대
    const [px, py] = pose.pelvis;
    const lift = pose.lift ?? 0;
    const T = mat(px, py + lift, pose.torso);
    const neck = pt(T, 0.8, -13);
    const H = mat(neck[0], neck[1], pose.torso + pose.head);
    const shF = pt(T, 8.6, -8.4);
    const shB = pt(T, -8.0, -8.8);
    const arm = (sh, a) => {
      const U = mat(sh[0], sh[1], a[0]);
      const el = pt(U, 0, L.up);
      const F = mat(el[0], el[1], a[0] + a[1]);
      return { U, F, fist: pt(F, 0, L.fore + 0.4) };
    };
    const aF = arm(shF, pose.armF);
    const aB = arm(shB, pose.armB);
    const leg = (hx, foot) => {
      const hip = [px + hx, py];
      const s = ik(hip[0], hip[1], foot[0], foot[1], L.thigh, L.shin, 1);
      return {
        Th: mat(hip[0], hip[1], s.a1),
        Sh: mat(s.knee[0], s.knee[1], s.a2),
        Ft: mat(s.end[0], s.end[1], foot[2] ?? 0),
      };
    };
    const lF = leg(4.6, pose.footF);
    const lB = leg(-4.6, pose.footB);

    // ---- 파츠 모양
    const thigh = capsule(L.thigh, 6.6, 6.4);
    const shin = capsule(L.shin, 7.4, 8.2);
    const boot = rpoly([[-4.4, -2.6], [3.2, -3.0], [4.6, 0.4], [8.8, 2.4], [9.0, 5.6], [-5.0, 5.6], [-5.2, 0.6]], 1.8);
    const upper = capsule(L.up, 4.6, 4.4);
    const fore = capsule(L.fore, 7.2, 7.8);
    const fist = ellipse(0, L.fore + 0.8, 4.0, 3.8);
    const pad = ellipse(0.2, 0.6, 6.0, 5.2);

    const legParts = (g, l, dk) => {
      add(g, thigh, l.Th, PAL.blueDk, { sh: 2.6 });
      add(g, shin, l.Sh, PAL.blue, { sh: 3.0,
        details: (c) => stroke(c, l.Sh, [[-3.6, 1.4], [3.6, 1.4]], GOLD, 1.1),
      });
      add(g, boot, l.Ft, PAL.blue, { sh: 3.0,
        details: (c) => {
          stroke(c, l.Ft, [[-4.2, 1.6], [3.4, 1.0]], GOLD, 1.0);
          fillIn(c, l.Ft, ellipse(6.4, 3.0, 1.3, 0.8, -15), '#d8e6ff');
        },
      });
    };
    const armParts = (g, a, front) => {
      add(g, upper, a.U, PAL.blueDk, { sh: 2.0 });
      add(g, fore, a.F, PAL.blue, { sh: 2.8,
        details: (c) => stroke(c, a.F, [[-3.4, 1.2], [3.4, 1.2]], GOLD, 1.1),
      });
      if (front && pose.gun) {
        const G = a.F;
        const r = pose.recoil ?? 0;
        add(g, rpoly([[-2.6, L.fore - 1 - r], [2.6, L.fore - 1 - r], [2.4, L.fore + 4 - r], [-2.4, L.fore + 4 - r]], 0.8), G, PAL.blue);
        add(g + 'gun', rpoly([[-1.05, L.fore + 3.6 - r], [1.05, L.fore + 3.6 - r], [1.05, L.fore + 14 - r], [-1.05, L.fore + 14 - r]], 0.4), G, PAL.silver, { sh: 0.9, hl: 0.6 });
        add(g + 'gun', rpoly([[-2.6, L.fore + 13.6 - r], [2.6, L.fore + 13.6 - r], [2.6, L.fore + 15.2 - r], [-2.6, L.fore + 15.2 - r]], 0.5), G, PAL.silver, { sh: 0.8, hl: 0.5 });
      }
      add(g, fist, a.F, PAL.blue, { sh: 2.8,
        glint: true,
        details: (c) => stroke(c, a.F, [[-1.6, L.fore + 2.2], [1.6, L.fore + 2.2]], '#173a9a', 0.7),
      });
    };

    // ---- 그리는 순서: 뒤팔 → 뒤 어깨 → 뒷다리 → 지느러미·몸통 → 앞다리 → 머리 → 앞팔 → 앞 어깨
    armParts('armB', aB, false);
    add('armB', pad, mat(shB[0], shB[1], pose.torso), PAL.blueDk, { sh: 3.4 });
    legParts('legB', lB, true);

    add('fin', rpoly([[-7.5, -11.4], [-17, -14.4], [-12.4, -10.2], [-17.6, -9.2], [-9.2, -7]], [0.6, 0.4, 0.6, 0.4, 0.6]), T, PAL.white, { sh: 1.1, hl: 0.7 });
    add('torso', rpoly([[-8.6, -13], [9.2, -13], [8.2, -4], [6.6, 1.2], [-6.8, 1.2], [-8, -4]], 3), T, PAL.blue, { sh: 4.2,
      details: (c) => {
        stroke(c, T, [[-7.2, -11.6], [1, -6.2], [8.4, -11.6]], GOLD, 1.1);
        fillIn(c, T, rpoly([[-8, -2.4], [8, -2.4], [7.6, 0], [-7.6, 0]], 0.3), '#16348e');
        fillIn(c, T, rpoly([[-0.6, -2.8], [2.6, -2.8], [2.6, 0.4], [-0.6, 0.4]], 0.6), GOLD);
      },
    });

    legParts('legF', lF, false);

    armParts('armF', aF, true);
    add('armF', pad, mat(shF[0], shF[1], pose.torso), PAL.blue, { sh: 3.6,
      details: (c) => {
        const P = mat(shF[0], shF[1], pose.torso);
        stroke(c, P, [[-4.4, 2.6], [0.2, 4.4], [4.6, 2.6]], GOLD, 1.0);
        fillIn(c, P, ellipse(-2.0, -2.2, 1.8, 1.1, -30), '#b8d8ff');
      },
    });

    // 머리: 볏 → 투구 → (투구 안에) 얼굴·눈·귀·보석
    add('head', rpoly([[5, -16.5], [7.4, -21.8], [2.6, -18.2], [2, -23.6], [-1.4, -18.8], [-4, -23.4], [-5.4, -17.8], [-10, -21.6], [-8.2, -15.6], [-13.8, -16.8], [-9.6, -12.4], [-14.2, -10.8], [-8.6, -8], [0, -12]], [0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 1, 1]), H, PAL.white, { sh: 1.2, hl: 0.8 });
    const helmet = ellipse(1.0, -8.8, 11.0, 10.3);
    add('head', helmet, H, PAL.blue, { sh: 4.4,
      details: (c) => {
        const face = rpoly([[0.2, -9.6], [12.2, -9.6], [12.2, 2.2], [2.4, 2.2], [-1.0, -3.6]], 2.8);
        k.shade(c, world(face, H), PAL.skin, 1.5, 0.8);
        // 이마 챙
        stroke(c, H, [[-1.4, -9.8], [11.6, -9.8]], '#173a9a', 1.2);
        // 눈
        fillIn(c, H, ellipse(5.8, -4.8, 2.1, 2.8), '#ffffff');
        fillIn(c, H, ellipse(6.6, -4.4, 1.3, 2.1), '#2a1a12');
        fillIn(c, H, ellipse(6.9, -5.7, 0.55, 0.6), '#ffffff');
        stroke(c, H, [[3.8, -8.2], [8.2, -8.4]], '#5a2a14', 0.9);
        stroke(c, H, [[8.2, 0.2], [10.0, 0.0]], '#8a3a1c', 0.8);
        // 귀 장치
        k.shade(c, world(ellipse(-5.6, -5.4, 3.3, 3.3), H), PAL.blue, 1.1, 0.7);
        stroke(c, H, [[-5.6, -6.6], [-5.6, -4.2]], '#173a9a', 0.9);
        // 보석
        k.shade(c, world(ellipse(5.4, -14.6, 1.9, 1.8), H), PAL.gold, 0.8, 0.5);
        fillIn(c, H, ellipse(-3.4, -14.2, 2.6, 1.5, -35), '#b8d8ff');
      },
    });

    // 총구 = 못 머리 끝(총을 들었으면), 아니면 주먹 앞
    const muzzle = pose.gun ? pt(aF.F, 0, L.fore + 15.4 - (pose.recoil ?? 0)) : aF.fist;
    return { parts, muzzle };
  }

  // ---------------------------------------------------------------- 자세
  const A = L.ankle;
  const base = () => ({
    pelvis: [0, -17], torso: 0, head: 0, lift: 0,
    armF: [-8, -100], armB: [48, -64],
    footF: [10.6, -A, 0], footB: [-10, -A, 0],
    gun: false, recoil: 0,
  });

  const idle = [base(), { ...base(), lift: -1 }];

  /** 달리기 한 바퀴(8칸) — 발은 땅에 있는 동안 몸 뒤로 미끄러지고, 떠 있는
      동안 둥글게 앞으로 넘어온다. 몸은 디딜 때 낮고 넘어갈 때 높다 */
  const STRIDE = 6.6;
  const footAt = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 0.5) {
      const u = t / 0.5;
      return [STRIDE - 2 * STRIDE * u, -A, 0];
    }
    const u = (t - 0.5) / 0.5;
    const x = -STRIDE + 2 * STRIDE * (0.5 - 0.5 * Math.cos(Math.PI * u));
    return [x, -A - 4.2 * Math.sin(Math.PI * u), -14 * Math.sin(Math.PI * u)];
  };
  const runPose = (t, aim) => {
    const p = base();
    const bob = Math.cos(4 * Math.PI * t);
    p.pelvis = [1, -15.8 + 0.6 * bob];
    p.torso = 8;
    p.head = -5;
    p.footF = footAt(t);
    p.footB = footAt(t + 0.5);
    const sw = Math.sin(2 * Math.PI * t);
    p.armB = [30 * sw + 10, -95];
    if (aim) {
      p.armF = [-92, -4];
      p.gun = true;
    } else {
      p.armF = [-30 * sw - 15, -95];
    }
    return p;
  };
  const walk = Array.from({ length: 8 }, (_, i) => runPose(i / 8, false));
  const runAttack = Array.from({ length: 8 }, (_, i) => runPose(i / 8, true));

  const dash = [{
    ...base(), pelvis: [0, -13.6], torso: 22, head: -14,
    footF: [9, -A + 1, -8], footB: [-10, -A + 1.5, 20],
    armF: [40, -40], armB: [55, -30],
  }];

  const aimP = (extra) => ({ ...base(), armF: [-88, -2], gun: true, ...extra });
  const attack = [
    base(), base(),
    { ...base(), armF: [-62, -62] },
    aimP({}),
    aimP({ recoil: 1.6, torso: -3, head: 2 }),
    aimP({ recoil: 1.6, torso: -3, head: 2 }),
    aimP({ recoil: 0.6, torso: -1 }),
    aimP({}),
    base(),
  ];

  const hurt = [{
    ...base(), pelvis: [-1, -15.6], torso: -16, head: -10,
    footF: [6, -A, -6], footB: [-6, -A, 6],
    armF: [-140, -30], armB: [150, -20],
  }];
  const down = [{
    ...base(), pelvis: [-4, -8], torso: -72, head: -8,
    footF: [11, -A + 1.5, 0], footB: [9, -A + 1.2, 0],
    armF: [-150, -10], armB: [170, -10],
  }];

  window.CHAR = {
    id: 'nail',
    canvas: { w: 96, h: 64 },
    build,
    anims: {
      idle: { frames: idle, ms: 450, loop: true },
      walk: { frames: walk, ms: 50, loop: true },
      dash: { frames: dash, ms: 70, loop: true },
      attack_main: { frames: attack, ms: 40, loop: false },
      run_attack: { frames: runAttack, ms: 50, loop: true },
      hurt: { frames: hurt, ms: 340, loop: false },
      down: { frames: down, ms: 200, loop: false },
    },
  };
})();
