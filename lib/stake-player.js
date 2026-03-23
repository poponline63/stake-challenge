/**
 * stake-player.js
 * Opens Stake.com, navigates to game, and either:
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
  console.log('(If this is your first run, log into Stake.com in the Chrome window that opens, then run again)');
  
  // Only use SOCKS proxy if USE_PROXY=true in .env (otherwise assume NordVPN app is connected)
  const useProxy = process.env.USE_PROXY === 'true';
  
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    '--hide-crash-restore-bubble',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-blink-features=AutomationControlled',
  ];
  if (useProxy) {
    chromeArgs.push('--proxy-server=socks5://127.0.0.1:1090');
    console.log('Using SOCKS5 proxy (127.0.0.1:1090)');
  } else {
    console.log('No proxy — make sure NordVPN is connected to Canada!');
  }
  const fullGameUrl = `${BASE_URL}${GAME_URLS[gameName]}`;
  chromeArgs.push(fullGameUrl);
  
  console.log(`Chrome path: ${CHROME_PATH}`);
  console.log(`Chrome args: ${chromeArgs.join(' ')}`);
  
  const chrome = spawn(CHROME_PATH, chromeArgs, { detached: true, stdio: 'pipe' });
  
  chrome.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg && !msg.includes('DevTools listening')) console.log(`[Chrome] ${msg}`);
  });
  
  chrome.on('error', (err) => console.error(`Chrome spawn error: ${err.message}`));
  chrome.on('exit', (code) => console.log(`Chrome exited with code ${code}`));

  console.log('Waiting for Chrome to start...');
  await sleep(6000);

  let browser;
  try {
    console.log(`Connecting to Chrome CDP on port ${CDP_PORT}...`);
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    // Navigate to game
    const fullUrl = `${BASE_URL}${gameUrl}`;
    console.log(`Navigating to ${fullUrl}...`);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // Check if page is blank/white — might need a reload
    const pageContent = await page.content();
    if (pageContent.length < 500) {
      console.log('Page looks blank, reloading...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(8000);
    }

    // Handle Turnstile — wait for user to solve if needed
    const title = await page.title();
    if (title === 'Just a moment...' || title === '') {
      console.log('\n⚠️  Cloudflare challenge detected!');
      console.log('👉 Solve the captcha in the Chrome window, then wait...\n');
      
      // Try clicking Turnstile checkbox first
      await handleTurnstile(page);
      
      // Wait up to 60 seconds for user to solve captcha
      try {
        await page.waitForFunction(() => document.title !== 'Just a moment...' && document.title !== '', { timeout: 60000 });
        console.log('✅ Captcha solved!');
      } catch (e) {
        console.log('⏰ Captcha timeout — continuing anyway...');
      }
    }
    
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

    // Inject fake balance overlay — show challenge bankroll instead of real balance
    const challengeBalance = state.bankroll;
    await page.evaluate((balance) => {
      // Override balance display with challenge amount
      function overrideBalance() {
        // Stake shows balance in multiple places — find and replace all
        const selectors = [
          '[data-test="balance"]',
          '[class*="balance"]',
          '[class*="Balance"]',
          'button[class*="wallet"] span',
          'span[class*="amount"]',
        ];
        
        // Also search for any element that looks like a crypto balance
        const allSpans = document.querySelectorAll('span, div, p');
        for (const el of allSpans) {
          const text = el.textContent.trim();
          // Match patterns like "0.00000123" or "LTC 0.001" (crypto balances)
          if (/^\d+\.\d{4,}$/.test(text) || /^(LTC|BTC|ETH|USDT|USD)\s*[\d.]+/.test(text)) {
            if (el.children.length === 0 && el.offsetParent !== null) {
              el.setAttribute('data-original-balance', text);
              el.textContent = '$' + balance.toFixed(2);
              el.style.color = '#10b981';
              el.style.fontWeight = 'bold';
            }
          }
        }
        
        // Also override the wallet/balance button area
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            if (el.textContent.match(/[\d.]+/) && el.children.length === 0) {
              el.setAttribute('data-original-balance', el.textContent);
              el.textContent = '$' + balance.toFixed(2);
            }
          });
        }
      }
      
      // Run immediately and keep overriding (Stake re-renders often)
      window.__challengeBalance = balance;
      overrideBalance();
      window.__balanceInterval = setInterval(() => {
        // Use the latest balance value
        const allSpans = document.querySelectorAll('span, div, p');
        for (const el of allSpans) {
          if (el.getAttribute('data-original-balance') || 
              (/^\d+\.\d{4,}$/.test(el.textContent.trim()) && el.children.length === 0 && el.offsetParent !== null)) {
            el.setAttribute('data-original-balance', 'true');
            el.textContent = '$' + window.__challengeBalance.toFixed(2);
            el.style.color = window.__challengeBalance > 0 ? '#10b981' : '#ef4444';
            el.style.fontWeight = 'bold';
          }
        }
      }, 500);
      
      // Function to update balance after a bet
      window.updateChallengeBalance = (newBalance) => {
        window.__challengeBalance = newBalance;
      };
    }, challengeBalance);

    console.log(`💰 Balance overlay: $${challengeBalance.toFixed(2)}`);

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

    // Update balance overlay with new amount
    const newBalance = result.won 
      ? parseFloat((state.bankroll + result.payout).toFixed(2))
      : parseFloat((state.bankroll - betAmount).toFixed(2));
    
    await page.evaluate((bal) => {
      window.__challengeBalance = Math.max(0, bal);
    }, newBalance);
    
    console.log(`💰 Balance updated: $${Math.max(0, newBalance).toFixed(2)}`);

    // Hold on result
    await sleep(3000);

    // Stop recording
    clearInterval(recordingInterval);
    await sleep(500);

    // Convert screenshots to video
    const videoPath = await screenshotsToVideo(screenshots, gameSlug, state.day);

    // Clean up balance override interval
    await page.evaluate(() => { clearInterval(window.__balanceInterval); }).catch(() => {});
    
    // Close gracefully so Chrome doesn't show "restore" next time
    try { await page.close(); } catch (e) {}
    try { await browser.close(); } catch (e) {}
    await sleep(1000);
    try { chrome.kill(); } catch (e) {}

    return {
      won: result.won,
      payout: result.payout,
      videoPath,
    };

  } catch (error) {
    console.error(`Error: ${error.message}`);
    try { await browser.close(); } catch (e) {}
    await sleep(500);
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
  // Try to find and click the Turnstile checkbox in iframes
  const frames = page.frames();
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('challenges.cloudflare') || url.includes('turnstile')) {
      console.log(`Found Turnstile frame: ${url.substring(0, 80)}...`);
      try {
        // Try clicking the checkbox input directly
        const checkbox = await frame.$('input[type="checkbox"]');
        if (checkbox) {
          await checkbox.click();
          console.log('Clicked Turnstile checkbox');
          await sleep(5000);
          return;
        }
        
        // Try the label/wrapper
        const label = await frame.$('label');
        if (label) {
          await label.click();
          console.log('Clicked Turnstile label');
          await sleep(5000);
          return;
        }
        
        // Fallback: click center of the frame body
        const body = await frame.$('body');
        if (body) {
          const box = await body.boundingBox();
          if (box) {
            // Checkbox is usually on the left side
            await page.mouse.click(box.x + 30, box.y + box.height / 2);
            console.log('Clicked Turnstile area (fallback)');
            await sleep(5000);
          }
        }
      } catch (e) {
        console.log('Turnstile click error:', e.message);
      }
    }
  }
  
  // Also try finding Turnstile widget on the main page
  try {
    const widget = await page.$('[id*="turnstile"], .cf-turnstile, iframe[src*="turnstile"]');
    if (widget) {
      const box = await widget.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 30, box.y + box.height / 2);
        console.log('Clicked Turnstile widget on main page');
        await sleep(5000);
      }
    }
  } catch (e) {}
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
