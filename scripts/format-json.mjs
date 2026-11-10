// Writes a season file in the same style it is hand-edited in: short objects and lists on one
// line, longer ones spread out. This keeps the commits made by the GitHub Action small.

const inline = (v) => {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
};

function pretty(v, level) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const one = inline(v);
  const flatList = Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
  if (flatList || Object.keys(v).length === 0 || (level >= 3 && one.length <= 100)) return one;
  const pad = '  '.repeat(level + 1);
  const end = '  '.repeat(level);
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + pretty(x, level + 1)).join(',\n')}\n${end}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pretty(x, level + 1)}`).join(',\n')}\n${end}}`;
}

export const formatSeason = (season) => `${pretty(season, 0)}\n`;
