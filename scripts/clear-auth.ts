/** npm run auth:clear -> deletes every saved login session (.auth/). Next run logs in fresh. */
import fs from 'fs';
import path from 'path';

const dir = path.resolve(__dirname, '../.auth');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Cleared saved sessions in ${dir}`);
