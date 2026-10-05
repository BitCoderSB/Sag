#!/usr/bin/env bash
# Publica la versión local de SAG en el servidor. Se ejecuta en la PC de Carlos, desde Git Bash, en la carpeta del proyecto:
#   bash deploy/subir.sh
# Pasos: pruebas de API, compilación, paquete sin datos ni credenciales, subida con verificación de hash,
# instalador remoto (actualiza código y dependencias, reinicia servicios) y comprobación por HTTPS.
# Nunca crea cuentas ni toca la base de datos, /etc/sag.env, /etc/sag-demo.env o el Caddyfile.
set -euo pipefail

SERVIDOR="${SAG_SERVIDOR:-ubuntu@15.235.25.6}"
DOMINIO="${SAG_DOMINIO_PUBLICO:-vps-cfbba576.vps.ovh.ca}"
paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
falla() { printf '\n\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }
cd "$(dirname "$0")/.."

paso "Acceso al servidor"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$SERVIDOR" true || falla "No hay acceso por llave a $SERVIDOR. Ver docs/servidor.md."

paso "Pruebas de API"
npm test >/dev/null 2>&1 || falla "Las pruebas fallan. Corre «npm test» para ver cuáles; no se publica."

paso "Compilación"
npm run build >/dev/null || falla "La compilación falla. Corre «npm run build» para ver el error."

paso "Paquete"
rm -f deploy/sag.tar.gz
tar --owner=0 --group=0 --numeric-owner -czf deploy/sag.tar.gz \
  --exclude=./node_modules --exclude=./.data --exclude=./.local --exclude=./test-results \
  --exclude=./playwright-report --exclude=./.impeccable --exclude=./tests --exclude=./deploy/sag.tar.gz .
if tar -tzf deploy/sag.tar.gz | grep -qE '\.sqlite|credentials|^\./\.data/|^\./\.local/|node_modules'; then falla "El paquete incluye datos privados; se cancela."; fi
hash_local=$(sha256sum deploy/sag.tar.gz | cut -d' ' -f1)
echo "deploy/sag.tar.gz · $(du -h deploy/sag.tar.gz | cut -f1)"

paso "Subida"
scp -o BatchMode=yes -q deploy/sag.tar.gz "$SERVIDOR:/tmp/sag.tar.gz"
hash_remoto=$(ssh -o BatchMode=yes "$SERVIDOR" 'sha256sum /tmp/sag.tar.gz' | cut -d' ' -f1)
[ "$hash_local" = "$hash_remoto" ] || falla "El paquete llegó distinto al servidor; vuelve a intentarlo."
echo "Hash verificado."

paso "Instalación en el servidor"
estado=0
salida=$(ssh -o BatchMode=yes -o ServerAliveInterval=30 "$SERVIDOR" \
  'sudo tar -xzf /tmp/sag.tar.gz -C /opt/sag && sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a SAG_SIN_CUENTAS=1 bash /opt/sag/deploy/instalar.sh' 2>&1) || estado=$?
if [ "$estado" -ne 0 ]; then printf '%s\n' "$salida" | sed 's/\x1b\[[0-9;]*m//g' | tail -n 40; falla "El instalador falló en el servidor (arriba, su salida)."; fi
printf '%s\n' "$salida" | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^==>|Node v|responde|Abre:|prueba:|HTTPS aún' || true

paso "Comprobación desde esta PC"
node -e "
const sitios = [['Real', 'https://$DOMINIO', false], ['Prueba', 'https://$DOMINIO:8443', true]];
(async () => {
  let ok = true;
  for (const [nombre, url, demo] of sitios) {
    try {
      const r = await fetch(url + '/api/session'); const s = await r.json();
      const bien = r.status === 200 && s.demo === demo;
      ok = ok && bien;
      console.log((bien ? 'OK   ' : 'MAL  ') + nombre + ' ' + url + ' (HTTP ' + r.status + ', demo=' + s.demo + ')');
    } catch (e) { if (demo) console.log('--   ' + nombre + ' no responde (puede estar apagado)'); else { ok = false; console.log('MAL  ' + nombre + ' ' + url + ' ' + e.message); } }
  }
  process.exit(ok ? 0 : 1);
})();" || falla "El sitio no responde como se esperaba."
paso "Publicado"
