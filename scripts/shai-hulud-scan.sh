#!/usr/bin/env bash
# Scan the installed dependency tree for Shai-Hulud npm supply-chain IOCs.
# Usage: ./scripts/shai-hulud-scan.sh [node_modules-dir]
# Refs: https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack
set -uo pipefail

TREE="${1:-node_modules}"
LOCK="yarn.lock"
FOUND=0

# --- 1. Known-compromised name@version pairs (wave of 2026-02, keyv & friends) ---
BAD_VERSIONS=(
  "keyv@6.0.0"
  "flat-cache@6.1.24"
  "file-entry-cache@11.1.6"
  "cacheable-request@13.0.20"
  "cacheable@2.5.1"
  "@cacheable/memory@2.2.1"
  "cache-manager@7.2.10"
  "@cacheable/node-cache@3.1.2"
  "@cacheable/utils@2.5.1"
  "@cacheable/net@2.1.1"
  "ecto@5.0.1"
)

# --- 2. Payload hashes (sha256) ---
BAD_HASHES=(
  "54dc7ea54a1317cca0e890a2770630cf7fa6c97813e0cb9d2caa93012b350668" # setup.mjs
  "fd3ca4007b225fdf8de7af4345a19179d5efa8c4bb9205f88cda806e5684b1eb" # setup.mjs (community variant)
  "9fc2570b7cef51c1b8df116d144d11ff4096357be7d2c4c6367cfc2509cf1bcc" # Math_Symbol.js / math_init.js
)

# --- 3. Network / string IOCs ---
BAD_STRINGS=(
  "npm-cache.com"
  "0xE1f2395ee43e45A1556EC6438a88c31B83493103"
  "Shai-Hulud: Here We Go Again"
)

hit() { echo "::error::SHAI-HULUD IOC — $*"; FOUND=1; }

echo "▸ Checking $LOCK for known-compromised versions"
for pkg in "${BAD_VERSIONS[@]}"; do
  name="${pkg%@*}" ver="${pkg##*@}"
  # Yarn 4 lock entries look like:  "keyv@npm:6.0.0":  /  version: 6.0.0
  if grep -qF "\"${name}@npm:${ver}\"" "$LOCK" 2>/dev/null; then
    hit "compromised version in lockfile: $pkg"
  fi
done

if [ ! -d "$TREE" ]; then
  echo "▸ $TREE absent — lockfile-only scan"
  [ "$FOUND" -eq 0 ] && echo "✅ no IOC found"
  exit "$FOUND"
fi

echo "▸ Hashing scripts under $TREE"
# ponytail: hash every js-ish file rather than matching filenames — the worm renames its dropper.
while read -r sum file; do
  for bad in "${BAD_HASHES[@]}"; do
    [ "$sum" = "$bad" ] && hit "payload hash $sum → $file"
  done
done < <(find "$TREE" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' \) -print0 \
         | xargs -0 -r shasum -a 256 2>/dev/null)

echo "▸ Grepping for exfiltration indicators"
for s in "${BAD_STRINGS[@]}"; do
  if out=$(grep -rlF --exclude-dir=.cache "$s" "$TREE" 2>/dev/null | head -5) && [ -n "$out" ]; then
    hit "string '$s' in: $(echo "$out" | tr '\n' ' ')"
  fi
done

echo "▸ Checking for the worm's exfil repo in this account"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  if gh repo list --limit 200 --json name,description \
     --jq '.[] | select(.description | test("Shai-Hulud")) | .name' 2>/dev/null | grep -q .; then
    hit "a repo owned by this account carries a 'Shai-Hulud' description — credentials likely exfiltrated"
  fi
fi

if [ "$FOUND" -eq 0 ]; then
  echo "✅ no Shai-Hulud IOC found"
else
  echo "❌ IOCs found — rotate npm/GitHub tokens immediately, do not publish."
fi
exit "$FOUND"
