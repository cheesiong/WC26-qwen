#!/bin/sh
set -e

CONF="/etc/nginx/conf.d/default.conf"

# Always generate the HTTP-only config first
envsubst '${BACKEND_URL}' \
  < /etc/nginx/conf.d/default.conf.template \
  > "$CONF"

# If DOMAIN is set and cert already exists, switch to HTTPS config
if [ -n "$DOMAIN" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "SSL cert found for $DOMAIN — enabling HTTPS"
  sed "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" /etc/nginx/conf.d/nginx-ssl.conf.template \
    | envsubst '${BACKEND_URL}' \
    > "$CONF"
fi

# If DOMAIN is set but no cert yet, obtain one via HTTP challenge
if [ -n "$DOMAIN" ] && [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "Obtaining SSL certificate for $DOMAIN..."
  nginx  # start in background (daemon on by default)
  sleep 2
  certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d "$DOMAIN" \
    --email "${CERT_EMAIL:-admin@$DOMAIN}" \
    --agree-tos \
    --non-interactive \
    --no-eff-email || true

  sed "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" /etc/nginx/conf.d/nginx-ssl.conf.template \
    | envsubst '${BACKEND_URL}' \
    > "$CONF"
  nginx -s reload
  echo "HTTPS enabled for $DOMAIN"
fi

# Set up auto-renewal cron (runs daily at 3am)
if [ -n "$DOMAIN" ]; then
  echo "0 3 * * * certbot renew --quiet --webroot --webroot-path=/var/www/certbot --post-hook 'nginx -s reload'" | crontab -
  crond 2>/dev/null || true
fi

# Run nginx in foreground (keeps container alive)
exec nginx -g "daemon off;"
