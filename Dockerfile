FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.mjs og-image.mjs ./
COPY public ./public
COPY data ./data

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
