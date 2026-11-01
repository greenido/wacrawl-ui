import { expect, test, waitForDashboard } from './fixtures';

/**
 * The README's screenshots. Regenerate with `npm run docs:screenshots`.
 *
 * Running against the demo archive is the whole point: this repo has had real
 * personal data in its history before, and a screenshot is an easy way back in.
 */
test.beforeEach(async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health.demo, 'refusing to take screenshots of anything but the demo archive').toBe(true);
});

test('dashboard', async ({ page }) => {
  await page.goto('/');
  await waitForDashboard(page);
  await page.waitForTimeout(1500); // Chart entry animations.
  await page.screenshot({ path: 'docs/dashboard.png' });
});

test('group profile', async ({ page }) => {
  await page.goto('/groups');
  await page.getByRole('link', { name: /Neighbourhood Watch/ }).first().click();
  await expect(page.getByText('Who Carries It')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/group-profile.png' });
});

test('year in review', async ({ page }) => {
  await page.goto('/years');
  await expect(page.getByText('Month by Month')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/year-in-review.png' });
});
