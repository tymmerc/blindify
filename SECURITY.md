# Blindify - Security Configuration

## Security Headers

Le site Blindify est maintenant protégé avec les mêmes headers de sécurité que Clearpath:

### Headers Actifs
- ✅ **Strict-Transport-Security (HSTS)**: Force HTTPS pendant 1 an
- ✅ **X-Frame-Options: SAMEORIGIN**: Permet l'intégration uniquement depuis le même domaine
- ✅ **X-Content-Type-Options**: Empêche le MIME sniffing
- ✅ **X-XSS-Protection**: Protection XSS du navigateur
- ✅ **Referrer-Policy**: Contrôle les informations de référence
- ✅ **Permissions-Policy**: Bloque géolocalisation, micro, caméra
- ✅ **Content-Security-Policy**: Contrôle des sources de contenu

### Content Security Policy (CSP)

CSP configuré pour Blindify avec support Spotify:
- Scripts autorisés: self + Spotify Auth
- Styles: self + inline (Next.js/Tailwind)
- Images: self + data URIs + HTTPS + blob (pour les images Spotify)
- Connexions: self + Spotify API + WebSocket
- Frames: Spotify Auth uniquement

### Rate Limiting

- **10 requêtes/seconde** par IP
- Burst de 20 requêtes autorisé

### Fail2ban

- Ban après **5 tentatives échouées** en 5 minutes
- Durée du ban: **1 heure**

### Server Information Hiding

- Version nginx cachée

## Score de Sécurité

**SecurityHeaders.com**: Grade A attendu

## Commandes Utiles

```bash
# Vérifier les security headers
curl -I https://tymmerc.eu/blindify/

# Status fail2ban
fail2ban-client status nginx-blindify
```
