import { describe, expect, it } from 'vitest';
import { tokenizeSentence } from '../src/engine/language/Tokenizer';
import { closedClassReadings } from '../src/engine/language/ClosedClassLexicon';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

const forms: Array<[string, string, string]> = [
  ['eu', 'eu', 'PRON'], ['tu', 'tu', 'PRON'], ['ele', 'ele', 'PRON'],
  ['nós', 'nós', 'PRON'], ['vocês', 'você', 'PRON'], ['me', 'eu', 'PRON'],
  ['te', 'tu', 'PRON'], ['lhe', 'ele', 'PRON'], ['nos', 'nós', 'PRON'],
  ['meu', 'meu', 'DET'], ['minha', 'meu', 'DET'], ['seu', 'seu', 'DET'],
  ['este', 'este', 'DET'], ['aquela', 'aquele', 'DET'],
  ['alguém', 'alguém', 'PRON'], ['ninguém', 'ninguém', 'PRON'],
  ['nada', 'nada', 'PRON'], ['tudo', 'tudo', 'PRON'],
  ['que', 'que', 'PRON'], ['quem', 'quem', 'PRON'],
  ['onde', 'onde', 'ADV'], ['quando', 'quando', 'ADV'],
  ['qual', 'qual', 'PRON'], ['como', 'como', 'ADV'],
  ['o', 'o', 'DET'], ['a', 'o', 'DET'], ['uma', 'um', 'DET'],
  ['dois', 'dois', 'NUM'], ['três', 'três', 'NUM'],
  ['de', 'de', 'ADP'], ['em', 'em', 'ADP'], ['para', 'para', 'ADP'],
  ['e', 'e', 'CCONJ'], ['ou', 'ou', 'CCONJ'], ['porque', 'porque', 'SCONJ'],
  ['se', 'se', 'SCONJ'], ['não', 'não', 'ADV'], ['nunca', 'nunca', 'ADV'],
  ['hoje', 'hoje', 'ADV'], ['amanhã', 'amanhã', 'ADV']
];

describe('classes fechadas e tokenização', () => {
  it.each([
    ['si', 'PRON'], ['comigo', 'PRON'], ['contigo', 'PRON'], ['lhes', 'PRON'],
    ['meus', 'DET'], ['minhas', 'DET'], ['teu', 'DET'], ['tua', 'DET'],
    ['nossos', 'DET'], ['estas', 'DET'], ['aqueles', 'DET'],
    ['todas', 'DET'], ['alguns', 'DET'], ['nenhum', 'DET'], ['qualquer', 'DET'],
    ['onze', 'NUM'], ['doze', 'NUM'], ['vinte', 'NUM'], ['trinta', 'NUM'], ['mil', 'NUM'],
    ['desde', 'ADP'], ['contra', 'ADP'], ['após', 'ADP'], ['durante', 'ADP'],
    ['porém', 'CCONJ'], ['portanto', 'CCONJ'], ['caso', 'SCONJ'],
    ['agora', 'ADV'], ['sempre', 'ADV'], ['talvez', 'ADV'], ['aí', 'ADV'], ['ali', 'ADV'],
    ['mais', 'ADV'], ['menos', 'ADV']
  ] as Array<[string, string]>)('inclui forma fechada adicional %s', (form, upos) => {
    expect(closedClassReadings(form).some((reading) => reading.upos === upos)).toBe(true);
  });

  it.each(forms)('reconhece %s como %s/%s', (form, lemma, upos) => {
    expect(closedClassReadings(form)).toContainEqual(expect.objectContaining({ lemma, upos }));
  });

  it('conserva leituras concorrentes', () => {
    expect(new Set(closedClassReadings('a').map((r) => r.upos))).toEqual(new Set(['DET', 'ADP', 'PRON']));
    expect(new Set(closedClassReadings('que').map((r) => r.upos))).toEqual(new Set(['PRON', 'DET', 'SCONJ']));
  });

  it.each([
    ['na casa', ['em', 'a', 'casa'], 'na'],
    ['do livro', ['de', 'o', 'livro'], 'do'],
    ['à praça', ['a', 'a', 'praça'], 'à'],
    ['pelo caminho', ['por', 'o', 'caminho'], 'pelo'],
    ['naquele lugar', ['em', 'aquele', 'lugar'], 'naquele'],
    ['numa caixa', ['em', 'uma', 'caixa'], 'numa']
  ] as Array<[string, string[], string]>)('expande %s', (sentence, words, surface) => {
    const result = tokenizeSentence(sentence);
    expect(result.words.map((w) => w.form)).toEqual(words);
    expect(result.multiwords).toContainEqual(expect.objectContaining({ form: surface, from: 1, to: 2 }));
  });

  it('mantém a posição da contração dentro da frase', () => {
    const result = tokenizeSentence('Fiquei hoje na casa.');
    expect(result.words.map((w) => w.form)).toEqual(['Fiquei', 'hoje', 'em', 'a', 'casa', '.']);
    expect(result.multiwords).toContainEqual(expect.objectContaining({ form: 'na', from: 3, to: 4 }));
  });

  it('segmenta ênclise e mesóclise com clítico registrado', () => {
    const enclisis = tokenizeSentence('ajude-me');
    expect(enclisis.words.map((w) => w.form)).toEqual(['ajude', 'me']);
    const mesoclisis = tokenizeSentence('dá-lo-ei');
    expect(mesoclisis.words.some((w) => w.form === 'lo')).toBe(true);
  });

  it('recompõe o verbo flexionado da mesóclise para análise lexical', () => {
    const tokenization = tokenizeSentence('Dá-lo-ei.');
    expect(tokenization.words.map((word) => word.form.toLocaleLowerCase('pt-BR'))).toEqual(['darei', 'lo', '.']);
    expect(tokenization.multiwords).toContainEqual(expect.objectContaining({ form: 'Dá-lo-ei', from: 1, to: 2 }));
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Dá-lo-ei.');
    expect(analysis.words[0].selected).toMatchObject({ lemma: 'dar', upos: 'VERB' });
    expect(analysis.words[0].selected.feats).toMatchObject({ Person: '1', Number: 'Sing', Tense: 'Fut' });
  });
});
