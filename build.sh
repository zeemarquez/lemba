#!/bin/bash

# build.sh
# Orchestrates parallel builds for macOS and Windows on local machine.

set -e

FORCE_BUILD=false
NO_BUMP=false
HISTORY_FILE="build-history.json"
PACKAGE_FILE="package.json"
BUILD_SUCCESS=false
VERSION_BUMPED=false

# Get current version before any potential bump
OLD_VERSION=$(node -e "console.log(require('./$PACKAGE_FILE').version)" 2>/dev/null || echo "0.0.1")

cleanup() {
  if [ "$VERSION_BUMPED" = true ] && [ "$BUILD_SUCCESS" = false ]; then
    echo ""
    echo "Build failed. Rolling back version bump to $OLD_VERSION..."
    npm version "$OLD_VERSION" --no-git-tag-version > /dev/null 2>&1
  fi
}

trap cleanup EXIT

# Parse arguments
for arg in "$@"; do
  case $arg in
    --force)
      FORCE_BUILD=true
      ;;
    --no-bump)
      NO_BUMP=true
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./build.sh [--force] [--no-bump]"
      exit 1
      ;;
  esac
done

# Check for node_modules
if [ ! -d "node_modules" ]; then
  echo "Error: node_modules not found. Please run 'npm install'."
  exit 1
fi

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  echo "Loading environment variables from .env.local..."
  # Use a more robust way to load .env files that handles quotes and line endings
  export $(grep -v '^#' .env.local | xargs -L 1)
fi

# Check for required Firebase environment variables
REQUIRED_VARS=(
  "NEXT_PUBLIC_FIREBASE_API_KEY"
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  "NEXT_PUBLIC_FIREBASE_APP_ID"
  "NEXT_PUBLIC_AUTH_HANDLER_URL"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "Warning: The following environment variables are missing:"
  for var in "${MISSING_VARS[@]}"; do
    echo "  - $var"
  done
  echo "Cloud sync will NOT work in this build."
  echo "To fix this, set these variables in .env.local."
  # Ask for confirmation to proceed
  read -p "Do you want to proceed anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

run_node() {
  node -e "$1"
}

CURRENT_HASH=$(git rev-parse HEAD | tr -d '[:space:]')
echo "Current Hash: $CURRENT_HASH"

# 1. Determine platforms that need building
BUILD_MAC=true
BUILD_WIN=true

if [ "$FORCE_BUILD" = false ] && [ -f "$HISTORY_FILE" ]; then
    HISTORY_JSON=$(cat "$HISTORY_FILE")
    LAST_MAC_HASH=$(run_node "const h = $HISTORY_JSON; console.log(h.mac ? h.mac.hash : '')")
    LAST_WIN_HASH=$(run_node "const h = $HISTORY_JSON; console.log(h.win ? h.win.hash : '')")

    if [ "$CURRENT_HASH" = "$LAST_MAC_HASH" ]; then
        echo "[SKIP] macOS: Already built for this commit."
        BUILD_MAC=false
    fi
    if [ "$CURRENT_HASH" = "$LAST_WIN_HASH" ]; then
        echo "[SKIP] Windows: Already built for this commit."
        BUILD_WIN=false
    fi
fi

if [ "$BUILD_MAC" = false ] && [ "$BUILD_WIN" = false ]; then
    echo "Nothing to build. Use --force to rebuild."
    exit 0
fi

# 2. Versioning
if [ "$NO_BUMP" = false ]; then
  echo "Bumping version..."
  NEW_VERSION=$(npm version patch --no-git-tag-version)
  VERSION_BUMPED=true
  CLEAN_VERSION=${NEW_VERSION#v}
  echo "New Version: $CLEAN_VERSION"
else
  CLEAN_VERSION=$(run_node "console.log(require('./$PACKAGE_FILE').version)")
  echo "Using current version: $CLEAN_VERSION"
fi

# 3. Base Build (Next.js)
echo "Running shared Next.js build..."
npm run build

# 4. Parallel Electron Packaging
echo "Starting parallel Electron packaging..."

PIDS=()

if [ "$BUILD_MAC" = true ]; then
    # We pass --no-bump and --force because we already handled them here
    ./build-mac-local.sh --no-bump --force > build-mac.log 2>&1 &
    PIDS+=($!)
    echo "[JOBS] Started macOS build (PID: $!) - Logging to build-mac.log"
fi

if [ "$BUILD_WIN" = true ]; then
    ./build-win-local.sh --no-bump --force > build-win.log 2>&1 &
    PIDS+=($!)
    echo "[JOBS] Started Windows build (PID: $!) - Logging to build-win.log"
fi

# 5. Wait for both
EXIT_CODE=0
for pid in "${PIDS[@]}"; do
    if wait "$pid"; then
        echo "[JOBS] Job $pid finished successfully."
    else
        echo "[JOBS] Job $pid FAILED."
        EXIT_CODE=1
    fi
done

if [ $EXIT_CODE -eq 0 ]; then
    BUILD_SUCCESS=true
    echo "=============================================="
    echo "   ALL BUILDS COMPLETED SUCCESSFULLY!"
    echo "=============================================="
else
    echo "=============================================="
    echo "   SOME BUILDS FAILED. Check .log files for details."
    echo "=============================================="
    exit 1
fi
