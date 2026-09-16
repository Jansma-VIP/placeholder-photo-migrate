function escapeRegex(character) {
  return /[|\\{}()[\]^$+?.]/.test(character) ? `\\${character}` : character;
}

function globSource(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(character);
    }
  }
  return source;
}

function compileLine(rawLine) {
  let line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;

  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  }
  if (!line) return null;

  const anchored = line.startsWith('/');
  if (anchored) line = line.slice(1);
  const directoryOnly = line.endsWith('/');
  if (directoryOnly) line = line.slice(0, -1);
  const containsSlash = line.includes('/');
  const prefix = anchored || containsSlash ? '^' : '(?:^|.*/)';
  const suffix = directoryOnly ? '(?:/.*)?$' : '(?:$|/.*$)';

  return { negated, regex: new RegExp(`${prefix}${globSource(line)}${suffix}`) };
}

export function createGitIgnoreMatcher(contents = '') {
  const rules = contents.split(/\r?\n/).map(compileLine).filter(Boolean);
  return (relativePath) => {
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
    let ignored = false;
    for (const rule of rules) {
      if (rule.regex.test(normalized)) ignored = !rule.negated;
    }
    return ignored;
  };
}
