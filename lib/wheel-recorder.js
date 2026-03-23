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
    args: ['--disable-blink-features=AutomationControlled', '--disable-web-security', '--allow-file-access-from-files', '--start-fullscreen'],
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

  // Navigate to the wheel page in recording mode (hides all tracker UI)
  const fileUrl = `file:///${WHEEL_PAGE.replace(/\\/g, '/')}?record`;
  console.log(`Loading wheel page (record mode): ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });

  // Wait for the page to render (Tailwind loads from CDN)
  await page.waitForTimeout(4000);

  // Record mode CSS handles hiding — just make sure body has the class
  await page.evaluate(() => document.body.classList.add('record-mode'));
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
