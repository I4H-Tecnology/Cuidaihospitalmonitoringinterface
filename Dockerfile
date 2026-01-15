FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY guidelines /usr/share/nginx/html/guidelines

EXPOSE 80
