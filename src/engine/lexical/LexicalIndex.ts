import { RawLexer } from './RawLexer';
import { PortuguesePhonetic } from './PortuguesePhonetic';
import { ApproximateIndex, normalizedSimilarity } from './ApproximateMatcher';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../EngineSettings';
import type { SurfaceForm, Lexeme, LexemeId, Morphology } from '../types';

export type CandidateSource = 'EXACT' | 'PHONETIC' | 'APPROXIMATE';

export interface SurfaceCandidate {
  surfaceForm: SurfaceForm;
  lexeme: Lexeme;
  source: CandidateSource;
  score: number;
  /** Componentes do score, para depuração e para o trace. */
  components: {
    similarity: number;
    phonetic: number;
    morphology: number;
    context: number;
  };
  morphology?: Morphology;
  /** Forma escrita registrada que casou (pode diferir da entrada). */
  matchedForm: string;
}

function exactScore(formType: SurfaceForm['formType']): number {
  switch (formType) {
    case 'CANONICAL':
      return 1;
    case 'INFLECTION':
      return 0.99;
    case 'ABBREVIATION':
      return 0.97;
    case 'COLLOQUIAL':
      return 0.96;
    case 'MISSPELLING':
      return 0.95;
  }
}

/**
 * Índices lexicais: exato, fonético e aproximado (por deleções).
 *
 * O lookup exato é hash O(1). A recuperação aproximada usa índice — nunca
 * varre o dicionário por comando — e devolve CANDIDATOS com score decomposto.
 * A decisão de aceitar é da camada de política.
 */
export class LexicalIndex {
  private exact = new Map<string, SurfaceForm[]>();
  private approximate: ApproximateIndex;

  constructor(
    private surfaceForms: SurfaceForm[],
    private lexemes: Record<LexemeId, Lexeme>,
    private settings: EngineSettings = DEFAULT_ENGINE_SETTINGS
  ) {
    this.build();

    const entries = this.surfaceForms.map((sf) => ({
      key: RawLexer.normalize(sf.rawText),
      phoneticKey: PortuguesePhonetic.key(sf.rawText)
    }));
    this.approximate = new ApproximateIndex(entries, settings.approximateMaxDistance);
  }

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
  }

  private build(): void {
    for (const surface of this.surfaceForms) {
      const normalized = RawLexer.normalize(surface.rawText);
      const bucket = this.exact.get(normalized) ?? [];
      bucket.push(surface);
      this.exact.set(normalized, bucket);
    }
  }

  /** Formas registradas exatamente para a palavra (normalizada). */
  exactForms(raw: string): SurfaceForm[] {
    return this.exact.get(RawLexer.normalize(raw)) ?? [];
  }

  /** Candidatos exatos (formas registradas). */
  resolve(raw: string): SurfaceCandidate[] {
    return this.exactForms(raw)
      .map((surface) => this.toCandidate(surface, raw, 'EXACT', exactScore(surface.formType)))
      .filter((c) => c.lexeme);
  }

  /**
   * Candidatos aproximados, com score decomposto. Nunca decide.
   * `expectedCategories` e `contextHint` entram apenas como features de score.
   */
  approximateCandidates(
    raw: string,
    contextHint?: { lexicalSimilarityBonus?: number }
  ): SurfaceCandidate[] {
    if (!this.settings.approximateEnabled) return [];

    const normalized = RawLexer.normalize(raw);
    const phoneticKey = PortuguesePhonetic.key(raw);
    const rawCandidates = this.approximate.candidates(
      normalized,
      phoneticKey,
      this.settings.approximateMaxCandidates
    );

    const out: SurfaceCandidate[] = [];
    for (const candidate of rawCandidates) {
      for (const surface of this.exact.get(candidate.key) ?? []) {
        const lexeme = this.lexemes[surface.lexemeId];
        if (!lexeme) continue;

        const similarity = candidate.similarity;
        const phonetic = candidate.phoneticMatch ? 1 : 0;
        const context = contextHint?.lexicalSimilarityBonus ?? 0;

        // Score composto: a similaridade de superfície domina; a fonética
        // confirma; o contexto apenas desempata.
        const score = similarity * 0.7 + phonetic * 0.2 + context * 0.1;

        out.push({
          surfaceForm: surface,
          lexeme,
          source: phonetic ? 'PHONETIC' : 'APPROXIMATE',
          score,
          components: { similarity, phonetic, morphology: 0, context },
          morphology: surface.morphology,
          matchedForm: surface.rawText
        });
      }
    }

    // dedup por (lexemeId, matchedForm) mantendo o maior score
    const best = new Map<string, SurfaceCandidate>();
    for (const candidate of out) {
      const key = `${candidate.lexeme.id}|${candidate.matchedForm}`;
      const current = best.get(key);
      if (!current || candidate.score > current.score) best.set(key, candidate);
    }

    return Array.from(best.values()).sort((a, b) => b.score - a.score);
  }

  private toCandidate(
    surface: SurfaceForm,
    raw: string,
    source: CandidateSource,
    score: number
  ): SurfaceCandidate {
    return {
      surfaceForm: surface,
      lexeme: this.lexemes[surface.lexemeId],
      source,
      score,
      components: {
        similarity: normalizedSimilarity(RawLexer.normalize(raw), RawLexer.normalize(surface.rawText)),
        phonetic: 1,
        morphology: 0,
        context: 0
      },
      morphology: surface.morphology,
      matchedForm: surface.rawText
    };
  }

  get approximateIndexSize(): number {
    return this.approximate.size;
  }
}
