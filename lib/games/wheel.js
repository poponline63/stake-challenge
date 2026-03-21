/**
 * wheel.js — Stake's Wheel game
 * Set bet, click Spin
 */
async function play(page, betAmount) {
  console.log('[Wheel] Starting...');
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

  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('spin') || text.includes('play'))) {
        await btn.click();
        console.log('[Wheel] Spinning');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(7000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Profit') || text.includes('Win');
    return { won, payout: won ? betAmount * 2 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
