import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import asar from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'resedit';
import { root, readArchive, analyzeArchive, flatten, inflateLike, patchLanguageModule, defaultAppDirectory } from './extract.mjs';
import { validateTranslations } from './validate.mjs';
import { matchTranslations } from './locale.mjs';

const run = promisify(execFile);
const backupName = '.factory-zh-cn-backup';
const markerName = 'factory-zh-cn.json';

async function main() {
  const { command, appDir, buildDir } = await options();
  if (command === 'restore') return restore(appDir);
  const inputArchive = path.join(appDir, 'resources/app.asar');
  const marker = await readOptionalJson(path.join(appDir, markerName));
  if (command === 'inspect') {
    const info = JSON.parse(readArchive(inputArchive, 'package.json'));
    console.log(JSON.stringify({ appDir, version: info.version, compatibility: '安装时按语言结构识别，不限制版本号', installed: marker, backupAvailable: !!await readOptionalJson(path.join(appDir, backupName, 'backup.json')) }, null, 2));
    return;
  }
  if (marker) throw new Error('补丁已安装。重新安装前先执行 restore。');
  if (command === 'install') await requireClosed();
  const analysis = analyzeArchive(inputArchive);
  const english = analysis.english;
  const source = flatten(english);
  const { translations, report } = await matchTranslations(source);
  const matchedSource = Object.fromEntries(Object.keys(translations).map(key => [key, source[key]]));
  const issues = validateTranslations(matchedSource, translations);
  if (issues.length) throw new Error(`语言包检查失败：\n${issues.slice(0, 20).join('\n')}`);
  const resources = inflateLike(english, translations);
  console.log(`Factory ${analysis.version}：共 ${report.total} 条，原键匹配 ${report.sameKey} 条，同原文复用 ${report.reusedText} 条，保留英文 ${report.keptEnglish} 条。`);
  await fs.mkdir(buildDir, { recursive: true });
  await build(appDir, buildDir, resources, analysis);
  await fs.writeFile(path.join(buildDir, 'matching-report.json'), JSON.stringify({ factoryVersion: analysis.version, ...report }, null, 2) + '\n');
  if (command === 'build') {
    console.log(`补丁构建完成：${buildDir}`);
    return;
  }
  const backup = path.join(appDir, backupName);
  if (await readOptionalJson(path.join(backup, 'backup.json'))) throw new Error('发现原始备份，请先执行 restore，避免覆盖。');
  await fs.mkdir(path.join(backup, 'resources'), { recursive: true });
  for (const relative of ['resources/app.asar', 'factory-desktop.exe']) {
    await fs.copyFile(path.join(appDir, relative), path.join(backup, relative), fs.constants.COPYFILE_EXCL);
  }
  await fs.writeFile(path.join(backup, 'backup.json'), JSON.stringify({ version: analysis.version, created: new Date().toISOString() }, null, 2));
  try {
    await fs.copyFile(path.join(buildDir, 'app.asar'), inputArchive);
    await fs.copyFile(path.join(buildDir, 'factory-desktop.exe'), path.join(appDir, 'factory-desktop.exe'));
    await fs.writeFile(path.join(appDir, markerName), JSON.stringify({ patchVersion: '0.2.0', factoryVersion: analysis.version, locale: 'zh-CN', matching: report, installed: new Date().toISOString() }, null, 2));
  } catch (error) {
    for (const relative of ['resources/app.asar', 'factory-desktop.exe']) await fs.copyFile(path.join(backup, relative), path.join(appDir, relative));
    throw error;
  }
  console.log('安装完成。启动 Factory，在 Settings → Preferences → Language 中选择「简体中文」。');
}

async function options() {
  const args = process.argv.slice(2);
  const command = args.shift() ?? 'inspect';
  if (!['inspect', 'build', 'install', 'restore'].includes(command)) throw new Error('用法：node scripts/patch.mjs inspect|build|install|restore [--app-dir 路径] [--build-dir 路径]');
  const values = {};
  while (args.length) {
    const name = args.shift(), value = args.shift();
    if (!['--app-dir', '--build-dir'].includes(name) || !value) throw new Error(`未知或缺少参数：${name}`);
    values[name] = value;
  }
  if (process.platform !== 'win32') throw new Error('当前补丁仅支持 Windows。');
  const appDir = values['--app-dir'] ?? await defaultAppDirectory();
  return { command, appDir: path.resolve(appDir), buildDir: path.resolve(values['--build-dir'] ?? path.join(root, 'work', `build-${Date.now()}`)) };
}

export async function build(appDir, destination, resources, analysis) {
  const archive = path.join(appDir, 'resources/app.asar');
  const staging = path.join(destination, 'staging');
  await fs.mkdir(staging, { recursive: true });
  asar.extractAll(archive, staging);
  const rendererPath = path.join(staging, analysis.renderer.entry);
  const nativePath = path.join(staging, analysis.native.entry);
  const renderer = patchLanguageModule(analysis.renderer, 'async()=>import("./factory-zh-CN.js")');
  const native = patchLanguageModule(analysis.native, JSON.stringify({ desktop: resources.desktop }));
  const { desktop, ...rendererResources } = resources;
  await fs.writeFile(rendererPath, renderer);
  await fs.writeFile(nativePath, native);
  await fs.writeFile(path.join(path.dirname(rendererPath), 'factory-zh-CN.js'), `export const resources=${JSON.stringify(rendererResources)};\n`);
  const unpacked = asar.listPackage(archive).map(entry => entry.replace(/^[/\\]+/, ''))
    .filter(entry => { const item = asar.statFile(archive, entry); return item.unpacked && !item.files; });
  const globPaths = unpacked.map(entry => path.join(staging, entry).replaceAll('\\', '/'));
  const unpackPattern = globPaths.length === 1 ? globPaths[0] : `{${globPaths.join(',')}}`;
  await asar.createPackageWithOptions(staging, path.join(destination, 'app.asar'), globPaths.length ? { unpack: unpackPattern } : {});
  await updateIntegrity(path.join(appDir, 'factory-desktop.exe'), path.join(destination, 'factory-desktop.exe'), path.join(destination, 'app.asar'));
  console.log('中文资源和 ASAR 完整性资源已生成。');
}

async function updateIntegrity(input, output, archive) {
  const executable = NtExecutable.from(await fs.readFile(input), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const entry = resources.entries.find(item => String(item.type).toUpperCase() === 'INTEGRITY' && String(item.id).toUpperCase() === 'ELECTRONASAR');
  if (!entry) throw new Error('未找到 Electron ASAR 完整性资源。');
  const entries = JSON.parse(Buffer.from(entry.bin).toString('utf8'));
  const header = asar.getRawHeader(archive).headerString;
  const target = entries.find(item => item.file.replaceAll('\\', '/') === 'resources/app.asar');
  target.value = sha(header);
  entry.bin = new TextEncoder().encode(JSON.stringify(entries)).buffer;
  resources.outputResource(executable);
  await fs.writeFile(output, Buffer.from(executable.generate()));
}

async function requireClosed() {
  const { stdout } = await run('tasklist.exe', ['/FI', 'IMAGENAME eq factory-desktop.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
  if (stdout.toLowerCase().includes('"factory-desktop.exe"')) throw new Error('Factory 正在运行。请先完全退出 Factory，再执行安装或恢复。');
}

async function restore(appDir) {
  const backup = path.join(appDir, backupName);
  if (!await readOptionalJson(path.join(backup, 'backup.json'))) throw new Error('没有找到此安装目录的原始备份。');
  await requireClosed();
  for (const relative of ['resources/app.asar', 'factory-desktop.exe']) await fs.copyFile(path.join(backup, relative), path.join(appDir, relative));
  const marker = path.join(appDir, markerName);
  if (await readOptionalJson(marker)) await fs.rename(marker, path.join(backup, markerName));
  // Retain the original backup under a distinct name so another install can create a fresh backup.
  await fs.rename(backup, path.join(appDir, `${backupName}-restored-${Date.now()}`));
  console.log('已恢复原版。原始备份仍保留在安装目录中。');
}

function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
async function readOptionalJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
