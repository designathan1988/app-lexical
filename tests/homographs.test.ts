import { describe, it, expect } from 'vitest';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { LexicalIndex } from '../src/engine/lexical/LexicalIndex';

/**
 * F2.4 — Homógrafos: a construção do índice lista as formas compartilhadas
 * por lexemas diferentes ou por células diferentes. A desambiguação é da
 * camada de análise (Fase 3), nunca do índice.
 */
describe('F2.4 — homógrafos do léxico', () => {
  const kb = createInitialKnowledgeBase();
  const index = new LexicalIndex(kb.surfaceForms, kb.lexemes);
  const homographs = index.homographs();
  const bySurface = new Map(homographs.map((h) => [h.surface, h]));

  it('"texto" é entidade e propriedade (dois lexemas)', () => {
    const entry = bySurface.get('texto');
    expect(entry, 'texto deve ser homógrafo').toBeDefined();
    const lexemes = new Set(entry!.readings.map((r) => r.lexemeId));
    expect(lexemes.has('LEX_TEXTO')).toBe(true);
    expect(lexemes.has('LEX_CONTEUDO')).toBe(true);
  });

  it('"cria" é indicativo 3sg e imperativo 2sg (mesmo lexema, células distintas)', () => {
    const entry = bySurface.get('cria');
    expect(entry).toBeDefined();
    const features = entry!.readings
      .filter((r) => r.lexemeId === 'LEX_CRIAR')
      .map((r) => r.features);
    expect(features).toContain('Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres');
    expect(features).toContain('Number=Sing|Person=2|Mood=Imp|VerbForm=Fin');
  });

  it('"crie" é imperativo 3sg e subjuntivo 1sg/3sg', () => {
    const entry = bySurface.get('crie');
    expect(entry).toBeDefined();
    const features = entry!.readings
      .filter((r) => r.lexemeId === 'LEX_CRIAR')
      .map((r) => r.features);
    expect(features).toContain('Number=Sing|Person=3|Mood=Imp|VerbForm=Fin');
    expect(features).toContain('Number=Sing|Person=1|Mood=Sub|VerbForm=Fin|Tense=Pres');
    expect(features).toContain('Number=Sing|Person=3|Mood=Sub|VerbForm=Fin|Tense=Pres');
  });

  it('"move" é indicativo 3sg e imperativo 2sg', () => {
    const entry = bySurface.get('move');
    expect(entry).toBeDefined();
    const features = entry!.readings
      .filter((r) => r.lexemeId === 'LEX_MOVER')
      .map((r) => r.features);
    expect(features).toContain('Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres');
    expect(features).toContain('Number=Sing|Person=2|Mood=Imp|VerbForm=Fin');
  });

  it('formas com uma só leitura NÃO aparecem', () => {
    expect(bySurface.has('caixa')).toBe(false);
    expect(bySurface.has('botão')).toBe(false);
  });

  it('a lista é determinística e completa', () => {
    const again = new LexicalIndex(kb.surfaceForms, kb.lexemes).homographs();
    expect(again).toEqual(homographs);
    expect(homographs.length).toBeGreaterThan(50);
  });
});
