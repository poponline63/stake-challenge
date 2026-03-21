/**
 * crash.js — Stake Crash game
 * Set bet, click Bet, wait for auto-cashout or crash
 */
async function play(page, betAmount) {
  console.log('[Crash] Starting...');
  await page.waitForTimeout(3000);

  // Set bet amount
  await setBet(page, betAmount);
  await page.waitForTimeout(500);

  // Set auto cashout to 2x for safety
  try {
    const cashoutInput = await page.$('input[name="autoCashout"], input[placeholder*="cashout"], input[placeholder*="Auto"]');
    if (cashoutInput && await cashoutInput.isVisible()) {
      await cashoutInput.click({ clickCount: 3 });
      await cashoutInput.fill('2.00');
      console.log('[Crash] Set auto cashout to 2x');
    }
  } catch (e) {}

  // Click Bet button — may need to wait for next round
  await page.waitForTimeout(1000);
  await clickBet(page);

  // Wait for the crash round to play out (can take 5-30 seconds)
  await page.waitForTimeout(15000);

  return await getResult(page);
}

async function setBet(page, amount) {
  const inputs = await page.$$('input');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      const placeholder = await input.getAttribute('placeholder');
      const name = await input.getAttribute('name');
      if ((placeholder && placeholder.includes('0.00')) || (name && name.toLowerCase().includes('bet'))) {
        await input.click({ clickCount: 3 });
        await input.fill(amount.toFixed(2));
        console.log(`[Crash] Set bet to ${amount.toFixed(2)}`);
        return;
      }
    } catch (e) { continue; }
  }
  // Fallback to first text input
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      await input.click({ clickCount: 3 });
      await input.fill(amount.toFixed(2));
      return;
    } catch (e) { continue; }
  }
}

async function clickBet(page) {
  const keywords = ['bet', 'place', 'join'];
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && keywords.some(k => text.includes(k))) {
        await btn.click();
        console.log(`[Crash] Clicked: ${text.trim()}`);
        return;
      }
    } catch (e) { continue; }
  }
}

async function getResult(page) {
  try {
    const text = await page.textContent('body');
    const won = text.includes('cashed out') || text.includes('Profit') || text.includes('Won');
    return { won, payout: won ? 0.50 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
