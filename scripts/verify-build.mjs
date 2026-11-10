import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import asar from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'resedit';
import { getCurrentFuseWire } from '@electron/fuses';
import { readArchive, analyzeArchive, flatten, inflateLike } from './extract.mjs';
import { matchTranslations } from './locale.mjs';
import { validateTranslations } from './validate.mjs';

const [originalDir, buildDir] = process.argv.slice(2).map(value => path.resolve(value));
if (!originalDir || !buildDir) throw new Error('Usage: node scripts/verify-build.mjs ORIGINAL_APP_DIR BUILD_DIR');
const original = path.join(originalDir, 'resources/app.asar');
const analysis = analyzeArchive(original);
const patched = path.join(buildDir, 'app.asar');
const originals = asar.listPackage(original).map(entry => entry.replace(/^[/\\]+/, ''));
const changes = [];
let preserved = 0;
for (const entry of originals) {
  const info = asar.statFile(original, entry);
  if (info.files || info.link) continue;
  const oldBytes = asar.extractFile(original, entry), newBytes = asar.extractFile(patched, entry);
  if (!oldBytes.equals(newBytes)) changes.push(entry.replaceAll('\\', '/'));
  else preserved++;
  assert.equal(!!asar.statFile(patched, entry).unpacked, !!info.unpacked, `Unpacked flag: ${entry}`);
}
assert.deepEqual(changes.sort(), [analysis.native.entry, analysis.renderer.entry].sort());
const entries = asar.listPackage(patched).map(entry => entry.replace(/^[/\\]+/, '').replaceAll('\\', '/'));
assert.equal(entries.length, originals.length + 1);
const moduleSource = readArchive(patched, path.posix.join(path.posix.dirname(analysis.renderer.entry), 'factory-zh-CN.js'));
const resourceObject = JSON.parse(moduleSource.slice('export const resources='.length).trim().replace(/;$/, ''));
const english = analysis.english;
const { desktop, ...rendererEnglish } = english;
assert.deepEqual(validateTranslations(flatten(rendererEnglish), flatten(resourceObject)), []);
const { translations } = await matchTranslations(flatten(english));
const expected = flatten(inflateLike(english, translations));
assert.deepEqual(flatten(resourceObject), Object.fromEntries(Object.entries(expected).filter(([key]) => !key.startsWith('desktop.'))));
for (const [entry, value] of Object.entries(flatten({ desktop }))) {
  assert.equal(typeof expected[entry], 'string');
}
const oldExe = path.join(originalDir, 'factory-desktop.exe');
const newExe = path.join(buildDir, 'factory-desktop.exe');
assert.deepEqual(await getCurrentFuseWire(newExe), await getCurrentFuseWire(oldExe));
const executable = NtExecutable.from(await fs.readFile(newExe), { ignoreCert: true });
const resources = NtExecutableResource.from(executable);
const integrity = resources.entries.find(entry => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR');
const value = JSON.parse(Buffer.from(integrity.bin).toString('utf8'))[0].value;
const hash = crypto.createHash('sha256').update(asar.getRawHeader(patched).headerString).digest('hex');
assert.equal(value, hash);
console.log(JSON.stringify({ originalFilesPreserved: preserved, changed: changes, newLocale: Object.keys(flatten(resourceObject)).length, desktopLocale: Object.keys(flatten(desktop)).length, fusesPreserved: true, embeddedAsarIntegrityMatches: true }, null, 2));
