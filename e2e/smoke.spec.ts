import { expect, test, waitForDashboard } from './fixtures';

test('serves only the demo archive', async ({ request }) => {
  const response = await request.get('/api/health');
  const health = await response.json();

  // Every other test assumes this. If it fails, stop and find out what is being served.
  expect(health).toMatchObject({ ok: true, demo: true, mediaAccessible: true });
  expect(health.dbPath).toContain('wacrawl-demo-');
  expect(health.dbPath).not.toContain('.wacrawl');

  const sync = await (await request.get('/api/sync/status')).json();
  expect(sync.enabled).toBe(false);
});

const DASHBOARD_CARDS = [
  'Message Volume', 'Top Contacts', 'Activity Heatmap', 'Weekly Rhythm', 'Drifted Away', 'Buried, Not Dead',
  'How Fast Replies Happen', 'Emoji Analytics', 'Hour of Day', 'Day of Week', 'Media Breakdown', 'Media Senders',
  'Response Times', 'Group Activity', 'Streaks', 'Word Cloud', 'Distinctive Words', 'Group Graveyard',
  'Who Starts Conversations', 'Conversation Depth', 'Ghost Score', 'Late-Night Texters', 'Relationship Trajectory',
];

test('dashboard renders every card with the demo badge and no failed requests', async ({ page }) => {
  await page.goto('/');
  await waitForDashboard(page);

  await expect(page.getByText('Demo data')).toBeVisible();

  const main = page.getByRole('main');
  await expect(main.locator('section').first().getByText(/^\d{2},\d{3}$/)).toBeVisible();
  for (const card of DASHBOARD_CARDS) {
    await expect(main.getByText(card, { exact: true }), card).toBeVisible();
  }
  expect(await main.locator('.recharts-surface').count()).toBeGreaterThan(5);

  // A card with nothing to show says so. This archive exists so that none has to.
  const emptyStates = await main.locator('*').evaluateAll((elements) => elements
    .filter((element) => element.children.length === 0)
    .map((element) => element.textContent?.trim() ?? '')
    .filter((text) => /^(no|not enough|nothing|none)\b/i.test(text)));
  expect(emptyStates).toEqual([]);
});

test('every period refetches the charts and leaves nothing broken', async ({ page }) => {
  await page.goto('/');
  await waitForDashboard(page);

  for (const [label, period] of [['Day', 'day'], ['Week', 'week'], ['Month', 'month'], ['All', 'all']]) {
    const refetch = page.waitForResponse((response) =>
      response.url().includes('/api/stats/top-contacts') && response.url().includes(`period=${period}`));
    const button = page.getByLabel('Dashboard period').getByRole('button', { name: label });
    await button.click();

    const response = await refetch;
    expect(response.status()).toBe(200);
    expect((await response.json()).length, `top contacts for ${period}`).toBeGreaterThan(0);
    await expect(button).toHaveClass(/bg-brand-500/);
    await page.waitForLoadState('networkidle');
  }
});

test('search finds a message and opens it in its chat', async ({ page }) => {
  await page.goto('/search');
  await page.getByPlaceholder('Search messages...').fill('lighthouse');

  const hit = page.getByRole('article').filter({ hasText: 'The lighthouse trip is booked' });
  await expect(hit).toBeVisible();
  await expect(hit.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  await hit.click();

  await expect(page).toHaveURL(/\/chats\?contact=.+&msg=\d+/);
  const pane = page.getByRole('main');
  await expect(pane.getByRole('heading', { name: 'Ada Lovelace', level: 3 }).last()).toBeVisible();
  const opened = pane.getByRole('article').filter({ hasText: 'The lighthouse trip is booked' });
  await expect(opened).toBeVisible();
  await expect(opened).toHaveClass(/ring-amber/);
});

test('a contact profile opens from the people list', async ({ page }) => {
  await page.goto('/people');
  await page.getByRole('link', { name: /Ada Lovelace/ }).first().click();

  await expect(page).toHaveURL(/\/contacts\//);
  await expect(page.getByRole('heading', { name: 'Ada Lovelace', level: 1 })).toBeVisible();
  for (const section of ['Balance', 'Turnaround', 'Volume by Month', 'When You Talk', 'What You Talk About']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
  await page.waitForLoadState('networkidle');
});

test('a group profile opens from the groups list', async ({ page }) => {
  await page.goto('/groups');
  await page.getByRole('link', { name: /Neighbourhood Watch/ }).first().click();

  await expect(page).toHaveURL(/\/groups\/.+/);
  await expect(page.getByRole('heading', { name: 'Neighbourhood Watch', level: 1 })).toBeVisible();
  for (const section of ['Who Carries It', 'The Room', 'Concentration', 'Volume by Month', 'What It Talks About']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
  // The roster has lurkers, and the archive's owner must not be mistaken for one.
  await expect(page.getByText('Never Posted', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Charles Babbage')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
});

test('year in review shows the year and compares it with the last', async ({ page }) => {
  await page.goto('/years');

  const year = new Date().getUTCFullYear();
  await expect(page.getByRole('heading', { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText('Month by Month')).toBeVisible();
  await expect(page.getByText(`Words and Emoji of ${year}`)).toBeVisible();

  await page.getByRole('button', { name: String(year - 1), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/years/${year - 1}$`));
  await expect(page.getByRole('heading', { name: `${year - 1} in review` })).toBeVisible();
  await page.waitForLoadState('networkidle');
});

test('the media grid loads real files', async ({ page }) => {
  await page.goto('/media');

  const firstImage = page.getByRole('main').locator('img').first();
  await expect(firstImage).toBeVisible();
  await expect.poll(() => firstImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
});
