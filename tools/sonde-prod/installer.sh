#!/usr/bin/env bash
# Installe ou retire la sonde de prod de Blindz sur le VPS. En root, apres le
# GO de Tym. Ne change jamais la branche de /opt/blindify (elle sert le site de
# dev) : les fichiers sont lus dans git (git show), a la reference donnee.
#
#   git -C /opt/blindify fetch -q origin
#   git -C /opt/blindify show origin/main:tools/sonde-prod/installer.sh | bash -s -- origin/main
#   git -C /opt/blindify show origin/main:tools/sonde-prod/installer.sh | bash -s -- --retirer
#
# Installer : prepare le code et les unites a cote de l'installation en place,
# verifie que le node de l'unite (ExecStart) existe et que la sonde preparee
# demarre et trouve une config d'envoi complete (sonde.mjs --verifier-config,
# comme l'unite : sans variable d'environnement). Seulement ensuite, remplace
# l'installation en place : le code dans /opt/monitoring/sonde-prod, les unites
# de infra/sonde-prod dans /etc/systemd/system. Un echec avant ce point ne
# change rien et ne laisse aucun fichier a moitie copie. Puis un premier
# passage tout de suite (il dit si quelque chose cloche, et envoie un vrai
# e-mail si la prod est en panne) et le minuteur (prochain passage dans 65 min).
# Retirer : arrete et supprime le minuteur, les unites et le code. L'etat
# (/var/lib/blindz-sonde-prod) et le journal (/var/log/blindz-sonde-prod) restent.
#
# Essai sans systeme : SONDE_DEST et SONDE_UNITS vers un dossier jetable et
# SONDE_SANS_SYSTEMCTL=1 (la verification de config garde alors les variables
# d'environnement) ; SONDE_REPO pour lire un autre clone.
set -euo pipefail

REPO="${SONDE_REPO:-/opt/blindify}"
DEST="${SONDE_DEST:-/opt/monitoring/sonde-prod}"
UNITS="${SONDE_UNITS:-/etc/systemd/system}"
ESSAI="${SONDE_SANS_SYSTEMCTL:-0}"
CODE=(sonde.mjs passage.mjs checks.mjs decision.mjs message.mjs mail.mjs storage.mjs targets.mjs)
SCRIPTS=(echec-ntfy.sh)
SERVICE=blindz-sonde-prod.service
TIMER=blindz-sonde-prod.timer
UNIT_FILES=("$SERVICE" blindz-sonde-prod-echec.service "$TIMER")
STAGE=""
UNITS_TMP=()

sysctl_() { if [ "$ESSAI" = 1 ]; then echo "  (essai) systemctl $*"; else systemctl "$@"; fi; }

# Garde-fous avant d'ecrire ou d'effacer quoi que ce soit.
verifier() {
  if [ "$ESSAI" != 1 ] && [ "$(id -u)" != 0 ]; then
    echo "a lancer en root (unites dans /etc/systemd/system)" >&2; exit 1
  fi
  # rm -rf "$DEST" au retrait : jamais sur autre chose qu'un dossier sonde-prod...
  case "$DEST" in
    *//*|*/./*|*/../*) echo "SONDE_DEST sans // ni . ni .. (recu : $DEST)" >&2; exit 2 ;;
    /*/sonde-prod) ;;
    *) echo "SONDE_DEST doit etre un chemin absolu qui finit par /sonde-prod (recu : $DEST)" >&2; exit 2 ;;
  esac
  # ... ni dans un depot git (/opt/blindify, un worktree) : ce serait effacer du code suivi.
  local proche="$DEST"
  while [ ! -d "$proche" ]; do proche="$(dirname "$proche")"; done
  if git -C "$proche" rev-parse --git-dir >/dev/null 2>&1; then
    echo "SONDE_DEST est dans un depot git ($DEST) : refuse" >&2; exit 2
  fi
}

# En cas d'echec, efface ce qui a ete prepare (jamais l'installation en place).
nettoyer() {
  if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi
  local t
  for t in "${UNITS_TMP[@]}"; do rm -f "$t"; done
}

retirer() {
  sysctl_ disable --now "$TIMER" || true
  for u in "${UNIT_FILES[@]}"; do rm -f "$UNITS/$u"; done
  sysctl_ daemon-reload
  rm -rf "$DEST"
  echo "Sonde retiree. Etat et journal gardes : /var/lib/blindz-sonde-prod, /var/log/blindz-sonde-prod"
}

# Un fichier de la reference git, dans le dossier de preparation.
copier() {
  local source="$1" cible="$2" mode="$3"
  git -C "$REPO" show "$REF:$source" > "$cible"
  chmod "$mode" "$cible"
}

preparer() {
  mkdir -p "$(dirname "$DEST")"
  STAGE="$(mktemp -d "$(dirname "$DEST")/.sonde-prod.XXXXXX")"
  local f u
  for f in "${CODE[@]}"; do copier "tools/sonde-prod/$f" "$STAGE/$f" 600; done
  for f in "${SCRIPTS[@]}"; do copier "tools/sonde-prod/$f" "$STAGE/$f" 700; done
  mkdir "$STAGE/unites"
  for u in "${UNIT_FILES[@]}"; do copier "infra/sonde-prod/$u" "$STAGE/unites/$u" 644; done
}

# Le node de l'unite doit exister, et la sonde preparee demarrer avec lui et
# trouver une config d'envoi complete. Sinon : rien n'est change.
controler() {
  local node
  node="$(sed -n 's/^ExecStart=\([^ ]*\) .*/\1/p' "$STAGE/unites/$SERVICE")"
  if [ -z "$node" ] || [ ! -x "$node" ]; then
    echo "node introuvable : '$node' (ExecStart de infra/sonde-prod/$SERVICE)." >&2
    echo "Rien n'a ete change. Mettre ce chemin a jour (ls /root/.nvm/versions/node) puis relancer." >&2
    exit 1
  fi
  # Comme l'unite, qui n'a aucune variable d'environnement : seul alerte.env compte.
  local propre=(env -i)
  if [ "$ESSAI" = 1 ]; then propre=(); fi
  if ! "${propre[@]}" "$node" "$STAGE/sonde.mjs" --verifier-config; then
    echo "Rien n'a ete change. Completer la config d'envoi (en-tete de tools/sonde-prod/mail.mjs) puis relancer." >&2
    exit 1
  fi
}

# Remplace l'installation en place par celle preparee.
poser() {
  local u ancien="$STAGE.ancien"
  for u in "${UNIT_FILES[@]}"; do
    UNITS_TMP+=("$UNITS/.$u.nouveau")
    install -m 644 "$STAGE/unites/$u" "$UNITS/.$u.nouveau"
  done
  rm -rf "$STAGE/unites"
  if [ -e "$DEST" ]; then mv -T "$DEST" "$ancien"; fi
  if ! mv -T "$STAGE" "$DEST"; then
    if [ -e "$ancien" ]; then mv -T "$ancien" "$DEST"; fi
    echo "remplacement de $DEST impossible : installation precedente remise" >&2; exit 1
  fi
  STAGE=""
  rm -rf "$ancien"
  for u in "${UNIT_FILES[@]}"; do mv -f "$UNITS/.$u.nouveau" "$UNITS/$u"; done
  UNITS_TMP=()
}

installer() {
  git -C "$REPO" rev-parse --verify -q "$REF^{commit}" >/dev/null \
    || { echo "reference git inconnue : $REF (git -C $REPO fetch origin ?)" >&2; exit 1; }
  echo "Sonde de prod depuis $REF ($(git -C "$REPO" rev-parse --short "$REF"))"
  trap nettoyer EXIT
  preparer
  controler
  poser
  echo "  code   : $DEST"
  echo "  unites : $UNITS/{$SERVICE,blindz-sonde-prod-echec.service,$TIMER}"
  sysctl_ daemon-reload
  # Premier passage tout de suite : un vrai solo par lien sur blindz.app.
  sysctl_ start "$SERVICE" || echo "  !! premier passage en echec : journalctl -u blindz-sonde-prod -n 40" >&2
  sysctl_ enable --now "$TIMER"
  echo "Fait. Prochain passage : systemctl list-timers $TIMER ; journal : tail /var/log/blindz-sonde-prod/sonde.log"
}

case "${1:-}" in
  --retirer) verifier; retirer ;;
  ""|-*) echo "usage : installer.sh <reference git, ex. origin/main> | --retirer" >&2; exit 2 ;;
  *) REF="$1"; verifier; installer ;;
esac
