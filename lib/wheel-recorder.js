/**
 * wheel-recorder.js
 * Opens the wheel page in Playwright, triggers both spins (game + bet),
 * records the viewport, and returns { game, betPct, betLabel, betAmount, videoPath }
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WHEEL_PAGE = path.resolve(__dirname, '..', 'index.html');
const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');

async function recordWheelSpin(state) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--disable-web-security', '--allow-file-access-from-files'],
  });

  const context = await browser.newContext({
    viewport: { width: 720, height: 1280 },
    deviceScaleFactor: 1.5,
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: { width: 1080, height: 1920 },
    },
  });

  const page = await context.newPage();

  // Navigate to the wheel page
  const fileUrl = `file:///${WHEEL_PAGE.replace(/\\/g, '/')}`;
  console.log(`Loading wheel page: ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });

  // Wait for the page to render (Tailwind loads from CDN)
  await page.waitForTimeout(4000);

  // Hide ALL tracker UI — only keep title, wheel, spin button, and results
  await page.evaluate(() => {
    // Nuke everything except what matters for the recording
    const body = document.body;
    const allElements = body.querySelectorAll('*');
    
    // IDs/elements we want to keep visible
    const keepIds = new Set(['wheelCanvas', 'spinBtn', 'betSpinBtn', 'gameResult', 'betSection', 'betResult']);
    const keepClasses = ['wheel-container', 'wheel-canvas-wrap', 'wheel-hub', 'wheel-pointer', 'wheel-outer-glow', 'spin-btn'];
    
    // Hide everything that's not the wheel or spin area
    // Strategy: hide all top-level sections, then show only what we need
    const children = body.children;
    for (const child of children) {
      // Check if this section contains the wheel
      if (child.querySelector('#wheelCanvas') || child.querySelector('#spinBtn')) {
        // This is the wheel section — keep it but hide sub-elements we don't need
        // Hide stat cards, action buttons, utility buttons
        child.querySelectorAll('button').forEach(btn => {
          const text = btn.textContent.trim();
          if (['Add Daily $1', 'I Won', 'I Lost', 'Stats', 'Export', 'Reset'].some(t => text.includes(t))) {
            btn.style.display = 'none';
          }
        });
        // Hide stat grid
        child.querySelectorAll('.grid').forEach(grid => {
          const text = grid.textContent;
          if (text.includes('STARTING') || text.includes('SESSION') || text.includes('ALL-TIME') || text.includes('TODAY')) {
            grid.style.display = 'none';
          }
        });
        // Hide day/bankroll counters (the big numbers above the wheel)
        child.querySelectorAll('[style*="font-size"]').forEach(el => {
          const text = el.textContent;
          if (text.includes('DAY') || text.includes('BANKROLL')) {
            // Keep these — they give context in the video
          }
        });
      } else {
        // Not the wheel section — hide it entirely
        child.style.display = 'none';
      }
    }

    // Make sure wheel is centered
    const wheel = document.getElementById('wheelCanvas');
    if (wheel) {
      wheel.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    
    // Add padding so wheel isn't jammed against the top
    document.body.style.paddingTop = '40px';
  });
  await page.waitForTimeout(500);

  // Inject state into localStorage and reload the page state
  await page.evaluate((stateData) => {
    localStorage.setItem('stake_challenge', JSON.stringify(stateData));
    // Reload the state in the app
    if (typeof loadState === 'function') loadState();
    if (typeof updateUI === 'function') updateUI();
  }, {
    bankroll: state.bankroll,
    day: state.day,
    startBalance: state.startBalance || state.bankroll,
    ath: state.ath || state.bankroll,
    todayAdded: state.bankroll,
    history: state.history || [],
    balanceHistory: state.balanceHistory || [state.bankroll],
    stats: { wins: 0, losses: 0, biggestWin: 0, biggestLoss: 0, bestStreak: 0, currentStreak: 0, streakType: null },
  });

  await page.waitForTimeout(1000);

  // Check that the spin button exists
  const spinBtn = await page.$('#spinBtn');
  if (!spinBtn) {
    await browser.close();
    throw new Error('Spin button not found on wheel page');
  }

  // Make sure wheel canvas is rendered
  const canvasExists = await page.$('#wheelCanvas');
  if (!canvasExists) {
    await browser.close();
    throw new Error('Wheel canvas not found');
  }

  // Expose variables to window so we can check them from Playwright
  // (let declarations at script top level are NOT on window)
  await page.evaluate(() => {
    // Patch the showGameResult function to also set window-level vars
    const origShowGameResult = window.showGameResult || self.showGameResult;
    // We'll poll the DOM instead — the gameResult div becomes visible
  });

  console.log('Clicking SPIN button...');

  // Click the spin button
  await page.click('#spinBtn');

  // Wait for the game result to appear (the div becomes visible after spin completes)
  await page.waitForFunction(() => {
    const el = document.getElementById('gameResult');
    return el && el.style.display !== 'none' && el.innerHTML.includes('result-name');
  }, { timeout: 20000 });

  // Extract game name from the result card
  const gameName = await page.evaluate(() => {
    const nameEl = document.querySelector('.result-name');
    return nameEl ? nameEl.textContent.trim() : null;
  });

  if (!gameName) {
    await browser.close();
    throw new Error('Could not extract game name from result');
  }

  console.log(`Wheel selected game: ${gameName}`);

  // Wait for bet section to appear
  await page.waitForFunction(() => {
    const el = document.getElementById('betSection');
    return el && el.style.display !== 'none';
  }, { timeout: 10000 });

  await page.waitForTimeout(500);

  // Click the bet spin button
  const betSpinBtn = await page.$('#betSpinBtn');
  if (betSpinBtn) {
    console.log('Clicking BET SPIN button...');
    await page.click('#betSpinBtn');

    // Wait for bet result to appear
    await page.waitForFunction(() => {
      const el = document.getElementById('betResult');
      return el && el.style.display !== 'none' && el.innerHTML.includes('result-card');
    }, { timeout: 15000 });

    await page.waitForTimeout(1500);
  }

  // Extract bet info from the bet result card
  const betInfo = await page.evaluate(() => {
    const betResultEl = document.getElementById('betResult');
    if (!betResultEl) return null;
    const text = betResultEl.textContent;
    // Extract dollar amount - format is "$X.XX"
    const amountMatch = text.match(/\$(\d+\.\d{2})/);
    // Extract percentage - format is "XX%"
    const pctMatch = text.match(/(\d+)%/);
    // Extract label
    const labels = ['Safe', 'Steady', 'Bold', 'Risky', 'YOLO', 'ALL IN'];
    let label = 'Bold';
    for (const l of labels) {
      if (text.includes(l)) { label = l; break; }
    }
    const pctMap = { 'Safe': 0.10, 'Steady': 0.15, 'Bold': 0.25, 'Risky': 0.35, 'YOLO': 0.50, 'ALL IN': 1.00 };
    return {
      pct: pctMatch ? parseInt(pctMatch[1]) / 100 : (pctMap[label] || 0.25),
      label: label,
      amount: amountMatch ? parseFloat(amountMatch[1]) : 0.25,
    };
  });

  if (!betInfo) {
    console.log('Warning: Bet info not captured, using defaults');
  }

  const finalBet = betInfo || { pct: 0.25, label: 'Bold', amount: parseFloat((state.bankroll * 0.25).toFixed(2)) };
  console.log(`Bet: $${finalBet.amount} (${Math.round(finalBet.pct * 100)}% ${finalBet.label})`);

  // Hold on result for the recording
  await page.waitForTimeout(2500);

  // Close context to finalize the video recording
  const video = page.video();
  await page.close();
  await context.close();

  const videoPath = await video.path();
  await browser.close();

  // Rename to something meaningful
  const finalPath = path.join(RECORDINGS_DIR, `wheel-day${state.day}-${Date.now()}.webm`);
  if (fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, finalPath);
  }

  return {
    game: gameName,
    betPct: finalBet.pct,
    betLabel: finalBet.label,
    betAmount: finalBet.amount,
    videoPath: finalPath,
  };
}

module.exports = { recordWheelSpin };
