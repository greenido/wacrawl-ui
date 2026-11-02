import { test as base, expect } from '@playwright/test';

export { expect };

/** Skip the first-visit welcome modal, which covers the page it is greeting you on. */
const skipWelcome = () => window.localStorage.setItem('wacrawl:welcome-seen', 'true');

interface Fixtures {
  /** What went wrong in the browser during a test. Checked after every test. */
  problems: string[];
}

export const test = base.extend<Fixtures>({
  problems: [async ({ page }, use) => {
    const problems: string[] = [];

    page.on('response', (response) => {
      if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', (request) => {
      // Aborted means the browser lost interest (a <video> probing metadata, a
      // navigation under an open fetch), not that the server let it down.
      const failure = request.failure()?.errorText ?? 'failed';
      if (failure !== 'net::ERR_ABORTED') problems.push(`${failure} ${request.url()}`);
    });
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });

    await page.addInitScript(skipWelcome);
    await use(problems);

    expect(problems, 'failed requests or browser errors').toEqual([]);
  }, { auto: true }],
});

/** Everything the dashboard asked the API for has come back, charts included. */
export async function waitForDashboard(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  // The last card to appear: the loaders are gone once it has.
  await expect(page.getByText('Relationship Trajectory', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
}
