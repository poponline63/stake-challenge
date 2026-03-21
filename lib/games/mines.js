/**
 * mines.js — Stake Mines game
 * Set bet, click Bet, click a few tiles, then cash out
 */
async function play(page, betAmount) {
  console.log('[Mines] Starting...');
  await page.waitForTimeout(3000);

  // Set bet amount
  const inputs = await page.$$('input');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      if ((name && name.toLowerCase().includes('bet')) || (placeholder && placeholder.includes('0.00'))) {
        await input.click({ clickCount: 3 });
        await input.fill(betAmount.toFixed(2));
        console.log(`[Mines] Set bet to ${betAmount.toFixed(2)}`);
        break;
      }
    } catch (e) { continue; }
  }
  await page.waitForTimeout(500);

  // Click Bet button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('play'))) {
        await btn.click();
        console.log(`[Mines] Started game`);
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(2000);

  // Click 3 random tiles from the grid
  // Mines grid is typically a 5x5 grid of clickable elements
  try {
    const tiles = await page.$$('[class*="mine"] button, [class*="grid"] button, [class*="tile"], [data-testid*="tile"]');
    const clickCount = Math.min(3, tiles.length);
    const indices = [];
    while (indices.length < clickCount) {
      const idx = Math.floor(Math.random() * tiles.length);
      if (!indices.includes(idx)) indices.push(idx);
    }

    for (const idx of indices) {
      try {
        await tiles[idx].click();
        console.log(`[Mines] Clicked tile ${idx}`);
        await page.waitForTimeout(1500);

        // Check if we hit a mine (game over)
        const bodyText = await page.textContent('body');
        if (bodyText.includes('Game Over') || bodyText.includes('mine') || bodyText.includes('bust')) {
          return { won: false, payout: 0 };
        }
      } catch (e) { break; }
    }

    // Try to cash out
    await page.waitForTimeout(1000);
    const cashoutBtns = await page.$$('button');
    for (const btn of cashoutBtns) {
      try {
        const text = (await btn.textContent()).toLowerCase();
        if (await btn.isVisible() && (text.includes('cashout') || text.includes('cash out') || text.includes('collect'))) {
          await btn.click();
          console.log('[Mines] Cashed out!');
          await page.waitForTimeout(2000);
          return { won: true, payout: betAmount * 0.5 };
        }
      } catch (e) { continue; }
    }

  } catch (e) {
    console.log('[Mines] Grid interaction error:', e.message);
  }

  return { won: false, payout: 0 };
}

module.exports = { play };
