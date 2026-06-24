import type { JiraTicket } from './jira-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRequirement {
  ticketKey: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  attachmentUrls: string[];
  qaUrl: string;
}

export interface ParsedCredentials {
  username: string | null;
  password: string | null;
  targetUrl: string | null;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
// Extracts structured data from the JIRA ticket for the agent to act on.
// No external AI API needed — Claude Code IS the intelligence layer.

export function parseRequirements(ticket: JiraTicket): ParsedRequirement {
  const qaUrl = process.env.QA_BASE_URL ?? 'https://qa.slingo.com';

  // Extract acceptance criteria lines from description
  // Looks for lines after "Acceptance Criteria", "Expected", "Requirements" headings
  const lines = ticket.description.split('\n').map(l => l.trim()).filter(Boolean);
  const criteriaStart = lines.findIndex(l =>
    /acceptance criteria|expected outcome|requirements|definition of done/i.test(l)
  );

  let acceptanceCriteria: string[] = [];
  if (criteriaStart !== -1) {
    acceptanceCriteria = lines
      .slice(criteriaStart + 1)
      .filter(l => l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./))
      .map(l => l.replace(/^[-*\d.]\s*/, '').trim())
      .filter(Boolean);
  }

  // Fallback: use the whole description if no structured criteria found
  if (acceptanceCriteria.length === 0) {
    acceptanceCriteria = [ticket.description];
  }

  return {
    ticketKey: ticket.key,
    summary: ticket.summary,
    description: ticket.description,
    acceptanceCriteria,
    attachmentUrls: ticket.attachments.map(a => a.content),
    qaUrl,
  };
}

// ─── Test Type Extractor ──────────────────────────────────────────────────────
// Reads the "Test Type: <value>" line from the ticket description.

export function parseTestType(description: string): string | null {
  const lines = description.split('\n').map(l => l.trim());
  const line = lines.find(l => /^test\s*type\s*:/i.test(l));
  if (!line) return null;
  return line.replace(/^test\s*type\s*:\s*/i, '').trim().toLowerCase() || null;
}

// ─── Credential Extractor ─────────────────────────────────────────────────────
// Pulls username, password, and target URL out of a plain-text ticket description.

export function parseCredentials(description: string): ParsedCredentials {
  const lines = description.split('\n').map(l => l.trim());

  const userLine = lines.find(l => /^username\s*:/i.test(l));
  const passLine = lines.find(l => /^password\s*:/i.test(l));

  const username = userLine
    ? userLine.replace(/^username\s*:\s*/i, '').trim() || null
    : null;

  const password = passLine
    ? passLine.replace(/^password\s*:\s*/i, '').trim() || null
    : null;

  // Look for an explicit URL in the description (e.g. "Open qa.slingo.com")
  const urlMatch = description.match(/https?:\/\/[^\s]+/i)
    ?? description.match(/\b([\w-]+\.[\w.-]+\.[a-z]{2,})\b/i);

  let targetUrl: string | null = null;
  if (urlMatch) {
    targetUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
  }

  return { username, password, targetUrl };
}
