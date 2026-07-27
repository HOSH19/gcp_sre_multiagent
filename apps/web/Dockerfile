# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces=['packages/shared','apps/web']; fs.writeFileSync('package.json', JSON.stringify(p,null,2));"
RUN npm install
RUN npm run build -w @gcp-sre/shared && npm run build -w @gcp-sre/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
