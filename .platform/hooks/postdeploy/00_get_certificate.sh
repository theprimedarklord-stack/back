#!/bin/bash
set -e

DOMAIN=$(/opt/elasticbeanstalk/bin/get-config environment -k CERTBOT_DOMAIN || true)
EMAIL=$(/opt/elasticbeanstalk/bin/get-config environment -k CERTBOT_EMAIL || true)

# Если переменные не заданы — пропускаем SSL, деплой не ломаем
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "CERTBOT_DOMAIN or CERTBOT_EMAIL not set — skipping SSL setup."
  exit 0
fi

# 1. Получаем сертификат (если ещё нет)
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "Requesting certificate for ${DOMAIN}..."
  sudo certbot certonly --nginx \
    --non-interactive --agree-tos \
    -d "${DOMAIN}" \
    -m "${EMAIL}"
else
  echo "Certificate already exists, skipping issuance."
fi

# 2. Копируем https.conf из staging в nginx conf.d
STAGING_CONF="/var/app/current/.platform/staging/https.conf"
NGINX_CONF_DIR="/etc/nginx/conf.d"

if [ -f "$STAGING_CONF" ] && [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "Activating HTTPS config..."
  sudo cp "$STAGING_CONF" "$NGINX_CONF_DIR/https.conf"
else
  echo "Skipping HTTPS config: staging file or certificate not found."
fi

# 3. Перезагружаем nginx с новым конфигом
sudo nginx -t && sudo systemctl reload nginx