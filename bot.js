/**
 * bot.js — Stake $1 Challenge TikTok Automation Pipeline
 *
 * Main orchestrator:
 * 1. Spins the wheel page to pick a game + bet size (records it)
 * 2. Plays the game on Stake.com in Fun Mode (records it)
 * 3. Stitches recordings into a vertical TikTok video with overlays
 * 4. Updates state (bankroll, day, history)
 *
 * Usage: node bot.js [--day N] [--game GameName] [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { recordWheelSpin } = require('./lib/wheel-recorder');
const { playGame } = require('./lib/stake-player');
const { assembleVideo } = require('./lib/video-assembler');

// Auto-start local proxy for VPN routing
let proxyProcess = null;
function startProxy() {
  const proxyFile = path.resolve(__dirname, 'local-proxy.js');
  if (!fs.existsSync(proxyFile)) return;
  if (!process.env.NORD_USER || !process.env.NORD_PASS) {
    console.log('⚠️  No NordVPN creds in .env — skipping proxy');
    return;
  }
  console.log('🔒 Starting VPN proxy...');
  proxyProcess = fork(proxyFile, [], { silent: true });
  proxyProcess.on('error', (e) => console.log('Proxy error:', e.message));
}
function stopProxy() {
  if (proxyProcess) { proxyProcess.kill(); proxyProcess = null; }
}

const STATE_FILE = path.resolve(__dirname, 'state.json');

// ─── Parse CLI args ───
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--day' && args[i + 1]) flags.day = parseInt(args[++i]);
  if (args[i] === '--game' && args[i + 1]) flags.game = args[++i];
  if (args[i] === '--dry-run') flags.dryRun = true;
  if (args[i] === '--skip-wheel') flags.skipWheel = true;
  if (args[i] === '--skip-stake') flags.skipStake = true;
  if (args[i] === '--help') {
    console.log(`
Stake $1 Challenge Bot
======================
Usage: node bot.js [options]

Options:
  --day N          Override day number
  --game Name      Force a specific game (skip wheel spin)
  --dry-run        Show what would happen without actually running
  --skip-wheel     Skip wheel recording (use random game/bet)
  --skip-stake     Skip Stake gameplay (only record wheel)
  --help           Show this help
`);
    process.exit(0);
  }
}

// ─── State management ───
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    return {
      bankroll: 1.00,
      day: 1,
      startBalance: 1.00,
      ath: 1.00,
      history: [],
      balanceHistory: [1.00],
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Main pipeline ───
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Stake $1 Challenge — TikTok Bot      ║');
  console.log('╚════════════════════════════════════════╝\n');

  const state = loadState();

  // Override day if specified
  if (flags.day) state.day = flags.day;

  console.log(`📅 Day ${state.day}`);
  console.log(`💰 Bankroll: $${state.bankroll.toFixed(2)}`);
  console.log(`📈 ATH: $${state.ath.toFixed(2)}\n`);

  if (state.bankroll <= 0) {
    console.log('💀 Bankroll is $0.00 — Challenge over! Reset state.json to restart.');
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log('[DRY RUN] Would spin wheel, play game, and create video.');
    console.log('Exiting without changes.');
    process.exit(0);
  }

  // Start VPN proxy for Stake access
  startProxy();
  await new Promise(r => setTimeout(r, 2000)); // Give proxy time to start

  let gameName, betAmount, betLabel, betPct, wheelVideoPath;

  // ── Step 1: Wheel Spin ──
  if (flags.game) {
    // Manual game override
    gameName = flags.game;
    betPct = 0.25;
    betLabel = 'Bold';
    betAmount = parseFloat((state.bankroll * betPct).toFixed(2));
    console.log(`🎯 Forced game: ${gameName}`);
    console.log(`💵 Default bet: $${betAmount} (25% Bold)\n`);
  } else if (flags.skipWheel) {
    const GAMES = ['Dice', 'Crash', 'Mines', 'Plinko', 'Blackjack', 'Slots', 'Limbo', 'Roulette', 'Keno', 'Wheel', 'Dragon Tower', 'Hilo'];
    const BET_OPTIONS = [
      { pct: 0.10, label: 'Safe' },
      { pct: 0.15, label: 'Steady' },
      { pct: 0.25, label: 'Bold' },
      { pct: 0.35, label: 'Risky' },
      { pct: 0.50, label: 'YOLO' },
      { pct: 1.00, label: 'ALL IN' },
    ];
    gameName = GAMES[Math.floor(Math.random() * GAMES.length)];
    const betOpt = BET_OPTIONS[Math.floor(Math.random() * BET_OPTIONS.length)];
    betPct = betOpt.pct;
    betLabel = betOpt.label;
    betAmount = parseFloat((state.bankroll * betPct).toFixed(2));
    console.log(`🎲 Random game: ${gameName}`);
    console.log(`💵 Random bet: $${betAmount} (${Math.round(betPct * 100)}% ${betLabel})\n`);
  } else {
    console.log('🎡 Step 1: Spinning the wheel...\n');
    try {
      const wheelResult = await recordWheelSpin(state);
      gameName = wheelResult.game;
      betPct = wheelResult.betPct;
      betLabel = wheelResult.betLabel;
      betAmount = wheelResult.betAmount;
      wheelVideoPath = wheelResult.videoPath;

      console.log(`\n✅ Wheel result:`);
      console.log(`   Game: ${gameName}`);
      console.log(`   Bet: $${betAmount} (${Math.round(betPct * 100)}% ${betLabel})`);
      console.log(`   Video: ${wheelVideoPath}\n`);
    } catch (error) {
      console.error('❌ Wheel spin failed:', error.message);
      process.exit(1);
    }
  }

  // ── Step 2: Play on Stake ──
  let gameVideoPath, gameResult;

  if (flags.skipStake) {
    console.log('⏭️  Skipping Stake gameplay (--skip-stake)\n');
    gameResult = { won: false, payout: 0 };
  } else {
    console.log(`🎮 Step 2: Playing ${gameName} on Stake.com...\n`);
    try {
      const result = await playGame(gameName, betAmount, state);
      gameVideoPath = result.videoPath;
      gameResult = { won: result.won, payout: result.payout };

      console.log(`\n✅ Game result:`);
      console.log(`   ${gameResult.won ? '🏆 WON' : '💀 LOST'}`);
      console.log(`   Payout: $${gameResult.payout.toFixed(2)}`);
      console.log(`   Video: ${gameVideoPath}\n`);
    } catch (error) {
      console.error('❌ Game play failed:', error.message);
      console.log('Continuing with video assembly if wheel recording exists...\n');
      gameResult = { won: false, payout: 0, error: error.message };
    }
  }

  // ── Step 3: Assemble Video ──
  if (wheelVideoPath && gameVideoPath) {
    console.log('🎬 Step 3: Assembling TikTok video...\n');
    try {
      const outputPath = assembleVideo({
        wheelVideoPath,
        gameVideoPath,
        gameName,
        betAmount,
        bankroll: state.bankroll,
        day: state.day,
      });

      console.log(`\n✅ TikTok video ready: ${outputPath}\n`);
    } catch (error) {
      console.error('❌ Video assembly failed:', error.message);
    }
  } else if (wheelVideoPath || gameVideoPath) {
    console.log('⚠️  Only one recording available — skipping video assembly');
    console.log('   Run again to get both recordings.\n');
  }

  // ── Step 4: Update State ──
  const oldBankroll = state.bankroll;
  if (gameResult.won) {
    state.bankroll = parseFloat((state.bankroll + gameResult.payout).toFixed(2));
  } else {
    state.bankroll = parseFloat((state.bankroll - betAmount).toFixed(2));
    if (state.bankroll < 0) state.bankroll = 0;
  }

  if (state.bankroll > state.ath) state.ath = state.bankroll;

  state.history.push({
    day: state.day,
    game: gameName,
    betPct: betPct,
    betLabel: betLabel,
    betAmount: betAmount,
    won: gameResult.won,
    payout: gameResult.payout,
    bankrollBefore: oldBankroll,
    bankrollAfter: state.bankroll,
    timestamp: new Date().toISOString(),
  });

  state.balanceHistory.push(state.bankroll);
  state.day++;

  saveState(state);

  console.log('═══════════════════════════════════════');
  console.log(`📊 Day ${state.day - 1} Summary:`);
  console.log(`   Game: ${gameName}`);
  console.log(`   Bet: $${betAmount} (${betLabel})`);
  console.log(`   Result: ${gameResult.won ? '🏆 WIN' : '💀 LOSS'}`);
  console.log(`   Bankroll: $${oldBankroll.toFixed(2)} → $${state.bankroll.toFixed(2)}`);
  console.log(`   ATH: $${state.ath.toFixed(2)}`);
  console.log('═══════════════════════════════════════\n');

  if (state.bankroll <= 0) {
    console.log('💀💀💀 BUSTED! Challenge is over!');
    console.log('Reset state.json to start fresh.\n');
  }

  stopProxy();
}

main().catch(err => {
  console.error('Fatal error:', err);
  stopProxy();
  process.exit(1);
});
