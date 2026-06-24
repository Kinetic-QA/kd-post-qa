import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import * as dotenv from 'dotenv';
dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;        // Plain text extracted from Atlassian Document Format
  descriptionRaw: unknown;    // Raw ADF object for advanced parsing
  status: string;
  assignee: string | null;
  reporter: string | null;
  attachments: JiraAttachment[];
  labels: string[];
  priority: string;
}

export interface JiraAttachment {
  filename: string;
  content: string;   // Download URL
  mimeType: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

// ─── ADF → Plain Text ─────────────────────────────────────────────────────────

function adfToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'doc') return (node.content ?? []).map(adfToText).join('\n');
  if (node.type === 'paragraph') return (node.content ?? []).map(adfToText).join('');
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? []).map(adfToText).join('\n');
  }
  if (node.type === 'listItem') return '- ' + (node.content ?? []).map(adfToText).join('').trim();
  if (Array.isArray(node.content)) return node.content.map(adfToText).join('');
  return '';
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class JiraClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private email: string;
  private token: string;

  constructor() {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    const baseUrl = process.env.JIRA_BASE_URL;

    if (!email || !token || !baseUrl) {
      throw new Error(
        'Missing JIRA credentials. Set JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BASE_URL in .env'
      );
    }

    this.email = email;
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.http = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
      auth: { username: email, password: token },
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch a ticket ──────────────────────────────────────────────────────────
  async getTicket(issueKey: string): Promise<JiraTicket> {
    const res = await this.http.get(`/issue/${issueKey}`, {
      params: { fields: 'summary,description,status,assignee,reporter,attachment,labels,priority' },
    });
    const f = res.data.fields;

    return {
      key: issueKey,
      summary: f.summary ?? '',
      description: adfToText(f.description),
      descriptionRaw: f.description,
      status: f.status?.name ?? '',
      assignee: f.assignee?.accountId ?? null,
      reporter: f.reporter?.accountId ?? null,
      attachments: (f.attachment ?? []).map((a: any) => ({
        filename: a.filename,
        content: a.content,
        mimeType: a.mimeType,
      })),
      labels: f.labels ?? [],
      priority: f.priority?.name ?? 'Medium',
    };
  }

  // ── List available transitions for a ticket ─────────────────────────────────
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const res = await this.http.get(`/issue/${issueKey}/transitions`);
    return res.data.transitions.map((t: any) => ({ id: t.id, name: t.name }));
  }

  // ── Move ticket to a new status ─────────────────────────────────────────────
  async transitionTicket(issueKey: string, transitionId: string): Promise<void> {
    await this.http.post(`/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
    console.log(`[JIRA] ${issueKey} transitioned → ID ${transitionId}`);
  }

  // ── Post a comment ──────────────────────────────────────────────────────────
  async addComment(issueKey: string, bodyText: string): Promise<void> {
    await this.http.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: bodyText }],
          },
        ],
      },
    });
    console.log(`[JIRA] Comment posted on ${issueKey}`);
  }

  // ── Reassign ticket ─────────────────────────────────────────────────────────
  async assignTicket(issueKey: string, accountId: string): Promise<void> {
    await this.http.put(`/issue/${issueKey}/assignee`, { accountId });
    console.log(`[JIRA] ${issueKey} assigned to ${accountId}`);
  }

  // ── Upload a file as an attachment ─────────────────────────────────────────
  async uploadAttachment(issueKey: string, filePath: string): Promise<{ filename: string; contentUrl: string; thumbnailUrl: string; id: string }> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename: path.basename(filePath) });

    const res = await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      form,
      {
        auth: { username: this.email, password: this.token },
        headers: {
          ...form.getHeaders(),
          'X-Atlassian-Token': 'no-check',
          'Accept': 'application/json',
        },
      }
    );

    const att = res.data[0];
    console.log(`[JIRA] Attachment uploaded: ${att.filename} (id: ${att.id})`);
    return {
      filename: att.filename,
      contentUrl: att.content,
      thumbnailUrl: att.thumbnail ?? att.content,
      id: String(att.id),
    };
  }

  // ── Post a rich ADF comment ─────────────────────────────────────────────────
  async addCommentAdf(issueKey: string, adfBody: object): Promise<void> {
    await this.http.post(`/issue/${issueKey}/comment`, { body: adfBody });
    console.log(`[JIRA] Comment posted on ${issueKey}`);
  }

  // ── Helper: print transition IDs (run once to find your IDs) ───────────────
  async printTransitions(issueKey: string): Promise<void> {
    const transitions = await this.getTransitions(issueKey);
    console.log(`\nAvailable transitions for ${issueKey}:`);
    transitions.forEach(t => console.log(`  ID: ${t.id}  →  ${t.name}`));
  }
}
