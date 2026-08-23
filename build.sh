#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/home/hermes/repos/games/wingscommander}"
RUN_INSTALL="${RUN_INSTALL:-1}"
DRY_RUN="${DRY_RUN:-0}"

case "$DEPLOY_DIR" in
  /home/hermes/repos/games/wingscommander|/var/www/games/wingscommander) ;;
  *)
    echo "ERROR: destino no autorizado: $DEPLOY_DIR" >&2
    exit 2
    ;;
esac

for command_name in rsync jq npm; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: falta el comando $command_name" >&2
    exit 1
  }
done

[[ -s "$REPO_DIR/package.json" ]] || { echo "ERROR: falta package.json" >&2; exit 1; }
[[ -s "$REPO_DIR/project.json" ]] || { echo "ERROR: falta project.json" >&2; exit 1; }
jq empty "$REPO_DIR/project.json"

if [[ "$RUN_INSTALL" == "1" ]]; then
  echo "==> Instalando dependencias"
  (cd "$REPO_DIR" && npm install --no-audit --no-fund)
fi

echo "==> Generando dist"
(cd "$REPO_DIR" && npm run build)

[[ -s "$REPO_DIR/dist/index.html" ]] || { echo "ERROR: dist sin index.html" >&2; exit 1; }
[[ -s "$REPO_DIR/dist/game.js" ]] || { echo "ERROR: dist sin game.js" >&2; exit 1; }
[[ -s "$REPO_DIR/dist/pack.js" ]] || { echo "ERROR: dist sin pack.js" >&2; exit 1; }

STAGE_DIR="$(mktemp -d /tmp/wingscommander-build.XXXXXX)"
trap 'rm -rf -- "$STAGE_DIR"' EXIT
chmod 755 "$STAGE_DIR"
rsync -a "$REPO_DIR/dist/" "$STAGE_DIR/"
rsync -a "$REPO_DIR/project.json" "$STAGE_DIR/"
if [[ -d "$REPO_DIR/screenshots" ]]; then
  rsync -a "$REPO_DIR/screenshots/" "$STAGE_DIR/screenshots/"
fi

jq empty "$STAGE_DIR/project.json"
if find "$STAGE_DIR" \( -name .git -o -name node_modules -o -name tests \) -print | grep -q .; then
  echo "ERROR: la publicación contiene archivos privados o de desarrollo" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR"
RSYNC_ARGS=(-a --delete --delete-delay --delay-updates)
if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
  echo "==> Simulación de despliegue en $DEPLOY_DIR"
else
  echo "==> Desplegando en $DEPLOY_DIR"
fi
rsync "${RSYNC_ARGS[@]}" "$STAGE_DIR/" "$DEPLOY_DIR/"

if [[ "$DRY_RUN" != "1" ]]; then
  [[ -s "$DEPLOY_DIR/index.html" ]] || { echo "ERROR: despliegue incompleto" >&2; exit 1; }
  echo "OK: Wings Commander desplegado"
fi
