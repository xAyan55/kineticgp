# 🚀 KineticGP — Self-Hosted Minecraft & Game Server Panel

KineticGP is a modern, high-performance, self-hosted Minecraft & game server management panel built with Node.js, Express, EJS, Tailwind CSS, TypeScript, and SQLite.

Features the **Airlink Panel Design System**: clean dark surfaces, General Sans typography, Lucide icons, live server metrics, file management, plugin management (Modrinth integration), and node administration.

---

## ⚡ 1-Click Install Command (Linux / VPS)

Run this single command on your Linux server (Ubuntu, Debian, AlmaLinux, CentOS, Fedora) as `root`:

```bash
curl -sSL https://raw.githubusercontent.com/xAyan55/kineticgp/main/install.sh | bash
```

Alternatively using `wget`:

```bash
wget -qO- https://raw.githubusercontent.com/xAyan55/kineticgp/main/install.sh | bash
```

---

## 🛠️ Manual Installation

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- Git & build-essential (GCC/Make)

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/xAyan55/kineticgp.git
cd kineticgp

# 2. Install dependencies & compile native modules
npm install

# 3. Build TypeScript & Tailwind CSS
npm run build

# 4. Start panel
npm start
```

Panel will be running at `http://localhost:3000`.

---

## 🎨 UI/UX Features
- **Design Tokens**: Dark `#141414` page base, translucent `#ffffff` cards (`bg-white/5`), subtle `border-white/10` dividers.
- **Typography**: General Sans UI font with JetBrains Mono code snippets.
- **Server Control**: Console terminal, instant power controls (Start/Restart/Stop/Kill), File Manager with CodeMirror 5 editor, and Modrinth Bukkit/Paper Plugin Manager.
- **Admin Panel**: Node management, Server provisioning, User role management, Plan quotas, System telemetry, and Audit logs.

---

## 📜 License
MIT License. Created & maintained by [xAyan55](https://github.com/xAyan55).
