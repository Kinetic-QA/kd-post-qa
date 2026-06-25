import * as dotenv from 'dotenv';
dotenv.config();
import { JiraClient } from './jira-client';

const issueKey = process.argv[2];
const transitionId = process.argv[3];

if (!issueKey) {
  console.error('Usage: npx ts-node src/check-transitions.ts <JIRA-TICKET-KEY> [transition-id]');
  console.error('Example: npx ts-node src/check-transitions.ts SC-913');
  process.exit(1);
}

(async () => {
  const jira = new JiraClient();
  if (transitionId) {
    await jira.transitionTicket(issueKey, transitionId);
    const t = await jira.getTicket(issueKey);
    console.log('New status:', t.status);
  } else {
    const t = await jira.getTicket(issueKey);
    console.log('Current status:', t.status);
  }
  await jira.printTransitions(issueKey);
})().catch(console.error);
