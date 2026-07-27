FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/patient ./apps/patient
RUN npm install --workspace=@gcp-sre/patient --include-workspace-root=false || npm install
WORKDIR /app/apps/patient
RUN npx tsc -p tsconfig.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/patient/dist ./dist
COPY --from=build /app/apps/patient/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]
