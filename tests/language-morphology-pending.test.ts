import { describe, expect, it } from 'vitest';
import { createDerivationalAnalyzer } from '../src/knowledge/morphology';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import affixes from '../src/knowledge/morphology/affix-rules.json';
import stems from '../src/knowledge/morphology/stem-rules.json';
import seeds from '../src/knowledge/morphology/seed-roots.json';
import { normalizeWord } from '../src/engine/morphology/DerivationalAnalyzer';
import { treeSignature } from '../src/eval/signatures';

const analyzer = createDerivationalAnalyzer(createInitialKnowledgeBase().lexemes);

describe('pendências da morfologia', () => {
  it.each(['botãozinho', 'retomável', 'jardineiros'])(
    'remove cadeias alternativas improváveis de %s', (word) => {
      const readings = analyzer.analyze(word);
      expect(readings.length).toBeGreaterThan(0);
      const best = readings[0];
      for (const reading of readings) {
        expect(reading.score).toBeGreaterThanOrEqual(best.score - 1.5);
        expect(reading.chain.length).toBeLessThan(best.chain.length + 2);
      }
    }
  );

  const latinCases: Array<[string, string]> = [
    ['invisível', 'ver'],
    ['indestrutível', 'destruir'],
    ['descrição', 'escrever'],
    ['reeleição', 'eleger'],
    ['divisível', 'dividir'],
    ['ilegível', 'ler'],
    ['auditivo', 'ouvir'],
    ['visibilidade', 'ver'],
    ['indivisível', 'dividir'],
    ['destrutibilidade', 'destruir']
  ];

  it('as dez derivadas de teste não estão cadastradas como palavras nos dados', () => {
    const data = [affixes, stems, seeds];
    const words = new Set<string>();
    for (const item of data) {
      const serialized = JSON.stringify(item);
      for (const [word] of latinCases) {
        if (serialized.includes(`"derived":"${word}"`) ||
            serialized.includes(`"word":"${word}"`)) words.add(word);
      }
    }
    expect([...words]).toEqual([]);
  });

  it.each(latinCases)('recupera radical latino em %s', (word, root) => {
    const readings = analyzer.analyze(word);
    expect(readings.some((r) => normalizeWord(r.root.lemma) === root), word).toBe(true);
  });

  it('resolve diminutivo de entidade do domínio e avisa', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const result = engine.execute('crie um botãozinho azul');
    expect(result.success).toBe(true);
    expect(result.compile.diagnostics.some((d) => d.code === 'DERIVED_MATCH' && d.severity === 'WARNING')).toBe(true);
    expect(treeSignature(engine.store.document, engine.knowledgeBase.concepts)).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');
  });

  it('não resolve derivação de ação destrutiva', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const result = engine.execute('apaguezinho');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.some((d) => d.severity === 'ERROR')).toBe(true);
  });
});
