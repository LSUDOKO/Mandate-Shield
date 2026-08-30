# better-sqlite3 is a native module, so the build stage needs a toolchain.
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/audit/package.json packages/audit/
COPY packages/gateway/package.json packages/gateway/
COPY packages/server/package.json packages/server/
COPY packages/benchmarks/package.json packages/benchmarks/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build && npm run build -w @mandate-shield/dashboard

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000 5173

# The audit database lives here; docker-compose mounts a volume over it so the
# hash chain survives a restart.
RUN mkdir -p /app/data

CMD ["node", "packages/server/dist/index.js"]
