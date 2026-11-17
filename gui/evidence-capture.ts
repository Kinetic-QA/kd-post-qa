// One annotated screenshot per Documentation bullet, per platform (Standing
// Rules #12 / #13): the bullet's own page is opened on the QA or live site, the
// element the bullet is about gets a green (pass) or red (fail) box drawn on
// the live page itself, and the viewport is captured with the caption bar the
// annotator adds underneath. Because each image is made for one bullet, it
// always goes under that bullet — no guessing from a count.
//
// Deliberately a bare headless Chromium like screenshot-capture.ts (no stealth
// mode): a site that blocks it simply yields no image for that bullet, with a
// warning — never a made-up one. An element that cannot be found yields a plain
// viewport shot WITHOUT a box, also with a warning; the box is never guessed.
import { chromium, devices, Page } from '@playwright/test';
import { annotateEvidence } from '../src/evidence-annotate';
import type { EvidenceTarget } from '../src/ticket-interpreter';
import { dismissCookieConsent, dismissCampaignPopup } from '../helpers/common';

export interface BulletImage {
  platform: 'Desktop' | 'Mobile';
  filename: string;
  buffer: Buffer;
  // False when no element was found: the image has no box.
  located: boolean;
}

export interface BulletEvidence {
  text: string;
  images: BulletImage[];
}

// Box colours from Standing Rules #13 (green ~ (0,200,0), red ~ (220,30,30)).
const BOX_COLOUR = { pass: '#00c800', fail: '#dc1e1e' } as const;
const LOCATE_TIMEOUT_MS = 4_000;
const FALLBACK_TIMEOUT_MS = 1_500;
const DEFAULT_MOBILE = { width: 390, height: 844 };

// A phone size the ticket itself states, e.g. "on mobile (430×932)". The
// ticket wins over the default; a size outside phone range is ignored.
export function statedMobileViewport(items: string[]): { width: number; height: number } | undefined {
  for (const text of items) {
    const m = text.match(/\b(\d{3,4})\s*(?:x|×)\s*(\d{3,4})\b/i);
    if (!m) continue;
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (width >= 320 && width <= 600 && height >= 480 && height <= 1400) return { width, height };
  }
  return undefined;
}

const DEFAULT_DESKTOP = { width: 1440, height: 900 };

// A desktop size the ticket states: "(1920×1080)", or just "(1920px wide)" —
// then the height stays at the default. An element size such as "1905×472" is
// not a viewport, so a height under 600 rules it out.
export function statedDesktopViewport(items: string[]): { width: number; height: number } | undefined {
  for (const text of items) {
    const both = text.match(/\b(\d{4})\s*(?:x|×)\s*(\d{3,4})\b/i);
    if (both) {
      const width = Number(both[1]);
      const height = Number(both[2]);
      if (width >= 1000 && width <= 3840 && height >= 600 && height <= 2200) return { width, height };
    }
    const wide = text.match(/\b(\d{4})\s*px\s*wide\b/i);
    if (wide && Number(wide[1]) >= 1000 && Number(wide[1]) <= 3840) return { width: Number(wide[1]), height: DEFAULT_DESKTOP.height };
  }
  return undefined;
}

function setupFor(platform: 'Desktop' | 'Mobile', size: { width: number; height: number }) {
  if (platform === 'Desktop') return { viewport: size };
  // 1x so the caption's measured width is the phone's real width, not a doubled figure.
  return { ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: size };
}

// '' and 'promotions/' both resolve against the site root the check ran on, so
// a locale prefix in the base URL (e.g. /en-ca/) is kept.
export function resolveEvidenceUrl(baseUrl: string, relative: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = relative.replace(/^https?:\/\/[^/]+\/?/i, '').replace(/^\/+/, '');
  return new URL(path, base).toString();
}

// Words in an element's description that say nothing about which element it is.
const GENERIC_WORDS = new Set([
  'the', 'and', 'for', 'region', 'section', 'link', 'button', 'icon', 'icons', 'image', 'images',
  'logo', 'logos', 'page', 'homepage', 'home', 'main', 'area', 'element', 'text', 'item', 'items',
]);

// The AI names an element by its role and accessible name, but sites rarely
// expose that (a banner is usually a plain div, not role=region name="banner").
// So after the exact lookup comes the same kind of match the regression specs
// use: a visible element whose class, id or aria-label contains a key word of
// the description. Only ever tried when the exact lookup found nothing.
export function fallbackKeywords(locate: EvidenceTarget['locate']): string[] {
  const words = `${locate?.name ?? ''} ${locate?.text ?? ''}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return [...new Set(words.filter(w => !GENERIC_WORDS.has(w)))].slice(0, 3);
}

function locatorsFor(page: Page, locate: EvidenceTarget['locate']) {
  if (!locate) return [];
  const out: { loc: ReturnType<Page['locator']>; timeout: number }[] = [];
  if (locate.role && locate.name) {
    out.push({ loc: page.getByRole(locate.role as Parameters<Page['getByRole']>[0], { name: locate.name }).first(), timeout: LOCATE_TIMEOUT_MS });
  } else if (locate.text || locate.name) {
    out.push({ loc: page.getByText(locate.text ?? locate.name ?? '', { exact: false }).first(), timeout: LOCATE_TIMEOUT_MS });
  }
  for (const w of fallbackKeywords(locate)) {
    out.push({
      loc: page.locator(`[class*="${w}" i]:visible, [id*="${w}" i]:visible, [aria-label*="${w}" i]:visible`).first(),
      timeout: FALLBACK_TIMEOUT_MS,
    });
  }
  return out;
}

// Draws the box on the page, takes the viewport shot, removes the box. Returns
// whether an element was boxed.
async function shootBullet(page: Page, locate: EvidenceTarget['locate'], colour: string): Promise<{ png: Buffer; located: boolean }> {
  let located = false;
  for (const { loc, timeout } of locatorsFor(page, locate)) {
    if (located) break;
    try {
      await loc.waitFor({ state: 'visible', timeout });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400); // sticky headers and lazy content settle
      const box = await loc.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await page.evaluate(({ b, c }) => {
          const margin = 4;
          const left = Math.max(margin, b.x - margin);
          const top = Math.max(margin, b.y - margin);
          const right = Math.min(window.innerWidth - margin, b.x + b.width + margin);
          const bottom = Math.min(window.innerHeight - margin, b.y + b.height + margin);
          const el = document.createElement('div');
          el.setAttribute('data-qa-evidence-box', '');
          Object.assign(el.style, {
            position: 'fixed', left: `${left}px`, top: `${top}px`,
            width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px`,
            border: `5px solid ${c}`, borderRadius: '4px', boxSizing: 'border-box',
            zIndex: '2147483647', pointerEvents: 'none',
          });
          document.body.appendChild(el);
        }, { b: box, c: colour });
        located = true;
      }
    } catch {
      located = false;
    }
  }
  if (!located) {
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(300);
  }
  const png = await page.screenshot({ type: 'png' });
  await page.evaluate(() => document.querySelectorAll('[data-qa-evidence-box]').forEach(e => e.remove())).catch(() => {});
  return { png, located };
}

// An empty page means the homepage, which is right for a homepage or site-wide
// item (footer, header). It is NOT right when the ticket's scope names some
// other page and the AI still left the page empty, so that case is flagged.
const HOME_OR_SITE_WIDE = /home|footer|header|menu|navigation|site-?wide|all pages|every page|whole site/i;

export function homepageAssumed(scopePages: string[] | undefined): boolean {
  return !!scopePages?.length && !scopePages.some(s => HOME_OR_SITE_WIDE.test(s));
}

export async function captureBulletEvidence(opts: {
  baseUrl: string;
  items: string[];
  plan: (EvidenceTarget | null)[];
  verdict: 'pass' | 'fail';
  geo?: string;
  date: string;
  scopePages?: string[];
}): Promise<{ bullets: BulletEvidence[]; warnings: string[] }> {
  const { baseUrl, items, plan, verdict, geo, date, scopePages } = opts;
  const warnings: string[] = [];
  if (homepageAssumed(scopePages) && plan.some(t => t && t.page === '')) {
    warnings.push(`The ticket's scope is ${scopePages!.join(', ')}, but no page address was given for some screenshots, so the homepage was photographed — check those images show the right page.`);
  }
  const bullets: BulletEvidence[] = items.map(text => ({ text, images: [] }));
  const wanted = (t: EvidenceTarget | null | undefined, p: 'Desktop' | 'Mobile') =>
    !!t && (t.platforms === 'both' || t.platforms === p.toLowerCase());

  const needed = (['Desktop', 'Mobile'] as const).filter(p => items.some((_, i) => wanted(plan[i], p)));
  items.forEach((text, i) => {
    if (!plan[i]) warnings.push(`No screenshot was planned for "${text}" — that bullet has no evidence image.`);
  });
  if (needed.length === 0) return { bullets, warnings };

  const sizes = {
    Desktop: statedDesktopViewport(items.filter((_, i) => wanted(plan[i], 'Desktop'))) ?? DEFAULT_DESKTOP,
    Mobile: statedMobileViewport(items.filter((_, i) => wanted(plan[i], 'Mobile'))) ?? DEFAULT_MOBILE,
  };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const platform of needed) {
      const context = await browser.newContext(setupFor(platform, sizes[platform]));
      try {
        // One page load per distinct page, however many bullets use it.
        const byPage = new Map<string, number[]>();
        items.forEach((_, i) => {
          const t = plan[i];
          if (wanted(t, platform) && t) byPage.set(t.page, [...(byPage.get(t.page) ?? []), i]);
        });

        for (const [relative, indexes] of byPage) {
          const url = resolveEvidenceUrl(baseUrl, relative);
          const page = await context.newPage();
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await page.waitForTimeout(1_500);
            await dismissCookieConsent(page).catch(() => {});
            await dismissCampaignPopup(page).catch(() => {});
          } catch (e) {
            warnings.push(`${platform}: could not open ${url} (${e instanceof Error ? e.message : String(e)}) — no screenshot for ${indexes.length} bullet(s).`);
            await page.close();
            continue;
          }

          for (const i of indexes) {
            const shot = await shootBullet(page, plan[i]?.locate, BOX_COLOUR[verdict]);
            const annotated = await annotateEvidence(shot.png, { verdict, url: page.url(), geo, platform, date });
            if (annotated.error) warnings.push(`Could not annotate the ${platform} screenshot for "${items[i]}", so it is attached as captured: ${annotated.error}`);
            if (!shot.located) {
              warnings.push(`${platform}: the element for "${items[i]}" was not found on ${url}, so that screenshot has no box.`);
            }
            bullets[i].images.push({
              platform,
              filename: `evidence-${i + 1}-${platform.toLowerCase()}.png`,
              buffer: annotated.buffer,
              located: shot.located,
            });
          }
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Desktop before Mobile under each bullet, whatever order they were captured in.
  for (const b of bullets) b.images.sort((a, c) => (a.platform === c.platform ? 0 : a.platform === 'Desktop' ? -1 : 1));
  return { bullets, warnings };
}
