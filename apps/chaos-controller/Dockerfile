# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/chaos-controller ./apps/chaos-controller
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces=['packages/shared','apps/chaos-controller']; fs.writeFileSync('package.json', JSON.stringify(p,null,2));"
RUN npm install
RUN npm run build -w @gcp-sre/shared && npm run build -w @gcp-sre/chaos-controller

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/apps/chaos-controller/package.json ./package.json
COPY --from=build /app/apps/chaos-controller/dist ./dist
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]
