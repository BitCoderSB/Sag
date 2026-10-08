import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
// Por defecto, el servidor de desarrollo. AUDIT_BASE=http://127.0.0.1:4173 audita el servidor aislado de pruebas.
const base = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const report = [];
async function audit(name) {
  // Se audita el estado final: las animaciones de entrada pasan por opacidades intermedias.
  await page.waitForTimeout(900);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary, data: n.any.map(c => c.data) })) }));
  report.push({ name, violations });
  console.log(name, results.violations.map(v => `${v.id}:${v.nodes.length}`).join(', ') || 'PASS');
}
await page.goto(base);
await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
await audit('login');
await page.getByRole('button', { name: 'Responsable de Software', exact: true }).click();
await page.getByRole('heading', { level: 1, name: /^(Software|Hardware|Investigación)$/ }).waitFor();
for (const route of ['today', 'board', 'board?v=day', 'board?v=people', 'board?v=thesis', 'board?v=bank', 'students', 'assignments', 'talent', 'reports', 'settings']) {
  await page.goto(`${base}/#${route}`);
  await page.locator('main h1').first().waitFor();
  await audit(route);
}
await page.goto(`${base}/#students`);
await page.getByRole('button', { name: 'Agregar alumno', exact: true }).click();
await audit('student-form');
await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
await page.locator('.student-name').first().click();
await audit('student-drawer');
await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
await page.goto(`${base}/#assignments`);
await page.locator('.activity-name').first().click();
await audit('assignment-drawer');
await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
await audit('create-menu');
await page.getByRole('menuitem', { name: /^Actividad/ }).click();
await audit('assignment-form');
// Solo abre la caja de habilidad nueva; no crea nada.
await page.getByRole('button', { name: 'Nueva habilidad', exact: true }).click();
await audit('assignment-form-new-skill');
await page.keyboard.press('Escape');
await page.goto(`${base}/#today`);
// Los pendientes van agrupados y a la vista: se usa la acción del grupo «Por evaluar».
await page.locator('.tg-action', { hasText: /^Evaluar$/ }).first().click();
await page.getByRole('slider').first().focus(); await page.keyboard.press('8');
await audit('evaluation-form');
await page.keyboard.press('Escape');
await page.goto(`${base}/#today`);
await page.locator('.roster .student-action.action-progress').first().click();
await audit('progress-form');
await page.keyboard.press('Escape');
await page.goto(`${base}/#students?v=timeline`);
await page.locator('.gantt').waitFor();
await audit('students-timeline');
await page.goto(`${base}/#students`);
await page.locator('.student-name').first().click();
await page.getByRole('tab', { name: 'Plan' }).click();
await audit('student-plan');
// El jefe: panorama de las tres áreas y el tablero de una en solo lectura.
const director = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })).newPage();
await director.goto(base);
await director.getByRole('button', { name: 'Jefe (solo lectura)', exact: true }).click();
await director.getByRole('heading', { level: 1, name: 'Panorama del laboratorio' }).waitFor();
const auditOn = async (p, name) => { await p.waitForTimeout(900); const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); report.push({ name, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary, data: n.any.map(c => c.data) })) })) }); console.log(name, r.violations.map(v => `${v.id}:${v.nodes.length}`).join(', ') || 'PASS'); };
await auditOn(director, 'director-overview');
await director.locator('.overview .today-head').getByRole('button', { name: 'Agendar reunión' }).click();
await auditOn(director, 'meeting-form');
await director.keyboard.press('Escape');
await director.getByRole('radio', { name: 'Software' }).click();
await auditOn(director, 'director-area');
writeFileSync('docs/accessibility-audit.json', JSON.stringify(report, null, 2));
console.log('Contrast colors', [...new Set(report.flatMap(r => r.violations.filter(v => v.id === 'color-contrast').flatMap(v => v.nodes.flatMap(n => n.data.map(d => d?.fgColor).filter(Boolean)))))].join(','));
await browser.close();
