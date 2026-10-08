FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3338
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/build-server ./build-server
RUN mkdir -p /var/lib/echo-vault-web && chown -R node:node /var/lib/echo-vault-web
USER node
EXPOSE 3338
CMD ["node", "build-server/index.js"]
