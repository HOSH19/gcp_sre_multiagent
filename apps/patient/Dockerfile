# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/patient ./apps/patient
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces=['packages/shared','apps/patient']; fs.writeFileSync('package.json', JSON.stringify(p,null,2));"
RUN npm install
RUN npm run build -w @gcp-sre/patient

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/apps/patient/package.json ./package.json
COPY --from=build /app/apps/patient/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]
