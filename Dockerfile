FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html styles.css app.js sync.js sw.js manifest.webmanifest ./
COPY icons/ ./icons/

EXPOSE 80
