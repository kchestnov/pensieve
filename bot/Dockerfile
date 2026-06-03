# --- build stage: compile TypeScript ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: prod deps + compiled output only ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# the knowledge base is mounted here (see docker-compose.yml)
ENV PENSIEVE_HOME=/data
RUN mkdir -p /data && chown -R node:node /data
USER node

CMD ["node", "dist/index.js"]
