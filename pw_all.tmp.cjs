const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-rockmanrpg/b785a239-ce32-5456-9633-70a291c0cd55/scratchpad';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 560, height: 980 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: '+e.message));
  await page.goto('http://localhost:4325/rockmanrpg/?horde', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(6000);
  for (let i = 0; i < 4; i++) {
    const id = await page.evaluate(()=>window.__hordeTheme);
    await page.screenshot({ path: `${OUT}/all_${i}_${id}.png` });
    console.log('theme', i, id);
    await page.evaluate(()=>window.__hordeNextStage());
    await page.waitForTimeout(2500);
  }
  console.log('errors:', errs.length ? errs.slice(0,3) : 'none');
  await browser.close();
})();
