import type { ConceptId, LexemeId, Morphology, PartOfSpeech } from '../types';
import type { RawToken } from '../lexical/RawLexer';
import type { Span } from '../diagnostics';

/** Conceito sentinela para lexemas sem sentido ontológico (pronomes, conjunções). */
export const GRAMMATICAL_CONCEPT = '';

export interface ConceptCandidate {
  /**
   * Conceito associado ao sentido. É `GRAMMATICAL_CONCEPT` (`''`) para lexemas
   * puramente gramaticais, que têm classe e morfologia mas não significado
   * ontológico.
   */
  conceptId: ConceptId;
  lexemeId?: LexemeId;
  score: number;
  source: 'EXACT' | 'PHONETIC' | 'APPROXIMATE' | 'MULTIWORD' | 'LITERAL';
  /** Morfologia herdada da SurfaceForm que originou o candidato. */
  morphology?: Morphology;
  /** Classe gramatical do lexema que originou o candidato. */
  pos?: PartOfSpeech;
  /** Componentes do score, quando a resolução foi aproximada. */
  components?: {
    similarity: number;
    phonetic: number;
    morphology: number;
    context: number;
  };
  /** Forma registrada que casou (pode diferir da superfície de entrada). */
  matchedForm?: string;
}

export type SemanticLiteral =
  | { kind: 'TEXT'; value: string }
  | { kind: 'SIZE'; value: number; unit: string }
  | { kind: 'NUMBER'; value: number }
  | { kind: 'COLOR'; value: string };

export interface SemanticToken {
  rawTokens: RawToken[];
  candidates: ConceptCandidate[];
  literal?: SemanticLiteral;
  /** Span na entrada original. */
  span: Span;
}
