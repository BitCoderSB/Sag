# Decisiones de interfaz

SAG es una herramienta de trabajo diario para cuatro personas. Cada decisión responde a una pregunta: ¿qué tengo que hacer hoy y cómo van mis alumnos?

## Estructura

- **Hoy** (responsable), en dos paneles oscuros. Izquierda: título con resumen de una línea, calendario de mes y semana y «Mis alumnos». Derecha (panel fijo, con su propio desplazamiento) responde «qué me toca registrar»: el responsable registra todo (revisiones, avances, entregas, evaluaciones, impedimentos), así que cada texto y botón habla de su acción. Arriba: «Hoy · fecha», el número de pendientes, «y N para hoy» (abre hoy en el calendario), el aviso rojo «N requieren atención» (filtra la tabla), el avance del día («Hoy llevas X de Y») y las reuniones de hoy. Debajo, una nota «Arrastra cualquier pendiente a un día del calendario» y los grupos, siempre abiertos y en orden de urgencia, cada uno con una línea que explica qué significa: Con impedimento, Revisiones sin registrar, Para hoy (revisiones de hoy y entregas que vencen hoy), Entregas vencidas (incluye «No entregó»), Por evaluar, Sin seguimiento y Sin actividad. Se ven tres filas por grupo y «Ver N más». Cada fila lleva avatar, actividad, alumno, el porqué en el color del grupo, un asa para arrastrar y un botón azul del mismo ancho en todas. En pantallas angostas la columna derecha pasa arriba del calendario.
- **Sin actividad es prioridad**: un alumno siempre debe tener algo asignado. «Sin actividad» va en amarillo, cuenta en «requiere atención» y es el segundo grupo de la columna derecha. Para prevenirlo: al evaluar como terminada su última actividad abierta se abre «Asignar actividad» con el alumno ya elegido («¿Qué sigue?»), y el grupo «Preparar la siguiente» avisa cuando su única actividad ya se entregó o vence en 3 días (no suma al número de pendientes).
- **Pausa por área**: «Pausar participación» (menú del alumno o del expediente) pide motivo (baja temporal, salud o asunto personal, exámenes o vacaciones, sin contacto), detalle, regreso esperado y qué hacer con sus actividades abiertas (conservarlas o cancelarlas) y revisiones programadas. En pausa sale de pendientes, de la dona y de «sin seguimiento»; aparece en «En pausa» bajo la tabla y en un aviso del expediente. El día de regreso aparece en «¿Retoman?» con Retomar (con revisión de regreso opcional) o Extender. Con más de 21 días sin contacto el alumno pasa de «Sin seguimiento» a «Posible deserción», con la acción de pausarlo como «sin contacto». La pausa es del área: las otras áreas del alumno no cambian ni ven el motivo.
- **Mis alumnos**: una dona resume la situación y es el filtro de la tabla. Señalar un segmento o un renglón de su leyenda resalta el segmento, cambia la cifra del centro y muestra las caras de esos alumnos; un clic filtra la tabla (otro clic, o «Quitar filtro», lo quita). «Sin seguimiento» va en la leyenda aparte porque se cruza con los demás estados.
- **Calendario de Hoy**: tarjeta de cristal azul. Hoy es el único día con relleno azul; el día elegido lleva un aro claro sin relleno (la leyenda explica ambos). Mes: marcas por día donde la forma dice el tipo (círculo revisión, cuadro fecha límite, rombo reunión) y el color el estado (aro claro programada, ámbar sin registrar o vencida, verde realizada). El azul se reserva para acciones y para el día de hoy. Pasar el cursor sobre un día con algo muestra una vista previa de solo lectura (revisiones, vencimientos y quiénes); solo con ratón, aparece en ~0,1 s y desaparece al salir del día. Clic en un día abre su detalle debajo del calendario (se cierra con la X): primero lo que tiene hora, en orden; al final, aparte, las fechas límite de ese día; para cada cosa, horario, a quién le toca, etiqueta y la acción (Iniciar o Registrar la revisión; en días futuros «Registrar ahora» para cuando el alumno se adelanta: la revisión se registra como realizada en este momento y el cambio de fecha queda en el historial; Registrar entrega) y «Agregar actividad»; volver a hacer clic o la flecha de la leyenda lo cierra. Un día sin nada ofrece Programar revisión, Agregar tarea y Mover actividad aquí; este último abre una lista agrupada (revisiones programadas, fechas límite) con avatar y nombre del alumno, la actividad, la fecha actual → la nueva y búsqueda cuando hay más de cinco; elegir abre el diálogo para confirmar. Mayús + clic o arrastrar sobre varios días selecciona un rango con su resumen (revisiones, pendientes que requieren atención, realizadas) y acciones para programar o mover revisiones. Semana: una columna por día con sus primeros dos eventos y «+ N más». Los pendientes de la derecha y los eventos del calendario se pueden arrastrar a un día de hoy en adelante; soltar nunca guarda, abre el diálogo correspondiente con la fecha ya puesta (reprogramar revisión, cambiar fecha límite con motivo, programar revisión o asignar).
- **Panorama** (jefe): selector «Todas · Software · Hardware · Investigación». En «Todas», una columna por área sin tarjetas (líneas finas) con la dona, revisiones de hoy, entregas de la semana y las cifras de atrasadas, por evaluar, con impedimento, revisiones sin registrar, sin seguimiento y sin actividad; cada cifra distinta de cero lleva a la lista ya filtrada (los ceros no son clicables) y «Ver tablero de…» abre el tablero del área. Debajo, el calendario del laboratorio coloreado por área, las revisiones del día elegido y los movimientos recientes. Al elegir un área se ve su tablero de Hoy completo en solo lectura: sin botones de acción.
- **Reuniones del jefe**: «Agendar reunión» en el Panorama, en el tablero de cada área y en la Agenda. Asunto, responsables invitados (todos por omisión; desde un área, solo esa), fecha, duración, lugar o enlace y temas; avisa si choca con otra reunión. Al invitado le aparece en el calendario (punto con aro oscuro; en la semana, etiqueta oscura), en «Tu día» junto a sus revisiones, en «Próximas», en la Agenda y, el mismo día, como aviso oscuro en el resumen de Hoy. El color de las reuniones es tinta, distinto de áreas y estados. Solo el jefe edita o cancela.
- **Registrar avance** (un solo camino por alumno): cada alumno muestra la acción que toca según su actividad más urgente (Avance, Evaluar, Asignar o Cambiar fecha) en la tabla de Hoy, en Alumnos, en el encabezado del expediente y en el detalle de la actividad; también desde «Nuevo → Avance o entrega», que pide alumno y actividad. El formulario ofrece tres tarjetas (Avance, Entrega final, No entregó solo si venció), avance estimado con un toque (25, 50, 75, 90 %), frases rápidas, enlace, horas y fecha «ahora» que se puede cambiar. Con «Entrega final» y «Evaluar ahora» (marcado por omisión) se abre la evaluación al guardar. El porcentaje aparece en la tabla, en «Ahora» del expediente y llena la barra del Gantt. En Hoy la situación va bajo el nombre (texto de color) para dejar sitio a la acción.
- **Crear**: un solo botón «Nuevo» (barra lateral y encabezado de Hoy) abre Actividad, Revisión o Alumno. Es la acción principal de los responsables.
- **Panel de actividad**: se lee de arriba abajo. 1) Qué es y de quién (título y alumno, con enlace al expediente). 2) **Situación**: un solo bloque con el estado, el porqué y la acción, por prioridad: cancelada, terminada, con impedimento (si además venció, se dice dentro como dato, sin otro aviso), lista para evaluar, no entregó, entrega vencida, en correcciones, en curso. 3) **Seguimiento** Asignada → Entrega → Evaluación con su fecha; solo muestra progreso (verde hecho, aro claro en curso, gris pendiente), nunca alertas. 4) Datos clave en cuatro tarjetas: fecha límite (y cuánto falta o desde cuándo venció), próxima revisión, avance y asignación. 5) Pestañas; en Detalle, secciones con título en versalitas y su acción a la derecha (Añadir enlace, Subir documento, Programar). Los pasos grandes usan sustantivos (Asignada, Entrega, Evaluación): el color del punto dice cómo va, el nombre no se pinta de alerta.
- **Tablero** (menú lateral): cuatro vistas tipo Trello sobre los mismos datos. Mover una tarjeta nunca cambia el estado por sí solo: abre el registro que lo justifica, y si el movimiento no tiene sentido se dice por qué antes de soltar.
  - **Actividades**: Por iniciar · En curso · En espera · Por evaluar · Correcciones · Terminadas (30 días), con un carril por alumno (se puede apagar). Soltar en En curso = registrar avance; en Por evaluar = registrar entrega final; en En espera = marcar impedimento; de En espera a En curso = resolver; de Por evaluar a Correcciones o Terminadas = evaluar. Una actividad no cambia de alumno ni regresa a Por iniciar. El carril avisa «sin actividad» (con Asignar) o «sobrecargado» (más de 3 abiertas); en carriles, las terminadas son un contador que abre su historia. Filtros: búsqueda y «solo lo que pide atención».
  - **Mi día**: Atrasado · Para hoy · Hecho hoy. Soltar en Hecho hoy abre el registro de ese pendiente; Hecho hoy lista lo que registraste hoy.
  - **Participación**: Recién llegados · Activos · Sin actividad · En espera · En pausa · Por terminar (con fecha de término en 30 días) · Terminaron. Soltar en En pausa = pausar; desde En pausa = retomar; de Sin actividad a Activos = asignar; en Terminaron = cerrar su participación. Las demás etapas se calculan solas.
  - **Banco**: actividades preparadas sin alumno ni fechas. Se arrastran sobre un alumno (ordenados por menos trabajo) y se abre «Asignar actividad» ya llena, con la opción de conservarla en el banco.
- **Historia del alumno** (pestaña del expediente): su recorrido como tablero, por fase si las usa o por mes, con el estado y el promedio de cada actividad.
- **Actividades** es la lista con filtros; su antiguo tablero por estado se reemplazó por la ventana Tablero.
- **Tesis (Investigación)**: el flujo del responsable (puntos 1–28) en 10 fases: Pre-propuesta, Propuesta, Marco teórico y redacción, Análisis/diseño/simulaciones, Desarrollo matemático, Implementación y prototipo, Pruebas y validación, Diapositivas, Correcciones finales y Defensa. Cada fase repite el ciclo «tesista trabaja → revisas y propones cambios → llamada». En la llamada se decide: aprobar y pasar a la siguiente, corregir en la misma (con nota obligatoria) o, solo desde Desarrollo matemático, regresar a Diseño. La primera fase empieza con la llamada inicial. Se ve en la pestaña «Tesis» del expediente (fase N de 10, ciclo, siguiente acción, datos, enlaces a la propuesta y a la carpeta de Drive, historial), en el Tablero → Tesis (una columna por fase; arrastrar a la fase siguiente registra la aprobación) y en Hoy (grupo «Tesis» con lo que te toca: llamada inicial, revisión o llamada). En el Plan, las fases recorridas aparecen con sus fechas y las que faltan se reparten hasta la entrega estimada. Una tesis en curso cuenta como su trabajo: no aparece como «sin actividad». Solo Investigación y el jefe ven la tesis.
- **Plan del alumno** (pestaña del expediente): Gantt con una barra por actividad (de su inicio a su fecha límite, color de su estado), rombos de revisión, puntos de entrega, línea de hoy y el periodo del alumno con bordes punteados. Con fases, las actividades se agrupan y se pliegan. Avisa si alguna actividad vence después del fin del periodo. Arriba, el avance de horas con la fecha probable de término.
- **Cronograma** (Alumnos, vista alterna a la lista): una fila por alumno con su periodo coloreado por situación, fechas límite abiertas y próxima revisión; ordenado por quién termina antes.
- **Sin seguimiento**: alumno con trabajo, sin cita próxima y sin revisión ni entrega en 14 días. Es un pendiente en Hoy («Programar revisión»), un aviso ámbar en «Próxima revisión» y un filtro.
- **Acuerdos de revisión**: al registrar una revisión se anotan acuerdos; los pendientes aparecen en la siguiente revisión del alumno y se marcan al instante, sin abrir un diálogo.
- **Constancia**: desde el expediente («Más acciones», o el botón del jefe), documento imprimible con periodo, horas, actividades terminadas y habilidades con evidencia; se guarda como PDF desde el navegador.
- **Reportes** incluye la tendencia de 6 meses (terminadas por mes y porcentaje a tiempo) y cómo evoluciona cada habilidad.
- **Alumnos**: la única lista completa de alumnos. Los grupos de situación (con impedimento, atrasados, por evaluar, al día, sin actividad) usan los mismos nombres y colores que las insignias y que el resumen de Hoy, que enlaza aquí ya filtrado.
- **Actividades**: lista o tablero; pestañas por estado. Buscar por nombre busca en todos los estados.
- **Talento**: se elige una habilidad y aparece el ranking con la evidencia (promedio, número de evaluaciones, fecha) y la carga actual.
- **Reportes** y **Configuración** (esta última desde el menú de la cuenta).
- **Panorama** cuenta con los mismos criterios que las pestañas de Actividades a las que enlaza: una actividad con impedimento y atrasada aparece en ambas.

## Tema

- Oscuro por omisión; claro a elección con el selector «Claro / Oscuro» bajo la barra lateral o desde el menú de la cuenta. Sin elección se sigue el tema del sistema. La preferencia se guarda en el navegador y se aplica antes de pintar (sin destello).
- En claro no hay fondos pastel: etiquetas e insignias son blancas con borde y texto del color del estado; íconos y marcas del calendario usan colores plenos (azul programada, ámbar sin registrar o vencida, verde realizada, negro reunión).
- El tema claro se define en `src/styles.css` bajo `:root[data-theme="light"]`: tokens propios, una capa generada que invierte superficies y textos del oscuro, y ajustes manuales al final. Al cambiar colores del oscuro, revisar el claro y correr la auditoría en ambos.

## Formularios

- Cada formulario se ordena en bloques que responden una pregunta: Para quién / Con quién, Qué debe hacer, Cuándo, Para qué, Material, Impedimento. El pie dice en una línea qué pasará al guardar (para quién, fechas, qué cambia), y el botón nombra la acción completa («Registrar revisión», «Registrar que no se realizó»).
- Al abrir, el foco va al primer campo, no a la X.
- Alumno y actividad se eligen con un selector propio que muestra avatar, situación y actividad actual (o estado y fecha de la actividad), con búsqueda cuando hay más de seis. No se usa el <select> nativo para elegir personas.
- Avisos que previenen errores sin bloquear: primera revisión después de la fecha límite o en el pasado, choque de horario, revisión en una fecha que ya pasó.
- Cambiar la fecha límite muestra la fecha actual y pide motivo.
- **Impedimento → en espera**: al marcarlo se elige «¿Cuándo vuelves a revisarlo?» (mañana, 3 días, una semana, dos semanas). Hasta esa fecha la actividad está **en espera**: gris azulado con reloj, fuera de pendientes, de «requiere atención» y de «sin seguimiento», y no cuenta como atrasada (el reloj se detiene). Ese día vuelve en «Revisar impedimentos» (ámbar) con dos salidas: Resolver o Esperar más (otra fecha). Si pasa la fecha sin atenderlo, se pinta de rojo («sin revisar»). Al resolver se ofrece recorrer la fecha límite los días que estuvo detenida. Las actividades en espera se listan compactas al final de la columna derecha. Se marca desde el menú de cada alumno, el detalle del día, el panel de la actividad o la casilla al registrar revisión o avance.
- La opción elegida en controles segmentados y opciones grandes se marca con relleno claro y aro; «No se realizó» y «No entregó» usan ámbar, no rojo, porque no son errores.
- Los ejemplos en los campos empiezan con «Ej.» para no confundirse con un valor capturado. El avatar del alumno se muestra elegido y solo se abre la cuadrícula con «Cambiar».

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
- Modo oscuro: fondo negro con paneles casi negros (barra lateral, contenido y columna derecha) separados por un canal; bordes de 1 px blancos muy tenues. El calendario y sus paneles son cristal azul con ondas de luz; el día de hoy es azul pleno con brillo. Un azul de acción en degradado (`#2a6cff` a `#1553e0`). Tokens en `src/styles.css` (`:root`).
- Capa viva (`src/components/Ambient.tsx`): auroras azules y partículas que se encienden cerca del cursor, detrás de los paneles; borde de luz que recorre el calendario y luz que sigue al cursor sobre los días. Todo es decorativo, a ~30 fps, se detiene con la pestaña oculta y con «reducir movimiento».
- Áreas con tono propio que no choca con los estados: Software índigo, Hardware turquesa, Investigación ciruela; siempre acompañadas de ícono y nombre.
- Radios: controles 8 px, paneles y diálogos 12 px, insignias en píldora.
- Movimiento breve y solo de estado: diálogos 200 ms, panel lateral 280 ms, menús 150 ms; se desactiva con `prefers-reduced-motion`.
- Iconos de una sola familia: Phosphor.

## Estados

Carga con esqueleto, vacíos que dicen qué hacer, sin coincidencias con opción de quitar filtros, errores de formulario en línea, sesión expirada y fallo de actualización después de guardar.
