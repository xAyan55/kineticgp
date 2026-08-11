#!/usr/bin/env bash
# ====================================================================
#  KineticGP — Self-Hosted Minecraft Server Panel One-Click Installer
#  GitHub: https://github.com/xAyan55/kineticgp
# ====================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "===================================================================="
echo "    🚀  KineticGP Server Management Panel — Installer  🚀           "
echo "===================================================================="
echo -e "${NC}"

# Check for root privilege
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run this script as root (e.g., sudo bash install.sh)${NC}"
  exit 1
fi

INSTALL_DIR="/var/www/kineticgp"

# ── Step 1: System packages ──────────────────────────────────────────
echo -e "${BLUE}🔹 Step 1/6: Installing system prerequisites...${NC}"
if command -v apt-get &> /dev/null; then
  apt-get update -y
  apt-get install -y curl git unzip build-essential python3 python3-distutils openjdk-21-jre-headless 2>/dev/null || \
  apt-get install -y curl git unzip build-essential python3 openjdk-21-jre-headless
elif command -v dnf &> /dev/null; then
  dnf install -y curl git unzip gcc-c++ make python3 java-21-openjdk-headless
fi

# ── Step 2: Node.js 20 LTS ───────────────────────────────────────────
echo -e "${BLUE}🔹 Step 2/6: Checking Node.js environment...${NC}"
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]; then
  echo -e "${YELLOW}Installing Node.js 20.x LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}✅ Node.js $(node -v) & npm $(npm -v) detected${NC}"

# ── Step 3: PM2 ──────────────────────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}Installing PM2 process manager globally...${NC}"
  npm install -g pm2
fi

# ── Step 4: Clone / Update repo ──────────────────────────────────────
echo -e "${BLUE}🔹 Step 3/6: Setting up KineticGP source code at ${INSTALL_DIR}...${NC}"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  git pull origin main
else
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/xAyan55/kineticgp.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── Step 5: Install deps & compile better-sqlite3 from C source ─────
echo -e "${BLUE}🔹 Step 4/6: Installing dependencies...${NC}"

# CRITICAL: Remove stale prebuilt better-sqlite3 binary to avoid Segfault
rm -rf node_modules/better-sqlite3

# Install all packages, forcing native modules to compile from C source
npm install --production=false --build-from-source

echo -e "${BLUE}🔹 Step 5/6: Verifying better-sqlite3 native module...${NC}"
node -e "require('better-sqlite3')" 2>/dev/null && \
  echo -e "${GREEN}✅ better-sqlite3 native module OK${NC}" || \
  { echo -e "${RED}❌ better-sqlite3 failed, attempting rebuild...${NC}"; \
    npm rebuild better-sqlite3 --build-from-source; \
    node -e "require('better-sqlite3')"; }

# Build TypeScript & CSS (if source files are present)
if [ -f "tsconfig.json" ]; then
  echo -e "${BLUE}   Building TypeScript & CSS...${NC}"
  npm run build
fi

# Ensure required directories exist
mkdir -p storage public/images/banners
chmod -R 777 storage

# ── Step 6: PM2 Launch ───────────────────────────────────────────────
echo -e "${BLUE}🔹 Step 6/6: Starting KineticGP service with PM2...${NC}"
pm2 delete KineticGP 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup 2>/dev/null || true

# Quick health check — wait 3 seconds then verify PM2 status
sleep 3
PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try{const a=JSON.parse(d);
      const p=a.find(x=>x.name==='KineticGP');
      console.log(p?p.pm2_env.status:'unknown');
    }catch(e){console.log('unknown')}
  })
" 2>/dev/null || echo "unknown")

SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

if [ "$PM2_STATUS" = "online" ]; then
  echo -e "${GREEN}"
  echo "===================================================================="
  echo " 🎉 KineticGP Panel Installed & Running Successfully!"
  echo "===================================================================="
  echo -e "${NC}"
  echo -e "${CYAN}🌐 Panel URL:${NC} ${YELLOW}http://${SERVER_IP}:3000${NC}"
  echo -e "${CYAN}📁 Install Path:${NC} ${INSTALL_DIR}"
  echo -e "${CYAN}⚡ PM2 Command:${NC} pm2 status / pm2 logs KineticGP"
else
  echo -e "${RED}"
  echo "===================================================================="
  echo " ⚠️  KineticGP may not have started correctly."
  echo "===================================================================="
  echo -e "${NC}"
  echo -e "${YELLOW}Run these commands to debug:${NC}"
  echo "  pm2 logs KineticGP --lines 50"
  echo "  node dist/app.js"
fi
echo ""

