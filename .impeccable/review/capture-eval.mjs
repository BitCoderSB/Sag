import { chromium } from '@playwright/test';
// Solo contra el servidor aislado de pruebas (memoria temporal): nunca contra los datos de demostración.
const base = 'http://127.0.0.1:4173'; const out = '.impeccable/review';
const b = await chromium.launch();
for (const [viewport, prefix] of [[{ width: 1440, height: 1000 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
  const p = await (await b.newContext({ viewport, reducedMotion: 'reduce' })).newPage();
  await p.goto(base); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
  await p.locator('.featured .button').click(); const d = p.getByRole('dialog'); await d.waitFor(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${prefix}-eval-empty.png` });
  const bars = d.locator('.rating-bar');
  // locator.click comprueba que el punto cae sobre la barra; si algo la tapa, falla en lugar de pulsarlo.
  const clickAt = async (i, ratio) => { const box = await bars.nth(i).boundingBox(); await bars.nth(i).click({ position: { x: box.width * ratio, y: box.height / 2 } }); };
  await clickAt(0, 0.8); await clickAt(1, 0.42); await clickAt(2, 0.97);
  const sliders = d.getByRole('slider');
  const values = [await sliders.nth(0).getAttribute('aria-valuenow'), await sliders.nth(1).getAttribute('aria-valuenow'), await sliders.nth(2).getAttribute('aria-valuenow')];
  // Arrastre: de 2 a 6 en la cuarta barra
  await bars.nth(3).scrollIntoViewIfNeeded(); await bars.nth(3).hover(); const box = await bars.nth(3).boundingBox(); await p.mouse.move(box.x + box.width * .2, box.y + 5); await p.mouse.down(); await p.mouse.move(box.x + box.width * .6, box.y + 5, { steps: 6 }); await p.mouse.up();
  const dragged = await sliders.nth(3).getAttribute('aria-valuenow');
  await sliders.nth(3).focus(); await p.keyboard.press('ArrowRight'); const afterArrow = await sliders.nth(3).getAttribute('aria-valuenow');
  await d.locator('.rate-row').nth(0).locator('.quick-notes button').first().click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${prefix}-eval-filled.png` });
  console.log(prefix, 'clic en 80%, 42%, 97% →', values.join(', '), '| arrastre 20%→60% →', dragged, '| flecha derecha →', afterArrow);
  await p.close();
}
await b.close();
