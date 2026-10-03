import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { FUNCTION_WORDS } from '../src/engine/parser/Grammar';

/**
 * F0.2 — Terminação garantida.
 *
 * Nenhuma frase pode travar o motor. Cada caso tem orçamento de 50 ms.
 * O fuzz é determinístico: PRNG com semente fixa, registrada abaixo; qualquer
 * falha é reproduzível a partir da semente e do índice do caso.
 */

const PER_CASE_BUDGET_MS = 50;
const FUZZ_SEED = 0x5eed_c0de;
const FUZZ_CASES = 5000;
const MAX_WORDS_PER_CASE = 15;

/** PRNG determinístico (mulberry32) — nunca `Math.random`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUT_OF_DOMAIN_WORDS = [
  'título', 'titulo', 'parágrafo', 'paragrafo', 'imagem', 'vídeo', 'video', 'tabela',
  'lista', 'link', 'cabeçalho', 'cabecalho', 'rodapé', 'rodape', 'seção', 'secao',
  'coluna', 'linha', 'grade', 'card', 'modal', 'menu', 'ícone', 'icone', 'avatar',
  'formulário', 'formulario', 'campo', 'input', 'checkbox', 'slider', 'tooltip',
  'banner', 'sidebar', 'footer', 'header', 'navbar', 'accordion', 'tab', 'galeria',
  'carrossel', 'grafico', 'gráfico', 'mapa', 'calendário', 'calendario', 'relógio',
  'relogio', 'botãozinho', 'caixinha', 'imprima', 'salve', 'gire', 'rotacione'
];

const LITERALS = ['"x"', '"Ok"', '#fff', '#2563eb', '2px', '18px', '3', '10'];

function fuzzVocabulary(): string[] {
  const kb = createInitialKnowledgeBase();
  const words = new Set<string>();
  for (const form of kb.surfaceForms) words.add(form.rawText);
  for (const multiword of kb.multiwords) {
    for (const part of multiword.phrase.split(/\s+/)) words.add(part);
  }
  for (const word of FUNCTION_WORDS) words.add(word);
  for (const word of OUT_OF_DOMAIN_WORDS) words.add(word);
  for (const literal of LITERALS) words.add(literal);
  return [...words];
}

interface FuzzCase {
  text: string;
  index: number;
  elapsedMs: number;
}

describe('Terminação garantida (F0.2)', () => {
  it('"crie uma caixa que tem" termina com UNSUPPORTED_OPERATION, sem mutação', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const before = engine.store.document.nodes.size;
    const start = performance.now();
    const result = engine.execute('crie uma caixa que tem');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(PER_CASE_BUDGET_MS);
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('UNSUPPORTED_OPERATION');
    expect(engine.store.document.nodes.size).toBe(before);
  });

  it('fuzz determinístico: 5000 frases, todas terminam dentro do orçamento', () => {
    const random = mulberry32(FUZZ_SEED);
    const vocabulary = fuzzVocabulary();
    expect(vocabulary.length).toBeGreaterThan(100);

    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const slowest: FuzzCase = { text: '', index: -1, elapsedMs: 0 };
    const overBudget: FuzzCase[] = [];

    for (let i = 0; i < FUZZ_CASES; i++) {
      const wordCount = 1 + Math.floor(random() * MAX_WORDS_PER_CASE);
      const words: string[] = [];
      for (let w = 0; w < wordCount; w++) {
        words.push(vocabulary[Math.floor(random() * vocabulary.length)]);
      }
      const text = words.join(' ');

      // Resultado precisa ser bem formado mesmo para entrada degenerada.
      let result: ReturnType<SemanticEngine['execute']> | undefined;
      let thrown: unknown;
      const start = performance.now();
      try {
        result = engine.execute(text);
      } catch (error) {
        thrown = error;
      }
      const elapsed = performance.now() - start;

      expect(thrown, `caso ${i} lançou: ${text}`).toBeUndefined();
      expect(result, `caso ${i} não produziu resultado: ${text}`).toBeDefined();
      expect(result!.compile.ast, `caso ${i} sem AST: ${text}`).toBeDefined();
      expect(result!.compile.plan, `caso ${i} sem plano: ${text}`).toBeDefined();
      for (const diagnostic of result!.compile.diagnostics) {
        expect(diagnostic.start, `caso ${i} span inválido: ${text}`).toBeGreaterThanOrEqual(0);
        expect(diagnostic.end, `caso ${i} span inválido: ${text}`).toBeLessThanOrEqual(text.length);
        expect(diagnostic.start, `caso ${i} span invertido: ${text}`).toBeLessThanOrEqual(
          diagnostic.end
        );
      }

      if (elapsed > slowest.elapsedMs) {
        slowest.text = text;
        slowest.index = i;
        slowest.elapsedMs = elapsed;
      }
      if (elapsed >= PER_CASE_BUDGET_MS) {
        overBudget.push({ text, index: i, elapsedMs: elapsed });
      }

      // Mantém o documento pequeno para que o orçamento meça o parsing,
      // não o custo de varrer um documento acumulado por 5000 comandos.
      engine.undo();
    }

    // Registro exigido pelo relatório: semente e caso mais lento.
    console.log(
      `[termination-fuzz] seed=0x${FUZZ_SEED.toString(16)} cases=${FUZZ_CASES} ` +
        `vocab=${vocabulary.length} slowest=${slowest.elapsedMs.toFixed(1)}ms ` +
        `(caso ${slowest.index}: ${JSON.stringify(slowest.text)})`
    );

    expect(overBudget).toEqual([]);
  });
});
