import type { DependencyArc } from './DependencyParser';
import type { TaggedWord } from './Tagger';

export interface ClauseAnalysis {
  subject: number[];
  predicate: number[];
  completePredicate: number[];
  implicitSubject?: { person: string; number: string };
  mode: 'declarative' | 'interrogative' | 'imperative';
  polarity: 'positive' | 'negative';
}

export class ClauseAnalyzer {
  analyze(words: TaggedWord[], arcs: DependencyArc[]): ClauseAnalysis {
    const root = arcs.find((arc) => arc.head === 0)?.id ?? 1;
    const subjectHead = arcs.find((arc) => arc.head === root && arc.deprel === 'nsubj')?.id;
    const subject = subjectHead
      ? [subjectHead, ...arcs.filter((arc) => arc.head === subjectHead && arc.deprel === 'conj').map((arc) => arc.id)].sort((a, b) => a - b)
      : [];
    const copula = arcs.find((arc) => arc.head === root && arc.deprel === 'cop')?.id;
    const predicateHead = copula ?? root;
    const predicate = [predicateHead, ...arcs.filter((arc) => arc.head === predicateHead &&
      (arc.deprel === 'xcomp' || arc.deprel === 'conj' && ['VERB', 'AUX'].includes(words[arc.id - 1]?.selected.upos))
    ).map((arc) => arc.id)].sort((a, b) => a - b);
    const subjectSubtree = new Set(subject);
    for (let changed = true; changed;) {
      changed = false;
      for (const arc of arcs) {
        if (subjectSubtree.has(arc.head) && !subjectSubtree.has(arc.id)) {
          subjectSubtree.add(arc.id);
          changed = true;
        }
      }
    }
    const completePredicate = arcs.filter((arc) => arc.deprel !== 'punct' && !subjectSubtree.has(arc.id)).map((arc) => arc.id);
    const finite = words[(copula ?? root) - 1]?.selected.feats ?? {};
    const initialClitic = words[0]?.selected.feats.Clitic === 'Yes' && arcs[0]?.head === root && arcs[0]?.deprel === 'obj';
    const mode = words.some((word) => word.form === '?' || word.selected.feats.PronType === 'Int') ? 'interrogative'
      : (finite.Mood === 'Imp' || initialClitic) && !subject.length ? 'imperative'
        : 'declarative';
    const polarity = words.some((word) => word.selected.feats.Polarity === 'Neg' || word.selected.feats.PronType === 'Neg') ? 'negative' : 'positive';
    const implicitSubject = !subject.length && finite.Person && finite.Number && mode !== 'imperative'
      ? { person: finite.Person, number: finite.Number }
      : undefined;
    return { subject, predicate, completePredicate, implicitSubject, mode, polarity };
  }
}
