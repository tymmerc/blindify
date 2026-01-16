# Security Guide for Blindify

## 🔐 Critical Security Actions Required

### IMMEDIATE ACTION REQUIRED
If you've cloned this repository and found credentials in the `.env` file, you **MUST**:

1. **Rotate ALL secrets immediately**:
   - Generate new Spotify API credentials at https://developer.spotify.com/dashboard
   - Generate new JWT_SECRET and SESSION_SECRET (see instructions below)
   - Update all environment variables in your production environment

2. **Check Git history**:
   ```bash
   # Search for exposed secrets in history
   git log --all --full-history --source -- .env
   ```

3. **If secrets were committed to git**:
   - Consider the entire git history as compromised
   - Use tools like `git-filter-repo` or BFG Repo-Cleaner to remove sensitive data
   - Force push the cleaned repository (coordinate with team)
   - Rotate ALL compromised credentials

## 🔑 Secret Management

### Generating Secure Secrets

Generate new secrets using Node.js crypto:

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment Variables Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual values (NEVER commit this file)

3. For production, use environment variable management:
   - **Railway**: Use the Environment Variables tab
   - **Vercel**: Use the Environment Variables section in settings
   - **Docker**: Use secrets or external config files mounted at runtime
   - **Kubernetes**: Use Secrets resources

### Spotify API Credentials

1. Go to https://developer.spotify.com/dashboard
2. Create a new app or use existing one
3. Get your Client ID and Client Secret
4. Add redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://yourdomain.com/api/auth/callback`

## 🛡️ Security Best Practices

### What's Already Implemented

✅ **Authentication**
- Session tokens with httpOnly cookies
- OAuth state validation (CSRF protection)
- Token refresh with 60-second buffer
- Per-user Socket.IO authentication

✅ **Rate Limiting**
- 600 requests/minute per IP globally
- Request slowdown after 120 requests
- Exemptions for critical endpoints

✅ **CORS & Headers**
- Helmet.js for security headers
- Configured Content Security Policy
- SameSite cookie policy

✅ **Database**
- Parameterized queries (pg library)
- UUID primary keys where appropriate
- Cascade deletes for consistency

### Additional Recommendations

⚠️ **Add HTTPS in Production**
- Use Let's Encrypt certificates
- Configure nginx reverse proxy with SSL
- Set COOKIE_SECURE=true

⚠️ **Database Security**
- Use strong passwords for PostgreSQL
- Restrict database access by IP
- Enable SSL connections: `?sslmode=require`
- Regular backups with encryption

⚠️ **API Security**
- Implement request signing for sensitive operations
- Add API versioning
- Log all authentication attempts
- Monitor for suspicious patterns

⚠️ **Dependencies**
- Run `npm audit` regularly
- Keep dependencies updated
- Use `npm ci` in production
- Consider Snyk or Dependabot

## 🚨 Incident Response

If you suspect a security breach:

1. **Immediately rotate all credentials**
2. **Check access logs** for suspicious activity
3. **Review database** for unauthorized changes
4. **Notify users** if data may be compromised
5. **Document the incident** for future reference

## 📧 Reporting Security Issues

If you discover a security vulnerability, please email:
**security@blindify.app** (or create this email and update here)

**DO NOT** create public GitHub issues for security vulnerabilities.

## 🔍 Security Checklist for Production

Before deploying to production, verify:

- [ ] All secrets rotated and stored securely
- [ ] `.env` file is NOT committed to git
- [ ] HTTPS enabled with valid certificates
- [ ] COOKIE_SECURE=true in production
- [ ] Database uses SSL connections
- [ ] Rate limiting configured
- [ ] CORS restricted to known domains
- [ ] Helmet.js security headers enabled
- [ ] Error messages don't leak sensitive info
- [ ] Logging excludes sensitive data
- [ ] Monitoring and alerting configured
- [ ] Regular backup strategy in place
- [ ] Incident response plan documented

## 🔄 Regular Security Maintenance

### Weekly
- Review application logs for anomalies
- Check for failed authentication attempts

### Monthly
- Run `npm audit` and update dependencies
- Review and rotate access tokens if needed
- Check for new security advisories

### Quarterly
- Full security audit
- Penetration testing (if budget allows)
- Review and update security policies
- Rotate long-lived credentials

## 📚 Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Spotify API Security](https://developer.spotify.com/documentation/web-api/concepts/security)
