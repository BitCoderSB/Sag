import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://127.0.0.1:5173'); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
console.log('destacada:', await p.locator('.featured-title').innerText().catch(() => 'ninguna'), '| botón:', await p.locator('.featured .button').innerText().catch(() => 'ninguno'));
await p.locator('.featured .button').click(); await p.waitForTimeout(800);
console.log('diálogos:', await p.getByRole('dialog').count(), '| título:', await p.locator('.dialog h2').innerText().catch(() => 'sin diálogo'), '| barras:', await p.locator('.rating-bar').count());
console.log('errores:', JSON.stringify(errors.slice(0, 5)));
await b.close();
