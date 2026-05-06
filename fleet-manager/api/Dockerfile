# Stage 1: build (has compiler tools)
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Stage 2: runtime (compiler tools removed — small final image)
FROM node:20-alpine
RUN apk add --no-cache dumb-init openssh-client
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
EXPOSE 5000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
