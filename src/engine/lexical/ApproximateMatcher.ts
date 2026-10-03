/**
 * Recuperação aproximada por ÍNDICE (§D4).
 *
 * O dicionário nunca é varrido por comando: as formas candidatas são obtidas
 * por um índice de deleções no estilo SymSpell (deletes de distância 1) mais o
 * balde fonético. O custo é O(1) amortizado em relação ao tamanho do léxico.
 *
 * Referências consultadas:
 *  - SymSpell (Garvie, 2012): índice de deleções para busca por distância de
 *    edição sem varredura. https://github.com/wolfgarbe/SymSpell
 *  - Damerau–Levenshtein (Damerau 1964; Levenshtein 1966): distância com
 *    transposição adjacente. https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
 *  - BK-tree (Burkhard & Keller, 1973): índice métrico alternativo.
 *    https://en.wikipedia.org/wiki/BK-tree
 */

/** Distância de Damerau–Levenshtein (com transposição adjacente). */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const maxDist = a.length + b.length;
  const da = new Map<string, number>();
  const d: number[][] = Array.from({ length: a.length + 2 }, () =>
    new Array<number>(b.length + 2).fill(0)
  );

  d[0][0] = maxDist;
  for (let i = 0; i <= a.length; i++) {
    d[i + 1][0] = maxDist;
    d[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j + 1] = maxDist;
    d[1][j + 1] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    let db = 0;
    for (let j = 1; j <= b.length; j++) {
      const i1 = da.get(b[j - 1]) ?? 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        db = j;
      }
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,
        d[i + 1][j] + 1,
        d[i][j + 1] + 1,
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
      );
    }
    da.set(a[i - 1], i);
  }

  return d[a.length + 1][b.length + 1];
}

/** Similaridade normalizada em [0,1]. */
export function normalizedSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / longest;
}

function deletionsOf(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    out.push(word.slice(0, i) + word.slice(i + 1));
  }
  return out;
}

export interface ApproximateCandidate {
  /** Chave do verbete no índice (forma normalizada). */
  key: string;
  distance: number;
  similarity: number;
  phoneticMatch: boolean;
}

/**
 * Índice de recuperação aproximada.
 *
 * `maxDistance` limita a distância de edição considerada na GERAÇÃO.
 * A decisão (aceitar/rejeitar) é da camada de política, não do índice.
 */
export class ApproximateIndex {
  private deletes = new Map<string, Set<string>>();
  private phonetics = new Map<string, Set<string>>();
  private seen = new Set<string>();
  private count = 0;

  constructor(
    entries: Array<{ key: string; phoneticKey: string }>,
    private maxDistance = 2
  ) {
    for (const entry of entries) {
      this.insert(entry.key, entry.phoneticKey);
    }
  }

  private insert(key: string, phoneticKey: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.count++;

    for (const del of deletionsOf(key)) {
      let bucket = this.deletes.get(del);
      if (!bucket) {
        bucket = new Set<string>();
        this.deletes.set(del, bucket);
      }
      bucket.add(key);
    }

    let ph = this.phonetics.get(phoneticKey);
    if (!ph) {
      ph = new Set<string>();
      this.phonetics.set(phoneticKey, ph);
    }
    ph.add(key);
  }

  get size(): number {
    return this.count;
  }

  /**
   * Gera candidatos aproximados para `word`. NUNCA decide: apenas devolve
   * candidatos com distância e similaridade, ordenados por semelhança.
   */
  candidates(word: string, phoneticKey: string, limit = 8): ApproximateCandidate[] {
    const seen = new Map<string, number>();

    const consider = (key: string): void => {
      if (key === word) return;
      const lengthDiff = Math.abs(key.length - word.length);
      if (lengthDiff > this.maxDistance) return;
      const distance = damerauLevenshtein(word, key);
      if (distance > this.maxDistance) return;
      const previous = seen.get(key);
      if (previous === undefined || distance < previous) seen.set(key, distance);
    };

    for (const key of this.deletes.get(word) ?? []) consider(key);
    for (const del of deletionsOf(word)) {
      for (const key of this.deletes.get(del) ?? []) consider(key);
    }
    for (const key of this.phonetics.get(phoneticKey) ?? []) consider(key);

    const out: ApproximateCandidate[] = [];
    for (const [key, distance] of seen) {
      out.push({
        key,
        distance,
        similarity: normalizedSimilarity(word, key),
        phoneticMatch: (this.phonetics.get(phoneticKey) ?? new Set()).has(key)
      });
    }

    out.sort((a, b) => a.distance - b.distance || b.similarity - a.similarity);
    return out.slice(0, limit);
  }
}
