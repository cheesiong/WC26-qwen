FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache certbot bash
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY nginx-ssl.conf.template /etc/nginx/conf.d/nginx-ssl.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /var/www/certbot
ENV BACKEND_URL=http://backend:6173
EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]
