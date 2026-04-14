import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin settings', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/settings');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('AI Provider section heading is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI Provider' })).toBeVisible();
  });

  test('AI provider description text is present', async ({ page }) => {
    await expect(page.getByText(/Choose which AI model extracts events/)).toBeVisible();
  });

  test('Gemini radio option renders', async ({ page }) => {
    await expect(page.getByText('Gemini 2.5 Flash')).toBeVisible();
    await expect(page.getByText('Google — fast and cost-effective')).toBeVisible();
  });

  test('Claude radio option renders', async ({ page }) => {
    await expect(page.getByText(/Claude Sonnet/)).toBeVisible();
    await expect(page.getByText('Anthropic — high accuracy')).toBeVisible();
  });

  test('radio inputs exist for both providers', async ({ page }) => {
    const geminiRadio = page.locator('input[type="radio"][value="gemini"]');
    const claudeRadio = page.locator('input[type="radio"][value="claude"]');
    await expect(geminiRadio).toBeVisible();
    await expect(claudeRadio).toBeVisible();
  });

  test('change provider → saved feedback → reload → persisted', async ({ page }) => {
    const geminiRadio = page.locator('input[type="radio"][value="gemini"]');
    const claudeRadio = page.locator('input[type="radio"][value="claude"]');

    // Determine current selection
    const geminiChecked = await geminiRadio.isChecked();
    const originalProvider = geminiChecked ? 'gemini' : 'claude';
    const altProvider = originalProvider === 'gemini' ? 'claude' : 'gemini';
    const altRadio = altProvider === 'gemini' ? geminiRadio : claudeRadio;
    const originalRadio = originalProvider === 'gemini' ? geminiRadio : claudeRadio;

    // Switch to the other provider
    await altRadio.click();

    // Wait for the "Saved" feedback to appear
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    // Reload and confirm the new selection persisted
    await page.reload();
    await expect(altRadio).toBeChecked();

    // Revert to original provider
    await originalRadio.click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    // Confirm reverted
    await page.reload();
    await expect(originalRadio).toBeChecked();
  });
});
