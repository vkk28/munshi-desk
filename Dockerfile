FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY engine/package.json engine/
COPY web/package.json web/
COPY extension/package.json extension/
RUN npm ci --include=dev
COPY engine ./engine
COPY web ./web
RUN npm run build -w web

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
