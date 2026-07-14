#!/bin/bash
set -e

DOMAIN=$(/opt/elasticbeanstalk/bin/get-config environment -k CERTBOT_DOMAIN)
EMAIL=$(/opt/elasticbeanstalk/bin/get-config environment -k CERTBOT_EMAIL)

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "Requesting certificate for ${DOMAIN}..."
  sudo certbot certonly --nginx \
    --non-interactive --agree-tos \
    -d "${DOMAIN}" \
    -m "${EMAIL}"
else
  echo "Certificate already exists, skipping issuance."
fi

sudo systemctl reload nginx