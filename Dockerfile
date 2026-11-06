FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache git && npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV SERVER_NAME=_ API_UPSTREAM=api:8080
EXPOSE 80 443
