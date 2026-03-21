# Stake $1 Challenge — TikTok Automation

Fully automated pipeline that creates TikTok-ready vertical videos of the Stake $1 Challenge.

## How It Works

1. **Wheel Spin** — Opens the challenge wheel page, spins for a random game + bet size, screen records everything
2. **Stake Gameplay** — Opens Stake.com in Fun Mode via Playwright, navigates to the selected game, sets the bet, plays one round, records gameplay
3. **Video Assembly** — Stitches wheel spin + gameplay into a 1080x1920 (9:16) TikTok video with overlays (bankroll, game name, bet amount, day number)
4. **State Tracking** — Updates bankroll, day counter, and history in `state.json`

## Games

Dice, Crash, Mines, Plinko, Blackjack, Slots, Limbo, Roulette, Keno, Wheel, Dragon Tower, Hilo

## Bet Sizes

10% Safe, 15% Steady, 25% Bold, 35% Risky, 50% YOLO, 100% ALL IN

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

## Requirements

- Node.js 18+
- Playwright (with Chromium)
- ffmpeg
- VPN routing through Canada (for Stake.com access)

## Install

```bash
npm install
npx playwright install chromium
```

## Output

- Raw recordings: `recordings/`
- Final TikTok videos: `output/`
- State tracking: `state.json`
