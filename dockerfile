
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base

FROM base AS deps
RUN corepack enable
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS prod-deps
RUN corepack enable
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION} AS production
ENV NODE_ENV=production
WORKDIR /usr/src/app

RUN addgroup -g 1001 nodeapp && adduser -D -u 1001 -G nodeapp nodeapp

COPY --from=prod-deps --chown=nodeapp:nodeapp /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /usr/src/app/dist ./dist
COPY --chown=nodeapp:nodeapp package.json ./

USER nodeapp
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENV TZ=America/Bogota
CMD ["node", "dist/main.js"]