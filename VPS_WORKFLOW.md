# 🚀 Workflow VPS - tymmerc.eu/blindify

Guide de travail spécifique pour votre environnement de production VPS.

---

## 📍 Configuration Actuelle

**Domaine**: `https://tymmerc.eu/blindify`
**Environnement**: Production (NODE_ENV=production)
**Workflow**: Rebuild après chaque modification

### Services Déployés
- **Frontend**: Next.js sur tymmerc.eu/blindify
- **Backend**: Express API sur tymmerc.eu/blindify/api
- **Database**: PostgreSQL (localhost:5432)
- **Reverse Proxy**: Nginx

---

## 🔧 Workflow de Développement

### 1. Faire des Modifications

```bash
# Se connecter au VPS
ssh user@tymmerc.eu

# Naviguer vers le projet
cd /opt/blindify

# Faire vos modifications
nano backend/src/...
# ou
nano frontend/src/...
```

### 2. Rebuild & Deploy

#### Option A: Rebuild Manuel (Actuel)

**Backend**:
```bash
cd /opt/blindify/backend

# Installer nouvelles dépendances (si ajoutées)
npm install

# Rebuild TypeScript
npm run build

# Redémarrer le service
pm2 restart blindify-backend
# ou si systemd:
sudo systemctl restart blindify-backend

# Vérifier les logs
pm2 logs blindify-backend
```

**Frontend**:
```bash
cd /opt/blindify/frontend

# Installer nouvelles dépendances (si ajoutées)
npm install

# Rebuild Next.js
npm run build

# Redémarrer le service
pm2 restart blindify-frontend
# ou si systemd:
sudo systemctl restart blindify-frontend

# Vérifier les logs
pm2 logs blindify-frontend
```

#### Option B: Script de Déploiement Rapide

Créons un script pour automatiser:

```bash
# Créer le script
nano /opt/blindify/deploy.sh
```

Contenu du script ci-dessous (je vais le créer).

---

## 🆕 Nouvelles Dépendances à Installer

Avant le prochain rebuild, installez les nouvelles dépendances:

```bash
cd /opt/blindify/backend
npm install ioredis winston @sentry/node @sentry/profiling-node

# Vérifier l'installation
npm list ioredis winston @sentry/node
```

---

## 🔴 Redis Setup sur VPS

Redis est maintenant requis pour le nouveau système de cache.

### Installation Redis

```bash
# Installer Redis
sudo apt update
sudo apt install redis-server

# Configurer Redis pour démarrer automatiquement
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Vérifier que Redis fonctionne
redis-cli ping
# Devrait retourner: PONG
```

### Configuration Redis (Optionnelle mais Recommandée)

```bash
# Éditer la config Redis
sudo nano /etc/redis/redis.conf

# Trouver et modifier ces lignes:
# 1. Bind à localhost uniquement (sécurité)
bind 127.0.0.1

# 2. Activer la persistance AOF (recommandé)
appendonly yes

# 3. Définir un mot de passe (optionnel mais recommandé)
requirepass VotreMotDePasseRedis

# Redémarrer Redis
sudo systemctl restart redis-server
```

### Mettre à Jour .env

```bash
nano /opt/blindify/backend/.env

# Ajouter cette ligne:
REDIS_URL=redis://localhost:6379

# Si vous avez défini un mot de passe:
# REDIS_URL=redis://:VotreMotDePasseRedis@localhost:6379
```

---

## ⚡ Nouveaux Secrets à Générer

Pour la sécurité, générez de nouveaux secrets:

```bash
# SSH dans votre VPS
ssh user@tymmerc.eu

# Générer nouveau JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Générer nouveau SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copier ces valeurs et mettre à jour .env
nano /opt/blindify/backend/.env
```

**⚠️ Important**: Après avoir changé les secrets:
- Tous les utilisateurs devront se reconnecter
- Les sessions existantes seront invalidées

---

## 📊 Monitoring en Production

### Logs Winston (Nouveau)

Les logs sont maintenant structurés et enregistrés dans:

```bash
# Logs du backend
tail -f /opt/blindify/backend/logs/combined.log
tail -f /opt/blindify/backend/logs/error.log

# Filtrer par niveau
grep "ERROR" /opt/blindify/backend/logs/combined.log
```

### Sentry (Nouveau - Optionnel)

Si vous voulez activer Sentry pour le tracking d'erreurs:

1. Créer un compte sur [sentry.io](https://sentry.io) (gratuit)
2. Créer un nouveau projet Node.js
3. Copier le DSN
4. Ajouter à `.env`:
   ```bash
   SENTRY_DSN=https://votre-dsn@sentry.io/projet
   ```
5. Rebuild le backend

### Vérifier la Santé

```bash
# Health check du backend
curl https://tymmerc.eu/blindify/api/health

# Vérifier Redis
redis-cli ping

# Vérifier PostgreSQL
psql -U blindify -d blindify -c "SELECT 1"

# Vérifier les processus
pm2 status
```

---

## 🔄 Workflow Complet de Mise à Jour

### Scénario 1: Modification Code Seulement

```bash
# 1. Se connecter
ssh user@tymmerc.eu

# 2. Naviguer
cd /opt/blindify

# 3. Modifier le code
nano backend/src/services/gameOrchestrator.ts

# 4. Rebuild
cd backend
npm run build

# 5. Redémarrer
pm2 restart blindify-backend

# 6. Vérifier
pm2 logs blindify-backend --lines 50
curl https://tymmerc.eu/blindify/api/health
```

### Scénario 2: Nouvelles Dépendances

```bash
# 1-2. Se connecter et naviguer
ssh user@tymmerc.eu
cd /opt/blindify/backend

# 3. Installer dépendances
npm install

# 4. Rebuild
npm run build

# 5. Redémarrer
pm2 restart blindify-backend

# 6. Vérifier
pm2 logs blindify-backend
```

### Scénario 3: Modifications Base de Données

```bash
# 1. Backup d'abord!
pg_dump blindify > /opt/backups/blindify_$(date +%Y%m%d_%H%M%S).sql

# 2. Appliquer les modifications
psql -U blindify -d blindify -f backend/migrations/nouvelle_migration.sql

# 3. Vérifier
psql -U blindify -d blindify -c "\dt"

# 4. Redémarrer l'application
pm2 restart all
```

---

## 🐛 Debugging en Production

### Activer les Logs Debug Temporairement

```bash
# Éditer .env
nano /opt/blindify/backend/.env

# Changer LOG_LEVEL
LOG_LEVEL=debug

# Redémarrer
pm2 restart blindify-backend

# Voir les logs détaillés
pm2 logs blindify-backend

# Revenir à 'info' après debug
LOG_LEVEL=info
pm2 restart blindify-backend
```

### Vérifier l'État Redis

```bash
# Se connecter à Redis
redis-cli

# Dans Redis CLI:
> INFO stats
> KEYS game:state:*
> GET game:state:ABC123
> EXIT
```

### Analyser les Erreurs

```bash
# Erreurs récentes
tail -50 /opt/blindify/backend/logs/error.log

# Erreurs avec contexte
grep -A 5 "ERROR" /opt/blindify/backend/logs/combined.log | tail -50

# Erreurs spécifiques
grep "Redis" /opt/blindify/backend/logs/error.log
```

---

## ⚠️ Actions Prioritaires MAINTENANT

### 1. Installer Redis (OBLIGATOIRE)

```bash
sudo apt install redis-server
sudo systemctl start redis-server
redis-cli ping  # Vérifier
```

### 2. Mettre à Jour .env

```bash
nano /opt/blindify/backend/.env

# Ajouter:
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info

# Optionnel mais recommandé:
SENTRY_DSN=  # Laisser vide pour l'instant
```

### 3. Installer Nouvelles Dépendances

```bash
cd /opt/blindify/backend
npm install
```

### 4. Rebuild et Redémarrer

```bash
npm run build
pm2 restart blindify-backend
pm2 logs blindify-backend --lines 50
```

### 5. Vérifier que Tout Fonctionne

```bash
# Health check
curl https://tymmerc.eu/blindify/api/health

# Logs
pm2 logs blindify-backend | grep -i redis

# Test d'une partie
# Aller sur https://tymmerc.eu/blindify et démarrer un jeu
```

---

## 📝 Checklist de Déploiement

Avant chaque modification importante:

- [ ] Backup de la base de données
- [ ] Vérifier que Redis tourne (`redis-cli ping`)
- [ ] Vérifier l'espace disque (`df -h`)
- [ ] Tester en local si possible
- [ ] Faire la modification
- [ ] Rebuild (`npm run build`)
- [ ] Redémarrer les services (`pm2 restart`)
- [ ] Vérifier les logs (`pm2 logs`)
- [ ] Tester sur le site (https://tymmerc.eu/blindify)
- [ ] Monitorer pendant 5-10 minutes

---

## 🆘 Rollback en Cas de Problème

Si quelque chose ne fonctionne pas après un déploiement:

```bash
# 1. Revenir au code précédent
cd /opt/blindify
git log --oneline -5  # Voir les commits récents
git checkout HEAD~1   # Revenir au commit précédent

# 2. Rebuild
cd backend && npm run build
cd ../frontend && npm run build

# 3. Redémarrer
pm2 restart all

# 4. Restaurer la base de données (si nécessaire)
psql -U blindify -d blindify < /opt/backups/blindify_YYYYMMDD.sql
```

---

## 💡 Optimisations Recommandées

### 1. Script de Déploiement Automatique

Je vais créer un script `deploy.sh` pour automatiser le rebuild.

### 2. Backups Automatiques

```bash
# Ajouter au crontab
crontab -e

# Backup quotidien à 2h du matin
0 2 * * * pg_dump blindify > /opt/backups/blindify_$(date +\%Y\%m\%d).sql

# Nettoyer les backups > 7 jours
0 3 * * * find /opt/backups -name "blindify_*.sql" -mtime +7 -delete
```

### 3. Monitoring Automatique

```bash
# Créer un script de monitoring
nano /opt/blindify/healthcheck.sh
```

Contenu ci-dessous (je vais le créer).

---

## 📞 Support

En cas de problème:

1. **Logs**: `pm2 logs blindify-backend`
2. **Status**: `pm2 status`
3. **Redis**: `redis-cli ping`
4. **Database**: `psql -U blindify -d blindify -c "SELECT 1"`
5. **Health**: `curl https://tymmerc.eu/blindify/api/health`

---

**Dernière mise à jour**: 2024-01-14
**Environment**: Production VPS (tymmerc.eu)
