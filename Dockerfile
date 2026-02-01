FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time Vite vars only (no .env dependency)
ARG VITE_API_URL
ARG VITE_MODE=production
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MODE=$VITE_MODE

RUN npm run build -- --mode $VITE_MODE

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
