# Stake $1 Challenge — TikTok Automation

Fully automated pipeline that creates TikTok-ready vertical videos of the Stake $1 Challenge.

## How It Works

1. **Wheel Spin** — Opens the challenge wheel page, spins for a random game + bet size, screen records everything
2. **Stake Gameplay** — Opens Stake.com via Playwright + Chrome CDP, navigates to the selected game, sets the bet, plays one round, records gameplay
3. **Video Assembly** — Stitches wheel spin + gameplay into a 1080x1920 (9:16) TikTok video with overlays (bankroll, game name, bet amount, day number)
4. **State Tracking** — Updates bankroll, day counter, and history in `state.json`

## Games

Dice, Crash, Mines, Plinko, Blackjack, Slots, Limbo, Roulette, Keno, Wheel, Dragon Tower, Hilo

## Bet Sizes

10% Safe, 15% Steady, 25% Bold, 35% Risky, 50% YOLO, 100% ALL IN

## Setup (Fresh PC)

### 1. Clone the repo
```bash
git clone https://github.com/poponline63/stake-challenge.git
cd stake-challenge
```

### 2. Install dependencies
```bash
npm install
npx playwright install chromium
```

### 3. Install ffmpeg
Download from https://ffmpeg.org/download.html and add to PATH, or:
```bash
# Using chocolatey
choco install ffmpeg

# Or using winget
winget install ffmpeg
```

### 4. Configure environment
```bash
copy .env.example .env
```
Then edit `.env` with your NordVPN SOCKS5 credentials:
- Get them from NordVPN dashboard → Manual Setup → Service Credentials
- Chrome path auto-detects, but you can override it in `.env`

### 5. Install NordVPN (optional)
Only needed if you want the SOCKS5 proxy for VPN routing through the proxy server.
If you have NordVPN installed system-wide, you can just connect to a Canadian/US server instead of using the proxy.

## Usage

```bash
# Full pipeline (wheel spin + game + video)
node bot.js

# Force a specific game
node bot.js --game Dice

# Override day number
node bot.js --day 5

# Skip wheel recording (random game/bet)
node bot.js --skip-wheel

# Skip Stake gameplay (only wheel)
node bot.js --skip-stake

# Dry run (no changes)
node bot.js --dry-run
```

### Proxy (for VPN routing without system-wide NordVPN)
```bash
# Option A: SOCKS5 proxy (port 1090)
node local-proxy.js

# Option B: HTTP proxy (port 8899)
node proxy-server.js
```

## Output

- Raw recordings: `recordings/`
- Final TikTok videos: `output/`
- State tracking: `state.json`

## Requirements

- Node.js 18+
- Google Chrome (auto-detected)
- ffmpeg in PATH
- NordVPN SOCKS5 credentials (for proxy routing)
