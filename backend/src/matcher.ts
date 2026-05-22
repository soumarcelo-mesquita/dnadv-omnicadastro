/**
 * Name Normalization and Matching Engine
 * Handles abbreviation matching, fuzzy matching, and sequence alignment.
 */

// Portuguese prepositions to discard in name tokens
const PREPOSITIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Normalizes a name string by converting to lowercase, removing accents/diacritics,
 * removing non-alphabetic characters, and filtering out Portuguese prepositions.
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')     // remove special characters
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .trim();
}

/**
 * Split normalized name into tokens, filtering out Portuguese prepositions.
 */
export function getTokens(normalizedName: string): string[] {
  return normalizedName
    .split(' ')
    .filter(token => token.length > 0 && !PREPOSITIONS.has(token));
}

/**
 * Computes the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j, val;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 1; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      val = a[i - 1] === b[j - 1] ? 0 : 1;
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + val
      );
    }
  }
  return tmp[a.length][b.length];
}

export interface MatchResult {
  isMatch: boolean;
  score: number; // 0 to 1
  explanation: {
    queryToken: string;
    targetToken: string;
    type: 'exact' | 'abbreviation' | 'fuzzy' | 'none';
  }[];
}

/**
 * Evaluates the best ordered alignment of query tokens inside target tokens.
 * Uses recursive backtracking with memoization for fast matching.
 */
export function matchTokens(queryTokens: string[], targetTokens: string[]): MatchResult {
  if (queryTokens.length === 0 || targetTokens.length === 0) {
    return { isMatch: false, score: 0, explanation: [] };
  }

  const memo: { [key: string]: MatchResult } = {};

  function align(qIdx: number, tIdx: number): MatchResult {
    const key = `${qIdx},${tIdx}`;
    if (key in memo) return memo[key];

    // Base case: all query tokens matched
    if (qIdx === queryTokens.length) {
      // Small penalty for unmatched middle names in target (omitted names in query)
      const unmatchedTargetCount = targetTokens.length - tIdx;
      const penalty = unmatchedTargetCount * 0.02;
      return {
        isMatch: true,
        score: Math.max(0.1, 1 - penalty),
        explanation: []
      };
    }

    // Base case: ran out of target tokens but still have query tokens
    if (tIdx === targetTokens.length) {
      return { isMatch: false, score: 0, explanation: [] };
    }

    let bestResult: MatchResult = { isMatch: false, score: 0, explanation: [] };

    // Option 1: Try to match queryTokens[qIdx] with targetTokens[tIdx]
    const qToken = queryTokens[qIdx];
    const tToken = targetTokens[tIdx];
    
    let matchType: 'exact' | 'abbreviation' | 'fuzzy' | 'none' = 'none';
    let tokenScore = 0;

    if (qToken === tToken) {
      matchType = 'exact';
      tokenScore = 1.0;
    } else if (qToken.length === 1 && tToken.startsWith(qToken)) {
      matchType = 'abbreviation';
      tokenScore = 0.95;
    } else if (qToken.length > 5 && levenshteinDistance(qToken, tToken) === 1) {
      // Tolerate exactly 1 typo for words with length > 5
      matchType = 'fuzzy';
      tokenScore = 0.8;
    }

    if (matchType !== 'none') {
      const nextMatch = align(qIdx + 1, tIdx + 1);
      if (nextMatch.isMatch) {
        // Combined score is the average score of all query tokens, adjusted for target penalties
        const totalScore = (tokenScore + nextMatch.score * (queryTokens.length - qIdx - 1)) / (queryTokens.length - qIdx);
        const explanation = [
          { queryToken: qToken, targetToken: tToken, type: matchType },
          ...nextMatch.explanation
        ];
        
        bestResult = { isMatch: true, score: totalScore, explanation };
      }
    }

    // Option 2: Skip the current target token (middle name omission in query)
    // We only allow skipping if it's not the first query token (first name must match)
    // and we don't skip the last target token if we still have query tokens
    if (qIdx > 0) {
      const skipResult = align(qIdx, tIdx + 1);
      if (skipResult.isMatch && skipResult.score > bestResult.score) {
        bestResult = skipResult;
      }
    }

    memo[key] = bestResult;
    return bestResult;
  }

  const result = align(0, 0);
  
  // Make sure first query token and first target token align reasonably (first name matching)
  // And the overall match is high enough
  const isMatch = result.isMatch && result.score > 0.6;
  
  return {
    isMatch,
    score: isMatch ? parseFloat(result.score.toFixed(3)) : 0,
    explanation: isMatch ? result.explanation : []
  };
}

/**
 * Pre-filters search query tokens for Postgres Full Text Search (FTS) syntax.
 * Example: 'Marcelo M dos Santos' -> 'marcelo & santos'
 */
export function buildFtsQuery(queryText: string): string {
  const normalized = normalizeName(queryText);
  const tokens = getTokens(normalized);
  
  // Only use non-abbreviated tokens of length > 1 for FTS to avoid matching everything on "M"
  const ftsTokens = tokens.filter(t => t.length > 1);
  
  if (ftsTokens.length === 0) {
    // If all are abbreviations, use them as starts-with filters
    return tokens.map(t => `${t}:*`).join(' & ');
  }
  
  // Join with AND operator
  return ftsTokens.join(' & ');
}
