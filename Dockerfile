# ---- Stage 1: Build frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN node node_modules/vite/bin/vite.js build

# ---- Stage 2: Build backend ----
FROM node:22-slim AS backend-build
WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install root deps (prisma)
COPY package.json package-lock.json* ./
RUN npm ci

# Generate Prisma client (needed for tsc)
COPY prisma/ ./prisma/
RUN npx prisma generate

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci
COPY backend/ ./backend/
RUN cd backend && node node_modules/typescript/bin/tsc

# ---- Stage 3: Production ----
FROM node:22-slim AS production
WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install root deps (prisma)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install backend deps (production only)
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev

# Copy prisma schema and generate client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL="file:/data/mathgraph.db"
ENV NODE_OPTIONS="--max-old-space-size=3072"

EXPOSE 3001

# Run migrations, seed, and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node backend/dist/seed.js 2>/dev/null; node backend/dist/server.js"]
