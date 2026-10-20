# SAG en Claude Code (MCP)

SAG expone un servidor MCP en `/mcp` (HTTP «streamable», sin estado). Cada persona usa **su propia llave**, con sus mismos permisos: el jefe consulta todo y agenda reuniones; cada responsable trabaja en su área. Todo lo que se hace por MCP pasa por la misma API que la página, con las mismas validaciones y queda en el historial.

## Conectarse (una vez)

1. En SAG: **Conectar con Claude** (barra lateral) o Configuración → **Claude Code** → «Crear llave y conectar».
2. Abrir Claude Code (app de Claude → pestaña **Code**) y pegarle el prompt que aparece, con su botón «Copiar». Claude agrega el servidor `sag` (con `claude mcp add --transport http --scope user …` si el comando existe; si no, en `mcpServers` de `~/.claude.json`).
3. Abrir una sesión nueva y pedir cosas. `/mcp` muestra si `sag` está conectado. Se puede revocar una llave y crear otra en la misma pantalla (máximo 5 por persona).

## Qué se le puede pedir

| Herramienta | Para qué |
|---|---|
| `resumen_laboratorio` | Panorama: sin actividad, por evaluar, atrasadas, impedimentos, próximas revisiones, tesis |
| `listar_alumnos`, `ver_alumno` | Listas con filtros y el expediente completo (contacto, actividades, entregas, evaluaciones, revisiones, notas) |
| `listar_actividades`, `listar_habilidades` | Actividades por alumno o estado; habilidades del área |
| `registrar_alumno`, `editar_alumno` | Altas y cambios (solo el nombre es obligatorio) |
| `asignar_actividad`, `editar_actividad` | Asignar (habilidades por nombre; las nuevas se crean) o cambiar/cancelar |
| `registrar_avance`, `evaluar_actividad` | Avance, entrega final o «no entregó»; evaluación por habilidad |
| `buscar_horario_libre`, `programar_revision`, `registrar_revision` | Agenda sin choques; registrar resultado, acuerdos, cancelar o reprogramar |
| `marcar_impedimento`, `agregar_nota` | Impedimentos y notas del expediente |
| `subir_documento` | Archivo local (base64, hasta 10 MB) a una actividad o a la tesis |
| `tesis_paso` | Flujo de tesis (Investigación) |
| `agendar_reunion` | Solo el jefe |
| `historial`, `exportar_datos` | Bitácora y datos en JSON para tablas, gráficas o diagramas Mermaid |

Fechas en hora del centro de México: `AAAA-MM-DD HH:MM`.

## Seguridad

- La llave (`sag_…`) se guarda solo como hash; se puede revocar en cualquier momento.
- Una llave no puede crear ni revocar llaves (eso solo desde la sesión de la página).
- Las solicitudes con `Authorization: Bearer` no usan cookies, así que no necesitan el token CSRF ni el encabezado Origin.
