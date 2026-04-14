import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

const MARKER = `__e2e_test_${Date.now()}__`;

test.describe('Admin submissions', () => {
  let createdSubmissionPerformer: string | null = null;

  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
  });

  test('submissions page loads with heading', async ({ page }) => {
    await page.goto('/admin/submissions');
    await expect(page.getByRole('heading', { name: 'Community Submissions' })).toBeVisible();
  });

  test('shows empty state or submission list', async ({ page }) => {
    await page.goto('/admin/submissions');
    const emptyMsg = page.getByText('No pending submissions.');
    const submissionCards = page.locator('.space-y-3 > div');
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    const hasCards = await submissionCards.first().isVisible().catch(() => false);
    expect(hasEmpty || hasCards).toBe(true);
  });

  test('approve and reject controls render for pending submission', async ({ page, request }) => {
    // Create a submission via API
    const performer = `${MARKER}_performer`;
    createdSubmissionPerformer = performer;

    const res = await request.post('/api/submissions', {
      data: {
        performer,
        venue_name: 'E2E Test Venue',
        city: 'Halifax',
        province: 'NS',
        event_date: '2099-12-31',
        event_category: 'community',
      },
    });
    // Accept 200 or 429 (rate limited in CI) — if rate limited, skip controls check
    if (res.status() === 429) {
      test.skip();
      return;
    }
    expect(res.status()).toBe(200);

    await page.goto('/admin/submissions');

    // Find the row for our marker performer
    const row = page.locator('.space-y-3 > div').filter({ hasText: performer });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Approve button
    const approveBtn = row.getByRole('button', { name: 'Approve' });
    await expect(approveBtn).toBeVisible();

    // Reject button
    const rejectBtn = row.getByRole('button', { name: 'Reject' });
    await expect(rejectBtn).toBeVisible();
  });

  test('reject button removes submission from pending view', async ({ page, request }) => {
    const performer = `${MARKER}_reject_performer`;
    const res = await request.post('/api/submissions', {
      data: {
        performer,
        venue_name: 'E2E Reject Venue',
        city: 'Moncton',
        province: 'NB',
        event_date: '2099-11-30',
        event_category: 'community',
      },
    });
    if (res.status() === 429) {
      test.skip();
      return;
    }

    await page.goto('/admin/submissions');
    const row = page.locator('.space-y-3 > div').filter({ hasText: performer });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const rejectBtn = row.getByRole('button', { name: 'Reject' });
    await rejectBtn.click();

    // After rejection the submission status changes — it either disappears or shows 'rejected' badge
    // Reload and confirm it's no longer in the pending-only visible list (status badge changed)
    await page.goto('/admin/submissions');
    const rejectedRow = page.locator('.space-y-3 > div').filter({ hasText: performer });
    if (await rejectedRow.isVisible().catch(() => false)) {
      // If still visible, it should show 'rejected' status badge (no approve/reject buttons)
      await expect(rejectedRow.getByRole('button', { name: 'Reject' })).not.toBeVisible();
    }
    // Either hidden or showing rejected badge — both are acceptable outcomes
  });
});
