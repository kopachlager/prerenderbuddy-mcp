FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY bin ./bin
COPY src ./src
COPY README.md LICENSE NOTICE SECURITY.md ./

USER node

ENTRYPOINT ["node", "bin/prerenderbuddy-mcp.js"]
