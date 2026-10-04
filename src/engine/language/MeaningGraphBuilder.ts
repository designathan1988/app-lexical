import seedData from '../../knowledge/morphology/seed-roots.json';
import frameData from '../../knowledge/morphology/frames.json';
import semanticTypes from '../../knowledge/morphology/semantic-types.json';
import supplementData from '../../knowledge/language/lexical-supplements.json';
import adjunctData from '../../knowledge/language/adjunct-roles.json';
import pronounData from '../../knowledge/language/implicit-pronouns.json';
import pragmaticsData from '../../knowledge/language/pragmatics.json';
import coercionData from '../../knowledge/language/semantic-coercions.json';
import nominalPpData from '../../knowledge/language/nominal-pp-rules.json';
import coordinationData from '../../knowledge/language/coordination-rules.json';
import degreeData from '../../knowledge/language/degree-modifier-rules.json';
import pronounConceptData from '../../knowledge/language/pronoun-concept-rules.json';
import copularClauseData from '../../knowledge/language/copular-clause-rules.json';
import frameObliqueData from '../../knowledge/language/frame-oblique-cases.json';
import type { DependencyArc } from './DependencyParser';
import type { ClauseAnalysis } from './ClauseAnalyzer';
import type { TaggedWord } from './Tagger';
import type { TeachableRoot } from '../../knowledge/language/teachableRoot';

export interface MeaningNode { id: string; concept: string; token?: number }
export interface MeaningEdge { from: string; role: string; to: string; rule: string }
export interface MeaningAttribute { from: string; role: string; value: string; rule: string }
export interface MeaningGraph {
  root: string;
  nodes: MeaningNode[];
  edges: MeaningEdge[];
  attributes: MeaningAttribute[];
  penman: string;
  diagnostics: Array<{ code: string; alternatives: string[] }>;
  trace: Array<{ rule: string; token?: number; detail: string }>;
}

interface Seed { lemma: string; pos: string; senses?: Array<{ id: string; semanticType?: string }> }
interface Frame {
  id: string;
  roles?: Record<string, { prefers?: string[] }>;
  syntax?: Array<Record<string, string>>;
  control?: 'SUBJECT' | 'OBJECT';
  complement?: string;
  defaultTemplate?: boolean;
}

const seeds = (seedData as { entries: Seed[] }).entries;
const supplements = (supplementData as { entries: Array<{ lemma: string; semanticType?: string; sense?: string }> }).entries;
const frames = (frameData as unknown as { frames: Frame[] }).frames;
const typeParents = new Map((semanticTypes as { types: Array<{ id: string; isA: string | null }> }).types.map((item) => [item.id, item.isA]));
const adjuncts = adjunctData as {
  prepositions: Array<{ id: string; form: string; semanticType: string; role: string; priority?: string }>;
  markers: Array<{ id: string; form: string; role: string; feats?: Record<string, string> }>;
  interrogatives: Array<{ id: string; form: string; role: string; semanticType: string }>;
  adverbs: Array<{ id: string; form?: string; semanticType?: string; role: string; polarity?: string }>;
};
const pronouns = pronounData as { entries: Array<{ person: string; number: string; form: string }>; imperativeSubject: string; unknownConcept: string };
const pragmaticExpressions = (pragmaticsData as { expressions: Array<{ id: string; form: string; attribute: { role: string; value: string } }> }).expressions;
const coercions = (coercionData as { rules: Array<{ id: string; from: string; to: string; contextRole: string }> }).rules;
const nominalPpRules = (nominalPpData as { rules: Array<{ id: string; semanticRole: string }> }).rules;
const coordination = coordinationData as { operators: Array<{ id: string; form: string; concept: string }>; defaultOperator: string };
const degreeRules = degreeData as { classes: Array<{ class: string; lemmas: string[] }>;
  rules: Array<{ id: string; class: string; headUpos: string[]; semanticRole: string }> };
const pronounConceptRules = (pronounConceptData as { rules: Array<{
  id: string; lemmas: string[]; conceptSource: string
}> }).rules;
const copularClauseRules = (copularClauseData as { rules: Array<{
  id: string; predicateUpos: string[]; relation: string; semanticSubjectRole?: string
}> }).rules;
const frameObliqueCases = (frameObliqueData as { entries: Array<{
  id?: string; frame: string; preposition: string; semanticRole?: string
}> }).entries;

function isSubtype(actual: string | undefined, expected: string): boolean {
  for (let cursor = actual; cursor; cursor = typeParents.get(cursor) ?? undefined) if (cursor === expected) return true;
  return false;
}

function subtypeDistance(actual: string | undefined, expected: string): number | undefined {
  let distance = 0;
  for (let cursor = actual; cursor; cursor = typeParents.get(cursor) ?? undefined, distance++) {
    if (cursor === expected) return distance;
  }
  return undefined;
}

function semanticType(lemma: string, upos: string): string {
  const seed = seeds.find((entry) => entry.lemma === lemma && entry.pos === ({ ADJ: 'ADJECTIVE', ADV: 'ADVERB', PRON: 'PRONOUN' } as Record<string, string>)[upos] || entry.lemma === lemma && entry.pos === upos);
  return seed?.senses?.[0]?.semanticType ?? supplements.find((entry) => entry.lemma === lemma)?.semanticType ?? (upos === 'PRON' ? 'PESSOA' : 'ENTIDADE');
}

function preferredRole(frame: Frame | undefined, relation: string, fallback: string): string {
  for (const mapping of frame?.syntax ?? []) {
    for (const [role, syntax] of Object.entries(mapping)) if (syntax === relation) return role;
  }
  return fallback;
}

function serialize(root: string, nodes: MeaningNode[], edges: MeaningEdge[], attributes: MeaningAttribute[]): string {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const emit = (id: string): string => {
    if (seen.has(id)) return id;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return id;
    const parts = [`(${id} / ${node.concept}`];
    for (const edge of edges.filter((item) => item.from === id)) parts.push(` :${edge.role} ${emit(edge.to)}`);
    for (const attribute of attributes.filter((item) => item.from === id)) parts.push(` :${attribute.role} ${attribute.value}`);
    parts.push(')');
    return parts.join('');
  };
  return emit(root);
}

export class MeaningGraphBuilder {
  constructor(private languageRoots: TeachableRoot[] = []) {}

  build(words: TaggedWord[], arcs: DependencyArc[], clause: ClauseAnalysis): MeaningGraph {
    const nodes: MeaningNode[] = [];
    const edges: MeaningEdge[] = [];
    const attributes: MeaningAttribute[] = [];
    const diagnostics: MeaningGraph['diagnostics'] = [];
    const trace: MeaningGraph['trace'] = [];
    if (!words.length) return { root: '', nodes, edges, attributes, penman: '', diagnostics, trace };
    const tokenNodes = new Map<number, string>();
    const selectedFrames = new Map<number, Frame | undefined>();
    const node = (concept: string, token?: number): string => {
      const id = `n${nodes.length + 1}`;
      nodes.push({ id, concept, token });
      if (token !== undefined) tokenNodes.set(token, id);
      trace.push({ rule: token === undefined ? 'SEM_IMPLICIT_CONCEPT' : 'SEM_TOKEN_CONCEPT', token, detail: `${id}:${concept}` });
      return id;
    };
    const edge = (from: string, role: string, to: string, rule: string) => {
      if (!edges.some((item) => item.from === from && item.role === role && item.to === to)) edges.push({ from, role, to, rule });
      trace.push({ rule, detail: `${from}:${role}:${to}` });
    };
    const attr = (from: string, role: string, value: string, rule: string) => {
      if (!attributes.some((item) => item.from === from && item.role === role && item.value === value)) attributes.push({ from, role, value, rule });
      trace.push({ rule, detail: `${from}:${role}:${value}` });
    };
    const typeOf = (index: number): string => this.languageRoots.find((root) => root.lemma === words[index].selected.lemma)?.sense.semanticType
      ?? semanticType(words[index].selected.lemma, words[index].selected.upos);
    const childIndices = (head: number, relation?: string) => arcs.filter((arc) => arc.head === head + 1 && (!relation || arc.deprel === relation)).map((arc) => arc.id - 1);
    const relativeAntecedent = (index: number, headIndex: number): number =>
      words[index].selected.feats.PronType === 'Rel' && arcs[headIndex]?.deprel === 'acl:relcl'
        ? arcs[headIndex].head - 1
        : -1;
    const chooseFrame = (index: number): Frame | undefined => {
      const lemma = words[index].selected.lemma;
      const candidates = [...frames, ...this.languageRoots.map((root) => root.frame).filter((frame): frame is NonNullable<typeof frame> => Boolean(frame))]
        .filter((frame) => frame.id.startsWith(`${lemma}.`));
      if (!candidates.length) return undefined;
      const seedOrder = seeds.find((entry) => entry.lemma === lemma && entry.pos === 'VERB')?.senses?.map((sense) => sense.id) ?? [];
      const interrogativeRoles = arcs.filter((item) => item.head === index + 1 && item.deprel === 'advmod')
        .map((arc) => adjuncts.interrogatives.find((item) => item.form === words[arc.id - 1].selected.lemma)?.role)
        .filter((role): role is string => Boolean(role));
      const scored = candidates.map((frame, order) => {
        let score = 0;
        const appliedCoercions: Array<{ rule: string; token: number; detail: string }> = [];
        const preferences: Array<{ rule: string; token: number; detail: string }> = [];
        for (const arc of arcs.filter((item) => item.head === index + 1)) {
          if (!['nsubj', 'obj', 'obl', 'xcomp', 'ccomp'].includes(arc.deprel)) continue;
          const role = arc.deprel === 'nsubj' ? preferredRole(frame, arc.deprel, 'ARG0')
            : arc.deprel === 'obj' ? preferredRole(frame, arc.deprel, 'ARG1')
              : arc.deprel === 'obl' ? preferredRole(frame, arc.deprel, 'ARG2')
                : preferredRole(frame, arc.deprel, 'ARG1');
          const argumentType = arc.deprel === 'xcomp' ? 'ACAO' : arc.deprel === 'ccomp' ? 'INFORMACAO' : typeOf(arc.id - 1);
          const prefers = frame.roles?.[role]?.prefers ?? [];
          const coercedType = coercions.find((item) => isSubtype(argumentType, item.from) && interrogativeRoles.includes(item.contextRole) && prefers.some((type) => isSubtype(item.to, type)));
          const matches = prefers.map((type) => ({ type, distance: subtypeDistance(argumentType, type) }))
            .filter((match): match is { type: string; distance: number } => match.distance !== undefined)
            .sort((a, b) => a.distance - b.distance);
          if (matches.length) {
            score += 2;
            if ((arc.deprel === 'obj' || arc.deprel === 'obl') && isSubtype(argumentType, 'OBJETO')) {
              score += 1 / (1 + matches[0].distance);
            }
            preferences.push({ rule: 'SENSE_PREFERENCE', token: arc.id,
              detail: `${frame.id}:${role}:${argumentType}→${matches[0].type}:dist=${matches[0].distance}` });
          }
          else if (coercedType) score += 2;
          else if (prefers.length) score -= 1;
          if (coercedType) appliedCoercions.push({ rule: coercedType.id, token: arc.id, detail: `${argumentType}→${coercedType.to}` });
          if (frame.syntax?.some((mapping) => Object.values(mapping).includes(arc.deprel))) score += 1;
          if (frame.complement === arc.deprel) score += 1;
        }
        if (frame.defaultTemplate) score -= 0.25;
        for (const arc of arcs.filter((item) => item.head === index + 1 && item.deprel === 'advmod')) {
          const interrogative = adjuncts.interrogatives.find((item) => item.form === words[arc.id - 1].selected.lemma);
          if (interrogative && Object.values(frame.roles ?? {}).some((role) => role.prefers?.includes(interrogative.semanticType))) score += 2;
        }
        return { frame, score, order: seedOrder.indexOf(frame.id) >= 0 ? seedOrder.indexOf(frame.id) : order + seedOrder.length, appliedCoercions, preferences };
      }).sort((a, b) => b.score - a.score || a.order - b.order);
      if (scored.length > 1 && scored[0].score === scored[1].score) diagnostics.push({ code: 'AMBIGUOUS_SENSE', alternatives: scored.filter((item) => item.score === scored[0].score).map((item) => item.frame.id) });
      if (scored[0].frame.defaultTemplate) diagnostics.push({ code: 'UNCERTAIN_FRAME', alternatives: [scored[0].frame.id] });
      trace.push(...scored[0].appliedCoercions);
      trace.push(...scored[0].preferences);
      trace.push({ rule: 'SENSE_FRAME_PREF', token: index + 1, detail: scored.map((item) => `${item.frame.id} (${item.score})`).join(' > ') });
      return scored[0].frame;
    };
    const content = (index: number): string => {
      const existing = tokenNodes.get(index + 1);
      if (existing) return existing;
      const reading = words[index].selected;
      let concept = reading.lemma;
      if (reading.upos === 'PROPN') {
        const continuation = childIndices(index, 'flat:name');
        if (continuation.length) concept = [words[index].form, ...continuation.map((child) => words[child].form)].join(' ');
      }
      if (reading.feats.PronType === 'Int' && (reading.upos === 'PRON' || reading.upos === 'DET')) concept = pronouns.unknownConcept;
      if (arcs[index].deprel === 'obj' && childIndices(index, 'fixed').some((child) => words[child].selected.feats.PronType === 'Int')) concept = pronouns.unknownConcept;
      if (reading.upos === 'PRON' && reading.feats.Clitic !== 'Yes') {
        const rule = pronounConceptRules.find((entry) => entry.lemmas.includes(reading.lemma));
        concept = rule?.conceptSource === 'lemma' ? reading.lemma : words[index].form.normalize('NFC').toLocaleLowerCase('pt-BR');
        if (rule) trace.push({ rule: rule.id, token: index + 1, detail: `${words[index].form}→${concept}` });
      }
      if (reading.feats.PronType === 'Int') concept = pronouns.unknownConcept;
      if (reading.upos === 'VERB' || reading.upos === 'AUX') {
        const frame = chooseFrame(index);
        selectedFrames.set(index, frame);
        concept = frame?.id ?? this.languageRoots.find((root) => root.lemma === reading.lemma)?.sense.id
          ?? supplements.find((entry) => entry.lemma === reading.lemma)?.sense
          ?? seeds.find((entry) => entry.lemma === reading.lemma && entry.pos === 'VERB')?.senses?.[0]?.id ?? reading.lemma;
      }
      return node(concept, index + 1);
    };
    const implicit = (person: string, number: string, imperative = false): string => {
      const form = imperative ? pronouns.imperativeSubject : pronouns.entries.find((entry) => entry.person === person && entry.number === number)?.form;
      const existing = nodes.find((item) => item.concept === form);
      return existing?.id ?? node(form ?? pronouns.unknownConcept);
    };
    const roleForOblique = (head: number, target: number): { role: string; rule: string } => {
      const type = typeOf(target);
      const preposition = childIndices(target, 'case').map((index) => words[index].selected.lemma)[0];
      const frame = selectedFrames.get(head);
      const hasObject = childIndices(head, 'obj').length > 0;
      const frameCase = frameObliqueCases.find((entry) => entry.frame === frame?.id && entry.preposition === preposition && entry.semanticRole);
      if (frameCase?.semanticRole) return { role: frameCase.semanticRole, rule: frameCase.id ?? `FRAME:${frame?.id}:${frameCase.semanticRole}` };
      const directionalAdjunct = adjuncts.prepositions.find((item) => item.priority === 'BEFORE_FRAME'
        && item.form === preposition && isSubtype(type, item.semanticType));
      if (directionalAdjunct) return { role: directionalAdjunct.role, rule: directionalAdjunct.id };
      if (frame?.roles?.ARG2 && hasObject && isSubtype(type, frame.roles.ARG2.prefers?.[0] ?? '_')) return { role: 'ARG2', rule: `FRAME:${frame.id}:ARG2` };
      if (frame?.roles?.ARG1 && !hasObject && frame.roles.ARG1.prefers?.some((pref) => isSubtype(type, pref)) && !isSubtype(type, 'TEMPO') && !isSubtype(type, 'LUGAR')) return { role: 'ARG1', rule: `FRAME:${frame.id}:ARG1` };
      const rule = adjuncts.prepositions.find((item) => item.form === preposition && isSubtype(type, item.semanticType));
      if (rule) return { role: rule.role, rule: rule.id };
      if (isSubtype(type, 'TEMPO')) return { role: 'TIME', rule: 'SEM_TYPE_TIME' };
      if (isSubtype(type, 'LUGAR')) return { role: 'LOC', rule: 'SEM_TYPE_LOC' };
      return { role: 'ARG1', rule: 'SEM_OBLIQUE_FALLBACK' };
    };

    const rootIndex = arcs.findIndex((arc) => arc.head === 0);
    let root = content(Math.max(rootIndex, 0));
    for (let index = 0; index < words.length; index++) {
      const relation = arcs[index].deprel;
      if (!['root', 'nsubj', 'obj', 'obl', 'nmod', 'xcomp', 'ccomp', 'advcl', 'acl:relcl', 'conj'].includes(relation)) continue;
      if (relation === 'root') continue;
      const headIndex = arcs[index].head - 1;
      if (headIndex < 0) continue;
      const head = content(headIndex);
      if (relation === 'nsubj') {
        const copularPredicate = words[headIndex].selected.upos === 'ADJ' || arcs.some((arc) => arc.head === headIndex + 1 && arc.deprel === 'cop');
        const antecedent = relativeAntecedent(index, headIndex);
        const frame = selectedFrames.get(headIndex);
        const role = preferredRole(frame, 'nsubj', copularPredicate ? 'ARG1' : 'ARG0');
        edge(head, role, content(antecedent >= 0 ? antecedent : index), antecedent >= 0 ? 'SEM_RELATIVE_SUBJECT' : frame ? `FRAME:${frame.id}:${role}` : 'SEM_SUBJECT_FALLBACK');
      } else if (relation === 'obj') {
        const antecedent = relativeAntecedent(index, headIndex);
        const frame = selectedFrames.get(headIndex);
        const role = preferredRole(frame, 'obj', 'ARG1');
        edge(head, role, content(antecedent >= 0 ? antecedent : index), antecedent >= 0 ? 'SEM_RELATIVE_OBJECT' : frame ? `FRAME:${frame.id}:${role}` : 'SEM_OBJECT_FALLBACK');
      } else if (relation === 'obl') {
        const assignment = roleForOblique(headIndex, index);
        edge(head, assignment.role, content(index), assignment.rule);
      } else if (relation === 'nmod') {
        const rule = nominalPpRules.find((entry) => entry.id === arcs[index].rule);
        edge(head, rule?.semanticRole ?? 'mod', content(index), arcs[index].rule);
      } else if (relation === 'xcomp' || relation === 'ccomp') {
        const child = content(index);
        const frame = selectedFrames.get(headIndex);
        const role = preferredRole(frame, relation, 'ARG1');
        edge(head, role, child, frame ? `FRAME:${frame.id}:${role}` : `SEM_${relation.toUpperCase()}`);
        if (relation === 'xcomp' && !childIndices(index, 'nsubj').length) {
          const control = selectedFrames.get(headIndex)?.control;
          const controller = childIndices(headIndex, control === 'OBJECT' ? 'obj' : 'nsubj')[0];
          const subject = controller === undefined
            ? implicit(words[headIndex].selected.feats.Person ?? '3', words[headIndex].selected.feats.Number ?? 'Sing')
            : content(controller);
          edge(child, 'ARG0', subject, 'SEM_CONTROL');
        }
      } else if (relation === 'advcl') {
        const marker = childIndices(index, 'mark').map((item) => words[item].selected.lemma)[0];
        const markerRule = adjuncts.markers.find((item) => item.form === marker &&
          Object.entries(item.feats ?? {}).every(([key, value]) => words[index].selected.feats[key] === value));
        edge(head, markerRule?.role ?? 'cause', content(index), markerRule?.id ?? 'SEM_ADVCL_FALLBACK');
      } else if (relation === 'acl:relcl') {
        edge(head, 'mod', content(index), 'SEM_RELATIVE_MOD');
      }
    }
    for (let index = 0; index < words.length; index++) {
      if (arcs[index].deprel !== 'det') continue;
      const headIndex = arcs[index].head - 1;
      if (headIndex < 0) continue;
      if (words[index].selected.feats.PronType === 'Int' && words[index].selected.feats.Number === 'Plur') edge(content(headIndex), 'quant', node(pronouns.unknownConcept), 'SEM_INTERROGATIVE_QUANT');
      if (words[index].selected.feats.Poss === 'Yes') edge(content(headIndex), 'poss', content(index), 'SEM_POSSESSIVE');
    }
    for (let index = 0; index < words.length; index++) {
      const arc = arcs[index];
      if (arc.deprel !== 'advmod') continue;
      const headIndex = arc.head - 1;
      if (headIndex < 0) continue;
      const reading = words[index].selected;
      const degreeRule = degreeRules.rules.find((rule) => rule.headUpos.includes(words[headIndex].selected.upos) &&
        degreeRules.classes.some((entry) => entry.class === rule.class && entry.lemmas.includes(reading.lemma)));
      if (degreeRule) {
        attr(content(headIndex), degreeRule.semanticRole, reading.lemma, degreeRule.id);
        continue;
      }
      const antecedent = relativeAntecedent(index, headIndex);
      if (antecedent >= 0) {
        const role = adjuncts.interrogatives.find((item) => item.form === reading.lemma)?.role ?? 'LOC';
        edge(content(headIndex), role, content(antecedent), 'SEM_RELATIVE_ADVERB');
        continue;
      }
      if (reading.feats.Polarity === 'Neg' && reading.feats.PronType !== 'Int') {
        attr(content(headIndex), 'polarity', '-', 'SEM_NEGATION');
      }
      if (reading.feats.PronType === 'Int') {
        const interrogative = adjuncts.interrogatives.find((item) => item.form === reading.lemma);
        const role = interrogative?.role
          ?? (isSubtype(typeOf(index), 'TEMPO') ? 'TIME' : isSubtype(typeOf(index), 'LUGAR') ? 'LOC' : 'MANNER');
        edge(content(headIndex), role, node(pronouns.unknownConcept), interrogative?.id ?? 'SEM_QUESTION_ROLE');
        continue;
      }
      const rule = adjuncts.adverbs.find((item) => item.form === reading.lemma)
        ?? adjuncts.adverbs.find((item) => item.semanticType && isSubtype(typeOf(index), item.semanticType));
      if (!rule) continue;
      if (['degree', 'emph'].includes(rule.role)) attr(content(headIndex), rule.role, reading.lemma, rule.id);
      else edge(content(headIndex), rule.role, content(index), rule.id);
    }
    for (let index = 0; index < words.length; index++) {
      if (!['advcl', 'acl:relcl', 'ccomp'].includes(arcs[index].deprel)) continue;
      if (childIndices(index, 'nsubj').length) continue;
      const copularRule = copularClauseRules.find((rule) => rule.relation === arcs[index].deprel
        && rule.predicateUpos.includes(words[index].selected.upos)
        && childIndices(index, 'cop').length > 0);
      const matrixSubject = childIndices(arcs[index].head - 1, 'nsubj')[0];
      if (copularRule?.semanticSubjectRole && matrixSubject !== undefined) {
        edge(content(index), copularRule.semanticSubjectRole, content(matrixSubject), copularRule.id);
        continue;
      }
      const feats = words[index].selected.feats;
      if (feats.Person !== '1' && feats.Person !== '2') continue;
      const predicate = content(index);
      const role = preferredRole(selectedFrames.get(index), 'nsubj', 'ARG0');
      edge(predicate, role, implicit(feats.Person, feats.Number ?? 'Sing'), 'SEM_SUBORDINATE_PRO_DROP');
    }
    for (let index = 0; index < words.length; index++) {
      if (arcs[index].deprel !== 'nsubj' || (words[index].selected.feats.Polarity !== 'Neg' && words[index].selected.feats.PronType !== 'Neg')) continue;
      attr(content(arcs[index].head - 1), 'polarity', '-', 'SEM_NEGATIVE_SUBJECT');
    }
    if (!clause.subject.length) {
      const predicate = clause.predicate[0] - 1;
      const feats = words[predicate]?.selected.feats ?? {};
      const mode = clause.mode === 'imperative';
      const subject = implicit(feats.Person ?? '3', feats.Number ?? 'Sing', mode);
      const copularPredicate = words[rootIndex].selected.upos === 'ADJ' || childIndices(rootIndex, 'cop').length > 0;
      const role = mode ? 'ARG0' : preferredRole(selectedFrames.get(rootIndex), 'nsubj', copularPredicate ? 'ARG1' : 'ARG0');
      edge(content(rootIndex), role, subject, mode ? 'SEM_IMPERATIVE_SUBJECT' : 'SEM_IMPLICIT_SUBJECT');
    }
    if (clause.polarity === 'negative') attr(root, 'polarity', '-', 'SEM_POLARITY');
    if (clause.mode === 'interrogative' && !words.some((word) => word.selected.feats.PronType === 'Int')) attr(root, 'mode', 'interrogative', 'SEM_YES_NO_QUESTION');
    if (clause.mode === 'imperative') attr(root, 'mode', 'imperative', 'SEM_IMPERATIVE');
    for (let index = 0; index < words.length; index++) {
      for (const expression of pragmaticExpressions) {
        const parts = expression.form.split(' ');
        const single = words[index].form.normalize('NFC').toLocaleLowerCase('pt-BR') === expression.form;
        const sequence = parts.every((part, offset) => words[index + offset]?.form.normalize('NFC').toLocaleLowerCase('pt-BR') === part);
        if (single || sequence) attr(root, expression.attribute.role, expression.attribute.value, expression.id);
      }
    }
    if (clause.mode === 'declarative' && !clause.subject.length && words[rootIndex]?.selected.feats.Person === '1' && words[rootIndex]?.selected.feats.Number === 'Plur' && childIndices(rootIndex, 'xcomp').length) {
      attr(root, 'mode', 'hortative', 'SEM_HORTATIVE');
    }
    for (const earlier of [...edges].filter((item) => item.role === 'TIME')) {
      const earlierNode = nodes.find((item) => item.id === earlier.to);
      const earlierIndex = earlierNode?.token ? earlierNode.token - 1 : -1;
      if (earlierIndex < 0 || words[earlierIndex].selected.upos !== 'ADV' || !isSubtype(typeOf(earlierIndex), 'TEMPO')) continue;
      const later = edges.find((item) => item.from === earlier.from && item.role === 'TIME' && item.to !== earlier.to &&
        nodes.some((candidate) => candidate.id === item.to && candidate.token && candidate.token - 1 > earlierIndex && words[candidate.token - 1].selected.upos === 'NOUN'));
      const laterNode = later && nodes.find((item) => item.id === later.to);
      const laterIndex = laterNode?.token ? laterNode.token - 1 : -1;
      if (!later || !laterNode || laterIndex < 0 || !isSubtype(typeOf(laterIndex), 'TEMPO')) continue;
      const between = words.slice(earlierIndex + 1, laterIndex);
      if (!between.some((word) => word.selected.upos === 'ADP') ||
          !between.every((word) => word.selected.upos === 'ADP' || word.selected.upos === 'DET')) continue;
      earlierNode!.concept = `${earlierNode!.concept} ${laterNode.concept}`;
      edges.splice(edges.indexOf(later), 1);
      trace.push({ rule: 'SEM_COMPOUND_TIME', token: earlierIndex + 1, detail: `${earlierNode!.id}:${earlierNode!.concept}` });
    }
    const coordinated = new Map<number, number[]>();
    for (const arc of arcs.filter((item) => item.deprel === 'conj')) {
      coordinated.set(arc.head, [...(coordinated.get(arc.head) ?? []), arc.id - 1]);
    }
    for (const [headId, conjuncts] of coordinated) {
      const headIndex = headId - 1;
      if (headIndex < 0) continue;
      const members = [headIndex, ...conjuncts];
      const memberNodes = members.map(content);
      const last = conjuncts[conjuncts.length - 1];
      const coordinatorIndex = childIndices(last, 'cc')[0];
      const coordinator = coordination.operators.find((entry) => entry.form === words[coordinatorIndex]?.selected.lemma);
      const conjunction = node(coordinator?.concept ?? coordination.defaultOperator);
      const incoming = edges.filter((item) => item.to === memberNodes[0] && !memberNodes.includes(item.from));
      for (const item of incoming) item.to = conjunction;
      memberNodes.forEach((member, index) => edge(conjunction, `op${index + 1}`, member, coordinator?.id ?? 'SEM_COORDINATION_DEFAULT'));
      if (root === memberNodes[0]) root = conjunction;
      const shared = edges.find((item) => item.from === memberNodes[0] && (item.role === 'ARG0' || item.role === 'ARG1'));
      for (const conjunct of memberNodes.slice(1)) {
        if (shared && !edges.some((item) => item.from === conjunct && item.role === shared.role)) {
          edge(conjunct, shared.role, shared.to, 'SEM_COORDINATION_SHARED_ARGUMENT');
        }
      }
    }
    const reachable = new Set<string>([root]);
    for (let changed = true; changed;) {
      changed = false;
      for (const item of edges) {
        if (reachable.has(item.from) && !reachable.has(item.to)) {
          reachable.add(item.to);
          changed = true;
        }
      }
    }
    const visibleNodes = nodes.filter((item) => reachable.has(item.id));
    const visibleAttributes = attributes.filter((item) => reachable.has(item.from));
    return { root, nodes: visibleNodes, edges, attributes: visibleAttributes, penman: serialize(root, visibleNodes, edges, visibleAttributes), diagnostics, trace };
  }
}
