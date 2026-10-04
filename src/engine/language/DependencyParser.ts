import copulaData from '../../knowledge/language/copulas.json';
import adjunctData from '../../knowledge/language/adjunct-roles.json';
import pragmaticsData from '../../knowledge/language/pragmatics.json';
import seedData from '../../knowledge/morphology/seed-roots.json';
import supplementData from '../../knowledge/language/lexical-supplements.json';
import frameData from '../../knowledge/morphology/frames.json';
import semanticTypes from '../../knowledge/morphology/semantic-types.json';
import obliqueCasesData from '../../knowledge/language/frame-oblique-cases.json';
import nominalPpData from '../../knowledge/language/nominal-pp-rules.json';
import copularClauseData from '../../knowledge/language/copular-clause-rules.json';
import coordinationData from '../../knowledge/language/coordination-rules.json';
import degreeData from '../../knowledge/language/degree-modifier-rules.json';
import participialData from '../../knowledge/language/participial-predication-rules.json';
import nominalizedAdjectiveData from '../../knowledge/language/nominalized-adjective-rules.json';
import copularAdverbData from '../../knowledge/language/copular-adverb-rules.json';
import embeddedInterrogativeData from '../../knowledge/language/embedded-interrogative-rules.json';
import type { TeachableRoot } from '../../knowledge/language/teachableRoot';
import type { TaggedWord } from './Tagger';

export interface DependencyArc {
  id: number;
  head: number;
  deprel: string;
  rule: string;
}

const copulas = new Set((copulaData as { lemmas: string[] }).lemmas);
const markers = (adjunctData as { markers: Array<{ form: string }> }).markers;
const pragmaticExpressions = (pragmaticsData as { expressions: Array<{ id: string; form: string; relation: string }> }).expressions;
const typeByLemma = new Map([
  ...(seedData as { entries: Array<{ lemma: string; senses?: Array<{ semanticType?: string }> }> }).entries.map((entry) => [entry.lemma, entry.senses?.[0]?.semanticType] as const),
  ...(supplementData as { entries: Array<{ lemma: string; semanticType?: string }> }).entries.map((entry) => [entry.lemma, entry.semanticType] as const)
]);
type SyntaxFrame = { id: string; syntax?: Array<Record<string, string>>; roles?: Record<string, { prefers?: string[] }>; defaultTemplate?: boolean };
const frames = (frameData as unknown as { frames: SyntaxFrame[] }).frames;
const typeParents = new Map((semanticTypes as { types: Array<{ id: string; isA: string | null }> }).types
  .map((entry) => [entry.id, entry.isA]));
const obliqueCases = (obliqueCasesData as { entries: Array<{ frame: string; role: string; preposition: string }> }).entries;
const nominalPpRules = (nominalPpData as { rules: Array<{
  id: string; prepositions: string[]; scope: string; barrierUpos: string[]; relation: string
}> }).rules;
const copularClauseRules = (copularClauseData as { rules: Array<{
  id: string; markerForms: string[]; predicateUpos: string[]; relation: string
}> }).rules;
const coordinationLists = (coordinationData as { lists: Array<{
  id: string; separator: string; memberUpos: string[]; relation: string; punctuationRelation: string
}> }).lists;
const degreeRules = (degreeData as { classes: Array<{ class: string; lemmas: string[] }>;
  gradableHeads: Array<{ upos: string; lemmas: string[] }>;
  rules: Array<{ id: string; class: string; headUpos: string[]; relation: string }> });
const participialRules = (participialData as { rules: Array<{
  id: string; copulaLemmas: string[]; predicateUpos: string; predicateFeatures: Record<string, string>;
  relation: string; subjectRelation: string
}> }).rules;
const nominalizedAdjectiveRules = (nominalizedAdjectiveData as { rules: Array<{
  id: string; headUpos: string; precededBy: string[]; excludedFollowerUpos: string[]
}> }).rules;
const copularAdverbRules = (copularAdverbData as { rules: Array<{
  id: string; copulaLemmas: string[]; predicateUpos: string; predicateLemmas: string[]; relation: string
}> }).rules;
const embeddedInterrogativeRules = (embeddedInterrogativeData as { rules: Array<{
  id: string; markerFeature: Record<string, string>; markerUpos: string[]; relation: string;
  requiresMatrixRelation: string;
  adverbRelation: string; nominalSubjectRelation: string; nominalObjectRelation: string
}> }).rules;
const isSubtype = (actual: string | undefined, expected: string): boolean => {
  for (let current = actual; current; current = typeParents.get(current) ?? undefined) if (current === expected) return true;
  return false;
};
const nominals = new Set(['NOUN', 'PROPN', 'PRON']);
const verbal = new Set(['VERB', 'AUX']);

export class DependencyParser {
  constructor(private languageRoots: TeachableRoot[] = []) {}

  parse(words: TaggedWord[]): DependencyArc[] {
    if (!words.length) return [];
    const pos = (index: number) => words[index]?.selected.upos;
    const feat = (index: number, key: string) => words[index]?.selected.feats[key];
    const nominalized = (index: number) => nominalizedAdjectiveRules.some((rule) =>
      pos(index) === rule.headUpos && rule.precededBy.includes(pos(index - 1)) &&
      !rule.excludedFollowerUpos.includes(pos(index + 1)));
    const isNominal = (index: number) => nominals.has(pos(index)) || nominalized(index);
    const isFinite = (index: number) => verbal.has(pos(index)) && feat(index, 'VerbForm') !== 'Inf' && feat(index, 'VerbForm') !== 'Ger' && feat(index, 'VerbForm') !== 'Part';
    const comma = words.findIndex((word) => word.form === ',');
    const finite = words.map((_, index) => index).filter(isFinite);
    const copularPredicates = finite.map((index) => {
      const lemma = words[index].selected.lemma;
      const predicate = words.findIndex((word, candidate) => candidate > index &&
        ((copulas.has(lemma) && (word.selected.upos === 'ADJ' || word.selected.upos === 'NOUN')) ||
          copularAdverbRules.some((rule) => rule.copulaLemmas.includes(lemma) &&
            word.selected.upos === rule.predicateUpos && rule.predicateLemmas.includes(word.selected.lemma)) ||
          participialRules.some((rule) => rule.copulaLemmas.includes(lemma) && word.selected.upos === rule.predicateUpos &&
            Object.entries(rule.predicateFeatures).every(([key, value]) => word.selected.feats[key] === value))) &&
        !words.slice(index + 1, candidate).some((between) =>
          verbal.has(between.selected.upos) || between.selected.upos === 'PUNCT' || between.selected.upos === 'SCONJ'));
      const partRule = predicate >= 0 ? participialRules.find((rule) => rule.copulaLemmas.includes(lemma) &&
        words[predicate].selected.upos === rule.predicateUpos &&
        Object.entries(rule.predicateFeatures).every(([key, value]) => words[predicate].selected.feats[key] === value)) : undefined;
      const adverbRule = predicate >= 0 ? copularAdverbRules.find((rule) => rule.copulaLemmas.includes(lemma) &&
        words[predicate].selected.upos === rule.predicateUpos && rule.predicateLemmas.includes(words[predicate].selected.lemma)) : undefined;
      return { copula: index, predicate, relation: partRule?.relation ?? adverbRule?.relation ?? 'cop',
        subjectRelation: partRule?.subjectRelation ?? 'nsubj', rule: partRule?.id ?? adverbRule?.id ?? 'UD_COP_PREDICATE' };
    }).filter((entry) => entry.predicate >= 0);
    const copula = copularPredicates[0]?.copula;
    let root = finite[0] ?? words.findIndex((word) => word.selected.upos !== 'PUNCT');
    const mainCopula = copularPredicates.find((entry) => {
      const precedingFinite = finite.reduce((last, index) => index < entry.copula ? index : last, -1);
      const latestMarker = words.slice(0, entry.copula).reduce((last, word, index) =>
        word.selected.upos === 'SCONJ' ? index : last, -1);
      return latestMarker <= precedingFinite;
    });
    if (mainCopula) root = mainCopula.predicate;
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
    const obliqueRule = (head: number, target: number, marker: number): { rule: string; frameId?: string; argument: boolean } => {
      const lemma = words[head]?.selected.lemma;
      const type = this.languageRoots.find((entry) => entry.lemma === words[target].selected.lemma)?.sense.semanticType
        ?? typeByLemma.get(words[target].selected.lemma);
      const preposition = words[marker].selected.lemma;
      const candidates = [...frames, ...this.languageRoots.map((entry) => entry.frame)
        .filter((frame): frame is NonNullable<typeof frame> => Boolean(frame))]
        .filter((frame) => frame.id.startsWith(`${lemma}.`));
      for (const frame of candidates) {
        for (const mapping of frame.syntax ?? []) {
          for (const [role, relation] of Object.entries(mapping)) {
            if (relation !== 'obl') continue;
            const cases = obliqueCases.filter((entry) => entry.frame === frame.id && entry.role === role);
            if (cases.length && !cases.some((entry) => entry.preposition === preposition)) continue;
            const prefers = frame.roles?.[role]?.prefers ?? [];
            if (prefers.length && !prefers.some((expected) => isSubtype(type, expected))) continue;
            return { rule: frame.defaultTemplate ? 'UD_OBL_FRAME_UNCERTAIN' : 'UD_OBL_FRAME_ARGUMENT',
              frameId: frame.id, argument: !frame.defaultTemplate };
          }
        }
      }
      return { rule: 'UD_OBL_ADJUNCT', argument: false };
    };

    for (let i = 0; i < words.length; i++) {
      if (pos(i) === 'PUNCT') set(i, root, 'punct', 'UD_PUNCT_ROOT');
      const copular = copularPredicates.find((entry) => entry.copula === i);
      if (copular) set(i, copular.predicate, copular.relation, copular.rule);
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) === 'DET' || pos(i) === 'NUM') {
        const head = nearestRight(i, (candidate) => isNominal(candidate), i + 4);
        if (head >= 0) set(i, head, pos(i) === 'NUM' ? 'nummod' : 'det', pos(i) === 'NUM' ? 'UD_NUMMOD' : 'UD_DET');
      }
      if (pos(i) === 'PRON' && feat(i, 'PronType') === 'Int' && pos(i + 1) === 'NOUN') {
        set(i, i + 1, 'det', 'UD_INTERROGATIVE_DET');
      }
      if ((pos(i) === 'DET' || pos(i) === 'PRON') && pos(i + 1) === 'PRON' && feat(i + 1, 'PronType') === 'Int' && pos(i + 2) !== 'NOUN') {
        set(i, root, 'obj', 'UD_INTERROGATIVE_FIXED_HEAD');
        set(i + 1, i, 'fixed', 'UD_INTERROGATIVE_FIXED');
      }
    }

    for (let i = 0; i < words.length - 1; i++) {
      if (pos(i) === 'PROPN' && pos(i + 1) === 'PROPN') set(i + 1, i, 'flat:name', 'UD_PROPER_NAME');
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'ADJ' || i === root || assigned(i) || copularPredicates.some((entry) => entry.predicate === i)) continue;
      if (nominalized(i)) continue;
      const nominalLeft = nearestLeft(i, (candidate) => isNominal(candidate));
      const nominalRight = nearestRight(i, (candidate) => isNominal(candidate));
      const head = nominalLeft === i - 1 ? nominalLeft : nominalRight === i + 1 ? nominalRight : -1;
      if (head >= 0) set(i, head, 'amod', 'UD_AMOD_ADJACENT_NOMINAL');
    }

    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'ADP') continue;
      const nextVerb = nearestRight(i, (candidate) => verbal.has(pos(candidate)), i + 3);
      const nextNominal = nearestRight(i, (candidate) => isNominal(candidate), i + 4);
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

    for (const rule of coordinationLists) {
      for (let i = 0; i < words.length; i++) {
        if (pos(i) !== 'CCONJ') continue;
        const last = arcs[i].head - 1;
        if (last < 0 || !rule.memberUpos.includes(pos(last))) continue;
        const prior = nearestLeft(i, (candidate) => pos(candidate) === pos(last));
        if (prior < 0) continue;
        const members = [prior, last];
        let cursor = prior;
        while (cursor >= 2 && words[cursor - 1].form === rule.separator && pos(cursor - 2) === pos(last)) {
          set(cursor - 1, cursor, rule.punctuationRelation, `${rule.id}_PUNCT`);
          members.unshift(cursor - 2);
          cursor -= 2;
        }
        if (members.length < 3) continue;
        for (const member of members.slice(1)) set(member, members[0], rule.relation, rule.id);
      }
    }

    const embeddedInterrogatives: Array<{ marker: number; clause: number; rule: typeof embeddedInterrogativeRules[number] }> = [];
    for (let i = 0; i < words.length; i++) {
      if (!verbal.has(pos(i)) || i === root || i === copula || assigned(i)) continue;
      const marker = nearestLeft(i, (candidate) => pos(candidate) === 'SCONJ' ||
        (pos(candidate) === 'PRON' && feat(candidate, 'PronType') === 'Rel') ||
        (pos(candidate) === 'ADV' && feat(candidate, 'PronType') === 'Rel') ||
        embeddedInterrogativeRules.some((rule) => rule.markerUpos.includes(pos(candidate)) &&
          Object.entries(rule.markerFeature).every(([key, value]) => feat(candidate, key) === value)));
      const precedingVerb = nearestLeft(i, (candidate) => verbal.has(pos(candidate)) && candidate !== i);
      if (marker >= 0 && (precedingVerb < 0 || marker > precedingVerb)) {
        const relative = feat(marker, 'PronType') === 'Rel';
        const interrogativeRule = embeddedInterrogativeRules.find((rule) => rule.markerUpos.includes(pos(marker)) &&
          Object.entries(rule.markerFeature).every(([key, value]) => feat(marker, key) === value));
        const matrixLemma = words[precedingVerb]?.selected.lemma;
        const matrixAcceptsClause = interrogativeRule && [...frames, ...this.languageRoots.map((entry) => entry.frame)
          .filter((frame): frame is NonNullable<typeof frame> => Boolean(frame))].some((frame) =>
          frame.id.startsWith(`${matrixLemma}.`) && frame.syntax?.some((mapping) =>
            Object.values(mapping).includes(interrogativeRule.requiresMatrixRelation)));
        const antecedent = relative ? nearestLeft(marker, (candidate) => pos(candidate) === 'NOUN') : -1;
        if (interrogativeRule && precedingVerb >= 0 && matrixAcceptsClause) {
          set(i, precedingVerb, interrogativeRule.relation, interrogativeRule.id);
          embeddedInterrogatives.push({ marker, clause: i, rule: interrogativeRule });
        } else if (relative && antecedent >= 0) set(i, antecedent, 'acl:relcl', 'UD_RELATIVE');
        else if (comma >= 0 && i < comma || (marker === 0 && comma >= 0)) set(i, root, 'advcl', 'UD_ADVCL_INITIAL');
        else if (marker > root && pos(marker) === 'SCONJ') {
          const adjunctMarker = markers.some((entry) => entry.form === words[marker].selected.lemma);
          set(i, root, adjunctMarker ? 'advcl' : 'ccomp', adjunctMarker ? 'UD_ADVCL_MARKER' : 'UD_CCOMP');
        }
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

    for (const entry of copularPredicates) {
      if (entry.predicate === root) continue;
      const marker = nearestLeft(entry.copula, (candidate) => pos(candidate) === 'SCONJ');
      const rule = copularClauseRules.find((candidate) => marker >= 0 &&
        candidate.markerForms.includes(words[marker].selected.lemma) &&
        candidate.predicateUpos.includes(pos(entry.predicate)));
      if (!rule) continue;
      set(entry.predicate, root, rule.relation, rule.id);
      set(marker, entry.predicate, 'mark', `${rule.id}_MARK`);
    }

    for (let i = 0; i < words.length; i++) {
      for (const expression of pragmaticExpressions) {
        const parts = expression.form.split(' ');
        const single = words[i].form.normalize('NFC').toLocaleLowerCase('pt-BR') === expression.form;
        const sequence = parts.every((part, offset) => words[i + offset]?.form.normalize('NFC').toLocaleLowerCase('pt-BR') === part);
        if (!single && !sequence) continue;
        set(i, root, expression.relation, expression.id);
        if (sequence) for (let offset = 1; offset < parts.length; offset++) set(i + offset, i, 'fixed', `${expression.id}_FIXED`);
      }
    }

    const clauses = words.map((_, index) => index).filter((index) => index === root || arcs[index].deprel === 'ccomp' || arcs[index].deprel === 'advcl' || arcs[index].deprel === 'acl:relcl');
    for (const clause of clauses.filter((index) => index !== root).concat(root)) {
      const head = clause;
      const markerForClause = nearestLeft(clause, (candidate) =>
        arcs[candidate].head === clause + 1 && arcs[candidate].deprel === 'mark' ||
        embeddedInterrogatives.some((entry) => entry.clause === clause && entry.marker === candidate) ||
        arcs[clause].deprel === 'acl:relcl' && feat(candidate, 'PronType') === 'Rel'
      );
      const initialSubordinate = comma > 0 && (pos(0) === 'SCONJ' || pos(0) === 'ADV');
      const start = clause === root && initialSubordinate && root > comma ? comma + 1 : clause === root ? 0 : markerForClause >= 0 ? markerForClause + 1 : 0;
      const end = clause === root && comma < 0 ? words.length : clause === root ? words.length : Math.min(words.length, nearestRight(clause, (candidate) => pos(candidate) === 'PUNCT') + 1 || words.length);
      const before = [] as number[];
      for (let i = start; i < head; i++) {
        if (!isNominal(i) || assigned(i) || feat(i, 'Clitic') === 'Yes') continue;
        if (nearestLeft(i, (candidate) => pos(candidate) === 'ADP' && arcs[candidate].head === i + 1) >= 0) continue;
        before.push(i);
      }
      const agreementHead = isFinite(head) ? head : copula ?? head;
      const finiteFeats = words[agreementHead]?.selected.feats ?? {};
      const agreement = (candidate: number): number => {
        const candidateFeats = words[candidate].selected.feats;
        const person = candidateFeats.Person ?? (isNominal(candidate) ? '3' : undefined);
        const number = candidateFeats.Number;
        return (finiteFeats.Person && person ? (finiteFeats.Person === person ? 2 : -2) : 0) +
          (finiteFeats.Number && number ? (finiteFeats.Number === number ? 1 : -1) : 0);
      };
      const question = words.some((word, index) => word.form === '?' ||
        word.selected.feats.PronType === 'Int' && !embeddedInterrogatives.some((entry) => entry.marker === index));
      const subject = before.length ? [...before].sort((a, b) => agreement(b) - agreement(a) || b - a)[0]
        : question && clause === root ? nearestRight(head, (candidate) => candidate < end && isNominal(candidate) && !assigned(candidate))
          : -1;
      if (subject !== undefined && subject >= 0 && subject < end && subject !== root) {
        const copular = copularPredicates.find((entry) => entry.predicate === head);
        set(subject, head, copular?.subjectRelation ?? 'nsubj', 'UD_NSUBJ_AGREEMENT');
      }
      if (clause !== root && arcs[clause].deprel === 'acl:relcl') {
        const relative = nearestLeft(clause, (candidate) => feat(candidate, 'PronType') === 'Rel' && !assigned(candidate));
        if (relative >= 0) {
          if (pos(relative) === 'ADV') set(relative, clause, 'advmod', 'UD_RELATIVE_ADVERB');
          else set(relative, clause, subject >= 0 ? 'obj' : 'nsubj', subject >= 0 ? 'UD_RELATIVE_OBJECT' : 'UD_RELATIVE_SUBJECT');
        }
      }
    }

    for (const entry of embeddedInterrogatives) {
      if (pos(entry.marker) === 'ADV') {
        set(entry.marker, entry.clause, entry.rule.adverbRelation, entry.rule.id);
      } else {
        const overtSubject = arcs.some((arc) => arc.head === entry.clause + 1 && arc.deprel === 'nsubj');
        set(entry.marker, entry.clause, overtSubject ? entry.rule.nominalObjectRelation : entry.rule.nominalSubjectRelation, entry.rule.id);
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (!isNominal(i) || assigned(i) || i === root) continue;
      const caseMarker = nearestLeft(i, (candidate) => pos(candidate) === 'ADP' && arcs[candidate].head === i + 1);
      if (caseMarker >= 0) {
        const nominalHead = nearestLeft(caseMarker, (candidate) => pos(candidate) === 'NOUN' || pos(candidate) === 'PROPN');
        const preposition = words[caseMarker].selected.lemma;
        const nominalRule = nominalPpRules.find((rule) =>
          nominalHead >= 0 && rule.prepositions.includes(preposition) &&
          !words.slice(nominalHead + 1, caseMarker).some((word) => rule.barrierUpos.includes(word.selected.upos)) &&
          (rule.scope === 'adjacent-nominal' || rule.scope === 'before-finite-verb' &&
            nearestLeft(caseMarker, isFinite) < 0 && nearestRight(caseMarker, isFinite) >= 0)
        );
        if (nominalRule) set(i, nominalHead, nominalRule.relation, nominalRule.id);
        else {
          const head = governor(caseMarker);
          const nearestChoice = obliqueRule(head, i, caseMarker);
          const matrix = arcs[head]?.deprel === 'xcomp' ? arcs[head].head - 1 : -1;
          const matrixChoice = matrix >= 0 ? obliqueRule(matrix, i, caseMarker) : undefined;
          const matrixArgument = matrixChoice?.argument && !nearestChoice.argument;
          const selectedHead = matrixArgument ? matrix : head;
          const selectedRule = matrixArgument ? `${matrixChoice.rule}:${matrixChoice.frameId}` : nearestChoice.rule;
          set(i, selectedHead, 'obl', selectedRule);
        }
      }
      else {
        const followingXcomp = words[i].selected.feats.Clitic === 'Yes' && arcs[i + 1]?.deprel === 'xcomp' ? i + 1 : -1;
        const temporal = typeByLemma.get(words[i].selected.lemma) === 'TEMPO';
        set(i, followingXcomp >= 0 ? followingXcomp : governor(i), temporal ? 'obl' : 'obj', followingXcomp >= 0 ? 'UD_CLITIC_XCOMP' : temporal ? 'UD_TEMPORAL_OBLIQUE' : 'UD_OBJ');
      }
    }
    for (let i = 0; i < words.length; i++) {
      if (pos(i) !== 'ADV' || assigned(i)) continue;
      const degreeRule = degreeRules.rules.find((rule) => rule.headUpos.includes(pos(i + 1)) &&
        (pos(i + 1) === 'ADJ' || degreeRules.gradableHeads.some((entry) => entry.upos === pos(i + 1) && entry.lemmas.includes(words[i + 1].selected.lemma))) &&
        degreeRules.classes.some((entry) => entry.class === rule.class && entry.lemmas.includes(words[i].selected.lemma)));
      if (degreeRule) { set(i, i + 1, degreeRule.relation, degreeRule.id); continue; }
      const emphatic = (adjunctData as { adverbs: Array<{ form?: string; role: string }> }).adverbs.some((entry) => entry.form === words[i].selected.lemma && entry.role === 'emph');
      if (emphatic) {
        const target = nearestRight(i, (candidate) => nominals.has(pos(candidate)), i + 3);
        if (target >= 0) { set(i, target, 'advmod:emph', 'UD_EMPHATIC_ADVERB'); continue; }
      }
      const left = governor(i);
      set(i, left, 'advmod', 'UD_ADVMOD');
    }
    return arcs;
  }
}
