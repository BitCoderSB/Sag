# Servidor de SAG

Datos comprobados al instalar, el 1 de octubre de 2026.

## Sitios

| Sitio | Dirección | Servicio | Puerto interno | Datos | Configuración |
| --- | --- | --- | --- | --- | --- |
| Real | https://vps-cfbba576.vps.ovh.ca | `sag` | 3001 | `/opt/sag/.data/sag.sqlite` y `.data/files` | `/etc/sag.env` |
| Prueba (datos ficticios, acceso con un botón) | https://vps-cfbba576.vps.ovh.ca:8443 | `sag-demo` | 3002 | `/opt/sag/.data/demo.sqlite` y `.data/demo-files` | `/etc/sag-demo.env` |

- Caddy (`/etc/caddy/Caddyfile`) recibe HTTPS en 443 y 8443 y reenvía a los puertos internos. El certificado es de Let's Encrypt; Caddy lo gestiona.
- La app solo escucha en 127.0.0.1. Los dos sitios usan cookies distintas (`sag_session` y `sag_demo_session`), así que abrir uno no cierra la sesión del otro.
- En el sitio de prueba cualquiera con el enlace entra sin contraseña: no se escriben datos reales ahí.

## Máquina

- VPS de OVH `vps-cfbba576.vps.ovh.ca`, IPv4 `15.235.25.6`, IPv6 `2607:5300:205:200::c5f5`. Ubuntu 26.04 LTS, 2 vCores, 4 GB, 40 GB.
- Usuario `ubuntu`, con `sudo` sin contraseña. La app corre como el usuario de sistema `sag` en `/opt/sag`.
- Node v22.23.3 (NodeSource) y Caddy 2.6.2 (apt).
- Firewall `ufw` instalado pero **inactivo**; abiertos hacia fuera: 22 (SSH), 80, 443 y 8443 (Caddy).

## Entrar

El acceso es por la llave SSH de la PC de Carlos (`C:\Users\Carlos\.ssh\id_ed25519`), autorizada en `~ubuntu/.ssh/authorized_keys`. No hay contraseña que escribir.

```bash
ssh ubuntu@15.235.25.6
```

Para comandos sueltos sin sesión interactiva (lo que debe usar un agente):

```bash
ssh -o BatchMode=yes ubuntu@15.235.25.6 'systemctl is-active sag sag-demo caddy'
```

Si responde `Permission denied (publickey)`, la llave ya no está autorizada: pedir a Carlos que ejecute `ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@15.235.25.6` en Git Bash. Un agente nunca escribe la contraseña del servidor.

## Publicar cambios

Desde Git Bash, en la carpeta del proyecto:

```bash
bash deploy/subir.sh
```

Corre las pruebas de API, compila, empaqueta sin `.data`, `.local` ni `node_modules`, sube el paquete verificando su hash, ejecuta `deploy/instalar.sh` en el servidor y comprueba los dos sitios por HTTPS. No crea cuentas ni toca la base de datos, `/etc/sag.env`, `/etc/sag-demo.env` o el Caddyfile. Reinicia los servicios: hay unos segundos sin servicio.

Si se cambia la interfaz, conviene correr antes `npm run test:e2e` (no lo hace el script).

## Revisar

```bash
ssh -o BatchMode=yes ubuntu@15.235.25.6 'sudo journalctl -u sag -n 50 --no-pager'
```

Servicios: `sag`, `sag-demo` y `caddy` (`systemctl status`, `journalctl -u`). Cambiar `/etc/sag.env` o `/etc/sag-demo.env` requiere `sudo systemctl restart sag` (o `sag-demo`).

## Cuentas del sitio real

| Persona | Usuario | Rol |
| --- | --- | --- |
| Aldair | aldair@sag.local | Responsable de Software |
| Alexis | alexis@sag.local | Responsable de Hardware |
| Gerardo | gerardo@sag.local | Responsable de Investigación |
| Ernest | ernest@sag.local | Jefe (solo consulta) |

Las contraseñas iniciales están solo en `/opt/sag/.local/initial-credentials.txt` (permiso 600, dueño `sag`). Carlos las lee con `ssh ubuntu@15.235.25.6 "sudo cat /opt/sag/.local/initial-credentials.txt"`. **Un agente no las lee ni las copia al chat.** La app no tiene recuperación de contraseña. `npm run setup` se niega a correr si ya hay cuentas.

## No hacer

- No copiar `.data` ni `.local` de la PC al servidor: en la PC solo hay datos de demostración.
- No poner `SAG_DEMO=1` en `/etc/sag.env` (convertiría el sitio real en uno sin contraseña).
- No borrar ni reemplazar `/opt/sag/.data`: es la única copia de los datos reales.
- No activar `ufw` sin permitir antes `OpenSSH`, porque se pierde el acceso.

## Pendiente

- **Respaldos automáticos**: no hay ninguno configurado. `npm run backup -- <carpeta>` existe (ver `docs/backend.md`) pero no está programado, y no hay copia fuera del servidor.
- Firewall `ufw` inactivo: decisión de Carlos.
- Dominio propio (opcional): `sudo SAG_DOMINIO=nuevo.dominio bash /opt/sag/deploy/instalar.sh` actualiza el origen y el Caddyfile.
- Apagar el sitio de prueba cuando ya no se use: `sudo systemctl disable --now sag-demo` y quitar su bloque `:8443` del Caddyfile.

## Copias de configuración

`/etc/caddy/Caddyfile.antes-de-sag` (el original de Caddy) y `/etc/sag.env.antes-de-demo` (la configuración real antes de la prueba que activó `SAG_DEMO`; hoy es igual a `/etc/sag.env`).
