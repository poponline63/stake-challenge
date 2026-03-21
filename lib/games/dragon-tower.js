/**
 * dragon-tower.js — Stake Dragon Tower
 * Set bet, start game, click a few tiles, cash out
 */
async function play(page, betAmount) {
  console.log('[Dragon Tower] Starting...');
  await page.waitForTimeout(3000);

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

  // Start game
  let buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('play') || text.includes('start'))) {
        await btn.click();
        console.log('[Dragon Tower] Game started');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(2000);

  // Click 2-3 tiles/eggs
  const tiles = await page.$$('[class*="tower"] button, [class*="egg"], [class*="tile"], [class*="grid"] button');
  const clicks = Math.min(2, tiles.length);
  for (let i = 0; i < clicks; i++) {
    try {
      const idx = Math.floor(Math.random() * Math.min(4, tiles.length));
      await tiles[idx].click();
      console.log(`[Dragon Tower] Clicked tile ${i + 1}`);
      await page.waitForTimeout(2000);

      const text = await page.textContent('body');
      if (text.includes('Game Over') || text.includes('bust') || text.includes('Lost')) {
        return { won: false, payout: 0 };
      }
    } catch (e) { break; }
  }

  // Cash out
  await page.waitForTimeout(1000);
  buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && (text.includes('cashout') || text.includes('cash out') || text.includes('collect'))) {
        await btn.click();
        console.log('[Dragon Tower] Cashed out');
        await page.waitForTimeout(2000);
        return { won: true, payout: betAmount * 0.5 };
      }
    } catch (e) { continue; }
  }

  return { won: false, payout: 0 };
}

module.exports = { play };
