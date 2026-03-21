/**
 * hilo.js — Stake Hilo game
 * Set bet, start, guess Higher or Lower, cash out after 1-2 rounds
 */
async function play(page, betAmount) {
  console.log('[Hilo] Starting...');
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

  // Start
  let buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('play') || text.includes('start'))) {
        await btn.click();
        console.log('[Hilo] Started');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(3000);

  // Guess Higher (safer bet for content)
  try {
    const higherBtn = await page.$('button:has-text("Higher"), button:has-text("Hi"), button:has-text("Over")');
    if (higherBtn && await higherBtn.isVisible()) {
      await higherBtn.click();
      console.log('[Hilo] Guessed Higher');
    } else {
      // Try Lower
      const lowerBtn = await page.$('button:has-text("Lower"), button:has-text("Lo"), button:has-text("Under")');
      if (lowerBtn && await lowerBtn.isVisible()) {
        await lowerBtn.click();
        console.log('[Hilo] Guessed Lower');
      }
    }
  } catch (e) {}

  await page.waitForTimeout(3000);

  // Cash out
  buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && (text.includes('cashout') || text.includes('cash out') || text.includes('collect'))) {
        await btn.click();
        console.log('[Hilo] Cashed out');
        await page.waitForTimeout(2000);
        return { won: true, payout: betAmount * 0.5 };
      }
    } catch (e) { continue; }
  }

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Profit');
    return { won, payout: won ? betAmount * 0.5 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
