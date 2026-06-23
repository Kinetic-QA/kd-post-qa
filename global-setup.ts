import * as fs from 'fs';
import * as path from 'path';

async function globalSetup() {
  const resultsPath = path.join(__dirname, 'test-results', 'results.json');
  if (fs.existsSync(resultsPath)) {
    fs.unlinkSync(resultsPath);
    console.log('[Setup] Cleared previous results.json');
  }
}

export default globalSetup;
