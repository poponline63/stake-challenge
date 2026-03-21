/**
 * roulette.js — Stake Roulette
 * Set bet, place on Red (simple for content), spin
 */
async function play(page, betAmount) {
  console.log('[Roulette] Starting...');
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

  // Try to click Red bet
  try {
    const redBtn = await page.$('button:has-text("Red"), [data-testid*="red"], [class*="red"]');
    if (redBtn && await redBtn.isVisible()) {
      await redBtn.click();
      console.log('[Roulette] Placed bet on Red');
    }
  } catch (e) {}

  await page.waitForTimeout(500);

  // Click Bet/Spin
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('spin') || text.includes('play'))) {
        await btn.click();
        console.log('[Roulette] Spinning');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(8000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Profit') || text.includes('Win');
    return { won, payout: won ? betAmount : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
