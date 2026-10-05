# SAG: servidor, datos y operación

El servidor de esta primera versión es Express con SQLite persistente. No requiere cuentas de alumnos ni servicios externos. `shared/types.ts` define los datos que consume la interfaz.

## Arranque local

- Requiere Node 22.11 o posterior y `npm install`.
- `npm run dev`: demostración con datos ficticios, API en `127.0.0.1:3001` y Vite en `127.0.0.1:5173`. La base es `.data/demo.sqlite` y los adjuntos `.data/demo-files`. Los cambios de la demostración se conservan entre arranques.
- `npm run setup`: crea las cuatro cuentas reales en `.data/sag.sqlite`. Las contraseñas aleatorias se escriben exclusivamente en `.local/initial-credentials.txt`; nunca se imprimen ni se guardan en texto en la base. Entregar la credencial correspondiente a cada persona por un canal seguro. El script rechaza sobrescribir cuentas existentes.
- `npm run build` y después `npm start`: sirve la interfaz compilada y la API desde `http://127.0.0.1:3001`. El modo real comienza vacío y no tiene botón de acceso de demostración. El servidor puede arrancar antes del setup; no habrá usuarios que puedan iniciar sesión.

Las cuentas iniciales usan los nombres Ana Torres, Miguel Ortega, Elena Ríos y Roberto Salazar. Antes del setup se pueden definir `SAG_SOFTWARE_NAME`, `SAG_SOFTWARE_EMAIL`, `SAG_HARDWARE_NAME`, `SAG_HARDWARE_EMAIL`, `SAG_RESEARCH_NAME`, `SAG_RESEARCH_EMAIL`, `SAG_DIRECTOR_NAME` y `SAG_DIRECTOR_EMAIL`. Los correos funcionan como identificadores de inicio de sesión; esta versión no envía correos.

El frontend y el backend deben utilizar el mismo origen público. Vite utiliza un proxy local durante el desarrollo.

## Configuración

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Puerto de escucha. |
| `SAG_HOST` | `127.0.0.1` | Interfaz de red. El modo demo solo admite loopback. |
| `SAG_DEMO` | desactivado | Solo `1` habilita el acceso rápido ficticio. Nunca usarlo en una instalación real. |
| `SAG_DB` | `.data/sag.sqlite` | Ruta de la base real. Demo rechaza esta variable para evitar mezclar información. |
| `SAG_FILES` | `.data/files` | Directorio privado de adjuntos reales. |
| `SAG_ORIGINS` | orígenes locales del puerto | Lista de orígenes exactos separados por comas. Ejemplo: `https://sag.ejemplo.edu`. |
| `SAG_SECURE_COOKIE` | `0` | Usar `1` detrás de HTTPS; activa cookie Secure y HSTS. |
| `SAG_TRUST_PROXY` | `0` | Usar `1` detrás de un proxy en la misma máquina (Caddy, nginx) para que el límite de intentos de acceso cuente por cliente y no uno para todos. Solo confía en el proxy local. |

Para acceso por red institucional se necesita un dominio/origen definido y TLS, mediante el servicio o proxy de alojamiento elegido. Mantener el backend detrás del proxy, configurar `SAG_ORIGINS` con el origen público y `SAG_SECURE_COOKIE=1`. El directorio `.data`, los respaldos y `.local` son privados y no deben servirse como archivos estáticos. El servidor solo expone `dist` y una ruta autenticada de descarga. La demostración bloquea la escucha pública, pero tampoco debe exponerse mediante un túnel o proxy.

## Permisos y límites

- Cada responsable administra las asignaciones, notas, entregas, revisiones y evaluaciones de su área; el área se obtiene de la sesión y nunca se acepta del formulario.
- El jefe puede consultar todo y descargar reportes. Todos los endpoints de escritura de datos de alumnos le responden `403 READ_ONLY`, incluso si construye manualmente la solicitud. Su única escritura son las reuniones con los responsables (`/api/meetings`), que a su vez solo él puede crear o modificar (`403 DIRECTOR_ONLY` para los responsables).
- El alumno tiene identidad global por matrícula/identificador normalizado. Añadirlo a un área conserva la misma ficha. La operación es idempotente. La edición de los datos básicos compartidos requiere pertenencia al área y versión vigente.
- Todos los responsables pueden consultar nombres, identificadores, pertenencias, tecnologías y puntuaciones de talento de las otras áreas, incluyendo número global de actividades abiertas. Para alumnos ajenos se vacían correo, carrera, semestre y modalidades.
- Las puntuaciones ajenas se comparten sin comentarios o retroalimentación privada. Sus actividades, revisiones, notas, archivos, entregas y auditoría no se incluyen en la respuesta. Las evidencias documentales de otras áreas no se comparten automáticamente; esa selección es una ampliación futura.
- Las actividades terminadas conservan sus entregas y permiten reevaluar explícitamente con la versión vigente; no aceptan nuevas entregas. Las canceladas no aceptan entregas ni evaluaciones. Cancelar una actividad cancela sus revisiones pendientes con motivo.
- Un responsable no puede cambiar el estado global (activo/pausado/finalizado) de un alumno que pertenece a varias áreas: afectaría el trabajo ajeno. Puede cerrar o cancelar las actividades propias. Un expediente pausado/finalizado debe reactivarse por su responsable actual antes de incorporarlo a otra área. El estado de participación por área queda como extensión posterior; los datos básicos compartidos sí pueden corregirse con versión vigente.
- La actualización optimista usa `version`. Un registro desactualizado devuelve `409 VERSION_CONFLICT` para que la interfaz recargue los datos.

## Evaluaciones

Cada actividad define las habilidades que se observarán. La evaluación exige una entrega completa registrada y una fila para cada habilidad; la fila puede contener puntuación entre 0 y 10 o `null` (sin evaluar). `null` nunca se convierte en cero. Las evaluaciones previas se conservan y solo una evaluación por asignación es vigente, reforzado por un índice único de SQLite. Al reevaluar, cambian únicamente los indicadores `current` de versiones anteriores; sus puntuaciones y comentarios no se editan.

Cancelar posteriormente una actividad que ya tenía una evaluación de correcciones conserva las competencias observadas en esa evaluación. La cancelación afecta el trabajo pendiente y sus revisiones, no borra evidencia técnica real. Las actividades canceladas sin evaluación no aportan puntuaciones.

La evaluación y el cierre opcional de una revisión se realizan en una transacción. Una revisión ajena o ya cerrada no puede vincularse. La fecha real de entrega y la de registro son independientes. El cambio de plazo requiere motivo y queda registrado junto con fecha anterior y nueva.

El responsable puede registrar `not_submitted` para confirmar que el alumno no entregó: exige un plazo vencido, fecha de confirmación posterior a ese plazo y una observación. Esta confirmación no crea puntuaciones, no vale como entrega para evaluar y no convierte ninguna habilidad en cero. Una entrega real posterior se agrega conservando la confirmación anterior. Si ya existe una entrega completa, no se admite una confirmación contradictoria de no entrega; los pendientes se documentan en la evaluación. Cuando no hay registro, la interfaz debe indicar «por confirmar», sin inferir incumplimiento.

## API

Todas las rutas privadas requieren la cookie `sag_session` (`sag_demo_session` en la demostración, para que una demo en el mismo dominio no reemplace la sesión real). Las mutaciones, excepto login y demo, requieren `X-CSRF-Token` obtenido desde `/api/session` y un encabezado `Origin` autorizado. Login también requiere origen autorizado. Se permite contenido JSON; las cargas usan multipart.

| Método/ruta | Respuesta |
| --- | --- |
| `GET /api/session` | `{user, csrf, demo}` |
| `POST /api/auth/login` | `{user, csrf, demo}`; cuerpo `{email,password}` |
| `POST /api/auth/demo` | sesión demo; cuerpo `{role}`; desactivado en real |
| `POST /api/auth/logout` | sesión vacía |
| `GET /api/workspace` | `Workspace` filtrado por permisos |
| `POST /api/students` | `{student}` |
| `POST /api/students/:id/join` | `{student}`; cuerpo `{}` |
| `PATCH /api/students/:id` | `{student}`; ficha básica completa y `version` |
| `POST /api/assignments` | `{assignment,review}`; incluye primera revisión |
| `PATCH /api/assignments/:id` | `{assignment}`; `version`, cambios y motivo cuando aplique |
| `POST /api/assignments/:id/deliveries` | `{delivery,assignment}`; requiere `version` vigente de la asignación; opcionales `hours` y `progress` (0 a 100, avance estimado de una entrega parcial) |
| `POST /api/assignments/:id/evaluations` | `{evaluation,assignment,review?}`; versión de la asignación |
| `POST /api/reviews`, `PATCH /api/reviews/:id` | `{review}`; al registrar acepta `hours` y `agreements` (`[{text,done?}]`, el servidor les asigna `id`) |
| `POST /api/reviews/:id/agreements/:agreementId` | `{review}`; cuerpo `{done}`; marca un acuerdo como cumplido o lo reabre, también en revisiones cerradas |

Campos opcionales añadidos (2026-10-01), sin migración: los registros anteriores siguen válidos. Alumno: `avatar`, `startDate`, `endDate` (AAAA-MM-DD; el término no puede ser anterior al inicio) y `hoursRequired`. Actividad: `startAt` (no posterior a `dueAt`) y `phase`. Entrega y revisión: `hours`. En modo demostración, `enrichDemo` añade una sola vez periodos, fases, horas y acuerdos de ejemplo (marca `demo_plan` en `meta`).
| `POST /api/notes` | `{note}` |
| `POST /api/meetings` | `{meeting}`; solo el jefe; cuerpo `{title,startsAt,durationMinutes?,areaIds,place?,notes?}` |
| `PATCH /api/meetings/:id` | `{meeting}`; solo el jefe; `version` y cambios, o `status:'cancelled'` |

Cada responsable recibe en `GET /api/workspace` solo las reuniones a las que está invitado (`meetings`); el jefe, todas. Crear, mover o cancelar una reunión deja un registro en el historial de cada área invitada.
| `POST /api/skills` | `{skill}`; nueva habilidad del área actual |
| `POST /api/assignments/:id/files` | `{attachment}`; campos `file` y `kind` |
| `GET /api/files/:id` | descarga autenticada y filtrada por área |
| `GET /api/export` | CSV de alumnos y habilidades dentro del alcance del usuario |

Los errores usan `{error,code?}`. Errores de validación agregan `details` con campo y descripción. El servidor no devuelve trazas, contraseñas, tokens almacenados o rutas físicas.

## Endurecimiento aplicado

- Contraseñas scrypt con sal aleatoria; verificación en tiempo constante del hash y cálculo equivalente para usuarios inexistentes.
- Cookies HttpOnly, SameSite=Strict, vida limitada de 12 horas. Tokens de sesión aleatorios almacenados solo como SHA-256, revocados al cerrar sesión. Rotación de token al volver a entrar.
- CSRF por sesión y validación exacta de origen en todas las mutaciones. Sin CORS abierto.
- Límite de intentos de acceso por IP; esquema estricto Zod y campos desconocidos rechazados; límite de cuerpo JSON de 128 KB.
- Consultas parametrizadas y transacciones para conjuntos de cambios relacionados.
- Cabeceras Helmet, CSP, bloqueo de iframes, nosniff, respuestas API no almacenables.
- Archivos de hasta 10 MB, extensiones permitidas, comprobación básica de firma para PDF/imágenes/Office, nombres de almacenamiento aleatorios y descarga forzada. No se interpretan los documentos en el servidor; no se incluye antivirus. La comprobación de firma no certifica que el documento sea inocuo.
- Exportación con neutralización de fórmulas de hoja de cálculo y alcance por área; no incluye credenciales o notas privadas.
- Auditoría con actor, área, fecha, acción y detalle. No hay endpoint que permita editarla o borrarla. No es un registro resistente a modificaciones por un administrador del sistema de archivos.

La primera versión está orientada a cuatro cuentas y volúmenes de laboratorio. La respuesta Workspace carga los registros autorizados completos; paginación y consultas agregadas serían necesarias si el volumen crece mucho. SQLite y sus migraciones iniciales requieren una sola instalación persistente, no contenedores efímeros ni varias réplicas con almacenamiento independiente.

## Respaldo y restauración

Ejecutar `npm run backup -- C:/respaldos/sag` (o el directorio elegido). Se crea un subdirectorio con fecha, una copia SQLite consistente mediante `VACUUM INTO`, los adjuntos referenciados por la copia y un manifiesto SHA-256. Las sesiones se eliminan de la copia para exigir iniciar sesión tras restaurar. Un adjunto faltante provoca error: ese respaldo debe considerarse incompleto. Proteger el respaldo porque contiene expedientes y hashes de contraseñas.

Para restaurar: detener el servidor; conservar la instalación actual como recuperación; verificar que los archivos coincidan con el manifiesto; restaurar `sag.sqlite` y su carpeta `files` en las rutas configuradas, sin mezclar archivos WAL/SHM de otra base; iniciar el servidor y comprobar expedientes, permisos y descargas. El respaldo no incluye variables de entorno ni las credenciales iniciales en texto. Mantener estos elementos por separado según la política del laboratorio.

## Verificación

`npm test` levanta servidores y bases temporales. Cubre sesiones y contraseña, demo desactivada en modo real, jefe de solo lectura en todas las rutas, aislamiento entre áreas, CSRF/origen, rechazo de campos inyectados, identidad global e incorporación idempotente, conflictos de versión, evaluación con cero y nulo, historial de reevaluación, archivos privados, CSV y rollback.

Antes de uso institucional debe concretarse dónde se alojará, quién custodia credenciales y respaldos, y con qué frecuencia se verificará la recuperación. No se incluyen recuperación de contraseña por correo, doble factor ni integración de directorio institucional.
