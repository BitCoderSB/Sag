import { test, expect, type Page } from '@playwright/test';

const runId = Date.now().toString().slice(-8);
async function login(page: Page, role = 'Software') {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'director' ? 'Jefe (solo lectura)' : `Responsable de ${role}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: role === 'director' ? 'Panorama del laboratorio' : /^(Software|Hardware|Investigación)$/ })).toBeVisible();
}
test('end-to-end: unique student, assignment, delivery, evaluation, persistence and talent', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page);
  await page.goto('/#students');
  await page.getByRole('button', { name: 'Agregar alumno', exact: true }).click();
  await page.getByLabel('Nombre completo').fill(`Lucía Prueba ${runId}`);
  await page.getByRole('textbox', { name: 'Matrícula', exact: true }).fill(`E2E-${runId}`);
  await page.getByLabel('Correo electrónico', { exact: true }).fill('lucia.prueba@example.test');
  await page.getByLabel('Carrera', { exact: true }).fill('Ingeniería en Computación');
  await page.getByLabel('Semestre', { exact: true }).fill('6');
  await page.getByLabel('Tecnologías', { exact: true }).fill('TypeScript, React');
  await page.getByRole('button', { name: 'Registrar alumno', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Buscar alumnos', { exact: true }).fill(`E2E-${runId}`);
  await page.locator('.student-name').click();
  await expect(page.locator('.student-profile-head')).toContainText(`Lucía Prueba ${runId}`);
  await page.getByRole('button', { name: /Asignar actividad|Nueva actividad/ }).first().click();
  const assignmentDialog = page.getByRole('dialog').last();
  await assignmentDialog.getByRole('textbox', { name: 'Nombre de la actividad', exact: true }).fill(`Interfaz de pruebas ${runId}`);
  await assignmentDialog.getByLabel('Qué debe hacer y entregar').fill('Construir una interfaz accesible y presentar un prototipo funcional con documentación.');
  await assignmentDialog.getByLabel('Enlace del material').fill('https://drive.google.com/drive/folders/e2e-carpeta');
  await assignmentDialog.getByLabel('Enlace del material').press('Enter');
  await assignmentDialog.getByLabel('Elegir documentos').setInputFiles([{ name: 'guia-practica.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 guía de prueba') }, { name: 'rubrica.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 rúbrica') }]);
  await expect(assignmentDialog.locator('.material-list li')).toHaveCount(3);
  // Un enlace escrito sin pulsar «Añadir» también se guarda.
  await assignmentDialog.getByLabel('Enlace del material').fill('github.com/laboratorio/practica');
  await assignmentDialog.getByLabel('Frontend', { exact: true }).check();
  await assignmentDialog.getByLabel('Backend', { exact: true }).check();
  await assignmentDialog.getByLabel('Documentación', { exact: true }).check();
  // Una habilidad nueva se crea sin salir del formulario y queda marcada; a medio crear, no se pierde en silencio.
  await assignmentDialog.getByRole('button', { name: 'Nueva habilidad', exact: true }).click();
  await assignmentDialog.getByLabel('Nombre de la habilidad').fill(`Comunicación oral ${runId}`);
  await assignmentDialog.getByRole('button', { name: /Asignar actividad|Crear actividad|Guardar actividad/ }).click();
  await expect(assignmentDialog.locator('.add-skill-error')).toContainText('Crear y añadir');
  await assignmentDialog.getByLabel('Qué debe demostrar').fill('Explica su trabajo con claridad ante el equipo.');
  await assignmentDialog.getByLabel('Qué debe demostrar').press('Enter');
  await expect(assignmentDialog.getByLabel(`Comunicación oral ${runId}`, { exact: true })).toBeChecked();
  await expect(assignmentDialog.getByLabel(`Comunicación oral ${runId}`, { exact: true })).toBeFocused();
  await assignmentDialog.getByRole('button', { name: /Asignar actividad|Crear actividad|Guardar actividad/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
  await page.goto('/#assignments');
  await page.getByLabel('Buscar actividades', { exact: true }).fill(`Interfaz de pruebas ${runId}`);
  await page.locator('.activity-name').click();
  await expect(page.locator('.files')).toContainText('Carpeta de Drive');
  await expect(page.locator('.files')).toContainText('guia-practica.pdf');
  await expect(page.locator('.files')).toContainText('rubrica.pdf');
  await expect(page.locator('.files')).toContainText('Repositorio de GitHub');
  // Un solo camino: «Registrar avance» abre el registro; la entrega final puede pasar directo a la evaluación.
  await page.getByRole('button', { name: 'Registrar avance', exact: true }).first().click();
  const deliveryDialog = page.getByRole('dialog').last();
  await deliveryDialog.getByText('Entrega final', { exact: true }).click();
  await deliveryDialog.getByLabel('Qué presentó el alumno').fill('Prototipo funcional revisado, con una demostración en el laboratorio.');
  await expect(deliveryDialog.getByLabel('Evaluar ahora, al guardar')).toBeChecked();
  await deliveryDialog.getByRole('button', { name: 'Registrar y evaluar', exact: true }).click();
  const evaluationDialog = page.getByRole('dialog', { name: 'Evaluar actividad' });
  await expect(evaluationDialog).toBeVisible();
  await expect(evaluationDialog.getByRole('slider')).toHaveCount(4);
  await expect(evaluationDialog.getByRole('slider', { name: `Calificación de Comunicación oral ${runId}` })).toHaveAttribute('aria-valuetext', /Sin/);
  // Explicit zero must be preserved; the final empty skill must remain null.
  await evaluationDialog.getByRole('slider', { name: 'Calificación de Frontend' }).focus(); await page.keyboard.press('9');
  await evaluationDialog.getByRole('slider', { name: 'Calificación de Backend' }).focus(); await page.keyboard.press('0');
  await expect(evaluationDialog.getByRole('slider', { name: 'Calificación de Backend' })).toHaveAttribute('aria-valuenow', '0');
  await evaluationDialog.getByLabel('Retroalimentación').fill('Interfaz bien lograda; Backend observado con dificultades. Documentación no evaluada.');
  await evaluationDialog.getByRole('button', { name: /Guardar evaluación|Finalizar evaluación/ }).click();
  // Era su única actividad: la app propone de inmediato asignarle la siguiente («¿Qué sigue?»), con el alumno ya elegido.
  const nextDialog = page.getByRole('dialog', { name: 'Asignar actividad' });
  await expect(nextDialog).toBeVisible();
  await expect(nextDialog.locator(".locked-value")).toContainText(`Lucía Prueba ${runId}`);
  await nextDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.ad-situation')).toContainText('Terminada');
  await page.getByRole('tab', { name: /Evaluaciones/ }).click();
  await expect(page.locator('.evaluation-scores')).toContainText('Sin evaluar');
  await expect(page.locator('.evaluation-scores')).toContainText('0');
  await page.reload();
  await page.getByLabel('Buscar actividades', { exact: true }).fill(`Interfaz de pruebas ${runId}`);
  await page.locator('.activity-name').click();
  await expect(page.locator('.ad-situation')).toContainText('Terminada');
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
  await page.goto('/#talent');
  await page.getByLabel('Buscar talento por nombre o tecnología').fill(`Lucía Prueba ${runId}`);
  await expect(page.locator('.talent-card')).toHaveCount(1);
  await expect(page.locator('.talent-card')).toContainText('9.0');
  await expect(page.locator('.talent-card')).toContainText('0.0');
  expect(errors).toEqual([]);
});

test('existing student search links to a second area instead of duplicating', async ({ page }) => {
  await login(page, 'Hardware');
  await page.goto('/#students');
  await page.getByRole('button', { name: 'Agregar alumno', exact: true }).click();
  await page.getByLabel('Nombre completo').fill('Andrea Martínez');
  const match = page.locator('.student-match').filter({ hasText: 'Andrea Martínez' });
  await expect(match).toHaveCount(1); await match.click();
  const button = page.getByRole('button', { name: 'Incorporar a mi área', exact: true });
  if (await button.count()) { await button.click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
  else { await page.getByRole('button', { name: 'Abrir expediente', exact: true }).click(); await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click(); }
  await page.getByLabel('Buscar alumnos', { exact: true }).fill('Andrea Martínez');
  await expect(page.locator('.student-name')).toHaveCount(1);
  await page.locator('.student-name').click();
  await expect(page.locator('.student-profile-head')).toContainText('Hardware');
  await expect(page.locator('.student-profile-head')).toContainText('Software');
});

test('a failed refresh after a successful save does not invite a duplicate submission', async ({ page }) => {
  await login(page);
  await page.goto('/#students');
  await page.getByRole('button', { name: 'Agregar alumno', exact: true }).click();
  await page.getByLabel('Nombre completo').fill(`Prueba de conexión ${runId}`);
  await page.getByRole('textbox', { name: 'Matrícula', exact: true }).fill(`RETRY-${runId}`);
  await page.route('**/api/workspace', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary failure' }) }));
  await page.getByRole('button', { name: 'Registrar alumno', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Los cambios se guardaron, pero no pudimos actualizar la vista. Recarga la página para verlos.', { exact: true })).toBeVisible();
  await page.unroute('**/api/workspace');
  await page.reload();
  await page.getByLabel('Buscar alumnos', { exact: true }).fill(`RETRY-${runId}`);
  await expect(page.locator('.student-name')).toHaveCount(1);
});

test('director is strictly read-only in UI and direct API requests', async ({ page }) => {
  await login(page, 'director');
  await page.goto('/#students');
  await expect(page.getByRole('button', { name: 'Agregar alumno', exact: true })).toHaveCount(0);
  await page.locator('.student-name').first().click();
  await expect(page.getByRole('button', { name: /Editar expediente|Asignar actividad|Nueva actividad/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
  const status = await page.evaluate(async () => {
    const session = await fetch('/api/session').then(r => r.json());
    const response = await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify({ name: 'Forbidden', registration: 'FORBIDDEN' }) });
    return response.status;
  });
  expect(status).toBe(403);
  await page.goto('/#assignments');
  await page.locator('.activity-name').first().click();
  await expect(page.getByRole('button', { name: /Registrar entrega|Evaluar actividad|Nueva evaluación|Editar actividad/ })).toHaveCount(0);
});

test('mobile navigation, search, drawer focus, empty state and calendar controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // La agenda se retiró: el calendario de Hoy cubre mes y semana.
  const calendarTitle = await page.locator('.cal-title').textContent();
  await page.getByRole('button', { name: 'Periodo siguiente', exact: true }).click();
  await expect(page.locator('.cal-title')).not.toHaveText(calendarTitle ?? '');
  await page.locator('.cal-today-button').click();
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Alumnos' }).click();
  await page.getByLabel('Buscar alumnos', { exact: true }).fill('NingunAlumnoTieneEsteNombre');
  await expect(page.getByText('No encontramos alumnos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
  await page.locator('.student-name').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('timeline expands to a full-screen view in a new tab', async ({ page, context }) => {
  await login(page);
  await page.goto('/#students?v=timeline');
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Expandir', exact: true }).click();
  const full = await popup;
  await expect(full.getByRole('heading', { level: 1, name: 'Cronograma de alumnos' })).toBeVisible();
  await expect(full.locator('.gantt.is-full .gantt-row').first()).toBeVisible();
  await full.getByRole('radio', { name: 'Meses', exact: true }).click();
  await expect(full.locator('.gantt-today-tag')).toBeVisible();
  await expect(full.locator('.sidebar')).toHaveCount(0);
});
