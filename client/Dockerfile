# client/Dockerfile
# Development-mode image for the React (Vite) frontend. Unlike the
# backend's production build, this intentionally runs Vite's own dev
# server so the team gets hot module reload while working - the
# `client` directory is bind-mounted over this image at runtime (see
# docker-compose.yml), and this Dockerfile just makes sure node_modules
# is pre-installed inside the image so the mount doesn't shadow it.
#
# (For an actual production deployment of the frontend, build a static
# bundle with `npm run build` and serve `dist/` from a static host or
# CDN - e.g. Vercel, as described in the README - rather than shipping
# this dev-server image.)

FROM node:20-alpine

WORKDIR /app

# Install dependencies in their own layer first for cache-friendly
# rebuilds - this layer is skipped unless package.json/lockfile change.
COPY package*.json ./
RUN npm install

# Copy the rest of the source. In docker-compose this gets overlaid by
# a bind mount of ./client, so this COPY mainly matters for `docker build`
# used standalone (e.g. CI) rather than the everyday `docker compose up`
# workflow.
COPY . .

# Tells vite.config.js to bind 0.0.0.0 and use polling-based file
# watching - both are required for the dev server to be reachable and
# for hot reload to work reliably from inside a container.
ENV DOCKER=true

EXPOSE 5173

# --host is redundant with vite.config.js's Docker-aware host setting,
# but kept explicit here so the dev server is reachable even if this
# image is ever run directly (`docker run`) outside docker-compose.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
