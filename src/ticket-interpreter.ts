import Anthropic from '@anthropic-ai/sdk';
import { SUPPORTED_TEST_TYPES } from './test-runner';

const MODEL = 'claude-sonnet-4-6';

/**
 * Sends the ticket's summary and description to Claude and asks it to identify
 * which of the 10 supported test types best matches.
 *
 * Returns the matched test type string (e.g. "login") or null if nothing matches.
 * Falls back gracefully if ANTHROPIC_API_KEY is not configured.
 */
export async function interpretTicket(
  summary: string,
  description: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — AI interpreter skipped.');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const supportedList = SUPPORTED_TEST_TYPES.map(t => `"${t}"`).join(', ');

  const systemPrompt = [
    'You are a QA test dispatcher for an automated Playwright test suite.',
    `The only supported test types are: ${supportedList}.`,
    'Given a Jira ticket title and description, respond with ONLY the single best matching test type from the list above — lowercase, exact spelling.',
    'If nothing matches, respond with exactly: none',
    'Do not explain. Do not add punctuation. Output one word or phrase only.',
  ].join(' ');

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 64,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Ticket title: ${summary}\n\nDescription:\n${description}`,
      }],
    });

    raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()
      .toLowerCase();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`      [WARN] AI interpreter API call failed: ${msg}`);
    return null;
  }

  if (!raw || raw === 'none') return null;

  // Exact match first, then substring match as fallback
  const exact = SUPPORTED_TEST_TYPES.find(t => t === raw);
  if (exact) return exact;

  const partial = SUPPORTED_TEST_TYPES.find(t => raw.includes(t));
  return partial ?? null;
}
