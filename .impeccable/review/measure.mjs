import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://127.0.0.1:5173'); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('.page-header').waitFor();
for (const h of ['assignments', 'students']) {
  await p.goto(`http://127.0.0.1:5173/#${h}`); await p.locator('.table-cards tbody tr').first().waitFor();
  const r = await p.evaluate(() => { const tr = document.querySelector('.table-cards tbody tr'); return { rowHeight: Math.round(tr.getBoundingClientRect().height), tdPadding: getComputedStyle(tr.querySelector('td')).paddingTop, sw: document.documentElement.scrollWidth }; });
  console.log(h, JSON.stringify(r));
}
await b.close();
