# Estágio 1: Build
FROM node:18-alpine AS build
WORKDIR /app
ENV TSC_COMPILE_ON_ERROR=true
COPY package*.json ./
RUN npm install --include=dev
COPY . .
# Removemos o || true para garantir que a pasta dist seja criada
RUN npx vite build --emptyOutDir

# Estágio 2: Serve
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
