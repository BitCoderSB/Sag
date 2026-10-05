import { chromium } from '@playwright/test';
// Solo contra el servidor aislado de pruebas: crea una habilidad en su base temporal.
const base = 'http://127.0.0.1:4173'; const out = '.impeccable/review';
const b = await chromium.launch();
for (const [viewport, prefix] of [[{ width: 1440, height: 1000 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
  const p = await (await b.newContext({ viewport, reducedMotion: 'reduce' })).newPage();
  await p.goto(base); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('main h1').first().waitFor();
  if (prefix === 'mobile') { await p.getByRole('button', { name: 'Abrir menú' }).click(); }
  await p.getByRole('button', { name: 'Asignar actividad', exact: true }).first().click(); const d = p.getByRole('dialog').last(); await d.waitFor();
  await d.getByLabel('Alumno').selectOption({ index: 1 });
  await d.getByRole('textbox', { name: 'Nombre de la actividad', exact: true }).fill('Prototipo de inventario');
  await d.getByLabel('Qué debe hacer y entregar').fill('Diseñar y presentar el prototipo.');
  await d.getByLabel('Frontend', { exact: true }).check();
  await d.getByRole('button', { name: 'Nueva habilidad', exact: true }).click();
  await d.getByLabel('Nombre de la habilidad').fill(`Trabajo en equipo ${prefix}`);
  await d.getByRole('button', { name: 'Asignar actividad', exact: true }).click();
  await d.locator('.add-skill-error').waitFor(); await d.locator('.add-skill-new').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${prefix}-assign-new-skill-open.png` });
  await d.getByLabel('Qué debe demostrar').fill('Coordina tareas y comunica avances');
  await d.getByRole('button', { name: 'Crear y añadir', exact: true }).click();
  await d.getByLabel(`Trabajo en equipo ${prefix}`, { exact: true }).waitFor(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${prefix}-assign-new-skill-done.png` });
  console.log(prefix, '| marcada:', await d.getByLabel(`Trabajo en equipo ${prefix}`, { exact: true }).isChecked(), '| con foco:', await d.getByLabel(`Trabajo en equipo ${prefix}`, { exact: true }).evaluate(el => el === document.activeElement), '| caja abierta:', await d.locator('.add-skill-new').count());
  await p.close();
}
await b.close();
