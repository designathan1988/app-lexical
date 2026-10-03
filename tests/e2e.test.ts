import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { REGRESSION_DATASET } from '../src/eval/loader';
import { runDataset } from '../src/eval/runner';
import { runRecord } from '../src/eval/runner';
import { treeSignature } from '../src/eval/signatures';

/**
 * Asserções POR CAMADA para cada um dos 14 casos obrigatórios (§A8):
 * tokens → MWEs → conceitos → AST → referências → plano → mutação → undo/redo.
 * Não basta verificar a árvore final.
 */

const MANDATORY = [
  'crie uma caixa azul com um botão vermelho dentro',
  'crie um botão dentro de uma caixa azul',
  'crie uma caixa e um botão ao lado dela',
  'crie dois botões dentro da caixa',
  'deixe a borda azul',
  'deixe a borda com 2px',
  'crie um botão sem borda',
  'não apague o botão',
  'apague o segundo botão',
  'mude o botão "Entrar" para azul',
  'mude o fundo do segundo botão para azul',
  'coloque o botão depois da caixa',
  'mova o botão de dentro da caixa para depois dela',
  'deixe todos os botões azuis menos o primeiro'
];

describe('E2E por camada — camada lexical (tokens, MWEs, offsets)', () => {
  it('preserva tokens, offsets e normalização', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const result = engine.analyze('crie uma caixa azul com um botão vermelho dentro');
    const raw = result.trace.rawTokens;

    expect(raw.map((t) => t.raw)).toEqual([
      'crie', 'uma', 'caixa', 'azul', 'com', 'um', 'botão', 'vermelho', 'dentro'
    ]);
    // Offsets crescentes e consistentes com a entrada
    for (let i = 1; i < raw.length; i++) {
      expect(raw[i].start).toBeGreaterThan(raw[i - 1].start);
    }
    expect(raw[6].normalized).toBe('botao');
    expect(raw[6].raw).toBe('botão');
  });

  it('reconhece MWE atomicamente', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const result = engine.analyze('crie um botão dentro de uma caixa');
    const mwe = result.trace.semanticTokens.find((t) =>
      t.candidates.some((c) => c.source === 'MULTIWORD')
    );
    expect(mwe).toBeDefined();
    expect(mwe!.rawTokens.map((t) => t.raw)).toEqual(['dentro', 'de']);
    expect(mwe!.span.start).toBe('crie um botão '.length);
  });
});

describe('E2E por camada — AST e plano dos 14 casos', () => {
  it.each(MANDATORY)('«%s» produz AST, plano e classes corretas', (input) => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const record = REGRESSION_DATASET.records.find((r) => r.input === input);
    expect(record, `caso obrigatório ausente no dataset: ${input}`).toBeDefined();

    const result = runRecord(createInitialKnowledgeBase(), record!);
    expect(result.failReasons, `${input}`).toEqual([]);
    expect(result.passed).toBe(true);

    // A AST precisa ser serializável e sem referências circulares.
    const compile = engine.analyze(input);
    expect(() => JSON.stringify(compile.ast)).not.toThrow();

    // Todo nó de comando carrega span dentro da entrada.
    for (const command of compile.ast.commands) {
      if (command.kind === 'NO_OP') continue;
      expect(command.span, `span ausente em ${input}`).toBeDefined();
      expect(command.span!.start).toBeGreaterThanOrEqual(0);
      expect(command.span!.end).toBeLessThanOrEqual(input.length);
    }
  });
});

describe('E2E por camada — mutação final, ordem dos nós, undo/redo', () => {
  it('a mutação final corresponde ao esperado e o undo restaura', () => {
    for (const record of REGRESSION_DATASET.records.filter((r) =>
      MANDATORY.includes(r.input)
    )) {
      const engine = new SemanticEngine(createInitialKnowledgeBase());

      const ids: string[] = [];
      const build = (sn: NonNullable<typeof record.seed>[number], parentId: string | null): void => {
        const id = engine.store.createNode(sn.entityConceptId, sn.text);
        ids.push(id);
        if (parentId) engine.store.place(id, 'CHILD_OF', parentId);
        for (const c of sn.children ?? []) build(c, id);
      };
      for (const s of record.seed ?? []) build(s, null);

      // Comandos de discurso fazem parte do estado inicial esperado.
      for (const pre of record.discourse ?? []) engine.execute(pre);

      if (typeof record.selection === 'number' && ids[record.selection]) {
        engine.store.setSelection([ids[record.selection]]);
      }

      const before = treeSignature(engine.store.document, engine.knowledgeBase.concepts);
      const result = engine.execute(record.input);

      if (record.expected.finalTree !== undefined) {
        expect(
          treeSignature(engine.store.document, engine.knowledgeBase.concepts),
          `mutação final de «${record.input}»`
        ).toBe(record.expected.finalTree);
      }

      if (result.success && result.execution.mutations.length > 0) {
        engine.undo();
        expect(
          treeSignature(engine.store.document, engine.knowledgeBase.concepts),
          `undo de «${record.input}»`
        ).toBe(before);

        engine.redo();
        if (record.expected.finalTree !== undefined) {
          expect(
            treeSignature(engine.store.document, engine.knowledgeBase.concepts),
            `redo de «${record.input}»`
          ).toBe(record.expected.finalTree);
        }
      }
    }
  });
});

describe('E2E por camada — conjuntos completos', () => {
  it('o conjunto de regressão passa integralmente', () => {
    const report = runDataset(createInitialKnowledgeBase(), REGRESSION_DATASET, 'regression');
    expect(report.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
    expect(report.passed).toBe(REGRESSION_DATASET.records.length);
  });
});

describe('Sequência da seção 38 (contexto de discurso)', () => {
  it('executa a sequência e mantém o estado correto após cada comando', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    const tree = () => treeSignature(e.store.document, e.knowledgeBase.concepts);

    e.execute('crie uma caixa');
    expect(tree()).toBe('C_ENT_CONTAINER{}');

    e.execute('crie dois botões dentro dela');
    expect(tree()).toBe('C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}\n  C_ENT_BUTTON{}');

    e.execute('deixe o segundo azul');
    expect(tree()).toBe(
      'C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}\n  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}'
    );

    e.execute('mova o primeiro para depois da caixa');
    expect(tree()).toBe('C_ENT_CONTAINER{}\n  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}\nC_ENT_BUTTON{}');

    e.execute('apague o botão azul');
    expect(tree()).toBe('C_ENT_CONTAINER{}\nC_ENT_BUTTON{}');
  });
});
