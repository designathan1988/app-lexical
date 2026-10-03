/**
 * Falhas conhecidas do conjunto morfossintático (F1.5) contra o front-end
 * legado, na data de escrita (ver `src/eval/data/CHANGES.md`).
 *
 * O oráculo só encolhe: caso que passe precisa sair desta lista; falha nova,
 * que não esteja aqui, quebra a suíte. Nunca se ajusta o esperado do dataset
 * para "fazer passar".
 */
export const KNOWN_MORPH_FAILURES = new Set([
    'morph-09',
  'morph-20', 'morph-21', 'morph-22', 'morph-23',
  'morph-24', 'morph-25', 'morph-26', 'morph-27', 'morph-31', 'morph-33',
  'morph-34', 'morph-36', 'morph-40'
]);
// Consertados na F2 (diminutivos produtivos): morph-15, morph-16, morph-17.
// Consertados na F3.3.B (contrações, ênclise e referência de grupo):
// morph-11, morph-12, morph-13, morph-14.
// Consertados na F3 (concordância de adjetivo com coordenação/adjunção):
// morph-02, morph-03, morph-05, morph-06.
// Consertados na F3 (definido plural = ALL; ambiguidade sem passos no plano;
// B4 direção espacial): morph-07, morph-08, morph-35.

/** Falhas que não estão na lista de conhecidas. */
export function unexpectedFailures(ids: string[]): string[] {
  return ids.filter((id) => !KNOWN_MORPH_FAILURES.has(id));
}

/** Falhas conhecidas que passaram — precisam sair da lista. */
export function fixedKnownFailures(ids: string[]): string[] {
  return [...KNOWN_MORPH_FAILURES].filter((id) => !ids.includes(id));
}
