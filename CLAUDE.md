# SAG

Seguimiento de alumnos del laboratorio: 3 responsables (Software, Hardware, Investigación) y 1 jefe de solo consulta (salvo agendar reuniones con los responsables). Producto y principios: `PRODUCT.md`. Decisiones de interfaz: `docs/design.md`. Servidor y API: `docs/backend.md`.

## Cómo trabajar con Carlos

- Responder en español y corto; pide "en pocas palabras" a menudo. Detalle solo si lo pide.
- Lo publicado está en uso por otras personas: confirmar antes de algo que borre datos o cambie el servidor más allá de publicar código.

## Servidor (producción)

Todo está en `docs/servidor.md`: acceso, sitios, servicios, cuentas y lo que no se debe hacer.

- Real: https://vps-cfbba576.vps.ovh.ca · Prueba con datos ficticios: https://vps-cfbba576.vps.ovh.ca:8443
- Entrar: `ssh -o BatchMode=yes ubuntu@15.235.25.6 '<comando>'` (llave SSH de esta PC; nunca escribir contraseñas).
- Publicar cambios: `bash deploy/subir.sh` (pruebas, compilación, subida con hash, instalación y comprobación).
- Las contraseñas de las cuentas están en `/opt/sag/.local/initial-credentials.txt`: no leerlas ni pegarlas en el chat.

## Local

- `npm run dev`: demostración en http://127.0.0.1:5173 con `.data/demo.sqlite`. Es la base con la que Carlos prueba: no enviar formularios ni cambiar datos ahí desde scripts.
- Scripts que llenan o envían formularios solo contra el servidor aislado de pruebas (`node --experimental-sqlite --import tsx tests/e2e-server.ts`, puerto 4173, base temporal).
- Verificación: `npx tsc --noEmit`, `npm test` (API), `npm run test:e2e` (navegador, compila y usa el puerto 4173), `node scripts/audit-accessibility.mjs` (axe; `AUDIT_BASE=http://127.0.0.1:4173` para el servidor aislado).
