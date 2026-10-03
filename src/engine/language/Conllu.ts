import type { DependencyArc } from './DependencyParser';
import type { TaggedWord } from './Tagger';
import type { MultiwordToken } from './Tokenizer';

export function toConllu(text: string, words: TaggedWord[], arcs: DependencyArc[], multiwords: MultiwordToken[]): string {
  const lines = [`# text = ${text}`];
  const ranges = new Map(multiwords.map((token) => [token.from, token]));
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const id = index + 1;
    const range = ranges.get(id);
    if (range) lines.push(`${range.from}-${range.to}\t${range.form}\t_\t_\t_\t_\t_\t_\t_\t_`);
    const feats = Object.entries(word.selected.feats)
      .filter(([name]) => name !== 'Clitic')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`)
      .join('|') || '_';
    const arc = arcs[index];
    lines.push([id, word.form, word.selected.lemma, word.selected.upos, '_', feats, arc.head, arc.deprel, '_', '_'].join('\t'));
  }
  return `${lines.join('\n')}\n\n`;
}
