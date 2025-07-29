FROM node:24-alpine

# Install CA certificates
RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm ci

COPY . .

RUN npm run build

# Temporarily disable SSL verification for debugging
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

CMD ["node", "./build/index.js"]