#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
site="music.kunini.ru"
site_target="/etc/nginx/sites-available/${site}.conf"
site_enabled="/etc/nginx/sites-enabled/${site}.conf"

sudo install -o root -g root -m 0644 \
  "$project_dir/deploy/nginx/${site}.bootstrap.conf" \
  "$site_target"
sudo ln -sfn "$site_target" "$site_enabled"
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --keep-until-expiring \
  -d "$site"

sudo install -o root -g root -m 0644 \
  "$project_dir/deploy/nginx/${site}.conf" \
  "$site_target"
sudo nginx -t
sudo systemctl reload nginx

echo "Nginx and HTTPS configured for https://${site}"
