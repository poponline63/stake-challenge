/**
 * plinko.js — Stake Plinko game
 * Set bet, click Drop/Bet, watch ball drop
 */
async function play(page, betAmount) {
  console.log('[Plinko] Starting...');
  await page.waitForTimeout(3000);

  // Set bet
  const inputs = await page.$$('input');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      await input.click({ clickCount: 3 });
      await input.fill(betAmount.toFixed(2));
      console.log(`[Plinko] Set bet to ${betAmount.toFixed(2)}`);
      break;
    } catch (e) { continue; }
  }
  await page.waitForTimeout(500);

  // Click Bet/Drop button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('bet') || text.includes('drop') || text.includes('play'))) {
        await btn.click();
        console.log(`[Plinko] Dropped ball`);
        break;
      }
    } catch (e) { continue; }
  }

  // Wait for ball to drop
  await page.waitForTimeout(6000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Profit') || text.includes('Win');
    return { won, payout: won ? betAmount * 0.5 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
