# Build once, promote the same image through DEV -> STAGING -> PROD (D17).
# Each environment mounts its own config.json over /usr/share/nginx/html/config.json.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/tcms-frontend/browser /usr/share/nginx/html
EXPOSE 8080
