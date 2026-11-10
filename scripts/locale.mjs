import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from './extract.mjs';

export async function loadTranslations(source) {
  const read = name => fs.readFile(path.join(root, 'locales', name), 'utf8').then(JSON.parse);
  const [translations, reviewed, overrides] = await Promise.all(['zh-CN.json', 'reviewed.json', 'overrides.json'].map(read));
  for (const [key, text] of Object.entries(source)) if (text in reviewed) translations[key] = reviewed[text];
  return Object.assign(translations, overrides);
}

export async function matchTranslations(source) {
  const read = name => fs.readFile(path.join(root, 'locales', name), 'utf8').then(JSON.parse);
  const [raw, reviewed, overrides, hashes] = await Promise.all([
    ...['zh-CN.json', 'reviewed.json', 'overrides.json'].map(read),
    fs.readFile(path.join(root, 'profiles/source-hashes.json'), 'utf8').then(JSON.parse),
  ]);
  const digest = text => crypto.createHash('sha256').update(text).digest('hex');
  const reviewedByHash = new Map(Object.entries(reviewed).map(([text, translated]) => [digest(text), translated]));
  const baseline = {}, byHash = new Map();
  for (const [key, hash] of Object.entries(hashes)) {
    const translated = overrides[key] ?? reviewedByHash.get(hash) ?? raw[key];
    if (translated === undefined) continue;
    baseline[key] = translated;
    if (!byHash.has(hash)) byHash.set(hash, translated);
  }
  const translations = {};
  let sameKey = 0, movedKey = 0;
  for (const [key, text] of Object.entries(source)) {
    const hash = digest(text);
    if (hashes[key] === hash && baseline[key] !== undefined) {
      translations[key] = baseline[key]; sameKey++;
    } else if (reviewedByHash.has(hash) || byHash.has(hash)) {
      translations[key] = reviewedByHash.get(hash) ?? byHash.get(hash); movedKey++;
    }
  }
  return { translations, report: { total: Object.keys(source).length, sameKey, reusedText: movedKey, keptEnglish: Object.keys(source).length - sameKey - movedKey } };
}
