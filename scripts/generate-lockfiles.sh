#!/bin/sh
# scripts/generate-lockfiles.sh
# Run this on YOUR machine (needs real internet access to npm's
# registry) to generate real, accurate package-lock.json files for
# both the server and client - the --package-lock-only flag resolves
# the full dependency tree and writes the lock file without actually
# installing node_modules, so it's quick.
#
# Usage (from the project root):
#   sh scripts/generate-lockfiles.sh
# or on Windows PowerShell, just run the two commands below by hand.

set -e

echo "Generating server/package-lock.json..."
(cd server && npm install --package-lock-only)

echo "Generating client/package-lock.json..."
(cd client && npm install --package-lock-only)

echo "Done. Commit both package-lock.json files."
echo "Optional: switch server/Dockerfile back to 'npm ci --omit=dev'"
echo "for faster, hash-verified, fully reproducible Docker builds."
