# Multiplexage du port 443 : nginx à la place de sslh

Changement du 2026-09-09. Le fichier [`nginx-stream-443.conf`](./nginx-stream-443.conf)
est la copie exacte de ce qui tourne, déployé dans `/etc/nginx/stream-443.conf`.

## Pourquoi

sslh écoutait sur le 443 et renvoyait le trafic TLS vers nginx en local, sans
mode transparent. nginx ne voyait donc que `127.0.0.1`, le transmettait tel quel
au backend, et la limitation de débit par adresse comptait tout le monde dans un
seul seau. Deux conséquences : aucune protection contre un client abusif, et un
seul client capable d'épuiser le quota de tous les autres.

Mesure au moment du diagnostic : 2704 requêtes sur environ 3458 dans le journal
d'accès portaient l'adresse `127.0.0.1`.

## Pourquoi cette solution et pas une autre

- **Protocole PROXY dans sslh** : la version installée (1.22c-1) ne connaît pas
  l'option et l'ignore sans rien dire. Vérifié par un test fonctionnel.
- **Mode transparent de sslh** : casse les connexions que la machine ouvre vers
  son propre nom public. La surveillance planifiée et toute la chaîne de
  déploiement et de test de ce dépôt en dépendent.
- **nginx `stream` + `ssl_preread`** : retenu. Pas de règle de pare-feu, pas de
  routage à modifier, un démon de moins, réversible par configuration.

## Comment ça marche

`ssl_preread` regarde les premiers octets sans les consommer. Un ClientHello TLS
renseigne `$ssl_preread_protocol`, une bannière SSH le laisse vide.

- TLS vers `127.0.0.1:8443` avec un en-tête PROXY. Les blocs HTTPS déclarent
  `proxy_protocol` sur leur `listen`, et le bloc `http` de `nginx.conf` porte
  `set_real_ip_from 127.0.0.1; set_real_ip_from ::1; real_ip_header proxy_protocol;`.
- Non-TLS vers `127.0.0.1:2223`, un étage nginx qui lit puis retire l'en-tête
  PROXY avant de livrer un flux ordinaire à `sshd` sur 2222. Nécessaire parce
  qu'OpenSSH ne sait pas lire cet en-tête.

## Pièces à ne pas oublier

- Paquet `libnginx-mod-stream` (même version que nginx). Le module est dynamique.
- `include /etc/nginx/stream-443.conf;` au PREMIER NIVEAU de `nginx.conf`, après
  le bloc `http`, jamais dedans.
- `proxy_protocol` sur les douze directives `listen ...:8443` des sites.
- sslh est masqué (`systemctl mask sslh`) : sans ça il reprendrait le 443 au
  démarrage, avant nginx.
- Après installation du module, nginx doit **redémarrer**, un rechargement ne
  suffit pas à charger un module dynamique.

## Retour arrière

1. `systemctl unmask sslh`
2. Retirer `proxy_protocol` des `listen ...:8443` et le bloc `real_ip` de `nginx.conf`
3. Retirer l'`include` du fichier stream
4. `nginx -t && systemctl restart nginx` (nginx rend le 443)
5. `systemctl enable --now sslh`

L'ordre compte : nginx doit rendre le port avant que sslh puisse le prendre.
Sauvegarde complète de `/etc/nginx` d'avant bascule dans `/opt/backups/sslh-*`.

## Vérifier que c'est sain

```
curl -sf -o /dev/null -w "%{http_code}\n" https://blindz.app/
ssh -p 443 -o BatchMode=yes -o PreferredAuthentications=none -v blindz.app 2>&1 | grep "Remote protocol"
tail -3 /var/log/nginx/stream-443.log     # l'adresse doit etre celle du client
```
