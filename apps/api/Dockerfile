FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@gcp-sre/shared --workspace=@gcp-sre/api
RUN npm run build -w @gcp-sre/shared && npm run build -w @gcp-sre/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
EXPOSE 8080
CMD ["node", "dist/index.js"]
