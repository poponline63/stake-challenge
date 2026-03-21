/**
 * generic.js — Fallback game handler for any Stake game
 * Tries to find bet input, set amount, and click play
 */

async function play(page, betAmount) {
  console.log('[Generic] Starting game automation...');

  await page.waitForTimeout(3000);

  // Set bet amount
  await setBetAmount(page, betAmount);
  await page.waitForTimeout(500);

  // Click the main action button
  await clickMainButton(page);

  // Wait for result
  await page.waitForTimeout(5000);

  // Get result
  const result = await getResult(page);
  return result;
}

async function setBetAmount(page, amount) {
  // Try common bet input selectors
  const selectors = [
    'input[name="betAmount"]',
    'input[data-testid="bet-amount"]',
    '[class*="bet"] input[type="text"]',
    '[class*="bet"] input[type="number"]',
    'input[placeholder*="0.00"]',
    '.bet-input input',
    '.input-wrapper input',
  ];

  for (const sel of selectors) {
    try {
      const input = await page.$(sel);
      if (input && await input.isVisible()) {
        await input.click({ clickCount: 3 });
        await page.waitForTimeout(200);
        await input.fill(amount.toFixed(2));
        console.log(`[Generic] Set bet to ${amount.toFixed(2)} via ${sel}`);
        return;
      }
    } catch (e) { continue; }
  }

  // Broad fallback
  try {
    const inputs = await page.$$('input');
    for (const input of inputs) {
      if (!(await input.isVisible())) continue;
      const type = await input.getAttribute('type');
      if (type === 'text' || type === 'number' || type === null) {
        await input.click({ clickCount: 3 });
        await input.fill(amount.toFixed(2));
        console.log('[Generic] Set bet via fallback');
        return;
      }
    }
  } catch (e) {}
  console.log('[Generic] Warning: Could not set bet amount');
}

async function clickMainButton(page) {
  const keywords = ['bet', 'play', 'roll', 'spin', 'deal', 'start', 'go', 'draw', 'flip'];

  // First try specific selectors
  for (const kw of keywords) {
    try {
      const btn = await page.$(`button:has-text("${kw}")`);
      if (btn && await btn.isVisible() && await btn.isEnabled()) {
        await btn.click();
        console.log(`[Generic] Clicked: ${kw}`);
        return;
      }
    } catch (e) { continue; }
  }

  // Fallback: find any green/primary large button
  try {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = (await btn.textContent()).toLowerCase();
      const visible = await btn.isVisible();
      const enabled = await btn.isEnabled();
      if (visible && enabled && keywords.some(kw => text.includes(kw))) {
        await btn.click();
        console.log(`[Generic] Fallback clicked: ${text.trim()}`);
        return;
      }
    }
  } catch (e) {}
  console.log('[Generic] Warning: Could not find main button');
}

async function getResult(page) {
  try {
    const text = await page.textContent('body');
    const won = text.includes('You won') || text.includes('Profit') || text.includes('Win');
    return { won, payout: won ? 0.50 : 0 };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
