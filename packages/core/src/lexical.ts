/**
 * Lexical ranking for the non-vector retrieval path.
 *
 * WHY THIS EXISTS. Without an EmbeddingProvider the layers used to discard the query
 * entirely and return the most recent rows with `score: 0`. Measured on 2026-09-26
 * against `npx -y @zensation/mcp` with three unrelated facts stored: the query
 * "Leuchtturm" and the query "Backrezept mit Speck" both returned all three rows, every
 * score 0 — the literal keyword match was not preferred over anything. That is the
 * default path for every SQLite user, because the vector branch is pgvector-only.
 *
 * This module is the fallback that path was missing. It is deliberately small, pure and
 * dependency-free: the package's whole promise is that installing it pulls nothing else in.
 *
 * WHAT IT IS NOT. This is a lexical heuristic, not semantic search. It cannot match
 * "car" to "automobile". An EmbeddingProvider remains the configuration the published
 * benchmarks were measured with, and the READMEs say so.
 */

/**
 * How the two signals split the [0, 1] range: token coverage can reach COVERAGE_SHARE,
 * and an adjacent-phrase match adds PHRASE_BONUS on top. They sum to exactly 1.
 */
const COVERAGE_SHARE = 0.8;
const PHRASE_BONUS = 0.2;

/** Tokens below this length carry no signal and are dropped. */
const MIN_TOKEN_LENGTH = 2;

/**
 * Closed-class words, German and English. Deliberately short: an aggressive stop list
 * removes signal from a small store, where every token matters.
 */
const STOPWORDS = new Set([
  // German
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'hat', 'haben',
  'von', 'vom', 'zum', 'zur', 'mit', 'auf', 'aus', 'bei', 'für', 'fur', 'nicht', 'auch',
  'als', 'wie', 'was', 'wer', 'wo', 'sich', 'es', 'im', 'in', 'an', 'zu',
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it', 'its',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'how', 'not',
]);

/**
 * Fold a string to a comparable form: lowercase, umlauts and accents removed, ß → ss.
 *
 * The fold matters more than it looks. A fact stored as "Kieler Förde" must be reachable
 * by the query "Kieler Foerde" and vice versa — users type both, and a database LOWER()
 * folds neither. Doing it here, in JS, also keeps the SQL portable across adapters.
 */
export function foldText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Split folded text into content tokens. */
export function tokenize(input: string): string[] {
  return foldText(input)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

export interface LexicalCandidate {
  /** The text the query is matched against. */
  text: string;
}

/**
 * Score candidates against a query. Returns a score in [0, 1] per candidate, in the same
 * order as the input.
 *
 * Rarer tokens weigh more: a token that appears in every candidate separates nothing. The
 * weight is an inverse-document-frequency over the candidate set itself, which needs no
 * corpus statistics and no state.
 *
 * A candidate containing the whole folded query as a substring gets a bonus, so an exact
 * phrase beats a scattered bag of the same words.
 */
export function scoreCandidates(query: string, candidates: LexicalCandidate[]): number[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || candidates.length === 0) {
    return candidates.map(() => 0);
  }

  const candidateTokens = candidates.map(c => new Set(tokenize(c.text)));
  const total = candidates.length;

  const weight = new Map<string, number>();
  for (const token of queryTokens) {
    if (weight.has(token)) continue;
    const df = candidateTokens.reduce((n, set) => n + (set.has(token) ? 1 : 0), 0);
    // +1 in both places keeps the weight finite when a token matches everything or nothing.
    weight.set(token, Math.log(1 + total / (1 + df)));
  }

  const maxWeight = queryTokens.reduce((sum, t) => sum + (weight.get(t) ?? 0), 0);
  if (maxWeight === 0) return candidates.map(() => 0);

  const foldedQuery = foldText(query).trim();

  return candidates.map((candidate, i) => {
    const tokens = candidateTokens[i];
    let matched = 0;
    for (const token of queryTokens) {
      if (tokens.has(token)) matched += weight.get(token) ?? 0;
    }
    if (matched === 0) return 0;
    // Token coverage is capped at COVERAGE_SHARE so the phrase bonus always has room.
    // Clamping the sum at 1 instead would erase the bonus exactly when it matters most:
    // with every query token matched, the score is already at the ceiling and an adjacent
    // phrase can no longer outrank the same words scattered across a sentence. A test
    // caught that on the first run.
    let score = COVERAGE_SHARE * (matched / maxWeight);
    if (foldedQuery.length > 0 && foldText(candidate.text).includes(foldedQuery)) {
      score += PHRASE_BONUS;
    }
    return score;
  });
}

/**
 * Rank items by lexical relevance to the query and keep the best `limit`.
 *
 * Items that match nothing are dropped rather than returned with score 0 — returning the
 * whole store for an unrelated query is the behaviour this module exists to end. When
 * NOTHING matches, the caller decides what to do; this function simply returns an empty
 * array, and every caller in this package falls back to recency so a recall is never empty
 * for a reason the user cannot see.
 */
export function rankByLexicalRelevance<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  limit: number,
): { item: T; score: number }[] {
  const scores = scoreCandidates(query, items.map(i => ({ text: getText(i) })));
  return items
    .map((item, i) => ({ item, score: scores[i] }))
    .filter(entry => entry.score > 0)
    // Stable: equal scores keep the order the storage returned them in, which is recency.
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * How many rows the non-vector path pulls before ranking. Bounded on purpose: this is a
 * fallback, and an unbounded scan would make a large store pay for a missing embedding
 * provider on every single recall.
 */
export const LEXICAL_CANDIDATE_WINDOW = 500;
