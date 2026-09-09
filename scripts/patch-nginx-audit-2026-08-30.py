#!/usr/bin/env python3
# Patchs nginx du batch audit 30/08/2026. Idempotent : chaque patch verifie
# s'il est deja applique avant de toucher au fichier.
import re
import sys

def patch(path, old, new, label, present_marker=None):
    s = open(path).read()
    if (present_marker or new) in s:
        print(f"  deja applique: {label}")
        return
    if old not in s:
        print(f"  !! ancre introuvable pour: {label} ({path})")
        sys.exit(1)
    open(path, "w").write(s.replace(old, new, 1))
    print(f"  applique: {label}")

# 1. Le snippet WS d'origine recoit la ligne Connection manquante (profite a
#    tous ses consommateurs, pas seulement blindz).
patch(
    "/etc/nginx/snippets/proxy-params-ws.conf",
    "proxy_set_header Upgrade $http_upgrade;",
    "proxy_set_header Upgrade $http_upgrade;\nproxy_set_header Connection $connection_upgrade;",
    "Connection upgrade dans proxy-params-ws.conf",
    present_marker="proxy_set_header Connection $connection_upgrade;",
)

# 2. Prod blindz : socket.io passe sur le snippet corrige (explicite).
patch(
    "/etc/nginx/sites-enabled/13-blindz.conf",
    """    location /socket.io/ {
        proxy_pass http://blindify_backend/socket.io/;
        include /etc/nginx/snippets/proxy-params-ws.conf;
    }""",
    """    location /socket.io/ {
        proxy_pass http://blindify_backend/socket.io/;
        include /etc/nginx/snippets/proxy-params-ws-fixed.conf;
    }""",
    "snippet WS corrige sur blindz prod",
    present_marker="proxy-params-ws-fixed.conf",
)

# 3. Cache long sur les assets Next.js hashes (ils sont immuables par nom) +
#    X-Frame-Options sur le statique (les add_header du location / masquaient
#    celui du http context).
patch(
    "/etc/nginx/sites-enabled/13-blindz.conf",
    """    location / {
        root /opt/blindify/frontend/out;
        index index.html;""",
    """    location /_next/static/ {
        root /opt/blindify/frontend/out;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
    location / {
        root /opt/blindify/frontend/out;
        index index.html;""",
    "cache immutable /_next/static",
    present_marker="max-age=31536000, immutable",
)

patch(
    "/etc/nginx/sites-enabled/13-blindz.conf",
    '        add_header Cache-Control "public, max-age=300" always;',
    '        add_header Cache-Control "public, max-age=300" always;\n        add_header X-Frame-Options "SAMEORIGIN" always;',
    "X-Frame-Options sur le statique blindz",
    present_marker='add_header X-Frame-Options "SAMEORIGIN" always;\n        add_header Strict-Transport-Security',
)

# 4. gzip global (nginx.conf, contexte http). Beneficie a tous les sites.
gzip_block = """
    # gzip (audit blindz 08/2026) : le HTML/JS/CSS partait non compresse.
    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;
"""
s = open("/etc/nginx/nginx.conf").read()
if "gzip on;" in s:
    print("  deja applique: gzip global")
else:
    anchor = "    map $http_upgrade $connection_upgrade {"
    if anchor not in s:
        print("  !! ancre gzip introuvable")
        sys.exit(1)
    s = s.replace(anchor, gzip_block + "\n" + anchor, 1)
    open("/etc/nginx/nginx.conf", "w").write(s)
    print("  applique: gzip global")

print("patchs nginx OK")
