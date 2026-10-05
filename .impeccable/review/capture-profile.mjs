import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5173'; const out = '.impeccable/review';
const b = await chromium.launch();
async function run(viewport, prefix) {
  const ctx = await b.newContext({ viewport, reducedMotion: 'reduce', locale: 'es-MX', timezoneId: 'America/Mexico_City' }); const p = await ctx.newPage();
  await p.goto(base); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
  const shot = async (name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${prefix}-${name}.png`, fullPage: full }); console.log('ok', prefix, name); };
  await p.goto(`${base}/#students`); await p.locator('.student-name').filter({ hasText: 'Sofía' }).first().click(); await p.locator('.drawer').waitFor();
  await shot('profile');
  await p.locator('.drawer-body').evaluate(el => el.scrollTo(0, 420)); await shot('profile-scroll');
  await p.getByRole('tab', { name: /Habilidades/ }).click(); await shot('profile-skills');
  await p.keyboard.press('Escape');
  if (prefix === 'desktop') {
    await p.goto(`${base}/#assignments`); await p.getByRole('radio', { name: 'Tablero por estado' }).click(); await shot('board');
    await p.goto(`${base}/#talent`); const boxes = p.locator('.talent-compare input'); await boxes.nth(0).check(); await boxes.nth(1).check(); await boxes.nth(2).check();
    await p.getByRole('button', { name: /^Comparar/ }).click(); await p.getByRole('dialog').waitFor(); await shot('compare');
    await p.keyboard.press('Escape');
    await p.goto(`${base}/#reports`); await shot('reports', true);
  }
  await ctx.close();
}
await run({ width: 1440, height: 900 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await b.close();
