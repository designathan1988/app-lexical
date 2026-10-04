import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-sentences.json';
import extra from './fixtures/sentences-extra.json';
import { LanguageTagger } from '../src/engine/language/Tagger';

type Sentence = { id: string; text: string; tokens: Array<{ form: string; pos: string }> };
const goldSentences = (gold as { sentences: Sentence[] }).sentences;
const extraSentences = (extra as { sentences: Sentence[] }).sentences;
const expectedUpos: Record<string, string[]> = {
  ADJECTIVE: ['ADJ'], ADVERB: ['ADV'], CONJUNCTION: ['CCONJ', 'SCONJ'],
  DETERMINER: ['DET'], NOUN: ['NOUN'], NUMERAL: ['NUM'], PREPOSITION: ['ADP'],
  PRONOUN: ['PRON'], PUNCT: ['PUNCT'], VERB: ['VERB']
};

function measure(tagger: LanguageTagger, sentences: Sentence[]) {
  let hits = 0;
  let total = 0;
  const failures: string[] = [];
  for (const sentence of sentences) {
    const tagged = tagger.tagForms(sentence.tokens.map((token) => token.form));
    expect(tagged.words.length).toBe(sentence.tokens.length);
    for (let index = 0; index < sentence.tokens.length; index++) {
      const actual = tagged.words[index].selected.upos;
      const expected = expectedUpos[sentence.tokens[index].pos] ?? [sentence.tokens[index].pos];
      total++;
      if (expected.includes(actual)) hits++;
      else failures.push(`${sentence.id}:${sentence.tokens[index].form} ${expected.join('/')}→${actual}`);
    }
  }
  return { hits, total, failures };
}

describe('desambiguação de classe por regras', () => {
  const tagger = new LanguageTagger();

  it('seleciona AUX para cópula e auxiliar diante de infinitivo', () => {
    expect(tagger.tagForms(['A', 'casa', 'é', 'grande', '.']).words[2].selected.upos).toBe('AUX');
    expect(tagger.tagForms(['Nós', 'vamos', 'viajar', '.']).words[1].selected.upos).toBe('AUX');
  });

  it('atinge 97% de UPOS nas 80 frases do projeto', () => {
    const result = measure(tagger, goldSentences);
    console.info('UPOS gabarito', result.hits, '/', result.total, 'falhas:', result.failures.join(', '));
    expect(result.hits / result.total).toBeGreaterThanOrEqual(0.97);
  });

  it('atinge 95% de UPOS nas 20 frases extras', () => {
    expect(extraSentences.length).toBe(20);
    const result = measure(tagger, extraSentences);
    console.info('UPOS extras', result.hits, '/', result.total, 'falhas:', result.failures.join(', '));
    expect(result.hits / result.total).toBeGreaterThanOrEqual(0.95);
  });

  it('registra a regra que removeu cada leitura', () => {
    const tagged = tagger.tagForms(['A', 'menina', 'dança', '.']);
    expect(tagged.words[0].selected.upos).toBe('DET');
    expect(tagged.trace.some((event) => event.rule && event.removed.length)).toBe(true);
  });
});
