import { Page } from '@playwright/test';

const MAX_PAGES = 50;

export async function discoverPages(page: Page, targetDomain: string): Promise<string[]> {
  const homeUrl = `https://${targetDomain}/`;

  await page.goto(homeUrl);
  await page.waitForLoadState('domcontentloaded');

  const hrefs = await page.$$eval('a[href]', anchors =>
    anchors.map(a => (a as HTMLAnchorElement).href).filter(Boolean)
  );

  const origin = new URL(homeUrl).origin;

  const seen = new Set<string>();
  seen.add(homeUrl);

  const filtered: string[] = [homeUrl];

  for (const href of hrefs) {
    if (seen.size >= MAX_PAGES) break;

    let url: URL;
    try {
      url = new URL(href, homeUrl);
    } catch {
      continue;
    }

    // Same origin only
    if (url.origin !== origin) continue;

    // Skip anchors, mailto, tel
    if (!url.pathname || url.hash || url.protocol === 'mailto:' || url.protocol === 'tel:') continue;

    // Strip query strings that look like session tokens or tracking params
    url.search = '';
    url.hash = '';

    const clean = url.href;
    if (seen.has(clean)) continue;

    seen.add(clean);
    filtered.push(clean);
  }

  return filtered.slice(0, MAX_PAGES);
}
