# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Cuatro personas, nunca más. Tres responsables de área (Software, Hardware e Investigación) que coordinan alumnos de prácticas, servicio social, tesis e investigación, y un jefe que supervisa las tres áreas en modo de solo lectura. Los alumnos no usan el sistema: el responsable registra por ellos altas, asignaciones, entregas y evaluaciones.

Escena de uso: oficina o laboratorio universitario, de día, en computadora de escritorio; ocasionalmente desde el teléfono para consultar la agenda.

## Product Purpose

Que cada responsable sepa al entrar qué tiene que hacer hoy y cómo van sus alumnos, y que pueda encontrar al alumno con mejor evidencia en una habilidad cuando necesita un candidato. Que el jefe vea de un vistazo qué área necesita apoyo.

Éxito: en pocos segundos el responsable identifica su siguiente acción y la ejecuta desde ahí mismo, sin buscarla en otra sección.

## Operating Context

- Flujo central: alta del alumno → asignación de actividad (alumno, plazo de entrega, primera revisión, habilidades a evaluar, enlaces y documentos) → revisiones programadas → registro de entrega (completa, parcial o no entregó) → evaluación por habilidad de 0 a 10 → finalizar o pedir correcciones.
- Un alumno tiene un expediente único y puede pertenecer a varias áreas.
- Las evaluaciones alimentan la búsqueda de talento entre las tres áreas.
- Fechas en horario de Ciudad de México.

## Capabilities and Constraints

- Stack existente: React 19 + Vite, Express + SQLite (Node 22), Radix Dialog y DropdownMenu, iconos Phosphor, fuente Geist local.
- El jefe es de consulta sobre los datos de alumnos (el servidor lo impone). Su única escritura: agendar, editar o cancelar reuniones con los responsables, que aparecen en el calendario y el día de los invitados (decisión del usuario, 2026-10-01).
- Cada responsable solo modifica su área; puede consultar habilidades evaluadas de alumnos de otras áreas.
- "Sin evaluar", "cero" y "no entregó" son conceptos distintos y deben seguir distinguiéndose.
- No hay calificación global del alumno ni comparación de productividad entre áreas.
- Fuera de alcance por ahora: notificaciones externas, plantillas de actividades, importación masiva.

## Brand Commitments

Nombre: SAG. Base visual a conservar (decisión del usuario, 2026-10-01): fondo claro, un color de acción azul, tipografía Geist. Se rehace la experiencia; el aspecto se pule sobre esa base.

Voz: español de México, directo y funcional. Sin frases motivacionales ni texto decorativo.

## Evidence on Hand

Datos de demostración ficticios en `.data/demo.sqlite` (modo `npm run dev`). No hay datos reales, testimonios ni métricas que citar.

## Product Principles

1. Lo primero que se ve es lo que hay que hacer hoy, con el botón para hacerlo.
2. Cada cosa vive en un solo lugar; los resúmenes enlazan a ese lugar ya filtrado, no lo duplican.
3. Si el contexto ya se conoce (alumno, actividad), no se vuelve a preguntar.
4. El color señala lo que necesita atención; todo lo demás es neutro.
5. Nada parece clicable si no hace algo.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste, navegación completa por teclado, foco visible, estados con texto además de color, respeto a `prefers-reduced-motion`. Existe auditoría automatizada con axe (`scripts/audit-accessibility.mjs`).
