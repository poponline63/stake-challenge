/**
 * keno.js — Stake Keno
 * Set bet, select some numbers, click Bet
 */
async function play(page, betAmount) {
  console.log('[Keno] Starting...');
  await page.waitForTimeout(3000);

  // Set bet
  const inputs = await page.$$('input');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      await input.click({ clickCount: 3 });
      await input.fill(betAmount.toFixed(2));
      break;
    } catch (e) { continue; }
  }
  await page.waitForTimeout(500);

  // Try auto-pick or click random numbers on the grid
  try {
    const autoBtn = await page.$('button:has-text("Auto"), button:has-text("Random"), button:has-text("Pick")');
    if (autoBtn && await autoBtn.isVisible()) {
      await autoBtn.click();
      console.log('[Keno] Auto-picked numbers');
    } else {
      // Click a few grid tiles
      const tiles = await page.$$('[class*="keno"] button, [class*="grid"] button, [class*="tile"]');
      const count = Math.min(5, tiles.length);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * tiles.length);
        try { await tiles[idx].click(); } catch (e) {}
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {}

  await page.waitForTimeout(500);

  // Click Bet
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('play'))) {
        await btn.click();
        console.log('[Keno] Bet placed');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(5000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Profit') || text.includes('Win');
    return { won, payout: won ? betAmount : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
