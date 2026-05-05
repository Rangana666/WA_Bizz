FROM node:20-alpine

# python3 make g++ are required to compile native modules (node-ssh → ssh2 → cpu-features)
RUN apk add --no-cache dumb-init openssh-client python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
