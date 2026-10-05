import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
await p.goto('http://127.0.0.1:5173'); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
await p.goto('http://127.0.0.1:5173/#students'); await p.locator('.student-name').filter({ hasText: 'Sofía' }).first().click(); await p.locator('.radar').first().waitFor(); await p.waitForTimeout(900);
const r = await p.evaluate(() => { const body = document.querySelector('.drawer-body').getBoundingClientRect(); const labels = [...document.querySelectorAll('.radar-label')].map(t => { const b = t.getBoundingClientRect(); return { text: t.textContent, left: Math.round(b.left), right: Math.round(b.right) }; }); const actions = [...document.querySelectorAll('.drawer-actions > *')].map(e => Math.round(e.getBoundingClientRect().top)); return { panel: [Math.round(body.left), Math.round(body.right)], outside: labels.filter(l => l.left < body.left || l.right > body.right), actionsRows: new Set(actions).size }; });
console.log(JSON.stringify(r));
await b.close();
