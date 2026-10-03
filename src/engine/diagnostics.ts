export type DiagnosticSeverity = 'INFO' | 'WARNING' | 'ERROR';

/** Trecho da entrada que originou o diagnóstico. */
export interface Span {
  start: number;
  end: number;
}

export function spanOf(start: number | undefined, end: number | undefined): Span | undefined {
  if (start === undefined || end === undefined) return undefined;
  return { start, end };
}

export function mergeSpan(a: Span | undefined, b: Span | undefined): Span | undefined {
  if (!a) return b;
  if (!b) return a;
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/**
 * Os nove códigos canônicos exigidos pelo §20 do PROMPT. Subcódigos são
 * permitidos no campo `subcode` (ex.: `INVALID_CONTAINMENT` + `CYCLE`).
 */
export const DIAGNOSTIC_CODES = {
  UNKNOWN_WORD: 'UNKNOWN_WORD',
  AMBIGUOUS_REFERENCE: 'AMBIGUOUS_REFERENCE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  INVALID_PROPERTY: 'INVALID_PROPERTY',
  INVALID_VALUE_CATEGORY: 'INVALID_VALUE_CATEGORY',
  INVALID_CONTAINMENT: 'INVALID_CONTAINMENT',
  UNRESOLVED_PRONOUN: 'UNRESOLVED_PRONOUN',
  AMBIGUOUS_SENSE: 'AMBIGUOUS_SENSE',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION'
} as const;

/**
 * Camadas válidas do pipeline (IV.F). Todo diagnóstico exposto pelo motor
 * declara a camada que o detectou; valores fora desta lista são defeito.
 * Fases 2/3 substituem o front-end legado pelas camadas de morfologia e
 * sintaxe; `lexer`, `segmenter`, `morphology`, `disambiguation`, `mwe` e
 * `semantics` passam a ser emitidas a partir de então.
 */
export const VALID_LAYERS = [
  'lexer',
  'segmenter',
  'morphology',
  'disambiguation',
  'mwe',
  'syntax',
  'semantics',
  'binder',
  'resolver',
  'validator',
  'planner',
  'executor'
] as const;

export type DiagnosticLayer = (typeof VALID_LAYERS)[number];

export type DiagnosticCode =
  | (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES]
  // Códigos adicionais do motor (não exigidos pelo §20, mas estruturados).
  | 'PHONETIC_MATCH'
  | 'UNCONSUMED_INPUT'
  | 'INCOMPLETE_REFERENCE'
  | 'INTERNAL_ERROR'
  | 'NEGATED_ACTION'
  | 'ELLIPSIS_RESOLVED'
  | 'CREATE_REQUIRES_ENTITY'
  | 'UPDATE_REQUIRES_VALUE'
  | 'UNABLE_TO_DETERMINE_COMMAND'
  | 'IMPLICIT_ENTITY_COMMAND'
  | 'SPATIAL_REQUIRES_TARGET'
  | 'UNRESOLVED_PLACEMENT_TARGET'
  | 'MOVE_REFERENCE_NOT_FOUND'
  | 'RUNTIME_MUTATION_FAILED'
  | 'NO_EFFECT'
  | 'ORDER_FALLBACK';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode | string;
  /** Subcódigo específico, quando aplicável. */
  subcode?: string;
  message: string;
  /** Trecho da entrada: offset inicial/final quando disponível. */
  span?: Span;
  /** Compatibilidade: mesmos valores de `span`, em campos separados. */
  start?: number;
  end?: number;
  /** Camada que detectou o problema. */
  layer: string;
  /** Candidatos considerados quando relevante. */
  candidates?: string[];
  /** Scores associados aos candidatos, quando relevante. */
  scores?: number[];
}

/**
 * Normaliza o span de um diagnóstico que sai do motor.
 *
 * Invariante (F1.3): todo diagnóstico exposto tem `0 ≤ start ≤ end ≤
 * input.length`. Diagnósticos sem span (ou com span fora da entrada) recebem
 * o span do comando inteiro — nunca `undefined`.
 */
export function normalizeSpan(diagnostic: Diagnostic, inputLength: number): Diagnostic {
  const { start, end } = diagnostic;
  if (
    typeof start === 'number' &&
    typeof end === 'number' &&
    start >= 0 &&
    end >= start &&
    end <= inputLength
  ) {
    return diagnostic;
  }
  return {
    ...diagnostic,
    span: { start: 0, end: inputLength },
    start: 0,
    end: inputLength
  };
}

export function diagnostic(
  layer: string,
  severity: DiagnosticSeverity,
  code: DiagnosticCode | string,
  message: string,
  span?: Span,
  extra?: Partial<Diagnostic>
): Diagnostic {
  return {
    severity,
    code,
    message,
    span,
    start: span?.start,
    end: span?.end,
    layer,
    ...extra
  };
}

/** Erro interno de parsing: sempre convertido em diagnóstico pelo compilador. */
export class ParseError extends Error {
  readonly code: DiagnosticCode | string;
  readonly span?: Span;
  readonly candidates?: string[];

  constructor(code: string, message: string, span?: Span, candidates?: string[]) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.span = span;
    this.candidates = candidates;
  }
}
