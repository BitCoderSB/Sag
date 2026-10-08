#!/usr/bin/env bash
# Instala o actualiza SAG en un servidor Ubuntu. Se ejecuta en el servidor, después de extraer sag.tar.gz en /opt/sag:
#   sudo bash /opt/sag/deploy/instalar.sh
# Con un dominio propio:  sudo SAG_DOMINIO=sag.midominio.com bash /opt/sag/deploy/instalar.sh
# Sitio de prueba con datos ficticios en el puerto 8443:  sudo SAG_PRUEBA=1 bash /opt/sag/deploy/instalar.sh
#   (una vez creado, las siguientes ejecuciones lo actualizan solas; se quita con: sudo systemctl disable --now sag-demo)
# Volver a ejecutarlo actualiza la aplicación: no toca la base de datos, las cuentas, /etc/sag.env ni el Caddyfile.
set -euo pipefail

APP=/opt/sag
DOMINIO="${SAG_DOMINIO:-vps-cfbba576.vps.ovh.ca}"
# Solo si se indica SAG_DOMINIO se reescriben el origen y el Caddyfile existentes (cambio de dominio).
CAMBIAR_DOMINIO="${SAG_DOMINIO:+si}"
paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
falla() { printf '\n\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falla "Ejecútalo con sudo: sudo bash $APP/deploy/instalar.sh"
{ [ -f "$APP/package.json" ] && [ -f "$APP/dist/index.html" ]; } || falla "Falta la aplicación en $APP. Extrae primero sag.tar.gz ahí."
cd "$APP"

paso "1/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --experimental-sqlite -e "require('node:sqlite')" 2>/dev/null || falla "Node $(node -v) no puede abrir SQLite con --experimental-sqlite."
echo "Node $(node -v)"

paso "2/6 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y caddy || falla "No se pudo instalar Caddy con apt. Instálalo según https://caddyserver.com/docs/install y vuelve a ejecutar este script."
fi
caddy version

paso "3/6 Usuario del servicio y permisos"
id sag >/dev/null 2>&1 || useradd --system --home-dir "$APP" --no-create-home --shell /usr/sbin/nologin sag
mkdir -p "$APP/.data" "$APP/.local"
chown -R sag:sag "$APP"
chmod 700 "$APP/.data" "$APP/.local"

paso "4/6 Dependencias"
sudo -H -u sag npm ci --omit=dev --no-audit --no-fund

paso "5/6 Cuentas"
usuarios=0
if [ -f .data/sag.sqlite ]; then
  usuarios=$(sudo -H -u sag node --experimental-sqlite -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('.data/sag.sqlite').prepare('SELECT count(*) AS n FROM users').get().n)" 2>/dev/null || echo 0)
fi
if [ "$usuarios" -gt 0 ]; then
  echo "Ya hay $usuarios cuentas; no se modifican."
elif [ "${SAG_SIN_CUENTAS:-}" = 1 ]; then
  echo "Cuentas pendientes. Para crearlas, vuelve a ejecutar este script sin SAG_SIN_CUENTAS."
else
  # Los datos pueden llegar como variables (SAG_SOFTWARE_NAME, SAG_SOFTWARE_EMAIL, ...); lo que falte se pregunta
  # solo si hay una terminal. Vacío deja el valor de ejemplo.
  [ -t 0 ] && echo "Escribe el nombre y el correo de cada persona. El correo es su usuario para entrar. Enter deja el de ejemplo."
  declare -A etiqueta=([SOFTWARE]="Responsable de Software" [HARDWARE]="Responsable de Hardware" [RESEARCH]="Responsable de Investigación" [DIRECTOR]="Jefe (solo consulta)")
  datos=()
  for rol in SOFTWARE HARDWARE RESEARCH DIRECTOR; do
    var_nombre="SAG_${rol}_NAME"; var_correo="SAG_${rol}_EMAIL"
    nombre="${!var_nombre:-}"; correo="${!var_correo:-}"
    if [ -t 0 ]; then
      [ -n "$nombre" ] || read -rp "${etiqueta[$rol]} · nombre: " nombre
      [ -n "$correo" ] || read -rp "${etiqueta[$rol]} · correo: " correo
    fi
    datos+=("$var_nombre=$nombre" "$var_correo=$correo")
  done
  sudo -H -u sag env "${datos[@]}" npm run setup --silent
fi

paso "6/6 Servicio y HTTPS"
if [ ! -f /etc/sag.env ]; then
  cat > /etc/sag.env <<EOF
# Configuración de SAG. Después de cambiarla: sudo systemctl restart sag
PORT=3001
SAG_HOST=127.0.0.1
SAG_ORIGINS=https://$DOMINIO
SAG_SECURE_COOKIE=1
SAG_TRUST_PROXY=1
EOF
elif [ "$CAMBIAR_DOMINIO" = si ]; then
  sed -i "s|^SAG_ORIGINS=.*|SAG_ORIGINS=https://$DOMINIO|" /etc/sag.env
fi
install -m 644 deploy/sag.service /etc/systemd/system/sag.service
systemctl daemon-reload
systemctl enable sag >/dev/null 2>&1
systemctl restart sag
for _ in $(seq 1 20); do curl -fsS -o /dev/null http://127.0.0.1:3001/api/session && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:3001/api/session || { journalctl -u sag -n 30 --no-pager; falla "SAG no arrancó. Arriba está su registro."; }
echo "SAG responde en el servidor."

CADDY_CAMBIO=no
if [ "$CAMBIAR_DOMINIO" = si ] || ! grep -q "reverse_proxy 127.0.0.1:3001" /etc/caddy/Caddyfile 2>/dev/null; then
  CADDY_CAMBIO=si
  if [ -f /etc/caddy/Caddyfile ] && [ ! -f /etc/caddy/Caddyfile.antes-de-sag ]; then cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-de-sag; fi
  cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3001
}
EOF
fi

PRUEBA=no
if [ "${SAG_PRUEBA:-}" = 1 ] || systemctl is-enabled sag-demo >/dev/null 2>&1; then
  PRUEBA=si
  echo "Sitio de prueba (datos ficticios): puerto 8443"
  if [ ! -f /etc/sag-demo.env ] || [ "$CAMBIAR_DOMINIO" = si ]; then
    cat > /etc/sag-demo.env <<EOF
# Sitio de prueba: datos ficticios y acceso con un botón, sin contraseña. No escribir datos reales aquí.
PORT=3002
SAG_HOST=127.0.0.1
SAG_ORIGINS=https://$DOMINIO:8443
SAG_SECURE_COOKIE=1
SAG_TRUST_PROXY=1
SAG_DEMO=1
EOF
  fi
  install -m 644 deploy/sag-demo.service /etc/systemd/system/sag-demo.service
  systemctl daemon-reload
  systemctl enable sag-demo >/dev/null 2>&1
  systemctl restart sag-demo
  for _ in $(seq 1 20); do curl -fsS -o /dev/null http://127.0.0.1:3002/api/session && break; sleep 1; done
  curl -fsS -o /dev/null http://127.0.0.1:3002/api/session || { journalctl -u sag-demo -n 30 --no-pager; falla "El sitio de prueba no arrancó. Arriba está su registro."; }
  if ! grep -q "reverse_proxy 127.0.0.1:3002" /etc/caddy/Caddyfile; then
    CADDY_CAMBIO=si
    cat >> /etc/caddy/Caddyfile <<EOF

$DOMINIO:8443 {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3002
}
EOF
  fi
  if command -v ufw >/dev/null && ufw status | grep -qiE "status: active|estado: activo"; then ufw allow 8443/tcp >/dev/null; fi
fi
# Caddy solo se toca si cambió su configuración. Recargarlo en cada publicación dejaba colgadas las conexiones
# abiertas de los navegadores (la página se quedaba en «La solicitud tardó demasiado»); reiniciar las cierra limpio.
if [ "$CADDY_CAMBIO" = si ]; then systemctl restart caddy; elif ! systemctl is-active --quiet caddy; then systemctl start caddy; fi
if command -v ufw >/dev/null && ufw status | grep -qiE "status: active|estado: activo"; then ufw allow 80,443/tcp >/dev/null; fi

echo "Esperando el certificado HTTPS (hasta 90 s)..."
https=no
for _ in $(seq 1 30); do curl -fsS -o /dev/null --max-time 5 "https://$DOMINIO/api/session" && { https=si; break; }; sleep 3; done

paso "Listo"
if [ "$https" = si ]; then echo "Abre: https://$DOMINIO"
else echo "SAG funciona, pero HTTPS aún no responde. Revisa: sudo journalctl -u caddy -n 50 --no-pager"; fi
if [ "$PRUEBA" = si ]; then echo "Sitio de prueba: https://$DOMINIO:8443  (datos ficticios, sin contraseña)"; fi
[ "$usuarios" -gt 0 ] || [ "${SAG_SIN_CUENTAS:-}" = 1 ] || echo "Contraseñas iniciales: sudo cat $APP/.local/initial-credentials.txt  (entrégalas y después borra el archivo)"
