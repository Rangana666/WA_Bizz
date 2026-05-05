FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p /app/uploads

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
