const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-rockmanrpg/b785a239-ce32-5456-9633-70a291c0cd55/scratchpad';
const PREF = ['spread','arc','rapid','power','metal_blade','rolling_shield','crash_bomber',
              'homing_torpedo','storm_tornado','triad_thunder','pierce','velo','armor','legs','magnet'];
const IDX = Number(process.argv[2] ?? 6);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 560, height: 980 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: '+e.message));
  await page.goto('http://localhost:4325/rockmanrpg/?horde', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  for (let i = 0; i < IDX; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(600);
  const keys = ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'];
  const want = [30, 60, 100, 150];
  let idx = 0, ki = 0;
  const t0 = Date.now();
  while (idx < want.length && Date.now()-t0 < 300000) {
    const pick = await page.evaluate(()=>window.__hordePick);
    if (pick) {
      let best = 0, rank = 99;
      pick.forEach((id,i)=>{const r=PREF.indexOf(id); if(r>=0&&r<rank){rank=r;best=i;}});
      const cur = await page.evaluate(()=>window.__hordePickIndex);
      for (let q=0;q<(best-cur+pick.length)%pick.length;q++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('KeyZ');
      continue;
    }
    const k = keys[Math.floor(ki/2)%keys.length];
    await page.keyboard.down(k); await page.waitForTimeout(380); await page.keyboard.up(k); ki++;
    const t = await page.evaluate(()=>window.__hordeTime ?? 0);
    if (t >= want[idx]) {
      await page.screenshot({ path: `${OUT}/b2_${want[idx]}s.png` });
      const s = await page.evaluate(()=>window.__hordeStat);
      console.log(`t=${t.toFixed(0)}s lv=${s.lv} kills=${s.kills} hp=${s.hp} foes=${s.foes} fps=${s.fps} wep=${s.wep}`);
      idx++;
    }
    if (await page.evaluate(()=>window.__hordeDead===true)) {
      const s = await page.evaluate(()=>window.__hordeStat);
      console.log(`DIED t=${t.toFixed(0)}s lv=${s.lv} kills=${s.kills}`);
      break;
    }
  }
  console.log('errors:', errs.length ? errs.slice(0,3) : 'none');
  await browser.close();
})();
