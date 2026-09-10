// Investigate: same-origin site crawl for the Visual Check tab's
// "Investigate" sub-tab — a deterministic Playwright crawl (fast, free,
// reproducible) rather than an AI-driven one, since QA evidence needs to be
// reproducible. The one place Claude gets involved is opt-in "Smart match":
// after the exact-text pass, it re-checks ONLY the pages that found zero
// exact hits for a given term, looking for paraphrased/reworded mentions —
// so turning it on never slows down or de-determinizes the crawl itself,
// it just adds a second pass on top.
import { chromium } from '@playwright/test';
import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from './visual-compare';

export interface CrawlOptions {
  seedUrl: string;
  terms: string[];
  smartMatch: boolean;
  // Case-insensitive substrings checked against the full URL — a link is
  // skipped (never enqueued/visited) if any pattern matches. Exists because
  // some brands serve several GEOs off the SAME domain by path rather than a
  // separate ccTLD (e.g. brand.com/ca/, brand.com/ie/ alongside the UK's
  // brand.com/) — a plain same-origin crawl has no other way to tell those
  // apart from the GEO actually being investigated.
  excludePatterns?: string[];
  maxPages?: number;
  concurrency?: number;
}

export interface PageResult {
  url: string;
  status: number | 'error';
  mentions: Record<string, number>;
}

export interface CrawlSummary {
  pagesCrawled: number;
  capped: boolean;
  smartMatches: Record<string, string[]>; // term -> URLs Claude flagged as a paraphrased/reworded match
}

const DEFAULT_MAX_PAGES = 200;
const DEFAULT_CONCURRENCY = 4;
const PAGE_TIMEOUT_MS = 15_000;
const TEXT_CAP_PER_PAGE = 20_000;
const SMART_MATCH_SNIPPET_LENGTH = 1_500;
const SMART_MATCH_PAGE_BUDGET = 60;

// Collapses "/page" and "/page/" (and strips any #fragment) into one queue
// entry — most sites treat those as the same page, and without this the
// crawler double-visits them and burns into the page cap for nothing.
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function isExcluded(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const lower = url.toLowerCase();
  return patterns.some(p => p && lower.includes(p.toLowerCase()));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp(escaped, 'gi'));
  return matches ? matches.length : 0;
}

// One Claude call per term (not per page) — the whole point of keeping this
// a separate opt-in pass is that it stays cheap and fast even on a large
// site. Only ever called with pages that already had zero exact hits, and
// only sends the first SMART_MATCH_PAGE_BUDGET of them — a term worth
// flagging this way is rarely buried past the first several dozen pages.
async function runSmartMatch(
  term: string,
  candidates: Array<{ url: string; text: string }>
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || candidates.length === 0) return [];

  const client = new Anthropic({ apiKey });
  const budgeted = candidates.slice(0, SMART_MATCH_PAGE_BUDGET);
  const corpus = budgeted.map(p => `URL: ${p.url}\nTEXT: ${p.text}`).join('\n---\n');

  const system = `You are a QA analyst reviewing crawled web pages for any mention of a specific term or phrase — including PARAPHRASED, REWORDED, or SYNONYMOUS wording, not just the exact text (pages with an exact-text match were already found separately and are excluded from what you're shown here).

Term to check for: "${term}"

You will be given several pages, each with its URL and rendered text (may be truncated). For each page, decide whether it meaningfully references this term/concept even without using the exact words. Do not flag a page just because it's superficially related to the general topic — only flag it if a QA reviewer would genuinely consider that page "mentions this".

Respond with ONLY valid JSON, no markdown fences: {"matches":["url1","url2"]} — list only the URLs that qualify. Return {"matches":[]} if none do.`;

  console.log(`      [Investigate] Smart-matching "${term}" via ${MODEL} across ${budgeted.length} candidate page(s)...`);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: corpus }],
    });
    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const jsonSlice = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;
    const parsed = JSON.parse(jsonSlice);
    return Array.isArray(parsed.matches) ? parsed.matches.filter((u: unknown): u is string => typeof u === 'string') : [];
  } catch (err) {
    console.warn(`      [WARN] Investigate smart-match failed for "${term}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

// BFS same-origin crawl with a small worker pool (each worker owns its own
// browser context/page). onPage fires once per URL as soon as it's
// resolved, so the caller can stream results to the UI incrementally
// instead of waiting for the whole crawl to finish. isStopped is polled
// between pages so a user-initiated stop takes effect promptly rather than
// running the crawl to completion regardless.
export async function crawlSite(
  opts: CrawlOptions,
  onPage: (result: PageResult) => void,
  isStopped: () => boolean
): Promise<CrawlSummary> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const excludePatterns = opts.excludePatterns ?? [];
  const origin = new URL(opts.seedUrl).origin;
  const seed = normalizeUrl(opts.seedUrl);
  if (!seed) throw new Error('Invalid seed URL.');
  // A seed URL matching its own exclude pattern is a contradictory config
  // (nothing would ever get crawled) — fail clearly rather than silently
  // returning zero pages crawled.
  if (isExcluded(seed, excludePatterns)) {
    throw new Error('The site URL itself matches one of the exclude patterns — nothing to crawl.');
  }

  const visited = new Set<string>([seed]);
  const queue: string[] = [seed];
  // Only populated when smartMatch is on — holds the text of every page
  // that had at least one term with zero exact hits, so the smart-match
  // pass below can be scoped per term without re-crawling.
  const zeroHitCandidates: Array<{ url: string; text: string; mentions: Record<string, number> }> = [];
  let capped = false;

  const browser = await chromium.launch({ headless: true });
  try {
    let cursor = 0;

    async function worker(): Promise<void> {
      while (true) {
        if (isStopped()) return;
        if (cursor >= queue.length) return;
        const url = queue[cursor++];

        const context = await browser.newContext();
        let status: number | 'error' = 'error';
        const mentions: Record<string, number> = {};
        for (const term of opts.terms) mentions[term] = 0;

        try {
          const page = await context.newPage();
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).catch(() => null);
          status = response ? response.status() : 'error';

          if (status !== 'error' && status < 400) {
            const contentType = response?.headers()['content-type'] ?? '';
            if (contentType.includes('text/html')) {
              const rawText = await page.evaluate(() => document.body.innerText).catch(() => '');
              const text = rawText.slice(0, TEXT_CAP_PER_PAGE);
              for (const term of opts.terms) mentions[term] = countOccurrences(text, term);

              if (opts.smartMatch && opts.terms.some(t => mentions[t] === 0)) {
                zeroHitCandidates.push({ url, text: text.slice(0, SMART_MATCH_SNIPPET_LENGTH), mentions });
              }

              if (visited.size < maxPages) {
                const links: string[] = await page
                  .$$eval('a[href]', (as) => as.map(a => (a as HTMLAnchorElement).href))
                  .catch(() => []);
                for (const link of links) {
                  if (/^(mailto:|tel:|javascript:)/i.test(link)) continue;
                  const normalized = normalizeUrl(link);
                  if (!normalized || !normalized.startsWith(origin)) continue;
                  if (isExcluded(normalized, excludePatterns)) continue;
                  if (visited.has(normalized)) continue;
                  if (visited.size >= maxPages) { capped = true; break; }
                  visited.add(normalized);
                  queue.push(normalized);
                }
              } else {
                capped = true;
              }
            }
          }
        } catch {
          status = 'error';
        } finally {
          await context.close();
        }

        onPage({ url, status, mentions });
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    await browser.close();
  }

  const smartMatches: Record<string, string[]> = {};
  if (opts.smartMatch && !isStopped()) {
    for (const term of opts.terms) {
      const candidates = zeroHitCandidates.filter(p => p.mentions[term] === 0);
      smartMatches[term] = await runSmartMatch(term, candidates);
    }
  }

  return { pagesCrawled: visited.size, capped, smartMatches };
}
