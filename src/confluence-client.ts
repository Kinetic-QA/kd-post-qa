// Live Confluence page fetcher — reuses the same Atlassian credentials as
// JiraClient (an Atlassian API token is account-wide, not product-specific,
// so JIRA_EMAIL/JIRA_API_TOKEN work against Confluence too). Fails soft:
// never throws, returns null on any error, so a Confluence outage or
// permission problem never blocks a Jira ticket check — this is enrichment,
// not a hard dependency.
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

interface CacheEntry {
  text: string;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

export interface ConfluencePageSummary {
  id: string;
  title: string;
}
interface ChildrenCacheEntry {
  children: ConfluencePageSummary[];
  fetchedAt: number;
}
const childrenCache = new Map<string, ChildrenCacheEntry>();
const versionCache = new Map<string, { version: ConfluencePageVersion; fetchedAt: number }>();

const MAX_CHARS = 8000;
// The cache keeps the whole page (up to this cap) and each caller's own size
// limit is applied when it READS — so one caller asking for a long page never
// leaves a truncated copy behind for another.
const HARD_MAX_CHARS = 80000;

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '\n\n[...truncated...]' : text;
}

// Confluence's "storage" format is XHTML-ish. This is a lightweight
// stripper, not a full parser — good enough to hand readable text to an AI
// prompt, not meant to preserve exact formatting.
function storageHtmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Fetches a Confluence page's body as plain text, live from the real
 * Confluence REST API — not a one-time copy baked into code. Cached for
 * `ttlMs` (default 10 minutes) so a normal run of tickets doesn't hammer
 * Confluence; a page edit shows up on the next cache expiry with no
 * redeploy needed. On any fetch error, serves the last good cached copy if
 * one exists, otherwise returns null.
 */
export async function getConfluencePageText(pageId: string, ttlMs = 10 * 60 * 1000, maxChars = MAX_CHARS): Promise<string | null> {
  const cached = cache.get(pageId);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return clip(cached.text, maxChars);

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  if (!email || !token || !baseUrl) return cached ? clip(cached.text, maxChars) : null;

  try {
    const res = await axios.get(`${baseUrl}/wiki/rest/api/content/${pageId}`, {
      params: { expand: 'body.storage' },
      auth: { username: email, password: token },
      headers: { Accept: 'application/json' },
      timeout: 8000,
    });
    const storage = res.data?.body?.storage?.value ?? '';
    const text = storageHtmlToText(storage).slice(0, HARD_MAX_CHARS);
    cache.set(pageId, { text, fetchedAt: Date.now() });
    return clip(text, maxChars);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Confluence] Could not fetch page ${pageId} (serving ${cached ? 'stale cache' : 'nothing'}): ${msg}`);
    return cached ? clip(cached.text, maxChars) : null;
  }
}

/**
 * Lists a Confluence page's direct child pages (id + title only, no body) —
 * used to discover what's currently under a KB folder (e.g. "JIRA QA
 * Helper") without hardcoding the list, so a page Reyn adds/renames shows up
 * on the next cache expiry. Same fail-soft contract as getConfluencePageText:
 * never throws, serves stale cache on error, empty array if nothing cached.
 */
export async function getConfluencePageChildren(pageId: string, ttlMs = 10 * 60 * 1000): Promise<ConfluencePageSummary[]> {
  const cached = childrenCache.get(pageId);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.children;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  if (!email || !token || !baseUrl) return cached?.children ?? [];

  try {
    const res = await axios.get(`${baseUrl}/wiki/rest/api/content/${pageId}/child/page`, {
      params: { limit: 100 },
      auth: { username: email, password: token },
      headers: { Accept: 'application/json' },
      timeout: 8000,
    });
    const children: ConfluencePageSummary[] = (res.data?.results ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
    }));
    childrenCache.set(pageId, { children, fetchedAt: Date.now() });
    return children;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Confluence] Could not fetch children of page ${pageId} (serving ${cached ? 'stale cache' : 'nothing'}): ${msg}`);
    return cached?.children ?? [];
  }
}

export interface ConfluencePageVersion {
  number: number;
  when: string;
  by: string;
}

/**
 * A page's current version number + when/who last saved it — no body, so it's
 * a tiny request. Used to notice when a page that some code was written
 * against has since been edited. Short cache (a minute) because the whole
 * point is catching a recent edit; fail-soft like the other readers: null on
 * any error, never throws.
 */
export async function getConfluencePageVersion(pageId: string, ttlMs = 60 * 1000): Promise<ConfluencePageVersion | null> {
  const cached = versionCache.get(pageId);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.version;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  if (!email || !token || !baseUrl) return cached?.version ?? null;

  try {
    const res = await axios.get(`${baseUrl}/wiki/rest/api/content/${pageId}`, {
      params: { expand: 'version' },
      auth: { username: email, password: token },
      headers: { Accept: 'application/json' },
      timeout: 8000,
    });
    const v = res.data?.version;
    if (typeof v?.number !== 'number') return cached?.version ?? null;
    const version: ConfluencePageVersion = { number: v.number, when: String(v.when ?? ''), by: String(v.by?.displayName ?? '') };
    versionCache.set(pageId, { version, fetchedAt: Date.now() });
    return version;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Confluence] Could not read version of page ${pageId}: ${msg}`);
    return cached?.version ?? null;
  }
}
