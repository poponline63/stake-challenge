/**
 * slots.js — Stake Slots
 * Navigate to a slot, set bet, spin
 */
async function play(page, betAmount) {
  console.log('[Slots] Starting...');
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

  // Click Spin
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('spin') || text.includes('bet') || text.includes('play'))) {
        await btn.click();
        console.log('[Slots] Spinning');
        break;
      }
    } catch (e) { continue; }
  }

  await page.waitForTimeout(6000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Win') || text.includes('Profit');
    return { won, payout: won ? betAmount * 2 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
