FROM node:20-alpine

RUN apk add --no-cache dumb-init openssh-client

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
