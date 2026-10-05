#!/usr/bin/env bash
# Installe ou retire la sonde de prod de Blindz sur le VPS. En root, apres le
# GO de Tym. Ne change jamais la branche de /opt/blindify (elle sert le site de
# dev) : les fichiers sont lus dans git (git show), a la reference donnee.
#
#   git -C /opt/blindify fetch -q origin
#   git -C /opt/blindify show origin/main:tools/sonde-prod/installer.sh | bash -s -- origin/main
#   git -C /opt/blindify show origin/main:tools/sonde-prod/installer.sh | bash -s -- --retirer
#
# Installer : copie le code dans /opt/monitoring/sonde-prod, les unites de
# infra/sonde-prod dans /etc/systemd/system, lance un premier passage (il dit
# tout de suite si quelque chose cloche) puis active le minuteur (65 min).
# Retirer : arrete et supprime le minuteur, l'unite et le code. L'etat
# (/var/lib/blindz-sonde-prod) et le journal (/var/log/blindz-sonde-prod) restent.
#
# Essai sans systeme : SONDE_DEST et SONDE_UNITS vers un dossier jetable et
# SONDE_SANS_SYSTEMCTL=1 ; SONDE_REPO pour lire un autre clone.
set -euo pipefail

REPO="${SONDE_REPO:-/opt/blindify}"
DEST="${SONDE_DEST:-/opt/monitoring/sonde-prod}"
UNITS="${SONDE_UNITS:-/etc/systemd/system}"
CODE=(sonde.mjs checks.mjs decision.mjs message.mjs mail.mjs storage.mjs targets.mjs)
UNIT_FILES=(blindz-sonde-prod.service blindz-sonde-prod.timer)
TIMER=blindz-sonde-prod.timer

sysctl_() { if [ "${SONDE_SANS_SYSTEMCTL:-0}" = 1 ]; then echo "  (essai) systemctl $*"; else systemctl "$@"; fi; }

retirer() {
  sysctl_ disable --now "$TIMER" || true
  for u in "${UNIT_FILES[@]}"; do rm -f "$UNITS/$u"; done
  sysctl_ daemon-reload
  rm -rf "$DEST"
  echo "Sonde retiree. Etat et journal gardes : /var/lib/blindz-sonde-prod, /var/log/blindz-sonde-prod"
}

# Ecrit un fichier de la reference git, sans laisser de fichier a moitie copie.
copier() {
  local source="$1" cible="$2" mode="$3"
  git -C "$REPO" show "$REF:$source" > "$cible.tmp"
  chmod "$mode" "$cible.tmp"
  mv "$cible.tmp" "$cible"
}

installer() {
  git -C "$REPO" rev-parse --verify -q "$REF^{commit}" >/dev/null \
    || { echo "reference git inconnue : $REF (git -C $REPO fetch origin ?)" >&2; exit 1; }
  echo "Sonde de prod depuis $REF ($(git -C "$REPO" rev-parse --short "$REF"))"
  install -d -m 700 "$DEST"
  for f in "${CODE[@]}"; do copier "tools/sonde-prod/$f" "$DEST/$f" 600; done
  for u in "${UNIT_FILES[@]}"; do copier "infra/sonde-prod/$u" "$UNITS/$u" 644; done
  echo "  code   : $DEST"
  echo "  unites : $UNITS/blindz-sonde-prod.{service,timer}"
  sysctl_ daemon-reload
  # Premier passage tout de suite : un vrai solo par lien sur blindz.app.
  sysctl_ start blindz-sonde-prod.service || echo "  !! premier passage en echec : journalctl -u blindz-sonde-prod -n 40" >&2
  sysctl_ enable --now "$TIMER"
  echo "Fait. Prochain passage : systemctl list-timers $TIMER ; journal : tail /var/log/blindz-sonde-prod/sonde.log"
}

case "${1:-}" in
  --retirer) retirer ;;
  ""|-*) echo "usage : installer.sh <reference git, ex. origin/main> | --retirer" >&2; exit 2 ;;
  *) REF="$1"; installer ;;
esac
