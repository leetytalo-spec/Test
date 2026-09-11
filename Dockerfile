FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY server.js media-server.js combat-engine.js ./
COPY data ./data
COPY media ./media
EXPOSE 4173 8787 8788
CMD ["node", "server.js"]
