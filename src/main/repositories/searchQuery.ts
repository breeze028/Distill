const cjkPattern = /\p{Script=Han}{2,}/gu;

const cjkStopTerms = new Set([
  '这个',
  '那个',
  '什么',
  '有没有',
  '没有',
  '是否',
  '之前',
  '以前',
  '最近',
  '提过',
  '写过',
  '说过',
  '哪些',
  '一下',
  '关于'
]);

export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(' OR ');
}

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (part) => `\\${part}`);
}

export function toLikePatterns(query: string, maxPatterns = 12): string[] {
  const trimmed = query.trim();
  const terms = [trimmed, ...searchTerms(trimmed)]
    .filter((term) => term.length > 0)
    .filter((term) => !cjkStopTerms.has(term));

  return [...new Set(terms)]
    .slice(0, maxPatterns)
    .map((term) => `%${escapeLike(term)}%`);
}

export function matchesSearchQuery(text: string, query: string): boolean {
  return searchScore(text, query) > 0;
}

export function searchScore(text: string, query: string): number {
  const normalizedText = normalizeForSearch(text);
  const trimmed = normalizeForSearch(query);
  if (!normalizedText || !trimmed) {
    return 0;
  }

  let score = normalizedText.includes(trimmed) ? trimmed.length * 4 : 0;
  for (const term of searchTerms(query)) {
    if (normalizedText.includes(term) && !cjkStopTerms.has(term)) {
      score += term.length;
    }
  }
  return score;
}

export function searchTerms(query: string): string[] {
  const normalized = normalizeForSearch(query).replace(/[^\p{Letter}\p{Number}]+/gu, ' ');
  const naturalQuery = isNaturalLanguageQuery(query);
  const terms = normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const cjkChunks = normalizeForSearch(query).match(cjkPattern) ?? [];
  for (const chunk of cjkChunks) {
    if (!naturalQuery) {
      terms.push(chunk);
      continue;
    }

    if (chunk.length <= 12) {
      terms.push(chunk);
    }
    for (let index = 0; index < chunk.length - 1; index += 1) {
      terms.push(chunk.slice(index, index + 2));
    }
  }

  return [...new Set(terms)].sort((left, right) => right.length - left.length);
}

function normalizeForSearch(text: string): string {
  return text.trim().toLocaleLowerCase();
}

function isNaturalLanguageQuery(query: string): boolean {
  const normalized = normalizeForSearch(query);
  return /[?？吗呢嘛]/u.test(normalized) || [...cjkStopTerms].some((term) => normalized.includes(term));
}
