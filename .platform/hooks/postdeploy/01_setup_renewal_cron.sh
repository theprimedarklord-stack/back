#!/bin/bash
set -e

echo "0 0,12 * * * root /usr/bin/certbot renew --quiet --deploy-hook 'systemctl reload nginx'" \
  | sudo tee /etc/cron.d/certbot-renew > /dev/null