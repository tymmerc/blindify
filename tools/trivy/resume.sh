#!/usr/bin/env bash
# Resume Markdown d'un rapport JSON de Trivy, pour la page du run GitHub
# Actions ($GITHUB_STEP_SUMMARY). Le script relit un rapport deja produit et
# n'appelle jamais Trivy. Il ne decide de rien : ce qui bloque la CI, ce sont
# les commandes trivy elles-memes (--exit-code 1). Il marche aussi en local.
#
# Usage :
#   bash tools/trivy/resume.sh image  rapport-image.json   # vulnerabilites et secrets
#   bash tools/trivy/resume.sh config rapport-config.json  # erreurs de configuration
#
# Les noms de paquets et de fichiers viennent de l'image scannee : ils sont
# echappes avant d'entrer dans un tableau Markdown. Le contenu d'un secret
# n'est jamais recopie, seulement la regle, le fichier et la ligne.
# Tests : bash tools/trivy/resume.test.sh

set -euo pipefail

# Au-dela, le detail reste dans le rapport JSON (artefact du run).
MAX_LIGNES=200

usage() {
  echo "usage : bash tools/trivy/resume.sh image|config RAPPORT.json" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage
MODE="$1"
RAPPORT="$2"
[[ "$MODE" == image || "$MODE" == config ]] || usage

if [[ ! -f "$RAPPORT" ]]; then
  echo "rapport introuvable : $RAPPORT" >&2
  exit 2
fi
if ! jq -e 'type == "object"' "$RAPPORT" > /dev/null 2>&1; then
  echo "rapport illisible, JSON de Trivy attendu : $RAPPORT" >&2
  exit 2
fi

# Fonctions communes aux deux modes.
COMMUN=$(cat <<'JQ'
# Une cellule de tableau : une seule ligne, ni barre verticale ni balise HTML.
def cellule: tostring | gsub("[\r\n]+"; " ") | gsub("\\|"; "\\|")
  | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("`"; "'");
# Un lien seulement vers une adresse https sans espace ni parenthese.
def lien($texte; $url):
  if ($url | type) == "string" and ($url | test("^https://[^\\s()]+$"))
  then "[\($texte | cellule)](\($url))" else ($texte | cellule) end;
def rang: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}[.] // 4;
def gravites: "CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN";
JQ
)

IMAGE=$(cat <<'JQ'
[.Results[]? | .Target as $cible | .Vulnerabilities[]? | . + {Cible: $cible}] as $vulns
| [.Results[]? | .Target as $fichier | .Secrets[]?
    | {Severity, RuleID, Title, Fichier: $fichier, Ligne: .StartLine}] as $secrets
| ([$vulns[] | select(.Severity == "CRITICAL" or .Severity == "HIGH")]
    | sort_by((.Severity | rang), .PkgName, .VulnerabilityID)) as $graves
| "## Image Docker : vulnerabilites et secrets",
  "",
  "Image `\(.ArtifactName // "?" | cellule)`"
    + (if .Metadata.OS then " (\(.Metadata.OS.Family) \(.Metadata.OS.Name))" | cellule else "" end)
    + ", Trivy \(.Trivy.Version // "?" | cellule).",
  "",
  "Ce qui bloque la CI : une vulnerabilite CRITICAL pour laquelle une version corrigee existe deja, ou un secret, quel qu'il soit. Le reste est signale ici sans bloquer.",
  "",
  "| Gravite | Vulnerabilites | Dont corrigeables |",
  "|---|---:|---:|",
  (gravites as $g | [$vulns[] | select(.Severity == $g)]
    | "| \($g) | \(length) | \(map(select(.Status == "fixed")) | length) |"),
  "",
  "**Secrets trouves : \($secrets | length)**",
  "",
  (if ($graves | length) == 0 then "Aucune vulnerabilite CRITICAL ou HIGH."
   else
     "### Vulnerabilites CRITICAL et HIGH",
     "",
     "| Gravite | Paquet | Installe | Corrige en | Identifiant | Emplacement |",
     "|---|---|---|---|---|---|",
     ($graves[:$max][]
       | "| \(.Severity | cellule) | \(.PkgName | cellule) | \(.InstalledVersion | cellule)"
         + " | \(if (.FixedVersion // "") == "" then "pas de correctif" else .FixedVersion end | cellule)"
         + " | \(lien(.VulnerabilityID; .PrimaryURL))"
         + " | \(.PkgPath // .Cible | sub("/package\\.json$"; "") | cellule) |"),
     (if ($graves | length) > $max
      then "", "Et \(($graves | length) - $max) autres : voir le rapport JSON du run."
      else empty end)
   end),
  "",
  "MEDIUM, LOW et UNKNOWN : le detail est dans le rapport JSON, en artefact du run.",
  (if ($secrets | length) > 0 then
     "",
     "### Secrets",
     "",
     "| Gravite | Regle | Fichier | Ligne |",
     "|---|---|---|---:|",
     ($secrets | sort_by(.Severity | rang) | .[:$max][]
       | "| \(.Severity | cellule) | \(.RuleID | cellule) : \(.Title // "" | cellule)"
         + " | \(.Fichier | cellule) | \(.Ligne // "-" | cellule) |")
   else empty end)
JQ
)

CONFIG=$(cat <<'JQ'
[.Results[]? | .Target as $cible | .Misconfigurations[]? | select(.Status == "FAIL")
  | . + {Cible: $cible}] | sort_by((.Severity | rang), .ID) as $echecs
| "## Dockerfile : erreurs de configuration (informatif)",
  "",
  "Ne bloque jamais la CI. C'est la liste des points a reprendre, avec la correction proposee par Trivy.",
  "",
  (if ($echecs | length) == 0 then "Aucun probleme releve."
   else
     "| Gravite | Fichier | Regle | Probleme | Correction proposee | Ligne |",
     "|---|---|---|---|---|---:|",
     ($echecs[:$max][]
       | "| \(.Severity | cellule) | \(.Cible | cellule) | \(lien(.ID; .PrimaryURL))"
         + " | \(.Title // "" | cellule) | \(.Resolution // .Message // "" | cellule)"
         + " | \(.CauseMetadata.StartLine // "-" | cellule) |")
   end)
JQ
)

if [[ "$MODE" == image ]]; then
  PROGRAMME="$COMMUN"$'\n'"$IMAGE"
else
  PROGRAMME="$COMMUN"$'\n'"$CONFIG"
fi

jq -r --argjson max "$MAX_LIGNES" "$PROGRAMME" "$RAPPORT"
echo
