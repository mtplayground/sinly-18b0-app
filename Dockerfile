FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WEB_DIST_DIR=/app/apps/web/dist

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages

EXPOSE 8080

CMD ["npm", "start"]
