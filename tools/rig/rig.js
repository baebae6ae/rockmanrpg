/**
 * 뼈대 스프라이트 엔진 — 브라우저(Canvas2D)에서 돈다.
 *
 * 캐릭터를 파츠(머리·몸통·팔·다리·무기)별 벡터 도형으로 한 번만 그려 두고,
 * 자세(관절 각도·발 위치)만 바꿔 프레임을 뽑는다. 몸이 하나라 프레임마다
 * 비율이나 디테일이 달라질 수가 없다 — AI 가 칸마다 다시 그린 시트에서
 * 계속 문제였던 '튀는 프레임'이 원리적으로 안 생긴다.
 *
 * 좌표 단위는 게임 픽셀 1칸. 발바닥 가운데가 (0, 0), 위가 -y, 앞이 +x.
 * render() 는 S 배로 키운 컬러 층과 파츠 번호 층을 함께 돌려준다 — 줄이는
 * 일(블록 최빈색)과 외곽선은 bake.py 가 맡는다.
 */
(() => {
  const S = 8;

  const mat = (tx, ty, deg = 0) => new DOMMatrix().translate(tx, ty).rotate(deg);
  const pt = (m, x, y) => { const p = m.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };
  const world = (local, m) => { const p = new Path2D(); p.addPath(local, m); return p; };
  const shifted = (path, dx, dy) => world(path, new DOMMatrix().translate(dx, dy));

  // ---------------------------------------------------------------- 도형
  function ellipse(cx, cy, rx, ry, rot = 0) {
    const p = new Path2D();
    p.ellipse(cx, cy, rx, ry, rot * Math.PI / 180, 0, Math.PI * 2);
    return p;
  }
  /** 꼭짓점을 r 만큼 둥글린 다각형 */
  function rpoly(pts, r = 1) {
    const p = new Path2D();
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(pts[n - 1], pts[0]);
    p.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const m = mid(a, pts[(i + 1) % n]);
      p.arcTo(a[0], a[1], m[0], m[1], Array.isArray(r) ? r[i] : r);
    }
    p.closePath();
    return p;
  }
  /** (0,0)→(0,len) 방향으로 뻗은 팔다리 — 양끝 반지름 r0, r1 */
  function capsule(len, w0, w1 = w0) {
    const r0 = w0 / 2, r1 = w1 / 2;
    const p = new Path2D();
    p.moveTo(-r0, 0);
    p.arc(0, 0, r0, Math.PI, 0);
    p.lineTo(r1, len);
    p.arc(0, len, r1, 0, Math.PI);
    p.closePath();
    return p;
  }

  // ---------------------------------------------------------------- 음영
  /** 도트 음영 — 왼쪽 위 테두리는 밝게, 오른쪽 아래는 그늘. 빛 방향이 화면
      기준이라 팔다리가 어떻게 돌아가도 빛은 늘 같은 쪽에서 온다 */
  function shade(ctx, P, pal, sh = 2.4, hl = 1.0) {
    const [dark, base, light, deep] = pal;
    ctx.save();
    ctx.clip(P);
    ctx.fillStyle = light;
    ctx.fill(P);
    ctx.fillStyle = base;
    ctx.fill(shifted(P, hl, hl));
    const R = new Path2D();
    R.addPath(P);
    R.addPath(shifted(P, -sh, -sh));
    ctx.fillStyle = dark;
    ctx.fill(R, 'evenodd');
    if (deep) {
      // 그늘 안쪽 맨 가장자리에 한 단 더 어두운 띠
      const D = new Path2D();
      D.addPath(P);
      D.addPath(shifted(P, -sh * 0.45, -sh * 0.45));
      ctx.fillStyle = deep;
      ctx.fill(D, 'evenodd');
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 관절
  /** 두 마디 IK — 무릎(팔꿈치)이 bend 쪽(+1 이면 앞)으로 굽는다 */
  function ik(hx, hy, tx, ty, l1, l2, bend = 1) {
    let dx = tx - hx, dy = ty - hy;
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.001;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    const a = Math.atan2(dy, dx);
    const c = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const b = Math.acos(c);
    // 화면 좌표(y 아래)에서 앞(+x)으로 굽히려면 각도를 빼야 한다
    const k1 = a - b * bend, k2 = a + b * bend;
    const kneeA = [hx + l1 * Math.cos(k1), hy + l1 * Math.sin(k1)];
    const kneeB = [hx + l1 * Math.cos(k2), hy + l1 * Math.sin(k2)];
    const knee = (kneeA[0] >= kneeB[0]) === (bend > 0) ? kneeA : kneeB;
    const end = [hx + dx, hy + dy];
    // 팔다리 도형은 국소 +y 로 뻗으므로, 방향 벡터 각도에서 90°를 뺀다
    const rot = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI - 90;
    return { knee, end, a1: rot([hx, hy], knee), a2: rot(knee, end) };
  }

  // ---------------------------------------------------------------- 렌더
  /**
   * def.build(pose, kit) 가 그릴 파츠 목록(뒤→앞 순서)을 돌려준다.
   *   { group, path(월드), pal, sh?, hl?, details?(ctx), flat?(색) }
   * 같은 group 끼리는 사이에 선을 긋지 않는다(한 덩어리의 음영으로 본다).
   */
  function render(def, pose) {
    const { w: CW, h: CH } = def.canvas;
    const kit = { mat, pt, world, shifted, ellipse, rpoly, capsule, ik, shade };
    const out = def.build(pose, kit);
    const parts = out.parts;

    const mk = () => {
      const c = document.createElement('canvas');
      c.width = CW * S; c.height = CH * S;
      const g = c.getContext('2d');
      // 맨 아래 한 줄은 발바닥 밑 외곽선 자리로 비워 둔다
      g.setTransform(S, 0, 0, S, (CW / 2) * S, (CH - 1) * S);
      return [c, g];
    };
    const [cc, cg] = mk();
    const [ic, ig] = mk();
    const groups = [];
    parts.forEach((p, i) => {
      if (!groups.includes(p.group)) groups.push(p.group);
      if (p.flat) {
        cg.fillStyle = p.flat;
        cg.fill(p.path);
      } else {
        shade(cg, p.path, p.pal, p.sh, p.hl);
      }
      if (p.details) {
        cg.save();
        if (!p.noClip) cg.clip(p.path);
        p.details(cg);
        cg.restore();
      }
      // 파츠 번호 층: R=번호+1, G=그룹+1 — 그 픽셀이 어느 파츠에 속하는지
      ig.fillStyle = `rgb(${i + 1},${groups.indexOf(p.group) + 1},0)`;
      ig.fill(p.path);
    });
    return {
      color: cc.toDataURL('image/png'),
      ids: ic.toDataURL('image/png'),
      muzzle: out.muzzle,
      scale: S,
    };
  }

  window.Rig = { render, S };
})();
