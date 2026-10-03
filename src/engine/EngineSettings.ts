/**
 * Parâmetros configuráveis do motor, consumidos pelas camadas de resolução
 * lexical, recuperação aproximada e de referência a instâncias do documento.
 */
export interface EngineSettings {
  /**
   * Similaridade mínima (Damerau–Levenshtein normalizada) para aceitar um
   * candidato aproximado não destrutivo. Palavras curtas precisam ser mais
   * próximas, porque uma edição pesa proporcionalmente mais.
   */
  approximateMinSimilarity: number;
  /** Habilita recuperação aproximada como fallback. */
  approximateEnabled: boolean;
  /** Máximo de candidatos aproximados considerados por token. */
  approximateMaxCandidates: number;
  /** Distância de edição máxima indexada. */
  approximateMaxDistance: number;
  /**
   * Ações destrutivas (DELETE, MOVE) nunca são resolvidas por aproximação:
   * exigem forma cadastrada exata.
   */
  destructiveRequiresExact: boolean;
  /** Emite AMBIGUOUS_REFERENCE quando um seletor singular casa vários nós. */
  ambiguityWarningEnabled: boolean;
  /** Trata AMBIGUOUS_REFERENCE como erro fatal (bloqueia a execução). */
  ambiguityIsFatal: boolean;
  /** Após um comando bem-sucedido, a seleção passa a ser os nós afetados. */
  selectAfterCommand: boolean;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  approximateMinSimilarity: 0.8,
  approximateEnabled: true,
  approximateMaxCandidates: 6,
  approximateMaxDistance: 2,
  destructiveRequiresExact: true,
  ambiguityWarningEnabled: true,
  ambiguityIsFatal: true,
  selectAfterCommand: true
};
