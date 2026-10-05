# Decisiones de interfaz

SAG es una herramienta de trabajo diario para cuatro personas. Cada decisión responde a una pregunta: ¿qué tengo que hacer hoy y cómo van mis alumnos?

## Estructura

- **Hoy** (responsable), página blanca sin tarjetas, en dos columnas. Izquierda: título con resumen de una línea, calendario de mes y semana (puntos por día; revisiones con hora en la semana; fecha límite con bandera) y la tabla "Mis alumnos" con filtros por situación, primero quienes piden atención. Derecha (fija, con su propio desplazamiento), en orden de lectura: 1) el número de pendientes con íconos por tipo y una dona de cómo van los alumnos; 2) "Empieza por aquí": la tarea más urgente con su botón; 3) "Después": el resto de pendientes; 4) el día elegido en el calendario (por defecto "Tu día", con marca de ahora y próximas), sus fechas límite y "Programar revisión en este día". En pantallas angostas la columna derecha pasa arriba del calendario.
- **Panorama** (jefe): selector «Todas · Software · Hardware · Investigación». En «Todas», una columna por área sin tarjetas (líneas finas) con la dona, revisiones de hoy, entregas de la semana y las cifras de atrasadas, por evaluar, con impedimento, revisiones sin registrar, sin seguimiento y sin actividad; cada cifra distinta de cero lleva a la lista ya filtrada (los ceros no son clicables) y «Ver tablero de…» abre el tablero del área. Debajo, el calendario del laboratorio coloreado por área, las revisiones del día elegido y los movimientos recientes. Al elegir un área se ve su tablero de Hoy completo en solo lectura: sin botones de acción.
- **Reuniones del jefe**: «Agendar reunión» en el Panorama, en el tablero de cada área y en la Agenda. Asunto, responsables invitados (todos por omisión; desde un área, solo esa), fecha, duración, lugar o enlace y temas; avisa si choca con otra reunión. Al invitado le aparece en el calendario (punto con aro oscuro; en la semana, etiqueta oscura), en «Tu día» junto a sus revisiones, en «Próximas», en la Agenda y, el mismo día, como aviso oscuro en el resumen de Hoy. El color de las reuniones es tinta, distinto de áreas y estados. Solo el jefe edita o cancela.
- **Registrar avance** (un solo camino por alumno): cada alumno muestra la acción que toca según su actividad más urgente (Avance, Evaluar, Asignar o Cambiar fecha) en la tabla de Hoy, en Alumnos, en el encabezado del expediente y en el detalle de la actividad; también desde «Nuevo → Avance o entrega», que pide alumno y actividad. El formulario ofrece tres tarjetas (Avance, Entrega final, No entregó solo si venció), avance estimado con un toque (25, 50, 75, 90 %), frases rápidas, enlace, horas y fecha «ahora» que se puede cambiar. Con «Entrega final» y «Evaluar ahora» (marcado por omisión) se abre la evaluación al guardar. El porcentaje aparece en la tabla, en «Ahora» del expediente y llena la barra del Gantt. En Hoy la situación va bajo el nombre (texto de color) para dejar sitio a la acción.
- **Crear**: un solo botón «Nuevo» (barra lateral y encabezado de Hoy) abre Actividad, Revisión o Alumno. Es la acción principal de los responsables.
- **Plan del alumno** (pestaña del expediente): Gantt con una barra por actividad (de su inicio a su fecha límite, color de su estado), rombos de revisión, puntos de entrega, línea de hoy y el periodo del alumno con bordes punteados. Con fases, las actividades se agrupan y se pliegan. Avisa si alguna actividad vence después del fin del periodo. Arriba, el avance de horas con la fecha probable de término.
- **Cronograma** (Alumnos, vista alterna a la lista): una fila por alumno con su periodo coloreado por situación, fechas límite abiertas y próxima revisión; ordenado por quién termina antes.
- **Sin seguimiento**: alumno con trabajo, sin cita próxima y sin revisión ni entrega en 14 días. Es un pendiente en Hoy («Programar revisión»), un aviso ámbar en «Próxima revisión» y un filtro.
- **Acuerdos de revisión**: al registrar una revisión se anotan acuerdos; los pendientes aparecen en la siguiente revisión del alumno y se marcan al instante, sin abrir un diálogo.
- **Constancia**: desde el expediente («Más acciones», o el botón del jefe), documento imprimible con periodo, horas, actividades terminadas y habilidades con evidencia; se guarda como PDF desde el navegador.
- **Reportes** incluye la tendencia de 6 meses (terminadas por mes y porcentaje a tiempo) y cómo evoluciona cada habilidad.
- **Agenda**: calendario de mes y semana con el detalle del día. Para el responsable los colores indican estado (programada, realizada, sin registrar); para el jefe, el área.
- **Alumnos**: la única lista completa de alumnos. Los grupos de situación (con impedimento, atrasados, por evaluar, al día, sin actividad) usan los mismos nombres y colores que las insignias y que el resumen de Hoy, que enlaza aquí ya filtrado.
- **Actividades**: lista o tablero; pestañas por estado. Buscar por nombre busca en todos los estados.
- **Talento**: se elige una habilidad y aparece el ranking con la evidencia (promedio, número de evaluaciones, fecha) y la carga actual.
- **Reportes** y **Configuración** (esta última desde el menú de la cuenta).
- **Panorama** cuenta con los mismos criterios que las pestañas de Actividades a las que enlaza: una actividad con impedimento y atrasada aparece en ambas.

## Reglas

1. Cada cosa vive en un solo lugar; los resúmenes enlazan, no duplican.
2. Si el contexto se conoce (alumno, actividad), el formulario lo muestra fijo y no lo vuelve a preguntar.
3. El color marca lo que pide atención: ámbar vencido o sin registrar, rojo con impedimento, azul por evaluar, verde solo para finalizado o realizado. En curso, en correcciones y sin actividad son neutros. Siempre hay texto además del color.
4. Nada parece clicable si no hace algo.
5. La cuenta tiene un solo lugar: abajo a la izquierda, en la barra lateral fija. En móvil, la barra superior es fija.
6. La acción más frecuente, **Asignar actividad**, está siempre visible en la barra lateral. Ctrl K abre la búsqueda con acciones, alumnos y actividades.
7. Lecturas en paneles laterales; cada escritura, en un diálogo con un botón que nombra la acción. En móvil los diálogos se abren desde abajo.
8. Sin texto decorativo: títulos que dicen qué hay y frases que dicen qué hacer.

## Vocabulario

Palabras simples que dicen qué pasa y a quién le toca, iguales en todas las pantallas.

- Actividades: En curso, Por evaluar, Corrigiendo, Terminada, Atrasada, Con impedimento, No entregó, Cancelada.
- Alumnos: Al día, Atrasado, Por evaluar, Con impedimento, Sin actividad. "Con impedimento" significa que algo externo le impide avanzar (falta material, una aprobación); lo anota el responsable en la actividad y se quita al borrarlo. No se usa "pendiente" porque ya nombra la lista de cosas por hacer.
- El tablero explica cada columna: "El alumno está trabajando", "Te toca evaluar", "El alumno corrige lo que pediste", "Entregadas y evaluadas".

## Asignar

- Solo lo esencial: alumno, nombre, qué debe hacer, habilidades, fecha límite y primera revisión. Proyecto y prioridad se retiraron de la interfaz porque no aportaban (los datos anteriores se conservan en la base).
- Si falta una habilidad, "Nueva habilidad" (chip punteado al final) la crea ahí mismo con nombre y qué debe demostrar; aparece marcada al final de la lista y queda en el catálogo del área. Es el mismo bloque que al evaluar. Si se intenta guardar con una habilidad a medio crear, se avisa junto a ella en lugar de perderla.
- Material opcional: varios enlaces (normalmente la carpeta de Drive de la actividad) y varios documentos. Un enlace pegado sin pulsar "Añadir" también se guarda, y los campos de enlace aceptan direcciones sin "https://". El nombre del enlace se reconoce solo ("Carpeta de Drive", "Documento de Google" o el sitio). Si el documento no se sube, la actividad igual se crea y se avisa.
- En el detalle de la actividad se pueden añadir o quitar enlaces y subir documentos después.

## Evaluar

- Se califica con un toque en una escala de 0 a 10 que se llena con el color del nivel (Inicial, En desarrollo, Competente, Avanzado). Volver a tocar la nota la quita: sin nota significa que no se observó, nunca cero. Con teclado: flechas, Inicio, Fin, dígitos y Supr.
- Al elegir una nota aparecen observaciones frecuentes para ese nivel; un toque las agrega. Escribir es opcional.
- Si se observó una habilidad que no estaba en la actividad, se añade ahí mismo desde el catálogo o se crea; el servidor solo acepta habilidades del área o compartidas y la incorpora a la actividad.
- La retroalimentación es opcional y tiene frases rápidas.

## Pictogramas

- **Avatar de alumno**: una cara de animal (20 en `src/components/animals.tsx`, lista en `shared/avatars.ts`), con fondo de color pleno. Al registrar un alumno el formulario ya trae uno elegido (el menos repetido) y se puede cambiar; si no se envía, el servidor asigna uno igual. Los expedientes anteriores reciben uno al iniciar el servidor. Cuentas y autores de movimientos, que no son alumnos, usan iniciales en blanco sobre color pleno. Sin colores pastel en los avatares.
- **Aro de semáforo** en cada avatar: verde va bien, ámbar atrasado, rojo con impedimento (ícono de barrera), azul espera tu evaluación, gris sin actividad. Con ícono en la esquina cuando pide atención.
- **Pasos de una actividad**: asignada, entregada, evaluada. Verde hecho, azul en espera, ámbar atrasado o corrigiendo, rojo con impedimento.
- **Gráfica hexagonal (araña)** de habilidades: un eje por habilidad evaluada (hasta 8), comparada con el promedio del laboratorio en línea punteada. En Talento se superponen hasta 3 alumnos usando solo las habilidades evaluadas en todos; sin evaluar nunca se dibuja como cero.
- **Perfil del alumno**: "Lo importante" arriba (qué hace ahora, en qué destaca, qué puede mejorar, entrega a tiempo), luego la gráfica; cada habilidad muestra su tendencia respecto a la evaluación anterior y una marca del promedio.
- **Dona de salud** del grupo, **línea de tiempo** del día y **tira de la semana** con las caras de quién entrega.
- En Agenda, una banderita marca las fechas límite de entrega junto a las revisiones.

## Movimiento

- Momento central: al resolver un pendiente su fila se desvanece y cede su lugar, el siguiente sube a "Empieza por aquí" y el número rueda hacia abajo. Al llegar a cero se dibuja un check.
- Continuidad: un indicador se desliza entre opciones del menú, pestañas, filtros y selectores; los bloques de cada página entran en orden de lectura (máximo 190 ms de retraso).
- Confirmación: al guardar, el botón del diálogo se vuelve verde y dibuja una palomita con el resultado («Registrado», «Asignada», «Programada», «Registrada», «Guardada») antes de cerrarse; después queda el aviso, cuyo círculo y palomita se dibujan y una barra marca su tiempo. Lo recién creado o modificado se ilumina un momento en su lista (fila con borde azul que se desvanece). Los acuerdos se tachan y su casilla dibuja la palomita.
- Datos que aparecen: las barras del Gantt crecen desde su inicio y las marcas aparecen después; en Reportes las barras suben y la línea se traza.
- Retroalimentación: botones que se hunden al presionar, contadores que laten al cambiar, avisos que entran y salen, barras y donas que se llenan.
- Curvas de salida suaves, 150 a 520 ms. Con "reducir movimiento" quedan solo fundidos breves, sin desplazamientos.

## Sistema visual

- Tipografía Geist (local). Escala de producto: 24 título de página, 15 a 16 títulos de sección, 14 texto, 12.5 metadatos. Números tabulares.
- Lienzo gris claro con superficies blancas elevadas; la elevación marca la jerarquía. Hoy es la excepción: fondo blanco y sin tarjetas, con líneas finas de 1 px como estructura. Un azul de acción (`#2f64b8`). Tokens en `src/styles.css` (`:root`).
- Áreas con tono propio que no choca con los estados: Software índigo, Hardware turquesa, Investigación ciruela; siempre acompañadas de ícono y nombre.
- Radios: controles 8 px, paneles y diálogos 12 px, insignias en píldora.
- Movimiento breve y solo de estado: diálogos 200 ms, panel lateral 280 ms, menús 150 ms; se desactiva con `prefers-reduced-motion`.
- Iconos de una sola familia: Phosphor.

## Estados

Carga con esqueleto, vacíos que dicen qué hacer, sin coincidencias con opción de quitar filtros, errores de formulario en línea, sesión expirada y fallo de actualización después de guardar.
