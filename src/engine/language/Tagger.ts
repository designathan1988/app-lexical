import rulesData from '../../knowledge/language/pos-rules.json';
import copulaData from '../../knowledge/language/copulas.json';
import { LexicalAnalyzer, type LexicalReading } from './LexicalAnalyzer';

interface Constraint {
  offset?: number;
  atStart?: boolean;
  atEnd?: boolean;
  finalForm?: string;
  containsForm?: string;
  upos?: string[];
  feats?: Record<string, string>;
  barrier?: string[];
  maxDistance?: number;
}

interface Rule {
  id: string;
  action: 'SELECT' | 'REMOVE';
  form?: string;
  target: { upos: string; feats?: Record<string, string>; lemmaClass?: string };
  context: Constraint[];
  note: string;
  example: string;
}

export interface TaggedWord {
  form: string;
  readings: LexicalReading[];
  selected: LexicalReading;
}

export interface TaggingTrace {
  rule: string;
  index: number;
  removed: LexicalReading[];
}

export interface TaggingResult {
  words: TaggedWord[];
  trace: TaggingTrace[];
}

const rules = (rulesData as unknown as { rules: Rule[] }).rules;
const copulas = new Set((copulaData as { lemmas: string[] }).lemmas);

function readingMatches(reading: LexicalReading, target: { upos: string; feats?: Record<string, string>; lemmaClass?: string }): boolean {
  return reading.upos === target.upos &&
    (!target.lemmaClass || target.lemmaClass === 'COPULA' && copulas.has(reading.lemma)) &&
    Object.entries(target.feats ?? {}).every(([key, value]) => reading.feats[key] === value);
}

function contextMatches(words: TaggedWord[], index: number, condition: Constraint): boolean {
  if (condition.atStart) return index === 0;
  if (condition.atEnd) return index === words.length - 1;
  if (condition.finalForm) return words[words.length - 1]?.form === condition.finalForm;
  if (condition.containsForm) return words.some((word) => word.form === condition.containsForm);
  const offset = condition.offset ?? 0;
  const direction = Math.sign(offset);
  const maxDistance = condition.maxDistance ?? Math.abs(offset);
  for (let distance = Math.abs(offset); distance <= maxDistance; distance++) {
    const neighbor = words[index + direction * distance];
    if (!neighbor) return false;
    if (condition.barrier?.some((upos) => neighbor.readings.some((reading) => reading.upos === upos))) return false;
    if (neighbor.readings.some((reading) =>
      (!condition.upos || condition.upos.includes(reading.upos)) &&
      Object.entries(condition.feats ?? {}).every(([key, value]) => reading.feats[key] === value)
    )) return true;
  }
  return false;
}

export class LanguageTagger {
  constructor(private lexical = new LexicalAnalyzer()) {}

  tagForms(forms: string[]): TaggingResult {
    const words: TaggedWord[] = forms.map((form) => {
      const readings = [...this.lexical.analyzeSurface(form)];
      return { form, readings, selected: readings[0] };
    });
    const trace: TaggingTrace[] = [];
    for (const rule of rules) {
      for (let index = 0; index < words.length; index++) {
        const word = words[index];
        if (rule.form && word.form.normalize('NFC').toLocaleLowerCase('pt-BR') !== rule.form) continue;
        const targets = word.readings.filter((reading) => readingMatches(reading, rule.target));
        if (!targets.length || !rule.context.every((condition) => contextMatches(words, index, condition))) continue;
        const kept = rule.action === 'SELECT'
          ? targets
          : word.readings.filter((reading) => !readingMatches(reading, rule.target));
        if (!kept.length || kept.length === word.readings.length) continue;
        const removed = word.readings.filter((reading) => !kept.includes(reading));
        word.readings = kept;
        word.selected = kept[0];
        trace.push({ rule: rule.id, index, removed });
      }
    }
    return { words, trace };
  }
}
