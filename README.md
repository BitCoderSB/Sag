# SAG · Gestión académica

Aplicación web para los responsables de Software, Hardware e Investigación y su jefe. Un alumno tiene un expediente único y puede participar en varias áreas. Cada área mantiene sus propias actividades, entregas, revisiones y evaluaciones. El jefe consulta todo y no puede modificar información.

## Abrir la aplicación

Requiere Node.js 22.11 o posterior. El proyecto usa SQLite incluido en Node, sin instalar un servidor de base de datos. Node 22.11 requiere la bandera `--experimental-sqlite`, incorporada en los comandos.

```powershell
cd C:\Users\Carlos\Documents\sag
npm install
npm run dev
```

Abrir **http://127.0.0.1:5173**. El modo de desarrollo contiene información ficticia y permite explorar las cuatro cuentas. Cambiar de vista desde el menú del usuario, abajo a la izquierda. En móvil, abrir primero el menú lateral.

La demostración utiliza `.data/demo.sqlite` y `.data/demo-files`. No introducir datos reales en este modo: el acceso rápido está habilitado únicamente para explorar y desarrollar en la computadora local.

## Uso real

El mismo código incluye autenticación con contraseña y persistencia real. La instalación comienza sin alumnos ni actividades ficticias.

1. Antes de crear cuentas, establecer los nombres y correos de las cuatro personas mediante las variables de [configuración del servidor](docs/backend.md). Si no se establecen, el setup utiliza las cuentas de ejemplo documentadas allí.
2. Crear las cuatro cuentas y compilar:

```powershell
npm run setup
npm run build
npm start
```

3. Abrir **http://127.0.0.1:3001**. Las cuatro contraseñas aleatorias se guardan en `.local/initial-credentials.txt`, un archivo privado excluido del repositorio. El setup no imprime contraseñas ni sobrescribe cuentas existentes.
4. Entregar a cada responsable exclusivamente su credencial. Los alumnos no tienen cuenta.

El entorno real usa `.data/sag.sqlite` y `.data/files`. Al abrir `npm start` no aparecen los accesos de demostración.

Para que las cuatro personas entren desde equipos diferentes hay que instalar el servidor en el equipo o alojamiento elegido, configurar HTTPS, el dominio exacto en `SAG_ORIGINS` y `SAG_SECURE_COOKIE=1`. El proyecto está listo para el piloto local; no está publicado en internet. Ver [instalación y seguridad](docs/backend.md).

## Publicar en un servidor Ubuntu

`deploy/instalar.sh` instala Node 22 y Caddy (HTTPS automático), crea el servicio `sag` y las cuatro cuentas, y deja la aplicación en `https://<dominio>`. Se ejecuta en el servidor después de extraer el paquete en `/opt/sag`: `sudo bash /opt/sag/deploy/instalar.sh`. Volver a ejecutarlo actualiza la aplicación sin tocar datos ni cuentas. La configuración queda en `/etc/sag.env`.

El servidor en uso, cómo entrar y cómo publicar cambios (`bash deploy/subir.sh`) están en [docs/servidor.md](docs/servidor.md).

## Funciones incluidas

- Hoy: pendientes del responsable con el botón que los resuelve, entregas que vencen en la semana, agenda del día y cómo van sus alumnos. El jefe ve un panorama por área.
- Agenda con calendario mensual y semanal, detalle del día y registro o reprogramación de revisiones.
- Búsqueda dinámica de expedientes existentes por nombre o matrícula; incorporación a otra área sin duplicar personas.
- Ficha del alumno con datos, áreas, tecnologías, competencias, notas y cambios históricos.
- Actividades en lista o tablero, impedimentos y material: varios enlaces (por ejemplo, la carpeta de Drive) y documentos.
- Plazo de entrega y primera revisión independientes.
- Entregas completas o parciales, y confirmación explícita de no entrega cuando el plazo venció.
- Evaluación por habilidad, de 0 a 10; vacío significa sin evaluar. Cero se conserva como calificación válida.
- Correcciones y reevaluación: conserva versiones anteriores y calcula una sola evaluación vigente por actividad.
- Documentos privados de hasta 10 MB, enlaces y evidencias de demostraciones presenciales.
- Programación, registro, cancelación y confirmación de revisiones no realizadas.
- Talento entre las tres áreas: filtros de habilidad, nivel, evidencia reciente y número de evaluaciones, matriz y comparación de hasta tres alumnos.
- Reportes y exportación CSV con permisos aplicados en el servidor.
- Catálogo de habilidades con descripciones de criterios.
- Interfaz adaptable a computadora, tableta y móvil; navegación por teclado y reducción de movimiento.

## Reglas importantes

- El jefe es estrictamente de consulta, incluso si se llama directamente a la API.
- Los encargados solo modifican actividades, notas, entregas y evaluaciones de su área.
- Las puntuaciones de otras áreas pueden consultarse para buscar talento; documentos, notas y retroalimentación privada no se comparten automáticamente.
- Los datos básicos del alumno son compartidos. Un encargado no puede suspender globalmente un alumno de varias áreas; puede cerrar o cancelar sus propias actividades. El estado independiente de participación por área no está incluido todavía.
- Una entrega sin registrar se presenta como pendiente de confirmación. No se presume incumplimiento.
- No entrega, cero y sin evaluar son conceptos distintos.
- Las revisiones requieren que alguien registre su resultado; el paso del tiempo no las completa.
- Las fechas se muestran en horario de Ciudad de México.
- Las estadísticas muestran cantidad y fecha de evidencias. No representan una clasificación general de personas ni permiten comparar productividad entre disciplinas.

## Respaldo

```powershell
npm run backup -- C:\Respaldos\SAG
```

Genera una instantánea consistente de SQLite, adjuntos y un manifiesto con hashes. Las sesiones se excluyen del respaldo. El destino contiene datos privados; restringir su acceso. El procedimiento de restauración está documentado en [docs/backend.md](docs/backend.md). Se verificó una restauración en las pruebas automáticas.

## Verificación

```powershell
npm test
npm run test:e2e
```

- Pruebas API: autenticación, CSRF, origen, permisos del jefe, aislamiento entre áreas, duplicados, concurrencia, evaluaciones, no entrega, archivos, exportación, setup y restauración.
- Pruebas de navegador: flujo completo desde alumno hasta evaluación y búsqueda en Talento, pertenencia a varias áreas, solo lectura del jefe y navegación móvil.
- Las pruebas de navegador compilan la aplicación y usan una base temporal aislada, sin modificar los datos de demostración o de uso real.
- Auditoría automatizada de accesibilidad con axe en las seis pantallas principales, login y formularios. Resultado guardado en [docs/accessibility-audit.json](docs/accessibility-audit.json). Complementa la comprobación manual; no certifica todos los flujos posibles.

## Estructura

```text
src/                 Aplicación React, interfaz y componentes
shared/types.ts      Contrato compartido de datos
server/              API Express, SQLite, sesiones y permisos
scripts/             Setup, respaldos e inspección visual
tests/               Pruebas API y navegador
docs/                Decisiones, operación y resultados de verificación
.data/               Base de datos y adjuntos privados (ignorado)
.local/              Credenciales iniciales privadas (ignorado)
```

Tecnologías: React, TypeScript, Vite, Express, SQLite, Zod, Radix UI, Phosphor y fuentes Geist servidas localmente. No requiere servicios externos ni claves de APIs.

## Alcance posterior

Plantillas reutilizables de prácticas, importación masiva, archivos compartidos selectivamente entre áreas, participación activa por área, recuperación de contraseña por correo y notificaciones externas no forman parte de esta versión. La primera versión trabaja con asignaciones individuales; no incluye control de horas, inventario ni reservas de equipo.
