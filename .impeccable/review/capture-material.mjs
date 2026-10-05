import { chromium } from '@playwright/test';
// Solo contra el servidor aislado de pruebas.
const base = 'http://127.0.0.1:4173'; const out = '.impeccable/review';
const b = await chromium.launch();
for (const [viewport, prefix] of [[{ width: 1440, height: 1000 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
  const p = await (await b.newContext({ viewport, reducedMotion: 'reduce' })).newPage();
  await p.goto(base); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
  if (prefix === 'mobile') { await p.getByRole('button', { name: 'Abrir menú' }).click(); }
  await p.getByRole('button', { name: 'Asignar actividad', exact: true }).first().click(); const d = p.getByRole('dialog').last(); await d.waitFor();
  const link = d.getByLabel('Enlace del material');
  await link.fill('https://drive.google.com/drive/folders/abc'); await link.press('Enter');
  await link.fill('a.com'); await link.press('Enter');
  await d.getByLabel('Elegir documentos').setInputFiles([{ name: 'guia-de-la-practica.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') }, { name: 'rubrica.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 r') }]);
  await d.locator('.material-list').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${prefix}-assign-material-list.png` });
  console.log(prefix, 'elementos en la lista:', await d.locator('.material-list li').count(), '| nombres:', (await d.locator('.material-list .material-title').allInnerTexts()).join(' / '));
  await p.close();
}
await b.close();
