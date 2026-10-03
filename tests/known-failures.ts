/**
 * Falhas conhecidas do conjunto morfossintático (F1.5) contra o front-end
 * legado, na data de escrita (ver `src/eval/data/CHANGES.md`).
 *
 * O oráculo só encolhe: caso que passe precisa sair desta lista; falha nova,
 * que não esteja aqui, quebra a suíte. Nunca se ajusta o esperado do dataset
 * para "fazer passar".
 */
export const KNOWN_MORPH_FAILURES = new Set<string>([]);
// Histórico: F2 consertou morph-15/16/17 (diminutivos); F3.3.B, morph-11..14
// (ênclise); F3, morph-02/03/05/06 (concordância), morph-07/08/35 (definido
// plural, ambiguidade sem passos, direção), morph-20..23 (pedido indireto),
// morph-24/36/40 (modo-tempo, comparativo, cor composta), morph-25/31 (alvo
// com filtro); F4/B5, morph-33/34 (grupo de texto); PP topicalizado e MWE por
// lema, morph-09/26/27. Todas as 40 passam — o conjunto é mantido como
// oráculo ativo no dataset, sem falhas conhecidas.

/** Falhas que não estão na lista de conhecidas. */
export function unexpectedFailures(ids: string[]): string[] {
  return ids.filter((id) => !KNOWN_MORPH_FAILURES.has(id));
}

/** Falhas conhecidas que passaram — precisam sair da lista. */
export function fixedKnownFailures(ids: string[]): string[] {
  return [...KNOWN_MORPH_FAILURES].filter((id) => !ids.includes(id));
}
