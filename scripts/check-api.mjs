// CI check: the committed client in src/app/api must match contracts/openapi.yaml.
// Regenerates the client, then fails if anything under src/app/api changed or appeared.
import { execSync } from 'node:child_process';

execSync('npx ng-openapi-gen', { stdio: 'inherit' });
const changes = execSync('git status --porcelain -- src/app/api', { encoding: 'utf8' }).trim();
if (changes) {
  console.error('Generated API client is out of date. Run "npm run api:generate" and commit:\n' + changes);
  process.exit(1);
}
console.log('Generated API client matches contracts/openapi.yaml.');
