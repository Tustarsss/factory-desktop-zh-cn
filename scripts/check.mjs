import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './extract.mjs';
import { loadTranslations } from './locale.mjs';
import { validateTranslations } from './validate.mjs';

const contract = JSON.parse(await fs.readFile(path.join(root, 'profiles/catalog.tokens.json'), 'utf8'));
let source;
try { source = JSON.parse(await fs.readFile(path.join(root, 'work/source.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const translations = await loadTranslations(source ?? {});
const issues = validateTranslations(contract, translations);
const unchanged = source ? Object.keys(source).filter(key => source[key] === translations[key]) : [];
const report = {
  sourceKeys: Object.keys(contract).length,
  translatedKeys: Object.keys(translations).length,
  issues,
  unchangedCount: unchanged.length,
  unchanged: unchanged.map(key => ({ key, text: source[key] })),
};
await fs.mkdir(path.join(root, 'work'), { recursive: true });
await fs.writeFile(path.join(root, 'work/check-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sourceKeys: report.sourceKeys, translatedKeys: report.translatedKeys, issues, unchanged: unchanged.length }, null, 2));
if (issues.length) process.exitCode = 1;
