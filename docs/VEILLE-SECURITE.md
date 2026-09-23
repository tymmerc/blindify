# Veille sécurité - Blindz

Journal daté de la veille sécurité menée sur le projet. Une entrée par semaine,
même courte, même vide. Ouvert le 2026-09-09.

**Pourquoi ce fichier.** Le dossier de projet remis au jury du titre Concepteur
Développeur d'Applications comporte un chapitre sur la veille menée pendant le
projet : les vulnérabilités suivies, celles trouvées, celles corrigées. Une veille
se date. Elle ne se reconstitue pas après coup.

**Règle d'honnêteté.** Chaque entrée est écrite à la date qu'elle porte. La seule
exception est la première, explicitement marquée comme un inventaire rétrospectif
de ce qui existait avant l'ouverture du journal. On n'antidate rien.

**Format d'une entrée.**

- **Sources consultées** cette semaine.
- **Ce qui concerne Blindz** dans ce qui a été lu.
- **Vérifié dans le code** : ce qui a réellement été ouvert et lu, avec le chemin.
- **Décidé** : corrigé, écarté, ou reporté, et pourquoi.

**Sources suivies en routine.** Avis de sécurité GitHub sur les dépendances du
dépôt, `npm audit` sur les deux paquets, notes de version Node.js, Express,
socket.io, Next.js et ioredis, OWASP Top 10, avis CVE pour PostgreSQL, Redis et
nginx.

**Où écrire.** Les entrées sont classées de la plus récente à la plus ancienne.
Une nouvelle entrée se place donc juste en dessous de cette ligne, avant celle qui
la précède dans le temps. Une semaine sans rien s'écrit quand même, en une ligne :
une semaine vide datée vaut mieux qu'un trou dans le journal.

---

## 2026-09-23 - Deux semaines sans veille, et une CVE dans Express

### D'abord, le trou

Aucune entrée entre le 9 et le 23 septembre. Deux semaines sautées. C'est écrit
ici plutôt que comblé après coup, parce qu'un journal qu'on rattrape ne vaut
rien. Le rythme hebdomadaire n'a pas tenu tout seul, il faut un rappel.

### Sources consultées

`npm audit` sur les deux paquets du dépôt, avis GitHub sur les dépendances,
et relecture de l'état de la chaîne d'exposition corrigée le 9.

### Ce qui concerne Blindz

**Deux CVE dans `qs`, la bibliothèque qui analyse les paramètres d'URL, tirée
par Express.** Une permet de contourner la limite de taille des tableaux par un
jeu de virgules dans les clés entre crochets, l'autre ouvre un déni de service
via une valeur contrôlée par l'attaquant. Les deux sont de gravité moyenne, mais
elles touchent du code qui s'exécute sur chaque requête entrante d'un serveur
public. Le déni de service est le plus gênant, d'autant qu'on vient justement de
réparer la limitation de débit.

### Vérifié dans le code

- Versions installées avant correction : `express@4.22.2`, `body-parser@1.20.6`,
  `qs@6.15.3`.
- Après : `express@4.22.3`, `body-parser@1.20.8`, `qs@6.16.0`. Ce sont des
  montées de version corrective à l'intérieur d'Express 4, sans rupture d'API.
- `npm audit --omit=dev` sur le backend ne remonte plus rien.
- Le backend compile (`npm run build`), l'instance de développement redémarre et
  répond.

**Restent deux vulnérabilités dans les dépendances de DÉVELOPPEMENT seulement**,
`@vitest/mocker` (moyenne) et `minimatch` (élevée). Elles ne partent jamais en
production, l'image Docker n'installe que les dépendances de production. Pas
d'urgence, mais à traiter quand la chaîne d'intégration continue sera en place,
puisqu'elle fera tourner ces outils.

Côté frontend, trois alertes autour de `postcss` et `postcss-selector-parser`,
toutes sur des outils de compilation. Le site est un export statique : ce code ne
s'exécute jamais chez le visiteur, seulement sur la machine de build, sur nos
propres fichiers. Risque considéré comme négligeable, noté pour mémoire.

### Décidé

Correction appliquée au dépôt, **pas encore déployée**. Mettre à jour Express en
production demande de reconstruire l'image Docker du backend, donc de couper
brièvement les parties en cours. Ça attend un accord explicite, et ça ira bien
avec le prochain déploiement plutôt que tout seul.

### Contrôle de l'existant

La correction du 9 septembre tient. Le port 443 est toujours multiplexé par
nginx, sslh reste masqué, les quatre sites répondent, et le journal du
multiplexeur montre bien des adresses de clients réels, pas `127.0.0.1`.

### Sujets ouverts, inchangés depuis l'ouverture

Toujours aucun scan de dépendances automatisé, aucune analyse statique, aucun
scan de secrets, et surtout aucune base de test : les tests d'intégration du
backend tapent la base de production. Ce dernier point bloque toute mise en place
d'intégration continue et devient le premier chantier de la semaine du 28
septembre.

---

## 2026-09-09 - Ouverture du journal

### Inventaire rétrospectif

Ce qui existait avant l'ouverture du journal, avec les dates réelles des travaux.
Cette section est le seul contenu non contemporain du fichier.

| Date | Travail | Où le vérifier |
|---|---|---|
| 2026-03-16 | Abandon de l'authentification OAuth au profit d'un compte local, mot de passe haché avec bcrypt | `backend/src/controllers/authController.ts` |
| 2026-06-11 | Suppression d'une exemption de rate limiting fondée sur l'adresse IP, remplacée par une clé secrète réservée aux tests E2E | commits `424364d` puis `71680e5` |
| 2026-06-24 | Audit d'écart en lecture seule et rédaction des règles de sécurité | `docs/AUDIT-2026-06-24.md`, `docs/SECURITY.md` |
| 2026-08-07 | Jetons de session hachés en SHA-256 avant stockage, suppression de compte en libre-service | `backend/src/utils/session.ts`, `authController.deleteAccount` |
| 2026-08-30 | Contrat anti-triche complet et durcissement d'exploitation | `docs/` et commit `2de6cde` |

Deux points de méthode pour la relecture. Les dates de commit ne valent pas dates
de travail sur ce dépôt : une grande partie du code est restée non versionnée
pendant des mois, et le commit `2de6cde` porté au 2026-09-09 contient le travail
du 2026-08-30. Et l'audit du 2026-06-24 comme celui du 2026-08-30 ont été menés en
lecture seule avant toute correction, ce qui est la bonne séquence à raconter.

Détail de l'état actuel, tout vérifié aujourd'hui dans le code :

- **Jetons de session.** `crypto.randomUUID()` côté serveur, haché en SHA-256
  avant insertion dans `user_sessions`, le jeton en clair ne vit que chez le
  client (`backend/src/utils/session.ts`, `hashToken`, `createSessionToken`).
  Une fuite de la table ne donne donc aucune session utilisable.
- **Mots de passe.** bcrypt à 10 tours, minimum 8 caractères
  (`authController.ts`, `BCRYPT_ROUNDS`).
- **Suppression de compte.** Route `DELETE /account`, efface les sessions puis
  l'utilisateur (`routes/auth.ts`, `authController.deleteAccount`).
- **En-têtes et transport.** helmet, politique de sécurité de contenu explicite
  qui liste les origines audio autorisées (`backend/src/index.ts`).
- **Limitation de débit.** `express-rate-limit` sur l'API et sur
  l'authentification, plus un compteur par socket côté temps réel.
- **Anti-triche.** Le serveur ne diffuse jamais titre, artiste, pochette,
  propriétaire ni réponses des autres joueurs avant la révélation.

### Trouvaille de la semaine : la limitation de débit par adresse IP ne discrimine rien

**Source.** Relecture de la chaîne d'exposition du service, déclenchée par la mise
à plat de l'infrastructure pour le projet de formation.

**Ce qui concerne Blindz.** `express-rate-limit` compte les requêtes par adresse
IP. Encore faut-il que le serveur voie la bonne.

**Vérifié dans le code et sur la machine.**

- sslh écoute sur le port 443 et redirige le trafic TLS vers `127.0.0.1:8443`,
  sans mode transparent (`/etc/default/sslh`, aucune option `transparent`).
- nginx renseigne donc `X-Forwarded-For` avec `$proxy_add_x_forwarded_for`, dont
  la valeur ajoutée est `127.0.0.1` (`/etc/nginx/snippets/proxy-params*.conf`).
- Le backend fait confiance à un saut de proxy (`app.set("trust proxy", 1)` dans
  `backend/src/index.ts`), et aucun `keyGenerator` personnalisé n'est défini.
- Ce réglage est un héritage : il a été introduit le 2025-10-12 par le commit
  `4b641c3`, dont le message dit explicitement « add trust proxy for Railway ».
  Il a été écrit pour un hébergement différent et a survécu au passage sur le VPS
  derrière sslh, où la chaîne de proxy n'est plus la même.
- Mesure sur le journal d'accès nginx : 2704 requêtes sur environ 3458 portent
  l'adresse `127.0.0.1`, très loin devant la première adresse réelle.

**Conséquence.** La majorité du trafic HTTPS tombe dans un seul et même seau de
comptage. La limitation par adresse ne protège donc pas contre un client abusif,
et pire, un seul client peut consommer le quota commun et faire refuser les
requêtes de tous les autres. C'est un risque de disponibilité autant qu'un trou
de protection.

**Décidé.** Corrigé le jour même, sur accord de l'exploitant. Les trois pistes
envisagées au moment de la découverte ont toutes été écartées après vérification,
et une quatrième a été retenue.

- **Protocole PROXY dans sslh** : impossible. Testé, la version installée
  (sslh-fork 1.22c-1) ne connaît pas l'option `proxyprotocol` et l'ignore en
  silence, sans message d'erreur. Un test fonctionnel a confirmé qu'aucun en-tête
  n'était émis, le flux TLS arrivant brut.
- **Mode transparent de sslh** : écarté. Il casse les connexions qu'une machine
  ouvre vers son propre nom public, or deux tâches planifiées de surveillance et
  toute la chaîne de déploiement et de test de ce projet passent par là.
- **Lecture d'un en-tête côté application** : impossible, il n'existait aucun
  en-tête à lire. L'adresse réelle était perdue dès le premier saut.
- **Retenue : nginx remplace sslh.** Le module `stream` de nginx multiplexe le
  port 443 avec `ssl_preread`, qui distingue un ClientHello TLS d'une bannière
  SSH. Le TLS part vers le bloc HTTPS local avec un en-tête PROXY, le SSH passe
  par un étage intermédiaire qui retire cet en-tête avant de le livrer à un
  démon qui ne saurait pas le lire. Aucune règle de pare-feu, aucun changement de
  routage, un démon de moins à maintenir, et le tout réversible par configuration.

**Vérifié après bascule.** HTTPS répond sur les quatre domaines du serveur, la
redirection depuis le port 80 fonctionne, SSH par le port 443 négocie normalement
(version distante annoncée par OpenSSH), la surveillance planifiée passe, et
surtout l'adresse réelle du client apparaît maintenant dans les journaux nginx
comme dans l'en-tête transmis au backend, là où l'on lisait `127.0.0.1`.

**Conséquence sur le code.** Les commentaires du limiteur de débit décrivaient la
situation d'avant et ont été corrigés. La valeur de 60 requêtes par minute est
conservée, mais pour une raison différente et toujours valable : une soirée se
joue derrière une seule box, donc une douzaine de joueurs partagent une adresse
publique et s'inscrivent en rafale.

**Reste à surveiller.** Le paramètre `trust proxy` du backend vaut 1, ce qui est
correct avec un seul intermédiaire. Toute couche ajoutée devant nginx demandera de
revoir cette valeur, faute de quoi un client pourrait forger son adresse.

### Sujets ouverts, à instruire dans les prochaines entrées

- **Aucun scan de dépendances.** Ni `npm audit` en routine, ni avis GitHub
  branchés. À traiter avec la semaine usine logicielle du 28/09.
- **Aucune analyse statique** sur le code applicatif.
- **Aucun scan de secrets** sur l'historique ni sur les nouveaux commits.
- **La limitation de débit vit en mémoire du processus**, donc elle se remet à
  zéro à chaque redémarrage et ne survivrait pas à une seconde instance.
- **Base de test absente.** Les tests d'intégration du backend importent la base,
  et `blindify-postgres` est la base de production. Automatiser les tests avant de
  régler ce point ferait tourner la suite sur les données réelles.

