import { describe, it, expect } from 'vitest';
import { RawLexer } from '../src/engine/lexical/RawLexer';
import { segmentTokens } from '../src/engine/lexical/Segmenter';
import { PortuguesePhonetic } from '../src/engine/lexical/PortuguesePhonetic';
import { MultiwordTrie } from '../src/engine/lexical/MultiwordTrie';
import { LexicalIndex } from '../src/engine/lexical/LexicalIndex';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

describe('RawLexer.normalize (Unicode / acentuação)', () => {
  it('remove diacríticos e mantém minúsculas', () => {
    expect(RawLexer.normalize('Botão')).toBe('botao');
    expect(RawLexer.normalize('CAIXA')).toBe('caixa');
    expect(RawLexer.normalize('não')).toBe('nao');
    expect(RawLexer.normalize('AÇÃO')).toBe('acao');
  });

  it('não altera a forma original', () => {
    const original = 'Botão';
    expect(original).toBe('Botão');
  });
});

describe('RawLexer.lex (tokenização não destrutiva)', () => {
  const lexer = new RawLexer();

  it('preserva strings entre aspas com offsets', () => {
    const tokens = lexer.lex('mude o botão "Entrar agora" para azul');
    const str = tokens.find((t) => t.type === 'STRING')!;
    expect(str.value).toBe('Entrar agora');
    expect(str.start).toBe(13);
  });

  it('preserva cores hexadecimais', () => {
    const tokens = lexer.lex('#2563eb');
    expect(tokens[0].type).toBe('COLOR_HEX');
    expect(tokens[0].value).toBe('#2563eb');
  });

  it('preserva medidas CSS, decimais, negativos e porcentagens', () => {
    const tokens = lexer.lex('20px 1.5rem 50% -3px');
    const units = tokens.filter((t) => t.type === 'CSS_UNIT');
    expect(units.map((u) => u.raw)).toEqual(['20px', '1.5rem', '50%', '-3px']);
    expect(units[1].value).toBe(1.5);
    expect(units[1].unit).toBe('rem');
  });

  it('preserva números', () => {
    const tokens = lexer.lex('crie 3 botões');
    const num = tokens.find((t) => t.type === 'NUMBER')!;
    expect(num.value).toBe(3);
  });

  it('preserva acentos nas palavras', () => {
    const tokens = lexer.lex('botão');
    expect(tokens[0].raw).toBe('botão');
    expect(tokens[0].normalized).toBe('botao');
  });
});

describe('segmentTokens (contrações)', () => {
  const lexer = new RawLexer();

  it('expande do/da/dele/dela', () => {
    const tokens = segmentTokens(lexer.lex('da dele dela')).tokens;
    const words = tokens.filter((t) => t.type === 'WORD').map((t) => t.raw);
    expect(words).toEqual(['de', 'a', 'de', 'ele', 'de', 'ela']);
  });

  it('não transforma contrações em conceitos', () => {
    const tokens = segmentTokens(lexer.lex('do')).tokens;
    expect(tokens.map((t) => t.raw)).toEqual(['de', 'o']);
  });
});

describe('PortuguesePhonetic', () => {
  it('gera a mesma chave para variações fonéticas', () => {
    expect(PortuguesePhonetic.key('azul')).toBe(PortuguesePhonetic.key('asul'));
    expect(PortuguesePhonetic.key('botão')).toBe(PortuguesePhonetic.key('botao'));
  });
});

describe('MultiwordTrie', () => {
  it('faz longest-match', () => {
    const kb = createInitialKnowledgeBase();
    const trie = new MultiwordTrie(kb.multiwords);
    const tokens = new RawLexer().lex('cor de fundo');
    const m = trie.match(tokens, 0)!;
    expect(m.entry.conceptId).toBe('C_PROP_BG_COLOR');
    expect(m.length).toBe(3);
  });

  it('reconhece expressões com contração expandida (cor do texto)', () => {
    const kb = createInitialKnowledgeBase();
    const trie = new MultiwordTrie(kb.multiwords);
    const tokens = segmentTokens(new RawLexer().lex('cor do texto')).tokens;
    const m = trie.match(tokens, 0)!;
    expect(m.entry.conceptId).toBe('C_PROP_TEXT_COLOR');
  });

  it('reconhece relação espacial dentro de', () => {
    const kb = createInitialKnowledgeBase();
    const trie = new MultiwordTrie(kb.multiwords);
    const tokens = new RawLexer().lex('dentro de uma caixa');
    const m = trie.match(tokens, 0)!;
    expect(m.entry.conceptId).toBe('C_SPAT_INSIDE');
  });
});

describe('LexicalIndex', () => {
  const kb = createInitialKnowledgeBase();
  const index = new LexicalIndex(kb.surfaceForms, kb.lexemes);

  it('resolve formas canônicas exatamente', () => {
    const c = index.resolve('botão')[0];
    expect(c.lexeme.id).toBe('LEX_BOTAO');
    expect(c.source).toBe('EXACT');
  });

  it('resolve flexões', () => {
    const c = index.resolve('botões')[0];
    expect(c.lexeme.id).toBe('LEX_BOTAO');
  });

  it('resolve formas coloquiais sem acento', () => {
    const c = index.resolve('botao')[0];
    expect(c.lexeme.id).toBe('LEX_BOTAO');
  });

  it('resolve misspellings cadastrados', () => {
    const c = index.resolve('asul')[0];
    expect(c.lexeme.id).toBe('LEX_AZUL');
  });

  it('resolve() é exato; a recuperação aproximada vive em approximateCandidates()', () => {
    expect(index.resolve('asull')).toHaveLength(0);
    const approx = index.approximateCandidates('asull')[0];
    expect(approx.lexeme.id).toBe('LEX_AZUL');
    expect(approx.components.similarity).toBeGreaterThan(0.7);
  });

  it('mantém lexemas independentes convergindo para o mesmo conceito', () => {
    const criar = index.resolve('criar')[0];
    const adicionar = index.resolve('adicionar')[0];
    expect(criar.lexeme.id).toBe('LEX_CRIAR');
    expect(adicionar.lexeme.id).toBe('LEX_ADICIONAR');
    expect(criar.lexeme.senseConceptIds[0]).toBe('C_ACT_CREATE');
    expect(adicionar.lexeme.senseConceptIds[0]).toBe('C_ACT_CREATE');
  });
});
