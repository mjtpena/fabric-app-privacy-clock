import { test, type Locator } from '@playwright/test';

import type { DemoHelpers } from '@x10/shared/demo';
import { watchConsole } from '@x10/shared/e2e';

import { script } from '../demo/walkthrough';

// Dry run of the narrated walkthrough at the recorder's size with instant helpers, so every locator is proven to
// resolve. A persona change reloads with ?as=; otherwise only the hash changes (as the recorder does).
test.use({ viewport: { width: 1920, height: 1080 } });

test('walkthrough scenes run against the demo app', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The recorder runs at desktop size.');
  test.setTimeout(120_000);
  const c = watchConsole(page);
  const loc = (t: Locator | string) => (typeof t === 'string' ? page.locator(t) : t);
  let current = script.persona ?? '';
  let opened = false;
  const h: DemoHelpers = {
    page,
    async goto(path, persona) {
      const who = persona ?? current;
      if (!opened || who !== current) {
        await page.goto(`/?as=${encodeURIComponent(who)}#${path}`);
        opened = true;
        current = who;
      } else {
        await page.evaluate((p) => {
          window.location.hash = p;
        }, path);
      }
      await page.getByTestId('demo-banner').waitFor();
    },
    click: (t) => loc(t).click({ timeout: 5000 }),
    async type(t, text) {
      await loc(t).click({ timeout: 5000 });
      await loc(t).pressSequentially(text, { timeout: 10000 });
    },
    fill: (t, text) => loc(t).fill(text, { timeout: 5000 }),
    async select(t, label) {
      await loc(t).selectOption({ label }, { timeout: 5000 });
    },
    hover: (t) => loc(t).hover({ timeout: 5000 }),
    scrollTo: (t) => loc(t).scrollIntoViewIfNeeded({ timeout: 5000 }),
    async spotlight(t) {
      await loc(t).waitFor({ state: 'visible', timeout: 5000 });
    },
    pause: (ms) => page.waitForTimeout(Math.min(ms, 300)),
  };
  for (const scene of script.scenes) {
    await test.step(scene.id, () => scene.run(h));
  }
  const lines = script.scenes.flatMap((s) => s.say);
  if (lines.length < 14 || lines.length > 19) throw new Error(`The walkthrough has ${lines.length} lines; aim for 14 to 19.`);
  c.assertClean();
});
