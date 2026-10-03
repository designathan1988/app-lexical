import contractions from '../../knowledge/language/contractions.json';
import { closedClassReadings } from './ClosedClassLexicon';

export interface LanguageWord {
  id: number;
  form: string;
  start: number;
  end: number;
}

export interface MultiwordToken {
  form: string;
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface Tokenization {
  words: LanguageWord[];
  multiwords: MultiwordToken[];
}

const bySurface = new Map((contractions as { entries: Array<{ form: string; parts: string[] }> }).entries
  .map((entry) => [entry.form, entry.parts]));

export function tokenizeSentence(text: string): Tokenization {
  const words: LanguageWord[] = [];
  const multiwords: MultiwordToken[] = [];
  for (const match of text.matchAll(/\p{L}+(?:-\p{L}+)*|\d+|[^\s]/gu)) {
    const form = match[0];
    const start = match.index;
    const end = start + form.length;
    const key = form.normalize('NFC').toLocaleLowerCase('pt-BR');
    const isClitic = closedClassReadings(key).some((reading) => reading.feats.Clitic === 'Yes');
    const contraction = isClitic ? undefined : bySurface.get(key);
    const hyphenParts = form.includes('-') ? form.split('-') : [];
    const splitClitic = hyphenParts.length > 1 && hyphenParts.slice(1).some((part) =>
      closedClassReadings(part).some((reading) => reading.feats.Clitic === 'Yes')
    );
    const parts = contraction ?? (splitClitic ? hyphenParts : [form]);
    const from = words.length + 1;
    let offset = start;
    for (const part of parts) {
      const partStart = contraction ? start : offset;
      const partEnd = contraction ? end : partStart + part.length;
      words.push({ id: words.length + 1, form: part, start: partStart, end: partEnd });
      offset = partEnd + 1;
    }
    if (parts.length > 1) multiwords.push({ form, from, to: words.length, start, end });
  }
  return { words, multiwords };
}
