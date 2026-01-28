#!/bin/bash

# build-win-local.sh
# Script to build Windows artifacts locally on macOS.
# Features:
# - Checks build-history.json to avoid redundant builds (override with --force)
# - Bumps package version (disable with --no-bump)
# - Updates build-history.json on success

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
      echo "Usage: ./build-win-local.sh [--force] [--no-bump]"
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
  export $(grep -v '^#' .env.local | grep '=' | xargs)
fi

# Check for required Firebase environment variables
REQUIRED_VARS=(
  "NEXT_PUBLIC_FIREBASE_API_KEY"
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  "NEXT_PUBLIC_FIREBASE_APP_ID"
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
  echo "To fix this, set these variables in your environment or in a .env.local file."
  # Ask for confirmation to proceed
  read -p "Do you want to proceed anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Helper function to run node one-liners
run_node() {
  node -e "$1"
}

# 1. Get current git hash
CURRENT_HASH=$(git rev-parse HEAD | tr -d '[:space:]')
echo "Current Hash: $CURRENT_HASH"

# 2. Check build history
if [ "$FORCE_BUILD" = false ] && [ -f "$HISTORY_FILE" ]; then
  LAST_HASH=$(run_node "
    try {
      const history = require('./$HISTORY_FILE');
      if (history.win && history.win.hash) console.log(history.win.hash);
    } catch (e) {}
  ")
  
  if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
    echo "This commit ($CURRENT_HASH) was already built for Windows."
    echo "Use --force to build anyway."
    exit 0
  fi
fi

# 3. Bump Version
if [ "$NO_BUMP" = false ]; then
  echo "Bumping version..."
  # Use npm version patch to handle the file update safely
  # --no-git-tag-version prevents it from creating a git tag/commit automatically
  NEW_VERSION=$(npm version patch --no-git-tag-version)
  VERSION_BUMPED=true
  # Remove 'v' prefix if present for display or JSON consistency
  CLEAN_VERSION=${NEW_VERSION#v}
  echo "New Version: $CLEAN_VERSION"
else
  CLEAN_VERSION=$(run_node "console.log(require('./$PACKAGE_FILE').version)")
  echo "Using current version: $CLEAN_VERSION"
fi

# 4. Run Build
echo "Preparing dist/win directory..."
mkdir -p dist/win
# Clear existing contents
rm -rf dist/win/*

echo "Starting Windows build..."
npx electron-builder --win --config.directories.output=dist/win

# 5. Update History
echo "Updating build history..."
DATE_STR=$(date "+%Y-%m-%d %H:%M:%S")

run_node "
  const fs = require('fs');
  const historyFile = './$HISTORY_FILE';
  let history = {};
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
  } catch (e) { console.error('Error reading history:', e); }

  history.win = {
    hash: '$CURRENT_HASH',
    version: '$CLEAN_VERSION',
    date: '$DATE_STR'
  };

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 4));
"

BUILD_SUCCESS=true
echo "Build complete! Artifacts are in dist/"
