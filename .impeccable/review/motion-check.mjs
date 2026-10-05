import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const state = () => p.evaluate(() => ({ exiting: document.querySelectorAll('.task[data-exiting]').length, roll: document.querySelectorAll('.rolling-value.roll-down').length, hero: document.querySelector('.hero-number')?.textContent, featured: document.querySelector('.featured-title')?.textContent, nav: document.querySelector('.nav-count-urgent')?.textContent }));
async function watch(label) { const t0 = Date.now(); let exit, roll, last; while (Date.now() - t0 < 1200) { last = await state(); if (last.exiting && exit === undefined) exit = Date.now() - t0; if (last.roll && roll === undefined) roll = Date.now() - t0; await p.waitForTimeout(30); } console.log(label, '| salida de fila:', exit ?? 'no', 'ms | número rodando:', roll ?? 'no', 'ms | ahora:', JSON.stringify(last)); }
await p.goto('http://127.0.0.1:4173'); await p.getByRole('button', { name: 'Responsable de Software', exact: true }).click(); await p.locator('.hero-number').waitFor();
console.log('inicio', JSON.stringify(await state()));
await p.locator('.featured .button').click();
let d = p.getByRole('dialog'); await d.getByRole('slider').first().focus(); await p.keyboard.press('8'); await d.getByRole('button', { name: 'Guardar evaluación' }).click();
await watch('1) evaluar');
await p.locator('.task-list .task').filter({ hasText: 'Sin actividad asignada' }).getByRole('button', { name: 'Asignar' }).click();
d = p.getByRole('dialog'); await d.getByRole('textbox', { name: 'Nombre de la actividad', exact: true }).fill('Prueba de movimiento'); await d.getByLabel('Qué debe hacer y entregar').fill('Entregar un prototipo.'); await d.getByLabel('Frontend', { exact: true }).check(); await d.getByRole('button', { name: 'Asignar actividad' }).click();
await watch('2) asignar');
await b.close();
