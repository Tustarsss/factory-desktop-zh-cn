import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import asar from '@electron/asar';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function readArchive(archive, entry) {
  return asar.extractFile(archive, path.normalize(entry)).toString('utf8');
}

export function parseBundle(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const bindings = new Map();
  for (const statement of ast.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === 'Identifier') bindings.set(declaration.id.name, declaration.init);
      }
    }
    if (statement.type === 'FunctionDeclaration') bindings.set(statement.id.name, statement);
  }
  return { ast, bindings };
}

// Only data expressions are evaluated; Factory's bundled code is never executed.
export function evaluate(node, bindings) {
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier': return evaluate(bindings.get(node.name), bindings);
    case 'TemplateLiteral':
      if (node.expressions.length) throw new Error('Translation contains an executable template');
      return node.quasis[0].value.cooked;
    case 'ArrayExpression': return node.elements.map(item => evaluate(item, bindings));
    case 'UnaryExpression':
      if (node.operator === '!') return !evaluate(node.argument, bindings);
      if (node.operator === '-') return -evaluate(node.argument, bindings);
      break;
    case 'ObjectExpression': {
      const value = {};
      for (const property of node.properties) {
        if (property.type === 'SpreadElement') Object.assign(value, evaluate(property.argument, bindings));
        else value[property.key.name ?? property.key.value] = evaluate(property.value, bindings);
      }
      return value;
    }
    case 'CallExpression':
      if (node.callee.type === 'MemberExpression' && node.callee.object.name === 'Object' && node.callee.property.name === 'assign') {
        return Object.assign({}, ...node.arguments.map(item => evaluate(item, bindings)));
      }
      // Recognize the namespace wrapper by its JSON-file data, independent of minified names.
      if (node.callee.type === 'Identifier' && bindings.get(node.callee.name)?.type === 'FunctionDeclaration' && node.arguments.length === 1) {
        const files = evaluate(node.arguments[0], bindings);
        if (Object.keys(files).some(key => /^\.\/.*\.json$/.test(key))) {
          return Object.fromEntries(Object.entries(files).map(([key, value]) => [path.basename(key, '.json'), value]));
        }
      }
      break;
  }
  throw new Error(`Unsupported translation expression: ${node.type}`);
}

export function flatten(value, prefix = '', result = {}) {
  for (const [key, item] of Object.entries(value)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') result[id] = item;
    else if (item && typeof item === 'object') flatten(item, id, result);
    else throw new Error(`Non-string translation at ${id}`);
  }
  return result;
}

export function inflateLike(source, translations, prefix = '') {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => {
    const id = prefix ? `${prefix}.${key}` : key;
    return [key, typeof value === 'string' ? (translations[id] ?? value) : inflateLike(value, translations, id)];
  }));
}

export function extractEnglish(archive) {
  return analyzeArchive(archive).english;
}

export function analyzeArchive(archive) {
  const info = JSON.parse(readArchive(archive, 'package.json'));
  const candidates = { renderer: [], native: [] };
  for (const filename of asar.listPackage(archive)) {
    const entry = filename.replace(/^[/\\]+/, '').replaceAll('\\', '/');
    if (!entry.endsWith('.js')) continue;
    const kind = entry.startsWith('.vite/renderer/') ? 'renderer' : entry.startsWith('.vite/build/') ? 'native' : null;
    if (!kind) continue;
    const source = readArchive(archive, entry);
    if (!source.includes('i18next:') || !source.includes('ChineseSimplified')) continue;
    candidates[kind].push(analyzeBundle(source, entry, kind));
  }
  const renderer = only(candidates.renderer, '桌面界面语言模块');
  const native = only(candidates.native, '原生菜单语言模块');
  return { version: info.version, renderer, native, english: { ...renderer.english, ...native.english } };
}

function analyzeBundle(source, entry, kind) {
  const { ast, bindings } = parseBundle(source);
  const localeList = only([...bindings.values()].filter(node => node?.type === 'ArrayExpression'
    && ['English', 'Japanese', 'French'].every(name => node.elements.some(item => item?.type === 'MemberExpression' && item.property.name === name))), `${entry} 的可选语言列表`);
  const enumName = localeList.elements.find(item => item.type === 'MemberExpression' && item.property.name === 'English').object.name;
  const init = only([...walk(ast)].filter(node => node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
    && node.callee.property.name === 'init' && node.arguments[0]?.type === 'ObjectExpression'
    && ['resources', 'lng', 'fallbackLng', 'interpolation'].every(name => property(node.arguments[0], name))), `${entry} 的 i18next 初始化`);
  const resourceMap = resolve(property(init.arguments[0], 'resources').value, bindings);
  const englishProperty = only(resourceMap.properties.filter(item => {
    const key = resolve(item.key, bindings);
    return key?.type === 'MemberExpression' && key.property.name === 'English';
  }), `${entry} 的英文资源`);
  const english = evaluate(englishProperty.value, bindings);
  const targetMap = kind === 'native' ? resourceMap : only([...bindings.values()].filter(node => node?.type === 'ObjectExpression'
    && node.properties.some(item => item.key?.type === 'MemberExpression' && item.key.object.name === enumName
      && item.key.property.name === 'Japanese' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(item.value.type))), `${entry} 的语言资源加载器`);
  return { entry, source, english, enumName, localeList, targetMap };
}

export function patchLanguageModule(module, chineseValue) {
  const edits = [];
  if (!module.localeList.elements.some(item => item.type === 'MemberExpression' && item.property.name === 'ChineseSimplified')) {
    edits.push({ start: module.localeList.start + 1, end: module.localeList.start + 1, value: `${module.enumName}.ChineseSimplified,` });
  }
  const existing = module.targetMap.properties.find(item => item.key?.type === 'MemberExpression' && item.key.property.name === 'ChineseSimplified');
  if (existing) edits.push({ start: existing.value.start, end: existing.value.end, value: chineseValue });
  else edits.push({ start: module.targetMap.start + 1, end: module.targetMap.start + 1, value: `[${module.enumName}.ChineseSimplified]:${chineseValue},` });
  let source = module.source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}

function property(node, name) { return node.properties.find(item => (item.key?.name ?? item.key?.value) === name); }
function resolve(node, bindings) { return node?.type === 'Identifier' ? resolve(bindings.get(node.name), bindings) : node; }
function only(values, description) {
  if (values.length !== 1) throw new Error(`无法唯一识别${description}（找到 ${values.length} 处）。需要适配语言接入结构。`);
  return values[0];
}
function* walk(node) {
  if (!node || typeof node.type !== 'string') return;
  yield node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) yield* walk(child); }
    else if (value && typeof value === 'object') yield* walk(value);
  }
}

export async function defaultAppDirectory() {
  const installDir = path.join(process.env.LOCALAPPDATA, 'Factory');
  const versions = (await fs.readdir(installDir)).filter(name => /^app-\d+\.\d+\.\d+$/.test(name));
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!versions.length) throw new Error('未找到 Factory。可以用 --app-dir 指定 app-版本 目录。');
  return path.join(installDir, versions[0]);
}

export async function defaultArchive() {
  return path.join(await defaultAppDirectory(), 'resources', 'app.asar');
}

async function main() {
  const archive = process.argv[2] ?? await defaultArchive();
  const resources = extractEnglish(archive);
  const flat = flatten(resources);
  const destination = path.join(root, 'work');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'english.json'), JSON.stringify(resources, null, 2) + '\n');
  await fs.writeFile(path.join(destination, 'source.json'), JSON.stringify(flat, null, 2) + '\n');
  const namespaces = Object.fromEntries(Object.keys(resources).map(key => [key, Object.keys(flat).filter(id => id.startsWith(`${key}.`)).length]));
  console.log(JSON.stringify({ version: JSON.parse(readArchive(archive, 'package.json')).version, strings: Object.keys(flat).length, characters: Object.values(flat).join('').length, namespaces }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
