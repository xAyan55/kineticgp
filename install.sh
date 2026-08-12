#!/usr/bin/env bash
# ====================================================================
#  KineticGP — Self-Hosted Game Server Management Panel Installer
#  GitHub: https://github.com/xAyan55/kineticgp
# ====================================================================

export DEBIAN_FRONTEND=noninteractive
export NODE_ENV=development

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

# Determine installation directory
if [ "$EUID" -eq 0 ]; then
  INSTALL_DIR="/var/www/kineticgp"
else
  INSTALL_DIR="$HOME/kineticgp"
fi

# Step 1: System packages
echo -e "${BLUE}Step 1/6: Installing system prerequisites...${NC}"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y -qq
  apt-get install -y -qq curl git unzip build-essential python3 openjdk-21-jre-headless || \
  apt-get install -y -qq curl git unzip build-essential python3 default-jre-headless || true
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q curl git unzip gcc-c++ make python3 java-21-openjdk-headless || true
elif command -v yum >/dev/null 2>&1; then
  yum install -y -q curl git unzip gcc-c++ make python3 java-21-openjdk-headless || true
fi

# Step 2: Node.js 20 LTS
echo -e "${BLUE}Step 2/6: Checking Node.js environment...${NC}"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | tr -d 'v' | cut -d'.' -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    NODE_OK=1
  fi
fi

if [ "$NODE_OK" -eq 0 ]; then
  echo -e "${YELLOW}Installing Node.js 20.x LTS...${NC}"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs || dnf install -y nodejs
  fi
fi

echo -e "${GREEN}✅ Node.js $(node -v 2>/dev/null || echo 'installed') & npm $(npm -v 2>/dev/null || echo 'installed')${NC}"

# Step 3: PM2 Process Manager
if ! command -v pm2 >/dev/null 2>&1; then
  echo -e "${YELLOW}Installing PM2 process manager globally...${NC}"
  npm install -g pm2 || sudo npm install -g pm2 || true
fi

# Step 4: Clone / Update repository
echo -e "${BLUE}Step 3/6: Setting up KineticGP source code at ${INSTALL_DIR}...${NC}"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/xAyan55/kineticgp.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Step 5: Install dependencies & compile project
echo -e "${BLUE}Step 4/6: Installing node dependencies (including devDependencies)...${NC}"
npm install --include=dev --unsafe-perm

if [ ! -d "node_modules/express" ]; then
  echo -e "${RED}❌ Missing express in node_modules! Retrying npm install...${NC}"
  npm install --force
fi

echo -e "${BLUE}Step 5/6: Compiling TypeScript and CSS bundle...${NC}"
npm run build

mkdir -p storage public/images/banners
chmod -R 777 storage 2>/dev/null || true

# Step 6: Start service with PM2
echo -e "${BLUE}Step 6/6: Launching KineticGP with PM2...${NC}"
pm2 delete KineticGP >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 save >/dev/null 2>&1 || true

SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

echo -e "${GREEN}"
echo "===================================================================="
echo " 🎉 KineticGP Panel Installed & Running Successfully!"
echo "===================================================================="
echo -e "${NC}"
echo -e "${CYAN}🌐 Access Panel:${NC} ${YELLOW}http://${SERVER_IP}:3000${NC}"
echo -e "${CYAN}📁 Installation Path:${NC} ${INSTALL_DIR}"
echo -e "${CYAN}⚡ Service Commands:${NC} pm2 status / pm2 logs KineticGP"
echo ""
