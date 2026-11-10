/**
 * Tests for the per-bullet evidence screenshots (gui/evidence-capture.ts) and
 * the comment that places them (src/jira-comment.ts) — Standing Rules #12/#13:
 * one boxed, captioned screenshot per Documentation bullet, per platform.
 * Run with: npx playwright test -c gui/tests/playwright.config.ts
 *
 * The capture test runs a real headless browser against a tiny local page, so
 * no site, Jira or AI is needed.
 */

import { test, expect } from '@playwright/test';
import * as http from 'http';
import type { AddressInfo } from 'net';
import sharp from 'sharp';
import { captureBulletEvidence, resolveEvidenceUrl, fallbackKeywords, homepageAssumed, statedMobileViewport, statedDesktopViewport } from '../evidence-capture';
import { normalizeEvidencePlan, splitOutOfScope } from '../../src/ticket-interpreter';
import { buildCommentAdf, adfDocToPreviewText } from '../../src/jira-comment';
import type { TestRunResult } from '../../src/test-runner';

const PAGE = `<!doctype html><html><body style="margin:0;font-family:sans-serif">
<header style="height:120px;background:#eee">Header</header>
<main style="height:1400px;padding:20px">Main content</main>
<footer style="padding:30px;background:#ddd"><a href="/terms/" style="font-size:22px">Terms and Conditions</a></footer>
</body></html>`;

let server: http.Server;
let baseUrl = '';

test.beforeAll(async () => {
  server = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(PAGE); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

// Pixels close to the standard pass-box green, (0,200,0) — the whole-image
// border and caption bar use a different green, so only a drawn box matches.
async function boxPixels(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 20 && data[i + 1] > 185 && data[i + 1] < 215 && data[i + 2] < 20) n++;
  }
  return n;
}

test.describe('per-bullet capture', () => {
  test.setTimeout(180_000);

  test('boxes the element on desktop and mobile, and says so when an element is not found', async () => {
    const { bullets, warnings } = await captureBulletEvidence({
      baseUrl,
      items: ['The Terms and Conditions link is shown in the footer', 'A promo banner is shown'],
      plan: [
        { page: '', locate: { role: 'link', name: 'Terms and Conditions' }, platforms: 'both' },
        { page: '', locate: { text: 'Nonexistent promo banner' }, platforms: 'desktop' },
      ],
      verdict: 'pass',
      geo: 'UK',
      date: '21 October 2026',
    });

    // Bullet 1: one image per platform, Desktop first, each boxed.
    expect(bullets[0].images.map(i => i.platform)).toEqual(['Desktop', 'Mobile']);
    expect(bullets[0].images.every(i => i.located)).toBe(true);
    for (const img of bullets[0].images) expect(await boxPixels(img.buffer)).toBeGreaterThan(10);

    // The mobile image really is a phone-width capture.
    const mobileMeta = await sharp(bullets[0].images[1].buffer).metadata();
    const desktopMeta = await sharp(bullets[0].images[0].buffer).metadata();
    expect(mobileMeta.width!).toBeLessThan(desktopMeta.width! / 1.5);

    // Bullet 2: desktop only, element missing -> an image with NO box, plus a warning.
    expect(bullets[1].images).toHaveLength(1);
    expect(bullets[1].images[0].located).toBe(false);
    expect(await boxPixels(bullets[1].images[0].buffer)).toBe(0);
    expect(warnings.some(w => w.includes('was not found') && w.includes('A promo banner is shown'))).toBe(true);
  });

  test('a bullet with no plan gets no image and a warning, never a guess', async () => {
    const { bullets, warnings } = await captureBulletEvidence({
      baseUrl, items: ['Something unplanned'], plan: [null], verdict: 'pass', date: '21 October 2026',
    });
    expect(bullets[0].images).toHaveLength(0);
    expect(warnings.some(w => w.includes('Something unplanned'))).toBe(true);
  });

  test('a page that cannot be opened gives a warning, not an image', async () => {
    const { bullets, warnings } = await captureBulletEvidence({
      baseUrl: 'http://127.0.0.1:1/', items: ['x'], plan: [{ page: '', platforms: 'desktop' }], verdict: 'pass', date: '21 October 2026',
    });
    expect(bullets[0].images).toHaveLength(0);
    expect(warnings.some(w => w.includes('could not open'))).toBe(true);
  });
});

test.describe('evidence plan and URLs', () => {
  test('resolveEvidenceUrl keeps a locale prefix and ignores a leading slash or domain', () => {
    expect(resolveEvidenceUrl('https://qa.example.com/en-ca/', '')).toBe('https://qa.example.com/en-ca/');
    expect(resolveEvidenceUrl('https://qa.example.com/en-ca', 'promotions/')).toBe('https://qa.example.com/en-ca/promotions/');
    expect(resolveEvidenceUrl('https://qa.example.com/en-ca/', '/promotions/')).toBe('https://qa.example.com/en-ca/promotions/');
    expect(resolveEvidenceUrl('https://qa.example.com/en-ca/', 'https://www.live.com/promotions/')).toBe('https://qa.example.com/en-ca/promotions/');
  });

  test('normalizeEvidencePlan keeps one slot per statement and drops malformed entries', () => {
    const plan = normalizeEvidencePlan([
      { page: 'promotions/', locate: { role: 'link', name: 'Play Now' }, platforms: 'mobile' },
      { page: '', locate: { role: 'link' } },
      'nonsense',
    ], 4);
    expect(plan).toHaveLength(4);
    expect(plan[0]).toEqual({ page: 'promotions/', locate: { role: 'link', name: 'Play Now', text: undefined }, platforms: 'mobile' });
    expect(plan[1]).toEqual({ page: '', locate: undefined, platforms: 'both' }); // role without a name is no locator
    expect(plan[2]).toBeNull();
    expect(plan[3]).toBeNull();
  });
});

test.describe('comment placement', () => {
  const run: TestRunResult = {
    success: true, testType: 'footer', testFile: 'x.spec.ts', durationMs: 1,
    passed: 1, failed: 0, skipped: 0, errors: [], screenshotPaths: [], videoPaths: [],
  };
  const img = (n: number) => ({ thumbnailUrl: `https://jira.example/${n}.png` });

  test('each bullet carries its own screenshots, and the Platform line says Desktop/Mobile', () => {
    const doc = buildCommentAdf(run, [{ ...img(9), filename: '9.png' }], ['Footer link shown', 'Footer link opens Terms'], 'pre-check', [], {
      scopePages: ['Footer'], platform: 'Desktop/Mobile',
      documentation: [
        { text: 'Footer link shown', images: [img(1), img(2)] },
        { text: 'Footer link opens Terms', images: [img(3), img(4)] },
      ],
    });
    const out = adfDocToPreviewText(doc as { content: any[] });
    expect(out).toContain('  • Footer link shown\n      [screenshot]\n      [screenshot]\n  • Footer link opens Terms\n      [screenshot]\n      [screenshot]');
    expect(out).toContain('  • Platform: Desktop/Mobile');
    // The run's own screenshot (img 9) is not added after the list as well.
    expect(JSON.stringify(doc)).not.toContain('/9.png');
    expect(JSON.stringify(doc)).toContain('/1.png');
  });

  test('a bullet whose screenshots all failed to upload is still listed, without images', () => {
    const doc = buildCommentAdf(run, [], ['One'], 'pre-check', [], {
      scopePages: ['Footer'], documentation: [{ text: 'One', images: [] }],
    });
    expect(adfDocToPreviewText(doc as { content: any[] })).toContain('  • One');
  });
});

test.describe('fallbackKeywords', () => {
  test('keeps the words that identify the element and drops generic ones', () => {
    expect(fallbackKeywords({ role: 'region', name: 'banner' })).toEqual(['banner']);
    expect(fallbackKeywords({ role: 'link', name: 'Apple App Store' })).toEqual(['apple', 'app', 'store']);
    expect(fallbackKeywords({ text: 'Footer logo icon' })).toEqual(['footer']);
  });

  test('gives nothing to try when no element was named', () => {
    expect(fallbackKeywords(undefined)).toEqual([]);
  });
});

test.describe('homepageAssumed', () => {
  test('flags a scope that names another page, not a homepage or site-wide one', () => {
    expect(homepageAssumed(['Promotions'])).toBe(true);
    expect(homepageAssumed(['Online Slots — Jackpots'])).toBe(true);
    expect(homepageAssumed(['Homepage'])).toBe(false);
    expect(homepageAssumed(['Homepage - footer'])).toBe(false);
    expect(homepageAssumed(['Footer'])).toBe(false);
    expect(homepageAssumed([])).toBe(false);
    expect(homepageAssumed(undefined)).toBe(false);
  });
});

test.describe('statedMobileViewport', () => {
  test('uses the phone size the ticket states', () => {
    expect(statedMobileViewport(['Banner shows on mobile (430×932)'])).toEqual({ width: 430, height: 932 });
    expect(statedMobileViewport(['Banner shows', 'Visible at 412 x 915 on mobile'])).toEqual({ width: 412, height: 915 });
  });

  test('ignores sizes that are not a phone, and gives nothing when none is stated', () => {
    expect(statedMobileViewport(['Banner is 1920x472 on desktop'])).toBeUndefined();
    expect(statedMobileViewport(['Banner is present on mobile'])).toBeUndefined();
  });
});

test.describe('statedDesktopViewport', () => {
  test('uses the desktop size the ticket states', () => {
    expect(statedDesktopViewport(['Banner is visible on desktop (1920×1080)'])).toEqual({ width: 1920, height: 1080 });
    expect(statedDesktopViewport(['Banner is visible on desktop (1920px wide)'])).toEqual({ width: 1920, height: 900 });
  });

  test('does not mistake an element size for a viewport', () => {
    expect(statedDesktopViewport(['Banner renders at about 1905×472 on desktop'])).toBeUndefined();
    expect(statedDesktopViewport(['Banner is visible on desktop'])).toBeUndefined();
  });
});

test.describe('splitOutOfScope', () => {
  test('drops size, layout and responsive statements and keeps their slots aligned', () => {
    const r = splitOutOfScope(
      ['Banner is visible on desktop', 'Banner dimensions are appropriate for each viewport (desktop: ~1905×472)', 'Banner is visible on mobile (430×932)'],
      ['a', 'b', 'c'],
    );
    expect(r.items).toEqual(['Banner is visible on desktop', 'Banner is visible on mobile (430×932)']);
    expect(r.plan).toEqual(['a', 'c']);
    expect(r.dropped).toEqual(['Banner dimensions are appropriate for each viewport (desktop: ~1905×472)']);
  });

  test('keeps a viewport size in a presence statement, and never empties the comment', () => {
    expect(splitOutOfScope(['Banner is visible on mobile (430×932)'], ['a']).dropped).toEqual([]);
    const only = splitOutOfScope(['Layout does not overlap'], ['a']);
    expect(only.items).toEqual(['Layout does not overlap']);
    expect(only.dropped).toEqual([]);
  });
});
