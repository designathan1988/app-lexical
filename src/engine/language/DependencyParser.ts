import copulaData from '../../knowledge/language/copulas.json';
import type { TaggedWord } from './Tagger';

export interface DependencyArc {
  id: number;
  head: number;
  deprel: string;
  rule: string;
}

const copulas = new Set((copulaData as { lemmas: string[] }).lemmas);
const nominals = new Set(['NOUN', 'PROPN', 'PRON']);
const verbal = new Set(['VERB', 'AUX']);

export class DependencyParser {
  parse(words: TaggedWord[]): DependencyArc[] {
    if (!words.length) return [];
    const pos = (index: number) => words[index]?.selected.upos;
    const feat = (index: number, key: string) => words[index]?.selected.feats[key];
    const isFinite = (index: number) => verbal.has(pos(index)) && feat(index, 'VerbForm') !== 'Inf' && feat(index, 'VerbForm') !== 'Ger' && feat(index, 'VerbForm') !== 'Part';
    const comma = words.findIndex((word) => word.form === ',');
    const finite = words.map((_, index) => index).filter(isFinite);
    const copula = finite.find((index) => copulas.has(words[index].selected.lemma));
    let root = finite[0] ?? words.findIndex((word) => word.selected.upos !== 'PUNCT');
    if (copula !== undefined) {
      const predicative = words.findIndex((word, index) => index > copula && (word.selected.upos === 'ADJ' || word.selected.upos === 'NOUN'));
      if (predicative >= 0) root = predicative;
    }
    if (comma > 0 && (pos(0) === 'SCONJ' || pos(0) === 'ADV')) {
      const main = finite.find((index) => index > comma);
      if (main !== undefined) root = main;
    }
    if (root < 0) root = 0;
    const arcs: DependencyArc[] = words.map((_, index) => ({ id: index + 1, head: root + 1, deprel: 'dep', rule: 'UD_FALLBACK' }));
    const set = (index: number, head: number, deprel: string, rule: string) => {
      if (index === root) return;
      arcs[index] = { id: index + 1, head: head + 1, deprel, rule };
    };
    arcs[root] = { id: root + 1, head: 0, deprel: 'root', rule: 'UD_ROOT' };
    const assigned = (index: number) => arcs[index]?.deprel !== 'dep';
    const nearestLeft = (index: number, predicate: (candidate: number) => boolean): number => {
      for (let i = index - 1; i >= 0; i--) if (predicate(i)) return i;
      return -1;
    };
    const nearestRight = (index: number, predicate: (candidate: number) => boolean, limit = words.length): number => {
      for (let i = index + 1; i < Math.min(words.length, limit); i++) if (predicate(i)) return i;
      return -1;
    };
    const governor = (index: number): number => {
      const left = nearestLeft(index, (candidate) => verbal.has(pos(candidate)) && arcs[candidate].deprel !== 'cop');
      return left >= 0 ? left : root;
    };

    for (let i = 0; i < words.length; i++) {
      if (pos(i) === 'PUNCT') set(i, root, 'punct', 'UD_PUNCT_ROOT');
      if (i === copula && root !== copula) set(i, root, 'cop', 'UD_COP_PREDICATE');
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) === 'DET' || pos(i) === 'NUM') {
        const head = nearestRight(i, (candidate) => pos(candidate) === 'NOUN' || pos(candidate) === 'PROPN', i + 4);
        if (head >= 0) set(i, head, pos(i) === 'NUM' ? 'nummod' : 'det', pos(i) === 'NUM' ? 'UD_NUMMOD' : 'UD_DET');
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'ADP') continue;
      const nextVerb = nearestRight(i, (candidate) => verbal.has(pos(candidate)), i + 3);
      const nextNominal = nearestRight(i, (candidate) => nominals.has(pos(candidate)), i + 4);
      if (nextVerb >= 0 && (nextNominal < 0 || nextVerb < nextNominal)) set(i, nextVerb, 'mark', 'UD_XCOMP_MARK');
      else if (nextNominal >= 0) set(i, nextNominal, 'case', 'UD_CASE');
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'CCONJ') continue;
      const target = nearestRight(i, (candidate) => nominals.has(pos(candidate)) || verbal.has(pos(candidate)) || pos(candidate) === 'ADJ', i + 4);
      if (target < 0) continue;
      const prior = nearestLeft(i, (candidate) => pos(candidate) === pos(target));
      if (prior >= 0) {
        set(i, target, 'cc', 'UD_CC');
        set(target, prior, 'conj', 'UD_CONJ');
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (!verbal.has(pos(i)) || i === root || i === copula || assigned(i)) continue;
      const marker = nearestLeft(i, (candidate) => pos(candidate) === 'SCONJ' || (pos(candidate) === 'PRON' && feat(candidate, 'PronType') === 'Rel') || (pos(candidate) === 'ADV' && feat(candidate, 'PronType') === 'Rel'));
      const precedingVerb = nearestLeft(i, (candidate) => verbal.has(pos(candidate)) && candidate !== i);
      if (marker >= 0 && (precedingVerb < 0 || marker > precedingVerb)) {
        const relative = pos(marker) === 'PRON' || pos(marker) === 'ADV';
        const antecedent = relative ? nearestLeft(marker, (candidate) => pos(candidate) === 'NOUN') : -1;
        if (relative && antecedent >= 0) set(i, antecedent, 'acl:relcl', 'UD_RELATIVE');
        else if (comma >= 0 && i < comma || (marker === 0 && comma >= 0)) set(i, root, 'advcl', 'UD_ADVCL_INITIAL');
        else if (marker > root && pos(marker) === 'SCONJ') set(i, root, 'ccomp', 'UD_CCOMP');
        else set(i, root, 'advcl', 'UD_ADVCL');
      } else if (feat(i, 'VerbForm') === 'Inf' && precedingVerb >= 0) {
        set(i, precedingVerb, 'xcomp', 'UD_XCOMP');
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'SCONJ' || assigned(i)) continue;
      const next = nearestRight(i, (candidate) => verbal.has(pos(candidate)), i + 4);
      if (next >= 0) set(i, next, 'mark', 'UD_MARK');
    }

    const clauses = words.map((_, index) => index).filter((index) => index === root || arcs[index].deprel === 'ccomp' || arcs[index].deprel === 'advcl' || arcs[index].deprel === 'acl:relcl');
    for (const clause of clauses.filter((index) => index !== root).concat(root)) {
      const head = clause;
      const markerForClause = nearestLeft(clause, (candidate) =>
        arcs[candidate].head === clause + 1 && arcs[candidate].deprel === 'mark' ||
        arcs[clause].deprel === 'acl:relcl' && feat(candidate, 'PronType') === 'Rel'
      );
      const start = clause === root && comma >= 0 && root > comma ? comma + 1 : clause === root ? 0 : markerForClause >= 0 ? markerForClause + 1 : 0;
      const end = clause === root && comma < 0 ? words.length : clause === root ? words.length : Math.min(words.length, nearestRight(clause, (candidate) => pos(candidate) === 'PUNCT') + 1 || words.length);
      const before = [] as number[];
      for (let i = start; i < head; i++) {
        if (!nominals.has(pos(i)) || assigned(i)) continue;
        if (nearestLeft(i, (candidate) => pos(candidate) === 'ADP' && arcs[candidate].head === i + 1) >= 0) continue;
        before.push(i);
      }
      const question = words.some((word) => word.form === '?');
      const subject = before.length ? before[before.length - 1]
        : question && clause === root ? nearestRight(head, (candidate) => candidate < end && nominals.has(pos(candidate)) && !assigned(candidate))
          : -1;
      if (subject !== undefined && subject >= 0 && subject < end && subject !== root) set(subject, head, 'nsubj', 'UD_NSUBJ_AGREEMENT');
      if (clause !== root && arcs[clause].deprel === 'acl:relcl') {
        const relative = nearestLeft(clause, (candidate) => feat(candidate, 'PronType') === 'Rel' && !assigned(candidate));
        if (relative >= 0) set(relative, clause, subject >= 0 ? 'obj' : 'nsubj', subject >= 0 ? 'UD_RELATIVE_OBJECT' : 'UD_RELATIVE_SUBJECT');
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (!nominals.has(pos(i)) || assigned(i) || i === root) continue;
      const caseMarker = nearestLeft(i, (candidate) => pos(candidate) === 'ADP' && arcs[candidate].head === i + 1);
      if (caseMarker >= 0) set(i, governor(caseMarker), 'obl', 'UD_OBL_CASE');
      else set(i, governor(i), 'obj', 'UD_OBJ');
    }
    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'ADV' || assigned(i)) continue;
      const left = governor(i);
      set(i, left, 'advmod', 'UD_ADVMOD');
    }
    return arcs;
  }
}
