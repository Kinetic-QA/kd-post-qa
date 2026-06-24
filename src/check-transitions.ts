import * as dotenv from 'dotenv';
dotenv.config();
import { JiraClient } from './jira-client';

const issueKey = process.argv[2];
const transitionId = process.argv[3];

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
