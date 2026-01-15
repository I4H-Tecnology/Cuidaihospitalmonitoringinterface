FROM nginx:alpine

# Remove o site default do nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia o site pronto do Figma Make
COPY index.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY guidelines /usr/share/nginx/html/guidelines

EXPOSE 80
