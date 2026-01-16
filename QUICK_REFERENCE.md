# ⚡ Quick Reference - Commandes VPS

Guide rapide des commandes essentielles pour tymmerc.eu/blindify

---

## 🚀 Déploiement Rapide

### Déploiement Complet
```bash
cd /opt/blindify
./deploy.sh all
```

### Backend Seulement
```bash
cd /opt/blindify
./deploy.sh backend
```

### Frontend Seulement
```bash
cd /opt/blindify
./deploy.sh frontend
```

### Rebuild Manuel Rapide
```bash
# Backend
cd /opt/blindify/backend && npm run build && pm2 restart blindify-backend

# Frontend
cd /opt/blindify/frontend && npm run build && pm2 restart blindify-frontend
```

---

## 📊 Monitoring

### Logs en Temps Réel
```bash
# Backend (PM2)
pm2 logs blindify-backend

# Backend (fichiers)
tail -f /opt/blindify/backend/logs/combined.log
tail -f /opt/blindify/backend/logs/error.log

# Frontend
pm2 logs blindify-frontend

# Tous les services
pm2 logs
```

### Status des Services
```bash
# PM2
pm2 status

# PostgreSQL
sudo systemctl status postgresql
pg_isready

# Redis
sudo systemctl status redis-server
redis-cli ping

# Nginx
sudo systemctl status nginx
```

### Health Check
```bash
# Script automatique
./healthcheck.sh

# Manuel
curl https://tymmerc.eu/blindify/api/health
curl -I https://tymmerc.eu/blindify
```

---

## 🔧 Gestion des Services

### Redémarrer
```bash
# Backend
pm2 restart blindify-backend

# Frontend
pm2 restart blindify-frontend

# Tous
pm2 restart all

# Nginx
sudo systemctl restart nginx

# PostgreSQL
sudo systemctl restart postgresql

# Redis
sudo systemctl restart redis-server
```

### Arrêter/Démarrer
```bash
# PM2
pm2 stop blindify-backend
pm2 start blindify-backend

# PostgreSQL
sudo systemctl stop postgresql
sudo systemctl start postgresql

# Redis
sudo systemctl stop redis-server
sudo systemctl start redis-server
```

---

## 🗄️ Base de Données

### Backup
```bash
# Backup manuel
pg_dump blindify > /opt/backups/blindify_$(date +%Y%m%d_%H%M%S).sql

# Restaurer
psql -U blindify -d blindify < /opt/backups/blindify_YYYYMMDD.sql
```

### Accès
```bash
# Connexion
psql -U blindify -d blindify

# Commandes utiles dans psql:
\dt              # Lister les tables
\d table_name    # Décrire une table
\du              # Lister les utilisateurs
\q               # Quitter
```

### Requêtes Rapides
```bash
# Nombre d'utilisateurs
psql -U blindify -d blindify -c "SELECT COUNT(*) FROM users;"

# Parties actives
psql -U blindify -d blindify -c "SELECT COUNT(*) FROM game_sessions WHERE created_at > NOW() - INTERVAL '1 hour';"

# Connexions actives
psql -U blindify -d blindify -c "SELECT count(*) FROM pg_stat_activity WHERE datname='blindify';"
```

---

## 🔴 Redis

### Accès Redis CLI
```bash
redis-cli

# Dans Redis CLI:
> PING
> INFO
> KEYS game:state:*
> GET game:state:ABC123
> DEL game:state:ABC123
> FLUSHDB  # ⚠️ Efface toutes les données!
> EXIT
```

### Commandes Utiles
```bash
# Nombre de parties actives
redis-cli KEYS "game:state:*" | wc -l

# Mémoire utilisée
redis-cli INFO memory | grep used_memory_human

# Voir toutes les clés
redis-cli KEYS "*"

# Supprimer toutes les parties (cache)
redis-cli KEYS "game:state:*" | xargs redis-cli DEL
```

---

## 📝 Logs & Debugging

### Filtrer les Erreurs
```bash
# Erreurs seulement
grep "ERROR" /opt/blindify/backend/logs/combined.log

# Erreurs Redis
grep -i "redis" /opt/blindify/backend/logs/error.log

# Erreurs des 10 dernières minutes
find /opt/blindify/backend/logs -name "*.log" -mmin -10 -exec grep "ERROR" {} \;

# Suivre les erreurs en temps réel
tail -f /opt/blindify/backend/logs/error.log
```

### PM2 Logs Avancés
```bash
# Dernières 50 lignes
pm2 logs blindify-backend --lines 50

# Vider les logs
pm2 flush

# Logs avec timestamps
pm2 logs --timestamp
```

---

## 🔄 Git

### Pull Latest Changes
```bash
cd /opt/blindify

# Sauvegarder modifications locales (si nécessaire)
git stash

# Pull
git pull origin main

# Réappliquer modifications locales
git stash pop

# Rebuild
./deploy.sh all
```

### Voir l'État
```bash
# Status
git status

# Derniers commits
git log --oneline -10

# Différences
git diff
```

---

## 🔍 Diagnostics

### Utilisation Ressources
```bash
# CPU et Mémoire
htop
# ou
top

# Processus Node
ps aux | grep node

# Espace disque
df -h

# Mémoire
free -h

# PM2 monitoring
pm2 monit
```

### Connexions Réseau
```bash
# Ports ouverts
sudo netstat -tulpn | grep LISTEN

# Tester une connexion
telnet localhost 3000
nc -zv localhost 3000

# Voir les connexions actives
ss -tunap | grep node
```

### Tester les Endpoints
```bash
# Health
curl https://tymmerc.eu/blindify/api/health

# Auth me
curl https://tymmerc.eu/blindify/api/auth/me

# Stats
curl https://tymmerc.eu/blindify/api/stats/leaderboard

# Verbose
curl -v https://tymmerc.eu/blindify/api/health

# Headers
curl -I https://tymmerc.eu/blindify
```

---

## 🆘 Dépannage Rapide

### Service Ne Répond Plus
```bash
# 1. Vérifier les logs
pm2 logs blindify-backend --lines 50

# 2. Redémarrer
pm2 restart blindify-backend

# 3. Si ça ne marche pas, redémarrer complètement
pm2 delete blindify-backend
cd /opt/blindify/backend
pm2 start dist/index.js --name blindify-backend
```

### Erreur "Port Already in Use"
```bash
# Trouver le processus
lsof -i :3000

# Tuer le processus
kill -9 <PID>

# Ou tuer tous les processus Node
pkill -f node
```

### Redis Connection Error
```bash
# Vérifier Redis
redis-cli ping

# Si down, démarrer
sudo systemctl start redis-server

# Vérifier les logs Redis
sudo journalctl -u redis-server -n 50
```

### PostgreSQL Connection Error
```bash
# Vérifier PostgreSQL
pg_isready

# Si down, démarrer
sudo systemctl start postgresql

# Vérifier les logs
sudo journalctl -u postgresql -n 50

# Tester la connexion
psql -U blindify -d blindify -c "SELECT 1"
```

### Mémoire Pleine
```bash
# Libérer le cache système
sudo sync && echo 3 | sudo tee /proc/sys/vm/drop_caches

# Redémarrer PM2 avec limites mémoire
pm2 restart blindify-backend --max-memory-restart 500M

# Nettoyer les logs
pm2 flush
sudo journalctl --vacuum-time=7d
```

### Disque Plein
```bash
# Trouver les gros fichiers
du -h /opt/blindify | sort -rh | head -20

# Nettoyer node_modules
cd /opt/blindify/backend && rm -rf node_modules && npm install --production
cd /opt/blindify/frontend && rm -rf node_modules && npm install

# Nettoyer les backups anciens
find /opt/backups -name "*.sql" -mtime +7 -delete

# Nettoyer les logs
pm2 flush
sudo journalctl --vacuum-time=7d
```

---

## 📦 Installation Dépendances

### Backend
```bash
cd /opt/blindify/backend
npm install ioredis winston @sentry/node @sentry/profiling-node
npm install
```

### Frontend
```bash
cd /opt/blindify/frontend
npm install
```

---

## 🔐 Variables d'Environnement

### Éditer .env
```bash
nano /opt/blindify/backend/.env
```

### Nouvelles variables requises
```bash
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
SENTRY_DSN=  # Optionnel
```

---

## ⏰ Tâches Automatisées (Cron)

### Éditer Crontab
```bash
crontab -e
```

### Exemples de Tâches
```bash
# Backup quotidien à 2h
0 2 * * * pg_dump blindify > /opt/backups/blindify_$(date +\%Y\%m\%d).sql

# Nettoyer vieux backups (>7 jours)
0 3 * * * find /opt/backups -name "blindify_*.sql" -mtime +7 -delete

# Health check toutes les 5 minutes
*/5 * * * * /opt/blindify/healthcheck.sh >> /var/log/blindify-health.log 2>&1

# Redémarrer PM2 tous les jours à 4h
0 4 * * * pm2 restart all
```

---

## 🎯 Commandes Essentielles du Quotidien

```bash
# 1. Voir les logs
pm2 logs blindify-backend

# 2. Health check
curl https://tymmerc.eu/blindify/api/health

# 3. Status des services
pm2 status

# 4. Redémarrer après modification
cd /opt/blindify/backend && npm run build && pm2 restart blindify-backend

# 5. Voir les erreurs récentes
tail -50 /opt/blindify/backend/logs/error.log
```

---

## 📞 Aide Rapide

### Commandes les Plus Utilisées
1. `pm2 logs` - Voir les logs
2. `pm2 restart all` - Redémarrer tous les services
3. `./deploy.sh all` - Déployer tout
4. `./healthcheck.sh` - Vérifier la santé
5. `curl https://tymmerc.eu/blindify/api/health` - Tester l'API

### En Cas de Problème
1. Logs → `pm2 logs blindify-backend`
2. Status → `pm2 status`
3. Redémarrer → `pm2 restart all`
4. Health → `./healthcheck.sh`
5. Consulter → [VPS_WORKFLOW.md](VPS_WORKFLOW.md)

---

**Raccourci utile**: Créez un alias dans votre `.bashrc`:
```bash
echo "alias blindify='cd /opt/blindify'" >> ~/.bashrc
echo "alias blindify-logs='pm2 logs blindify-backend'" >> ~/.bashrc
echo "alias blindify-deploy='cd /opt/blindify && ./deploy.sh all'" >> ~/.bashrc
source ~/.bashrc
```

Ensuite utilisez simplement:
- `blindify` - Aller au dossier du projet
- `blindify-logs` - Voir les logs
- `blindify-deploy` - Déployer
