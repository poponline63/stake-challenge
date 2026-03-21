/**
 * blackjack.js — Stake Blackjack game
 * Set bet, click Deal, then Stand (simple strategy for recording)
 */
async function play(page, betAmount) {
  console.log('[Blackjack] Starting...');
  await page.waitForTimeout(3000);

  // Set bet
  const inputs = await page.$$('input');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      await input.click({ clickCount: 3 });
      await input.fill(betAmount.toFixed(2));
      console.log(`[Blackjack] Set bet to ${betAmount.toFixed(2)}`);
      break;
    } catch (e) { continue; }
  }
  await page.waitForTimeout(500);

  // Click Deal/Bet
  let dealt = false;
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const text = (await btn.textContent()).toLowerCase();
      if (await btn.isVisible() && await btn.isEnabled() && (text.includes('deal') || text.includes('bet') || text.includes('play'))) {
        await btn.click();
        console.log(`[Blackjack] Dealt`);
        dealt = true;
        break;
      }
    } catch (e) { continue; }
  }

  if (!dealt) {
    return { won: false, payout: 0 };
  }

  await page.waitForTimeout(3000);

  // Simple strategy: Hit if hand < 17, else Stand
  // For simplicity and good video content, just hit once then stand
  try {
    const hitBtn = await page.$('button:has-text("Hit")');
    if (hitBtn && await hitBtn.isVisible() && await hitBtn.isEnabled()) {
      await hitBtn.click();
      console.log('[Blackjack] Hit');
      await page.waitForTimeout(2000);
    }
  } catch (e) {}

  // Stand
  try {
    const standBtn = await page.$('button:has-text("Stand")');
    if (standBtn && await standBtn.isVisible() && await standBtn.isEnabled()) {
      await standBtn.click();
      console.log('[Blackjack] Stand');
    }
  } catch (e) {}

  await page.waitForTimeout(5000);

  try {
    const text = await page.textContent('body');
    const won = text.includes('Won') || text.includes('Blackjack') || text.includes('Win');
    const lost = text.includes('Bust') || text.includes('Lost') || text.includes('Lose');
    return { won: won && !lost, payout: won ? betAmount : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
