# syntax=docker/dockerfile:1

# --- Stage 1: build the Vite/React SPA ---
FROM node:20.19.0-alpine AS build

WORKDIR /app

# Install dependencies (leverages layer cache when lockfile is unchanged)
COPY package.json package-lock.json ./
RUN npm ci

# Build the static assets
COPY . .
RUN npm run build

# --- Stage 2: serve the static build with nginx ---
FROM nginx:1.27-alpine AS runtime

# SPA-aware nginx config (history fallback to index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
