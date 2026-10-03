import { describe, it, expect } from 'vitest';
import gold from '../research/morfologia/tests-derivation.json';
import affixRules from '../src/knowledge/morphology/affix-rules.json';
import stemRules from '../src/knowledge/morphology/stem-rules.json';
import seedRoots from '../src/knowledge/morphology/seed-roots.json';
import { createDerivationalAnalyzer } from '../src/knowledge/morphology';
import { normalizeWord } from '../src/engine/morphology/DerivationalAnalyzer';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

/**
 * Rede gerativa: o analisador reverso tem de GENERALIZAR por regra, não por
 * lista. As palavras abaixo NÃO aparecem nos dados de morfologia (nem como
 * exemplo de regra, nem como derivação atestada, nem no gabarito): só a raiz
 * está no léxico-semente. Se uma delas passar a constar nos dados, o teste
 * `inéditas são inéditas` falha e ela deve ser trocada por outra inédita.
 */
const UNSEEN: Array<[string, string]> = [
  ['pescador', 'pescar'],
  ['organizador', 'organizar'],
  ['cozinheiro', 'cozinha'],
  ['jardineiro', 'jardim'],
  ['lavagem', 'lavar'],
  ['aprendizagem', 'aprender'],
  ['rapidez', 'rápido'],
  ['calmamente', 'calmo'],
  ['tranquilamente', 'tranquilo'],
  ['reabrir', 'abrir'],
  ['desarrumar', 'arrumar'],
  ['descontente', 'contente'],
  ['impaciente', 'paciente'],
  ['inútil', 'útil'],
  ['irresponsável', 'responsável'],
  ['autorretrato', 'retrato'],
  ['conserto', 'consertar'],
  ['pulo', 'pular'],
  ['aviãozinho', 'avião'],
  ['cachorrinho', 'cachorro'],
  ['estabilidade', 'estável'],
  ['popularidade', 'popular'],
  ['legalidade', 'legal'],
  ['modernidade', 'moderno'],
  ['preparação', 'preparar'],
  ['separação', 'separar'],
  ['participação', 'participar'],
  ['apresentação', 'apresentar'],
  ['crescimento', 'crescer'],
  ['conhecimento', 'conhecer'],
  ['esquecimento', 'esquecer'],
  ['lançamento', 'lançar'],
  ['aceitável', 'aceitar'],
  ['reciclável', 'reciclar'],
  ['imperdível', 'perder'],
  ['desorganizado', 'organizar'],
  ['indecisão', 'decidir'],
  ['desconfiança', 'confiar'],
  ['ensinamento', 'ensinar'],
  ['atendimento', 'atender'],
  ['limpeza', 'limpo'],
  ['dirigente', 'dirigir'],
  ['navegação', 'navegar']
];

/** Alomorfia trocada: nunca pode sair como palavra ATESTADA. */
const WRONG = ['jardimeiro', 'comprível', 'beberável', 'felizidade', 'inpaciente', 'tristemento'];

const analyzer = createDerivationalAnalyzer();
const goldCases = (gold as { tests: Array<{
  word: string;
  expected: { status: string; root?: string; chain?: Array<{ from: string }> };
}> }).tests;

describe('analisador derivacional — generalização', () => {
  it('inéditas são inéditas (fora de exemplos, atestadas e gabarito)', () => {
    type Ex = { examples?: Array<{ derived: string }> };
    type Seed = { attestedDerivations?: Array<{ word: string }>; lexicalized?: Array<{ word: string }> };
    const seen = new Set<string>([
      ...goldCases.map((c) => c.word),
      ...[...(affixRules as { rules: Ex[] }).rules, ...(stemRules as unknown as { extraRules: Ex[] }).extraRules]
        .flatMap((r) => (r.examples ?? []).map((e) => e.derived)),
      ...(seedRoots as unknown as { entries: Seed[] }).entries
        .flatMap((e) => [...(e.attestedDerivations ?? []), ...(e.lexicalized ?? [])].map((d) => d.word))
    ].map(normalizeWord));
    expect(UNSEEN.filter(([w]) => seen.has(normalizeWord(w)))).toEqual([]);
  });

  it('acha a raiz certa na 1ª análise em ≥ 90% das palavras inéditas', () => {
    const misses = UNSEEN.filter(([w, root]) => {
      const top = analyzer.analyze(w)[0];
      return !top || normalizeWord(top.root.lemma) !== normalizeWord(root);
    });
    expect(misses.length / UNSEEN.length).toBeLessThanOrEqual(0.1);
  });

  it('nunca atesta forma com alomorfia errada', () => {
    for (const w of WRONG) {
      expect(analyzer.analyze(w).filter((a) => a.status === 'ATTESTED'), w).toEqual([]);
    }
  });

  it('cadeia e glosa composicionais: retomada = AÇÃO(REPETIÇÃO(tomar))', () => {
    const top = analyzer.analyze('retomada')[0];
    expect(top.root.lemma).toBe('tomar');
    expect(top.chain.map((s) => s.rule)).toEqual(['PRE_RE', 'SUF_ADA_V']);
    expect(top.pos).toBe('NOUN');
  });

  it('paráfrase passiva usa o particípio do verbo: reciclável', () => {
    const top = analyzer.analyze('reciclável')[0];
    expect(top.gloss).not.toMatch(/ser \S+(ar|er|ir)\b/);
  });

  it('plural é desfeito antes da derivação: jardineiros', () => {
    const top = analyzer.analyze('jardineiros')[0];
    expect(top.root.lemma).toBe('jardim');
    expect(top.inflection).toBeDefined();
  });
});

describe('analisador derivacional — gabarito da pesquisa (research/morfologia)', () => {
  it('acerta ≥ 75% do gabarito (raiz certa; bloqueadas nunca saem ATESTADAS)', () => {
    let hit = 0;
    for (const c of goldCases) {
      const e = c.expected;
      const top = analyzer.analyze(c.word)[0];
      const good =
        e.status === 'ANALYZED'
          ? !!top && top.status !== 'HYPOTHESIS_BLOCKED' &&
            (top.root.id === e.root || normalizeWord(top.root.lemma) === normalizeWord(e.chain?.[0]?.from ?? ''))
          : !top || top.status !== 'ATTESTED';
      if (good) hit++;
    }
    expect(goldCases.length).toBeGreaterThan(400);
    expect(hit / goldCases.length).toBeGreaterThanOrEqual(0.75);
  });
});

describe('integração: UNKNOWN_WORD explica a decomposição', () => {
  it('palavra fora do domínio recebe análise morfológica no diagnóstico', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const result = engine.analyze('crie um botão reciclável');
    const unknown = result.diagnostics.find((d) => d.code === 'UNKNOWN_WORD');
    expect(unknown).toBeDefined();
    expect(unknown!.morphology?.[0]?.root).toBe('reciclar');
    expect(unknown!.message).toContain('reciclar');
  });
});
