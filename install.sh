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

echo -e "${BLUE}🔹 Step 1/5: Updating system packages & installing prerequisites...${NC}"
if command -v apt-get &> /dev/null; then
  apt-get update -y
  apt-get install -y curl git unzip build-essential
elif command -v dnf &> /dev/null; then
  dnf install -y curl git unzip gcc-c++ make
fi

# Step 2: Ensure Node.js 18+ is installed
echo -e "${BLUE}🔹 Step 2/5: Checking Node.js environment...${NC}"
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]; then
  echo -e "${YELLOW}Installing Node.js 20.x LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}✅ Node.js $(node -v) & npm $(npm -v) detected${NC}"

# Step 3: Install PM2 globally if missing
if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}Installing PM2 process manager globally...${NC}"
  npm install -g pm2
fi

# Step 4: Clone / Update repository
echo -e "${BLUE}🔹 Step 3/5: Setting up KineticGP source code at ${INSTALL_DIR}...${NC}"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  git pull origin main
else
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/xAyan55/kineticgp.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Step 5: Install NPM packages, rebuild native binaries from source, and build static assets
echo -e "${BLUE}🔹 Step 4/5: Installing dependencies & compiling native modules from source...${NC}"
npm install --production=false
npm rebuild better-sqlite3 --build-from-source || npm rebuild --build-from-source
npm run build

# Ensure storage directory exists with proper write permissions
mkdir -p storage public/images/banners
chmod -R 777 storage

# Step 6: Start with PM2
echo -e "${BLUE}🔹 Step 5/5: Starting KineticGP service with PM2...${NC}"
pm2 delete KineticGP 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup 2>/dev/null || true

# Get Public / Server IP
SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

echo -e "${GREEN}"
echo "===================================================================="
echo " 🎉 KineticGP Panel Installed & Running Successfully!"
echo "===================================================================="
echo -e "${NC}"
echo -e "${CYAN}🌐 Panel URL:${NC} ${YELLOW}http://${SERVER_IP}:3000${NC}"
echo -e "${CYAN}📁 Install Path:${NC} ${INSTALL_DIR}"
echo -e "${CYAN}⚡ PM2 Command:${NC} pm2 status / pm2 logs KineticGP"
echo ""
