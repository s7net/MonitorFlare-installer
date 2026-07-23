# MonitorFlare 1-Click Client-Side Auto-Installer & Deployer (`monitorflare-installer`)

A 100% client-side React SPA app built with Vite and TailwindCSS to provision and deploy MonitorFlare to Cloudflare Workers and Cloudflare D1 Database with zero backend dependencies.

---

## 🌟 Key Features

- **100% Client-Side & Zero-Server Security**: Runs completely inside the browser. Your Cloudflare API Token is never sent to any third-party server.
- **Automated Cloudflare D1 Provisioning**: Creates the `monitorflare` D1 database and applies all migrations (`0000_initial.sql` through `0004_retries_and_backup_bot.sql`) via Cloudflare REST API.
- **Random Credentials Generator**: One-click generation of secure random admin username, 16-character password, and hidden admin path.
- **Telegram Connection Verification**: Instant client-side testing for Telegram alert bot credentials.

---

## 🚀 Getting Started

### Local Development
```bash
# 1. Clone repository
git clone https://github.com/ByteHolic/monitorflare-installer.git
cd monitorflare-installer

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open `http://localhost:5173` in your browser to launch the 1-Click Installer.

---

## 🛡 Security & Privacy
- **Web Crypto Hashing**: Password hashing occurs client-side using browser-native SHA-256 (`crypto.subtle`).
- **Direct Cloudflare REST API Integration**: Calls `https://api.cloudflare.com/client/v4/` directly using standard HTTPS CORS requests.
