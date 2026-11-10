export function protectedTokens(text) {
  const tokens = text.match(/```[\s\S]*?```|`[^`\n]+`|\{\{[\s\S]*?\}\}|\$t\([^)]*\)|<\/?(?:[A-Za-z][^>]*|\d+)>|https?:\/\/[^\s<>"')\]，。；：！？]+|(?<!\{)\{[A-Za-z_][\w.]*\}(?!\})/g) ?? [];
  return tokens.map(token => token.startsWith('http') ? token.replace(/[.,:;!?]+$/, '') : token).sort();
}

export function validateTranslations(source, translations) {
  const issues = [];
  for (const [key, original] of Object.entries(source)) {
    const value = translations[key];
    if (typeof value !== 'string' || !value.trim()) issues.push(`${key}: missing translation`);
    else if (JSON.stringify(Array.isArray(original) ? original : protectedTokens(original)) !== JSON.stringify(protectedTokens(value))) issues.push(`${key}: protected token mismatch`);
  }
  for (const key of Object.keys(translations)) if (!(key in source)) issues.push(`${key}: unknown key`);
  return issues;
}
