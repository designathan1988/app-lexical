import type { KnowledgeBase } from '../../knowledge/knowledgeBase';
import type { TeachableRoot } from '../../knowledge/language/teachableRoot';
import { LANGUAGE_PARADIGMS } from './LanguageInflector';
import { generateForms } from '../../knowledge/paradigms';
import { createDerivationalAnalyzer } from '../../knowledge/morphology';
import { buildMorphologyData } from '../../knowledge/morphology';

export interface NetworkView {
  lemma: string;
  forms: Array<{ surface: string; features: string }>;
  derivatives: Array<{ form: string; status: 'ATTESTED' | 'HYPOTHESIS'; rule: string }>;
  sense: string;
  gloss: string;
  frame?: string;
  semanticType: string;
  paradigm: string;
  paradigmRule: string;
}

export function buildNetworkView(root: TeachableRoot, kb: KnowledgeBase): NetworkView {
  const paradigm = LANGUAGE_PARADIGMS[root.paradigmId];
  const forms = paradigm ? generateForms(root.id, root.lemma, paradigm).map((form) => ({ surface: form.surface, features: form.featureKey })) : [];
  const stem = paradigm?.strip && root.lemma.endsWith(paradigm.strip)
    ? root.lemma.slice(0, -paradigm.strip.length)
    : root.lemma;
  const morphology = createDerivationalAnalyzer(kb.lexemes, kb.languageRoots);
  const rules = buildMorphologyData(kb.lexemes, kb.languageRoots).rules;
  const derivatives: NetworkView['derivatives'] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const accepted = rule.input?.pos ? Array.isArray(rule.input.pos) ? rule.input.pos : [rule.input.pos] : [];
    if (rule.process !== 'SUFFIX' || !rule.form.suffix || !accepted.includes(root.pos)) continue;
    const form = stem + rule.form.suffix;
    if (seen.has(form)) continue;
    const reading = morphology.analyze(form).find((item) => item.root.id === root.id && item.chain.some((step) => step.rule === rule.id));
    if (!reading || reading.status === 'HYPOTHESIS_BLOCKED') continue;
    seen.add(form);
    derivatives.push({ form, status: reading.status, rule: rule.id });
  }
  return {
    lemma: root.lemma,
    forms,
    derivatives,
    sense: root.sense.id,
    gloss: root.sense.gloss,
    frame: root.frame?.id,
    semanticType: root.sense.semanticType,
    paradigm: root.paradigmId,
    paradigmRule: root.paradigmRule
  };
}
