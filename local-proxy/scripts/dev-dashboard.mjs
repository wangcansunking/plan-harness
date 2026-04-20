import { startDashboard } from '../src/web-server.js';

const workspace = process.argv[2] || process.cwd();
const port = Number(process.argv[3]) || 3847;

const url = await startDashboard(workspace, port);
console.log(`Dashboard listening at ${url} (workspace: ${workspace})`);
console.log('Press Ctrl+C to stop.');
