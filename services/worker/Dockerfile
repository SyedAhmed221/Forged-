FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/worker/package.json services/worker/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/worker services/worker
COPY tsconfig.json ./
COPY scripts/local-worker-env.mjs scripts/local-worker-env.mjs
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--import", "./scripts/local-worker-env.mjs", "--import", "tsx", "services/worker/src/index.ts"]
