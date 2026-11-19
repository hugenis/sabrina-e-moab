FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
COPY public ./public
COPY data ./data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
