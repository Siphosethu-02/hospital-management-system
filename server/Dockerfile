# server/Dockerfile
# Multi-stage build for the Hospital Management System API.
#
#   Stage 1 "dependencies" - installs ONLY production npm packages, in
#   their own layer, so that later stages (and rebuilds where only
#   source code changed) can reuse this layer from cache instead of
#   reinstalling node_modules every time.
#
#   Stage 2 "runtime" - the actual image that ships: copies the
#   pre-built node_modules from stage 1, adds the application source,
#   drops root privileges, and starts the server via an entrypoint that
#   waits for MySQL and seeds reference data before handing off to Node.

# ---------------------------------------------------------------------
# Stage 1: dependencies
# ---------------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy only the manifest files first - this layer only invalidates (and
# triggers a slow reinstall) when package.json/package-lock.json actually
# change, not on every source-code edit.
COPY package*.json ./

# --omit=dev keeps nodemon/eslint out of the production image.
#
# NOTE: this uses `npm install` rather than `npm ci`. `npm ci` is
# normally preferable (faster, and it verifies package-lock.json's
# integrity hashes for fully reproducible installs) but it REQUIRES a
# package-lock.json to already exist, which this repo doesn't ship with
# out of the box. Once you've generated one - run, on your own machine:
#   cd server && npm install --package-lock-only
# and commit the resulting package-lock.json - switch this back to:
#   RUN npm ci --omit=dev
# for faster, hash-verified, fully reproducible builds.
RUN npm install --omit=dev

# ---------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------
FROM node:20-alpine AS runtime

# wget is used by the docker-compose healthcheck to hit /api/v1/health.
# BusyBox's wget (already present on alpine) is sufficient, so no extra
# package installation is needed here - kept as a comment for clarity.

ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user - a Docker/security best practice. The `node`
# image already ships a `node` user (uid 1000); we just need to own the
# files we copy in.
RUN mkdir -p /app/uploads/patients /app/uploads/lab-reports /app/uploads/misc /app/logs \
    && chown -R node:node /app

# Bring in the production node_modules built in the previous stage.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Now copy the application source itself. Combined with the dependency
# layer above, editing source code never forces a reinstall of
# node_modules on rebuild.
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node database ./database
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node

# The API listens on 5000 by default (see src/config/env.js / .env).
EXPOSE 5000

# Docker-level healthcheck as well as the docker-compose one, so the
# image is self-describing even if run outside docker-compose (e.g.
# `docker run`). docker-compose's healthcheck block (docker-compose.yml)
# takes precedence when the stack is run via compose.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

# Environment variables (DB_HOST, JWT secrets, etc.) are supplied at run
# time via docker-compose's `environment:` / `.env` file - see
# docker-compose.yml and .env.example. Nothing sensitive is baked into
# the image itself.

ENTRYPOINT ["./docker-entrypoint.sh"]
