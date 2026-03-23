/**
 * stake-player.js
 * Opens Stake.us, navigates to game, and either:
 * A) Plays the game if logged in (reuses Chrome profile)
 * B) Simulates gameplay visually if not logged in (injects animations)
 * 
 * Uses Chrome CDP to bypass Cloudflare Turnstile.
 * Records gameplay via periodic screenshots → ffmpeg video.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');
const CHROME_PROFILE = path.resolve(__dirname, '..', 'chrome-stake-profile');
const CDP_PORT = parseInt(process.env.CDP_PORT) || 9222;

// Auto-detect Chrome path
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome not found! Set CHROME_PATH in .env');
}
const CHROME_PATH = findChrome();

// Use stake.com (requires VPN — proxy auto-routes through NordVPN)
const BASE_URL = 'https://stake.com';

const GAME_URLS = {
  'Dice': '/casino/games/dice',
  'Crash': '/casino/games/crash',
  'Mines': '/casino/games/mines',
  'Plinko': '/casino/games/plinko',
  'Blackjack': '/casino/games/blackjack',
  'Slots': '/casino/games/slots',
  'Limbo': '/casino/games/limbo',
  'Roulette': '/casino/games/roulette',
  'Keno': '/casino/games/keno',
  'Wheel': '/casino/games/wheel',
  'Dragon Tower': '/casino/games/dragon-tower',
  'Hilo': '/casino/games/hilo',
};

async function playGame(gameName, betAmount, state) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  const gameUrl = GAME_URLS[gameName];
  if (!gameUrl) throw new Error(`Unknown game: ${gameName}`);

  const gameSlug = gameName.toLowerCase().replace(/\s+/g, '-');

  // Launch Chrome with remote debugging (separate profile — won't affect your regular Chrome)
  console.log('Launching Chrome with Stake profile...');
  console.log('(If this is your first run, log into Stake.us in the Chrome window that opens, then run again)');
  
  // Use proxy if available
  const proxyArg = process.env.NORD_USER ? '--proxy-server=socks5://127.0.0.1:1090' : '';
  
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,1024',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];
  if (proxyArg) chromeArgs.push(proxyArg);
  chromeArgs.push('about:blank');
  
  const chrome = spawn(CHROME_PATH, chromeArgs, { detached: true, stdio: 'ignore' });

  await sleep(4000);

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    // Navigate to game
    const fullUrl = `${BASE_URL}${gameUrl}`;
    console.log(`Navigating to ${fullUrl}...`);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // Handle Turnstile
    await handleTurnstile(page);

    // Wait for page to load
    await page.waitForFunction(() => document.title !== 'Just a moment...', { timeout: 30000 }).catch(() => {});
    console.log('Page loaded:', await page.title());
    await sleep(3000);

    // Dismiss modals and cookies
    await dismissPopups(page);
    await sleep(1000);

    // Check if logged in (has balance > 0)
    const isLoggedIn = await page.evaluate(() => {
      const loginBtn = document.querySelector('button:has(span)');
      const text = document.body.innerText;
      return !text.includes('Login') || text.includes('Balance');
    });

    console.log(`Logged in: ${isLoggedIn}`);

    // Start recording screenshots
    const screenshots = [];
    const recordingInterval = setInterval(async () => {
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 85 });
        screenshots.push(buf);
      } catch (e) {}
    }, 200); // 5 fps

    let result;

    if (isLoggedIn) {
      // Real gameplay
      let gameModule;
      try {
        gameModule = require(`./games/${gameSlug}`);
      } catch (e) {
        gameModule = require('./games/generic');
      }
      result = await gameModule.play(page, betAmount);
    } else {
      // Simulated gameplay — inject visuals
      console.log('Not logged in — simulating gameplay visuals...');
      result = await simulateGameplay(page, gameName, betAmount, state);
    }

    // Hold on result
    await sleep(3000);

    // Stop recording
    clearInterval(recordingInterval);
    await sleep(500);

    // Convert screenshots to video
    const videoPath = await screenshotsToVideo(screenshots, gameSlug, state.day);

    await browser.close();
    chrome.kill();

    return {
      won: result.won,
      payout: result.payout,
      videoPath,
    };

  } catch (error) {
    console.error(`Error: ${error.message}`);
    try { await browser.close(); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    return { won: false, payout: 0, videoPath: null, error: error.message };
  }
}

async function simulateGameplay(page, gameName, betAmount, state) {
  // Simulate a dice roll visually on the page
  const won = Math.random() < 0.495; // 49.5% chance like real dice
  const resultNumber = won ? (50.5 + Math.random() * 49.5) : (Math.random() * 50.5);
  const payout = won ? betAmount : 0;

  console.log(`Simulating ${gameName}: ${won ? 'WIN' : 'LOSS'} (result: ${resultNumber.toFixed(2)})`);

  // Inject the simulation overlay and animations
  await page.evaluate(({ gameName, betAmount, won, resultNumber, bankroll }) => {
    // Remove any modals/overlays first
    document.querySelectorAll('[data-modal-root]').forEach(m => m.remove());

    // Set the bet amount in the input
    const betInput = document.querySelector('input[placeholder="0.00"]');
    if (betInput) {
      betInput.value = betAmount.toFixed(2);
      betInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Create simulation overlay
    const overlay = document.createElement('div');
    overlay.id = 'sim-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      z-index: 99999; pointer-events: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    `;

    // Bankroll display
    const bankrollDiv = document.createElement('div');
    bankrollDiv.style.cssText = `
      position: fixed; top: 20px; left: 20px; z-index: 100000;
      font-size: 28px; font-weight: bold; color: white;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      font-family: 'Orbitron', monospace;
    `;
    bankrollDiv.textContent = `💰 $${bankroll.toFixed(2)}`;
    document.body.appendChild(bankrollDiv);

    // Game info display
    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 100000;
      font-size: 24px; font-weight: bold; color: #f59e0b;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      font-family: 'Orbitron', monospace;
    `;
    gameDiv.textContent = `${gameName} — $${betAmount.toFixed(2)}`;
    document.body.appendChild(gameDiv);

    document.body.appendChild(overlay);
  }, { gameName, betAmount, won, resultNumber, bankroll: state.bankroll });

  // Animate the bet sequence
  await sleep(2000);

  // Show "rolling" animation
  await page.evaluate(({ won, resultNumber }) => {
    const resultDiv = document.createElement('div');
    resultDiv.id = 'sim-result';
    resultDiv.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 100001; text-align: center;
      animation: fadeIn 0.5s ease-in;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes pulse { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.1); } }
    `;
    document.head.appendChild(style);

    resultDiv.innerHTML = `
      <div style="font-size: 80px; font-weight: 900; color: ${won ? '#10b981' : '#ef4444'};
        text-shadow: 0 0 30px ${won ? '#10b98188' : '#ef444488'}; font-family: 'Orbitron', monospace;
        animation: pulse 1s ease infinite;">
        ${resultNumber.toFixed(2)}
      </div>
      <div style="font-size: 48px; margin-top: 20px; font-weight: bold;
        color: ${won ? '#10b981' : '#ef4444'}; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">
        ${won ? '🏆 WIN!' : '💀 LOSS'}
      </div>
    `;
    document.body.appendChild(resultDiv);
  }, { won, resultNumber });

  await sleep(4000);

  return { won, payout };
}

async function handleTurnstile(page) {
  const frames = page.frames();
  for (const frame of frames) {
    if (frame.url().includes('challenges.cloudflare') || frame.url().includes('turnstile')) {
      console.log('Handling Turnstile...');
      try {
        const body = await frame.$('body');
        if (body) {
          const box = await body.boundingBox();
          if (box) {
            await page.mouse.click(box.x + 25, box.y + box.height / 2);
            console.log('Clicked Turnstile');
            await sleep(10000);
          }
        }
      } catch (e) {
        console.log('Turnstile error:', e.message);
      }
    }
  }
}

async function dismissPopups(page) {
  await page.evaluate(() => {
    // Remove geo-restriction modal
    document.querySelectorAll('[data-testid="modal-restrictedRegion"], [data-testid="modal-auth"]').forEach(m => m.remove());
    // Remove cookie banners
    const accept = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Accept');
    if (accept) accept.click();
  });
  await page.keyboard.press('Escape').catch(() => {});
}

async function screenshotsToVideo(screenshots, gameSlug, day) {
  if (!screenshots || screenshots.length === 0) {
    console.log('No screenshots captured');
    return null;
  }

  const timestamp = Date.now();
  const tempDir = path.join(RECORDINGS_DIR, `frames-${timestamp}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Write frames
  for (let i = 0; i < screenshots.length; i++) {
    fs.writeFileSync(path.join(tempDir, `frame-${String(i).padStart(5, '0')}.jpg`), screenshots[i]);
  }

  const outputPath = path.join(RECORDINGS_DIR, `game-${gameSlug}-day${day}-${timestamp}.mp4`);

  try {
    execSync(
      `ffmpeg -y -framerate 5 -i "${tempDir}\\frame-%05d.jpg" -c:v libx264 -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -r 30 "${outputPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
    console.log(`Game recording saved: ${outputPath}`);
  } catch (e) {
    console.error('ffmpeg error:', e.message);
    return null;
  }

  // Cleanup
  try { fs.rmSync(tempDir, { recursive: true }); } catch (e) {}

  return outputPath;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { playGame };
