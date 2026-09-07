FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY api ./api
COPY db ./db
COPY scripts ./scripts
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && node api/server.mjs"]
