import { execSync } from 'child_process';

export default async function globalSetup() {
  execSync('npm run db:migrate', { stdio: 'inherit', env: process.env });
}
