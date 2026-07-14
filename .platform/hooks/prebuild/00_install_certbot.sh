#!/bin/bash
set -e

if [ ! -f /opt/certbot/bin/certbot ]; then
  echo "Installing certbot..."
  sudo python3 -m venv /opt/certbot
  sudo /opt/certbot/bin/pip install --upgrade pip
  sudo /opt/certbot/bin/pip install certbot certbot-nginx
  sudo ln -sf /opt/certbot/bin/certbot /usr/bin/certbot
else
  echo "Certbot already installed, skipping."
fi