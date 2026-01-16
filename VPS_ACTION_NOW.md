# 🚨 ACTIONS IMMÉDIATES - VPS tymmerc.eu

Guide des actions à faire **maintenant** sur votre VPS pour appliquer les améliorations.

---

## ⚡ Quick Start (5 minutes)

```bash
# 1. Installer Redis (OBLIGATOIRE)
sudo apt update
sudo apt install redis-server -y
sudo systemctl start redis-server
redis-cli ping  # Doit retourner "PONG"

# 2. Mettre à jour .env
nano /opt/blindify/backend/.env
# Ajouter: REDIS_URL=redis://localhost:6379

# 3. Installer nouvelles dépendances
cd /opt/blindify/backend
npm install

# 4. Rebuild et redémarrer
npm run build
pm2 restart blindify-backend

# 5. Vérifier
pm2 logs blindify-backend --lines 20
curl https://tymmerc.eu/blindify/api/health
```

---

## 📋 Checklist Détaillée

### ✅ 1. Installer Redis (2 min)

**Commandes**:
```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

**Vérifier**:
```bash
redis-cli ping
# Doit afficher: PONG
```

**Si erreur**:
```bash
sudo systemctl status redis-server
sudo journalctl -u redis-server -n 50
```

---

### ✅ 2. Mettre à Jour .env (1 min)

**Éditer**:
```bash
nano /opt/blindify/backend/.env
```

**Ajouter ces lignes**:
```bash
# Redis (NOUVEAU - OBLIGATOIRE)
REDIS_URL=redis://localhost:6379

# Logging (NOUVEAU - OPTIONNEL)
LOG_LEVEL=info

# Sentry (NOUVEAU - OPTIONNEL, laisser vide pour l'instant)
SENTRY_DSN=
```

**Sauvegarder**: `Ctrl+O`, `Enter`, `Ctrl+X`

---

### ✅ 3. Installer Nouvelles Dépendances (1 min)

```bash
cd /opt/blindify/backend
npm install
```

**Vérifier l'installation**:
```bash
npm list ioredis winston @sentry/node
```

Vous devriez voir:
```
├── ioredis@5.3.2
├── winston@3.11.0
├── @sentry/node@7.100.0
└── @sentry/profiling-node@7.100.0
```

---

### ✅ 4. Rebuild Backend (1 min)

```bash
cd /opt/blindify/backend
npm run build
```

**Attendre** la fin du build (devrait afficher "Compiled successfully")

---

### ✅ 5. Redémarrer Services (30 sec)

```bash
pm2 restart blindify-backend
```

**Vérifier les logs immédiatement**:
```bash
pm2 logs blindify-backend --lines 30
```

**Chercher**:
- ✅ "Redis client connected"
- ✅ "Redis client ready"
- ✅ "Server listening on port 3000"
- ❌ Pas d'erreurs "Redis connection failed"

---

### ✅ 6. Tester le Site (1 min)

**Health Check**:
```bash
curl https://tymmerc.eu/blindify/api/health
```

Devrait retourner quelque chose comme:
```json
{"status":"ok","timestamp":"...","redis":"connected"}
```

**Tester sur le navigateur**:
1. Aller sur https://tymmerc.eu/blindify
2. Se connecter avec Spotify
3. Démarrer une partie solo
4. Vérifier que tout fonctionne

---

## 🔍 Vérification Post-Installation

### Check 1: Redis fonctionne
```bash
redis-cli ping
redis-cli INFO server | head -5
```

### Check 2: Backend voit Redis
```bash
pm2 logs blindify-backend | grep -i redis
```

Devrait afficher:
```
Redis client connected
Redis client ready
```

### Check 3: Pas d'erreurs
```bash
tail -50 /opt/blindify/backend/logs/error.log
```

Ne devrait PAS contenir d'erreurs récentes.

### Check 4: Health endpoint
```bash
curl -s https://tymmerc.eu/blindify/api/health | jq
```

### Check 5: Services PM2
```bash
pm2 status
```

Tous les services doivent être "online" en vert.

---

## 🎯 Test Complet

Testez manuellement ces fonctionnalités:

1. **Solo Game**:
   - Aller sur https://tymmerc.eu/blindify
   - Connexion Spotify
   - Démarrer un jeu solo
   - Jouer quelques rounds
   - ✅ Le jeu doit fonctionner normalement

2. **Multiplayer** (si possible):
   - Créer une room
   - Copier le code
   - Rejoindre depuis un autre navigateur/appareil
   - ✅ La synchronisation doit fonctionner

3. **Vérifier les Logs**:
   ```bash
   pm2 logs blindify-backend --lines 100 | grep "game:state"
   ```
   - ✅ Doit voir des opérations Redis pour l'état des jeux

---

## 🚨 En Cas de Problème

### Problème: Redis ne démarre pas

**Diagnostic**:
```bash
sudo systemctl status redis-server
sudo journalctl -u redis-server -n 50
```

**Solution**:
```bash
# Vérifier la config
sudo nano /etc/redis/redis.conf
# Chercher "bind 127.0.0.1" et vérifier que c'est décommenté

# Redémarrer
sudo systemctl restart redis-server
```

---

### Problème: Backend ne se connecte pas à Redis

**Diagnostic**:
```bash
pm2 logs blindify-backend | grep -i redis
```

**Solution**:
```bash
# Vérifier .env
cat /opt/blindify/backend/.env | grep REDIS

# Doit afficher: REDIS_URL=redis://localhost:6379

# Si manquant, ajouter et redémarrer
echo "REDIS_URL=redis://localhost:6379" >> /opt/blindify/backend/.env
pm2 restart blindify-backend
```

---

### Problème: Build échoue

**Diagnostic**:
```bash
cd /opt/blindify/backend
npm run build
```

**Solution**:
```bash
# Réinstaller les dépendances
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

### Problème: PM2 n'existe pas

**Installation PM2**:
```bash
sudo npm install -g pm2

# Démarrer le backend
cd /opt/blindify/backend
pm2 start dist/index.js --name blindify-backend

# Sauvegarder
pm2 save
pm2 startup
```

---

## 📊 Scripts Utiles Créés

Vous avez maintenant accès à:

### 1. Script de Déploiement
```bash
cd /opt/blindify
./deploy.sh all          # Déployer tout
./deploy.sh backend      # Backend seulement
./deploy.sh frontend     # Frontend seulement
```

### 2. Script de Health Check
```bash
cd /opt/blindify
./healthcheck.sh
```

### 3. Créer des Alias Pratiques
```bash
# Ajouter à votre ~/.bashrc
cat >> ~/.bashrc << 'EOF'

# Blindify shortcuts
alias blindify='cd /opt/blindify'
alias b-logs='pm2 logs blindify-backend'
alias b-status='pm2 status'
alias b-restart='pm2 restart blindify-backend'
alias b-deploy='cd /opt/blindify && ./deploy.sh all'
alias b-health='cd /opt/blindify && ./healthcheck.sh'
alias b-redis='redis-cli'
alias b-db='psql -U blindify -d blindify'

EOF

# Recharger
source ~/.bashrc
```

Ensuite vous pourrez utiliser:
- `blindify` → cd /opt/blindify
- `b-logs` → Voir les logs
- `b-status` → Status PM2
- `b-restart` → Redémarrer backend
- `b-deploy` → Déployer tout
- `b-health` → Health check
- `b-redis` → Redis CLI
- `b-db` → PostgreSQL

---

## 🎉 Prochaines Étapes

Après avoir tout vérifié:

### Optionnel: Configurer Sentry

1. Créer un compte sur [sentry.io](https://sentry.io) (gratuit)
2. Créer un projet Node.js
3. Copier le DSN
4. Ajouter à `.env`:
   ```bash
   SENTRY_DSN=https://xxx@sentry.io/yyy
   ```
5. Redémarrer:
   ```bash
   pm2 restart blindify-backend
   ```

### Optionnel: Backups Automatiques

```bash
# Créer le dossier de backup
sudo mkdir -p /opt/backups
sudo chown $USER:$USER /opt/backups

# Ajouter au crontab
crontab -e

# Ajouter cette ligne:
0 2 * * * pg_dump blindify > /opt/backups/blindify_$(date +\%Y\%m\%d).sql
```

### Optionnel: Monitoring Automatique

```bash
# Ajouter au crontab
crontab -e

# Health check toutes les 5 minutes
*/5 * * * * /opt/blindify/healthcheck.sh >> /var/log/blindify-health.log 2>&1
```

---

## 📚 Documentation Disponible

- **[VPS_WORKFLOW.md](VPS_WORKFLOW.md)** - Workflow complet pour VPS
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Commandes rapides
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Guide de déploiement général
- **[SECURITY.md](SECURITY.md)** - Sécurité
- **[API.md](API.md)** - Documentation API

---

## ✅ Résumé

**Ce qui a été amélioré**:
- ✅ Redis pour scalabilité horizontale
- ✅ Winston pour logs structurés
- ✅ Sentry pour tracking d'erreurs (optionnel)
- ✅ Tests complets
- ✅ Scripts d'automatisation
- ✅ Documentation complète

**Temps total estimé**: 5-10 minutes

**Prochaine étape**: Tester sur https://tymmerc.eu/blindify

---

**Besoin d'aide?** Consultez [QUICK_REFERENCE.md](QUICK_REFERENCE.md) pour les commandes courantes.
