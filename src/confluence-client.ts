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

const MAX_CHARS = 8000;

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
export async function getConfluencePageText(pageId: string, ttlMs = 10 * 60 * 1000): Promise<string | null> {
  const cached = cache.get(pageId);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.text;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  if (!email || !token || !baseUrl) return cached?.text ?? null;

  try {
    const res = await axios.get(`${baseUrl}/wiki/rest/api/content/${pageId}`, {
      params: { expand: 'body.storage' },
      auth: { username: email, password: token },
      headers: { Accept: 'application/json' },
      timeout: 8000,
    });
    const storage = res.data?.body?.storage?.value ?? '';
    let text = storageHtmlToText(storage);
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n[...truncated...]';
    }
    cache.set(pageId, { text, fetchedAt: Date.now() });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Confluence] Could not fetch page ${pageId} (serving ${cached ? 'stale cache' : 'nothing'}): ${msg}`);
    return cached?.text ?? null;
  }
}
