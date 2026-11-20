# syntax=docker/dockerfile:1

FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Install production runtime dependencies only (skips Playwright, Vite, TypeScript, oxlint)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend server, shared TypeScript/JS modules imported by server/, and seed garment images
COPY server ./server
COPY src/contracts ./src/contracts
COPY src/services ./src/services
COPY src/shared ./src/shared
COPY src/utils ./src/utils
COPY public/seed ./public/seed

# Prepare writable data/uploads/cache directory owned by unprivileged node user
RUN mkdir -p /app/data/uploads /app/data/outbox /app/data/vton-cache \
  && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/build-info').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/start.js"]
