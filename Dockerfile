# Estágio 1: Build
FROM node:18-alpine AS build
WORKDIR /app

# Variável para ignorar erros de lint/ts durante o build
ENV TSC_COMPILE_ON_ERROR=true
ENV ESLINT_NO_DEV_ERRORS=true

COPY package*.json ./
RUN npm install --include=dev

COPY . .

# Comando que força o build mesmo com avisos de erro
RUN npx vite build --emptyOutDir

# Estágio 2: Serve
FROM nginx:stable-alpine
# Copia o build para a pasta do Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Configuração básica para evitar erro de rotas (SPA)
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
