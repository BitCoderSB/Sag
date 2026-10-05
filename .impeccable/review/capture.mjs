// Capturas para la revisión final. Uso: node .impeccable/review/capture.mjs (requiere `npm run dev` activo).
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const out = '.impeccable/review';
const browser = await chromium.launch();

async function session(viewport, role) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
  if (role === 'login') return { context, page };
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.locator('main h1').first().waitFor();
  return { context, page };
}
async function shot(page, name, full = true) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('ok', name);
}
async function go(page, hash) { await page.goto(`${base}/#${hash}`); await page.locator('main h1').first().waitFor(); }

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

{ const { context, page } = await session(desktop, 'login'); await shot(page, 'desktop-login'); await context.close(); }
{
  const { context, page } = await session(desktop, 'Responsable de Software');
  await shot(page, 'desktop');
  for (const hash of ['agenda', 'students', 'assignments', 'talent', 'reports', 'settings']) { await go(page, hash); await shot(page, `desktop-${hash}`); }
  await go(page, 'talent'); await page.locator('.skill-picker button').nth(3).click(); await shot(page, 'desktop-talent-ranked');
  await go(page, 'students'); await page.locator('.student-name').first().click(); await page.locator('.drawer').waitFor(); await shot(page, 'desktop-student-drawer', false);
  await page.locator('.drawer .item').first().click(); await page.locator('.assignment-profile-head').waitFor(); await shot(page, 'desktop-assignment-drawer', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Asignar actividad', exact: true }).first().click(); await page.getByRole('dialog').waitFor(); await shot(page, 'desktop-assign-form', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Acciones para/ }).first().click(); await page.getByRole('menuitem', { name: 'Programar revisión' }).click(); await page.getByRole('dialog').waitFor(); await shot(page, 'desktop-review-form', false);
  await context.close();
}
{
  const { context, page } = await session(desktop, 'Jefe (solo lectura)');
  await shot(page, 'desktop-director');
  await context.close();
}
{
  const { context, page } = await session(mobile, 'Responsable de Software');
  await shot(page, 'mobile');
  for (const hash of ['agenda', 'students', 'assignments']) { await go(page, hash); await shot(page, `mobile-${hash}`); }
  await page.getByRole('button', { name: 'Abrir menú' }).click(); await page.waitForTimeout(300); await shot(page, 'mobile-menu', false);
  await context.close();
}
await browser.close();
