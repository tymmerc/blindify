#!/usr/bin/env bash
# Tests de tools/trivy/resume.sh : rapports d'exemple (fixtures/) et cas
# limites fabriques ici. Lances par la CI avant le scan de l'image, et en
# local sans rien installer d'autre que jq.
#
# Usage : bash tools/trivy/resume.test.sh

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
RESUME="$DIR/resume.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ECHECS=0

ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; ECHECS=$((ECHECS + 1)); }

# contient SORTIE TEXTE NOM : la sortie contient le texte tel quel.
contient() {
  if grep -qF -- "$2" <<< "$1"; then ok "$3"; else ko "$3 (attendu : $2)"; fi
}

# absent SORTIE TEXTE NOM : la sortie ne contient pas le texte.
absent() {
  if grep -qF -- "$2" <<< "$1"; then ko "$3 (trouve : $2)"; else ok "$3"; fi
}

# avant SORTIE A B NOM : la premiere ligne contenant A precede celle contenant B.
avant() {
  local la lb
  la=$(grep -nF -- "$2" <<< "$1" | head -1 | cut -d: -f1)
  lb=$(grep -nF -- "$3" <<< "$1" | head -1 | cut -d: -f1)
  if [[ -n "$la" && -n "$lb" && "$la" -lt "$lb" ]]; then ok "$4"; else ko "$4"; fi
}

echo "-- image : vulnerabilites et secrets"
SORTIE=$(bash "$RESUME" image "$DIR/fixtures/image.json")
contient "$SORTIE" "Image \`exemple:test\` (alpine 3.24.2), Trivy 0.74.0." "en-tete avec l'image et la version"
contient "$SORTIE" "| CRITICAL | 2 | 1 |" "compte des CRITICAL, dont corrigeables"
contient "$SORTIE" "| HIGH | 2 | 2 |" "compte des HIGH"
contient "$SORTIE" "| MEDIUM | 1 | 1 |" "compte des MEDIUM"
contient "$SORTIE" "| LOW | 1 | 0 |" "une LOW sans correctif"
contient "$SORTIE" "| UNKNOWN | 0 | 0 |" "gravite absente comptee a zero"
contient "$SORTIE" "**Secrets trouves : 1**" "nombre de secrets"
contient "$SORTIE" "[CVE-2099-0001](https://avd.aquasec.com/nvd/cve-2099-0001)" "lien vers l'avis"
contient "$SORTIE" "| pas de correctif | CVE-2099-0002 |" "CRITICAL sans correctif, adresse douteuse sans lien"
contient "$SORTIE" "| app/node_modules/paquet |" "emplacement sans package.json"
contient "$SORTIE" "| exemple:test (alpine 3.24.2) |" "paquet systeme : la cible comme emplacement"
contient "$SORTIE" "paquet\\|piege" "barre verticale echappee"
contient "$SORTIE" "&lt;img src=x&gt;" "balise HTML neutralisee"
absent "$SORTIE" "<img" "aucune balise HTML brute"
absent "$SORTIE" "CVE-2099-0005" "MEDIUM absente du tableau detaille"
avant "$SORTIE" "| CRITICAL | busybox" "| HIGH | paquet" "CRITICAL avant HIGH"
contient "$SORTIE" "| HIGH | exemple-cle : Cle d'exemple | /app/.env | 3 |" "ligne du secret"
absent "$SORTIE" "valeur-qui-ne-doit-pas-sortir" "valeur du secret jamais recopiee"

echo "-- config : erreurs de configuration"
SORTIE=$(bash "$RESUME" config "$DIR/fixtures/config.json")
contient "$SORTIE" "| HIGH | Dockerfile | [DS-0002](https://avd.aquasec.com/misconfig/ds-0002) | Image user should not be 'root' | Add 'USER &lt;non root user name&gt;' line to the Dockerfile | 1 |" "ligne DS-0002 complete"
contient "$SORTIE" "| LOW | Dockerfile | [DS-0026]" "ligne DS-0026"
absent "$SORTIE" "DS-0001" "regle respectee (PASS) absente"
avant "$SORTIE" "DS-0002" "DS-0026" "HIGH avant LOW"

echo "-- rapports vides"
echo '{"SchemaVersion": 2, "ArtifactName": "vide:test"}' > "$TMP/vide.json"
SORTIE=$(bash "$RESUME" image "$TMP/vide.json")
contient "$SORTIE" "Aucune vulnerabilite CRITICAL ou HIGH." "image sans resultat"
contient "$SORTIE" "**Secrets trouves : 0**" "zero secret"
absent "$SORTIE" "### Secrets" "pas de tableau de secrets vide"
SORTIE=$(bash "$RESUME" config "$TMP/vide.json")
contient "$SORTIE" "Aucun probleme releve." "Dockerfile sans probleme"

echo "-- tableau plafonne"
jq -n '{Results: [{Target: "t", Vulnerabilities: [range(205)
  | {VulnerabilityID: "CVE-2099-\(1000 + .)", PkgName: "p", InstalledVersion: "1",
     FixedVersion: "2", Status: "fixed", Severity: "HIGH"}]}]}' > "$TMP/gros.json"
SORTIE=$(bash "$RESUME" image "$TMP/gros.json")
contient "$SORTIE" "Et 5 autres : voir le rapport JSON du run." "au-dela de 200 lignes"
absent "$SORTIE" "CVE-2099-1204" "205e ligne non affichee"

echo "-- entrees refusees"
for cas in "inconnu $DIR/fixtures/image.json" "image $TMP/absent.json" "image"; do
  # shellcheck disable=SC2086 # decoupage voulu : mode et chemin
  if bash "$RESUME" $cas > /dev/null 2>&1; then
    ko "refus de : $cas"
  else
    code=$?
    if [[ $code -eq 2 ]]; then ok "refus (code 2) de : $cas"; else ko "code $code pour : $cas"; fi
  fi
done
echo "pas du JSON" > "$TMP/casse.json"
if bash "$RESUME" image "$TMP/casse.json" > /dev/null 2>&1; then ko "JSON casse accepte"; else ok "JSON casse refuse"; fi

echo
if [[ $ECHECS -gt 0 ]]; then
  echo "$ECHECS test(s) en echec"
  exit 1
fi
echo "Tous les tests passent."
