/**
 * Unit tests for requirements-parser.ts
 * Run with: npx playwright test tests/requirements-parser.spec.ts
 *
 * These are pure logic tests — no browser, no Jira API needed.
 */

import { test, expect } from '@playwright/test';
import { parseRequirements } from '../src/requirements-parser';
import type { JiraTicket } from '../src/jira-client';

function makeTicket(overrides: Partial<JiraTicket> = {}): JiraTicket {
  return {
    key: 'SLINGO-1',
    summary: 'Test ticket',
    description: '',
    descriptionRaw: null,
    status: 'Ready for QA',
    assignee: null,
    reporter: null,
    attachments: [],
    labels: [],
    priority: 'Medium',
    ...overrides,
  };
}

test('extracts acceptance criteria under "Acceptance Criteria" heading', () => {
  const ticket = makeTicket({
    description: 'Acceptance Criteria\n- User can log in\n- User sees dashboard\n- Logout works',
  });

  const result = parseRequirements(ticket);

  expect(result.acceptanceCriteria).toEqual([
    'User can log in',
    'User sees dashboard',
    'Logout works',
  ]);
});

test('falls back to full description when no AC heading found', () => {
  const ticket = makeTicket({ description: 'Fix the login page button alignment.' });

  const result = parseRequirements(ticket);

  expect(result.acceptanceCriteria).toEqual(['Fix the login page button alignment.']);
});

test('includes attachment URLs', () => {
  const ticket = makeTicket({
    attachments: [
      { filename: 'screenshot.png', content: 'https://example.com/file.png', mimeType: 'image/png' },
    ],
  });

  const result = parseRequirements(ticket);

  expect(result.attachmentUrls).toEqual(['https://example.com/file.png']);
});

test('returns correct ticketKey and summary', () => {
  const ticket = makeTicket({ key: 'SLINGO-42', summary: 'Checkout flow fix' });

  const result = parseRequirements(ticket);

  expect(result.ticketKey).toBe('SLINGO-42');
  expect(result.summary).toBe('Checkout flow fix');
});

test('uses QA_BASE_URL from env', () => {
  process.env.QA_BASE_URL = 'https://qa.slingo.com';
  const result = parseRequirements(makeTicket());
  expect(result.qaUrl).toBe('https://qa.slingo.com');
});
