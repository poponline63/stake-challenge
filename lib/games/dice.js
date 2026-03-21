/**
 * dice.js — Stake Dice game automation
 * Dice: Set bet, set target (over/under), click Roll
 */

async function play(page, betAmount) {
  console.log('[Dice] Starting...');

  // Wait for game to load
  await page.waitForTimeout(3000);

  // Set bet amount — clear and type
  await setBetAmount(page, betAmount);
  await page.waitForTimeout(500);

  // Click the Roll / Bet button
  await clickBetButton(page);

  // Wait for result animation
  await page.waitForTimeout(4000);

  // Try to determine win/loss from the page
  const result = await getResult(page);

  return result;
}

async function setBetAmount(page, amount) {
  const betInputSelectors = [
    'input[name="betAmount"]',
    'input[data-testid="bet-amount"]',
    '[class*="bet"] input[type="text"]',
    '[class*="bet"] input[type="number"]',
    'input[placeholder*="0.00"]',
    // Stake typically uses an input in the bet controls area
    '.bet-input input',
    '.input-wrapper input',
  ];

  for (const sel of betInputSelectors) {
    try {
      const input = await page.$(sel);
      if (input && await input.isVisible()) {
        await input.click({ clickCount: 3 }); // Select all
        await page.waitForTimeout(200);
        await input.fill(amount.toFixed(2));
        console.log(`[Dice] Set bet amount to ${amount.toFixed(2)}`);
        return;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: find any visible input that looks like a bet field
  try {
    const inputs = await page.$$('input');
    for (const input of inputs) {
      const visible = await input.isVisible();
      if (!visible) continue;
      const val = await input.inputValue();
      const type = await input.getAttribute('type');
      if (type === 'text' || type === 'number' || type === null) {
        await input.click({ clickCount: 3 });
        await page.waitForTimeout(200);
        await input.fill(amount.toFixed(2));
        console.log(`[Dice] Set bet amount via fallback input`);
        return;
      }
    }
  } catch (e) {}

  console.log('[Dice] Warning: Could not find bet input, using default');
}

async function clickBetButton(page) {
  const betButtonSelectors = [
    'button:has-text("Roll")',
    'button:has-text("Bet")',
    'button:has-text("Play")',
    '[data-testid="bet-button"]',
    '[class*="bet-button"]',
    'button[class*="roll"]',
    // Stake's main CTA button
    'button.btn-primary',
    'button[class*="primary"]',
  ];

  for (const sel of betButtonSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible() && await btn.isEnabled()) {
        await btn.click();
        console.log(`[Dice] Clicked bet button: ${sel}`);
        return;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: find the most prominent button
  try {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await btn.textContent();
      const visible = await btn.isVisible();
      if (visible && (text.toLowerCase().includes('roll') || text.toLowerCase().includes('bet'))) {
        await btn.click();
        console.log(`[Dice] Clicked button with text: ${text.trim()}`);
        return;
      }
    }
  } catch (e) {}

  console.log('[Dice] Warning: Could not find bet button');
}

async function getResult(page) {
  // Try to determine win/loss
  // For fun mode, we'll check if balance changed or look for win/loss indicators
  try {
    // Look for win/loss text indicators
    const pageText = await page.textContent('body');

    // Check for common win indicators
    const hasWin = pageText.includes('You won') ||
                   pageText.includes('Profit') ||
                   pageText.includes('Win');

    // For dice, the result number is usually displayed
    // We'll simulate a random outcome for fun mode since detecting exact payout is tricky
    // In practice, the video shows the actual result
    return {
      won: hasWin,
      payout: hasWin ? 0.50 : 0, // Approximate — the video shows reality
    };
  } catch (e) {
    return { won: false, payout: 0 };
  }
}

module.exports = { play };
