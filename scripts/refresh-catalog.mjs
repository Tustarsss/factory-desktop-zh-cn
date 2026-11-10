import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { protectedTokens } from './validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceFile = process.argv[2] ?? path.join(root, 'work/source.json');
const source = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
const hashes = {}, tokens = {};
for (const [key, text] of Object.entries(source)) {
  hashes[key] = crypto.createHash('sha256').update(text).digest('hex');
  tokens[key] = protectedTokens(text);
}
await fs.mkdir(path.join(root, 'profiles'), { recursive: true });
await fs.writeFile(path.join(root, 'profiles/source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
await fs.writeFile(path.join(root, 'profiles/catalog.tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
console.log(`已为 ${Object.keys(source).length} 个词条生成原文摘要和标记目录。`);
