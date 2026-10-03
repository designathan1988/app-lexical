// Verificador da pesquisa de morfologia. Rode:
//   node research/morfologia/ref/validate.mjs
//
// 1) valida envelope, esquema, ids únicos e referências cruzadas de todos os JSON;
// 2) confere que TODO exemplo de cada regra é reproduzido por generate;
// 3) roda tests-derivation.json e tests-inflection.json com analyze/inflect/lemmatize;
// 4) imprime a acurácia por categoria e a lista de falhas.
//
// O verificador NUNCA altera o esperado para fazer o teste passar: falhas vão
// para KNOWN_GAPS.md; correções de esperado vão para CHANGES.md desta pasta.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as A from './apply.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (name) => JSON.parse(readFileSync(join(ROOT, name), 'utf8'));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const schemaErrors = [];
const warnings = [];
const failures = [];
const err = (msg) => schemaErrors.push(msg);
const fail = (category, id, detail) => failures.push({ category, id, detail });

// ---------------------------------------------------------------------------
// 1) Esquema e referências cruzadas
// ---------------------------------------------------------------------------

const FILES = [
  'semantic-types.json', 'semantic-functions.json', 'affix-rules.json',
  'inflection-paradigms-proposed.json', 'irregular-verbs.json', 'seed-roots.json',
  'frames.json', 'tests-derivation.json', 'tests-inflection.json', 'tests-sentences.json'
];

const docs = {};
for (const name of FILES) {
  try {
    docs[name] = read(name);
  } catch (e) {
    err(`${name}: não foi possível ler/parsear (${e.message})`);
    continue;
  }
  const d = docs[name];
  if (!d.version) err(`${name}: falta "version"`);
  if (!d.schemaVersion) err(`${name}: falta "schemaVersion"`);
  if (!d.description) err(`${name}: falta "description"`);
}

const idsOf = (arr, label) => {
  const seen = new Set();
  for (const item of arr) {
    if (!item.id) { err(`${label}: item sem id`); continue; }
    if (seen.has(item.id)) err(`${label}: id duplicado ${item.id}`);
    seen.add(item.id);
  }
  return seen;
};

const typeIds = idsOf(docs['semantic-types.json'].types, 'semantic-types');
const fnIds = idsOf(docs['semantic-functions.json'].functions, 'semantic-functions');
idsOf(docs['affix-rules.json'].rules, 'affix-rules');
idsOf(docs['frames.json'].frames, 'frames');
idsOf(docs['seed-roots.json'].entries, 'seed-roots');

for (const t of docs['semantic-types.json'].types) {
  if (t.isA !== null && !typeIds.has(t.isA)) err(`semantic-types: ${t.id}.isA aponta para ${t.isA}, inexistente`);
}
for (const [concept, type] of Object.entries(docs['semantic-types.json'].domainMappings ?? {})) {
  if (!typeIds.has(type)) err(`domainMappings: ${concept} → ${type}, tipo inexistente`);
}
for (const f of docs['semantic-functions.json'].functions) {
  for (const t of f.inputTypes ?? []) if (!typeIds.has(t)) err(`semantic-functions: ${f.id}.inputTypes contém ${t}, inexistente`);
  if (f.outputType && !typeIds.has(f.outputType)) err(`semantic-functions: ${f.id}.outputType = ${f.outputType}, inexistente`);
}

const strategies = Object.keys(docs['affix-rules.json'].stemStrategies);
const paradigmIds = new Set(docs['inflection-paradigms-proposed.json'].paradigms.map((p) => p.id));
const PROJECT_PARADIGMS = new Set([
  'V_AR', 'V_AR_GAR', 'V_AR_CAR', 'V_AR_CED', 'V_ER', 'V_ER_GER', 'V_IR', 'V_FAZER', 'V_POR',
  'V_TER', 'V_ESTAR', 'V_SER', 'V_PODER', 'V_QUERER', 'V_TRAZER', 'V_IR_VERB', 'N_S', 'N_AO_OES',
  'N_AO_AES', 'N_AO_AOS', 'N_L_IS', 'N_R_Z_ES', 'N_INVARIANT', 'ADJ_O', 'ADJ_L', 'ADJ_UNIFORM',
  'ADJ_INVARIANT', 'DET_E', 'DET_UM'
]);
const irregularIds = new Set(docs['irregular-verbs.json'].verbs.map((v) => v.id));
const supplIds = new Set(docs['irregular-verbs.json'].supplementaryParticiples.map((v) => v.id));

for (const r of docs['affix-rules.json'].rules) {
  if (!fnIds.has(r.semantics?.function)) err(`affix-rules: ${r.id}.semantics.function = ${r.semantics?.function}, inexistente`);
  for (const alt of r.semantics?.alsoPossible ?? []) {
    if (!fnIds.has(alt)) err(`affix-rules: ${r.id}.alsoPossible contém ${alt}, inexistente`);
  }
  if (r.stem && !strategies.includes(r.stem)) err(`affix-rules: ${r.id}.stem = ${r.stem}, fora do vocabulário fechado`);
  const out = r.output?.inflectionParadigm;
  if (out && !paradigmIds.has(out) && !PROJECT_PARADIGMS.has(out) && !supplIds.has(out)) {
    err(`affix-rules: ${r.id}.output.inflectionParadigm = ${out}, inexistente`);
  }
  if (!r.sources?.length) err(`affix-rules: ${r.id} sem sources`);
  if (!r.confidence) err(`affix-rules: ${r.id} sem confidence`);
  for (const s of r.sources ?? []) {
    if (s.verified === undefined) err(`affix-rules: ${r.id} tem source sem "verified"`);
  }
  // O prompt admite menos de 5 exemplos "quando não existirem": a regra declara
  // a justificativa e o verificador rebaixa o erro a aviso.
  if ((r.examples ?? []).length < 5) {
    if (r.exampleCountJustified) warnings.push(`affix-rules: ${r.id} tem ${(r.examples ?? []).length} exemplos — ${r.exampleCountJustified}`);
    else err(`affix-rules: ${r.id} tem menos de 5 exemplos e não justifica`);
  }
  if ((r.counterExamples ?? []).length < 1) {
    if (r.counterExamplesJustified) warnings.push(`affix-rules: ${r.id} sem contraexemplos — ${r.counterExamplesJustified}`);
    else err(`affix-rules: ${r.id} sem contraexemplos`);
  }
}

const frameIds = new Set(docs['frames.json'].frames.map((f) => f.id));
const usedFrameIds = new Set();
for (const e of docs['seed-roots.json'].entries) {
  const p = e.inflection?.paradigmId;
  if (p && !paradigmIds.has(p) && !PROJECT_PARADIGMS.has(p) && !irregularIds.has(p) && !supplIds.has(p)) {
    err(`seed-roots: ${e.id}.inflection.paradigmId = ${p}, inexistente`);
  }
  if (e.pos === 'NOUN' && !e.gender) err(`seed-roots: substantivo ${e.id} sem gender`);
  if (!e.senses?.length) err(`seed-roots: ${e.id} sem senses`);
  for (const s of e.senses ?? []) {
    if (!typeIds.has(s.semanticType)) err(`seed-roots: sentido ${s.id} tem tipo ${s.semanticType}, inexistente`);
    if (e.pos === 'VERB') {
      if (!frameIds.has(s.id)) err(`seed-roots: sentido verbal ${s.id} sem moldura em frames.json`);
      usedFrameIds.add(s.id);
    }
  }
  for (const d of e.attestedDerivations ?? []) {
    if (!docs['affix-rules.json'].rules.some((r) => r.id === d.rule)) {
      err(`seed-roots: ${e.id}.attestedDerivations cita regra ${d.rule}, inexistente`);
    }
  }
}
for (const f of docs['frames.json'].frames) {
  if (!usedFrameIds.has(f.id)) err(`frames: ${f.id} não corresponde a nenhum sentido de verbo-semente`);
  for (const [role, spec] of Object.entries(f.roles ?? {})) {
    for (const t of spec.prefers ?? []) {
      if (!typeIds.has(t)) err(`frames: ${f.id}.${role} prefere ${t}, inexistente`);
    }
  }
}

idsOf(docs['tests-derivation.json'].tests, 'tests-derivation');
idsOf(docs['tests-inflection.json'].tests, 'tests-inflection');
idsOf(docs['tests-sentences.json'].sentences, 'tests-sentences');

const UD_RELATIONS = new Set([
  'root', 'nsubj', 'obj', 'iobj', 'xcomp', 'ccomp', 'obl', 'det', 'amod', 'advmod', 'cop',
  'aux', 'mark', 'case', 'nmod', 'conj', 'cc', 'acl:relcl', 'advcl', 'nummod', 'punct',
  'fixed', 'discourse', 'advmod:emph', 'appos', 'parataxis', 'nummod:gov'
]);
const FEAT_ALT = 'Gender=(Masc|Fem|Neut|Inv)|Number=(Sing|Plur|Inv)|Person=[123]|Mood=(Ind|Sub|Imp|Cnd)|VerbForm=(Fin|Inf|Ger|Part)|Tense=(Pres|Past|Imp|Fut)|Degree=Dim|Case=(Acc|Dat|Nom)';
const VALID_FEATS = new RegExp(`^(?:${FEAT_ALT})(?:\\|(?:${FEAT_ALT}))*$`);

for (const s of docs['tests-sentences.json'].sentences) {
  if (!s.text || !s.tokens?.length) { err(`tests-sentences: ${s.id} sem tokens`); continue; }
  const n = s.tokens.length;
  for (const t of s.tokens) {
    if (t.feats && !VALID_FEATS.test(t.feats)) {
      err(`tests-sentences: ${s.id} token "${t.form}" tem feats inválidos: ${t.feats}`);
    }
  }
  const roots = s.dependencies.filter((d) => d.rel === 'root');
  if (roots.length !== 1) err(`tests-sentences: ${s.id} tem ${roots.length} roots (esperado 1)`);
  for (const d of s.dependencies) {
    if (!UD_RELATIONS.has(d.rel)) err(`tests-sentences: ${s.id} relação desconhecida ${d.rel}`);
    if (d.dep < 1 || d.dep > n) err(`tests-sentences: ${s.id} dep ${d.dep} fora do intervalo`);
    if (d.head < 0 || d.head > n) err(`tests-sentences: ${s.id} head ${d.head} fora do intervalo`);
  }
  const governed = new Set(s.dependencies.map((d) => d.dep));
  for (let i = 1; i <= n; i++) if (!governed.has(i)) err(`tests-sentences: ${s.id} token ${i} sem dependência`);
  if (!s.meaningGraph) err(`tests-sentences: ${s.id} sem meaningGraph`);
}

// ---------------------------------------------------------------------------
// 2) Todo exemplo de regra precisa ser reproduzido por generate
// ---------------------------------------------------------------------------

let exampleTotal = 0;
for (const rule of docs['affix-rules.json'].rules) {
  for (const ex of rule.examples ?? []) {
    exampleTotal++;
    const forms = A.generate({ lemma: ex.base, pos: rule.input?.pos }, rule.id);
    if (!forms.some((f) => norm(f) === norm(ex.derived))) {
      fail('EXEMPLOS_DE_REGRA', `${rule.id}: ${ex.base} → ${ex.derived}`,
        `generate devolveu ${JSON.stringify(forms)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Testes de derivação
// ---------------------------------------------------------------------------

const CATEGORY = (id) => {
  const m = /^der-([a-z])(\d+)$/.exec(id);
  if (!m) return 'outros';
  return {
    m: 'multinível', s: 'sufixo', p: 'parassíntese', r: 'regressiva',
    c: 'conversão', x: 'justaposição', a: 'aglutinação', n: 'negativos', l: 'lexicalizados'
  }[m[1]] ?? 'outros';
};

const chainMatches = (r, exp) =>
  Boolean(exp.chain) && r.chain.length === exp.chain.length &&
  exp.chain.every((s, i) => s.rule === r.chain[i].rule && norm(s.from) === norm(r.chain[i].from));

function checkDerivation(t, top, results) {
  const exp = t.expected;
  if (exp.status === 'NOT_A_WORD') return top?.status === 'NOT_A_WORD';
  if (exp.status === 'HYPOTHESIS_BLOCKED') {
    if (top?.status !== 'HYPOTHESIS_BLOCKED' && top?.status !== 'NOT_A_WORD') return false;
    if (exp.reason && !String(top?.reason ?? '').startsWith(exp.reason.split(' ')[0])) return false;
    return true;
  }
  const candidates = results.filter((r) => r.root === exp.root);
  const match = candidates.find((r) => {
    if (!chainMatches(r, exp)) return false;
    if (!exp.semantics) return true;
    return r.semantics === exp.semantics || (r.alternatives ?? []).includes(exp.semantics);
  });
  if (match) return true;
  const chainOnly = candidates.find((r) => chainMatches(r, exp));
  if (chainOnly) {
    fail('DERIVAÇÃO/semântica', `${t.id} "${t.word}"`,
      `cadeia ok; semântica esperada ${exp.semantics}; obtidas ${[chainOnly.semantics, ...(chainOnly.alternatives ?? [])].join(' | ')}`);
  }
  return false;
}

function describeDerivation(t, top) {
  const exp = t.expected;
  const got = top
    ? `${top.status} root=${top.root} chain=${(top.chain ?? []).map((s) => s.rule).join('>')} sem=${top.semantics}`
    : 'nenhum resultado';
  const want = exp.status === 'ANALYZED' || exp.status === 'HYPOTHESIS'
    ? `root=${exp.root} chain=${(exp.chain ?? []).map((s) => s.rule).join('>')} sem=${exp.semantics}`
    : exp.status + (exp.reason ? ` (${exp.reason})` : '');
  return `esperado ${want}; obtido ${got}`;
}

let derTotal = 0;
const derByCat = {};
for (const t of docs['tests-derivation.json'].tests) {
  derTotal++;
  const cat = CATEGORY(t.id);
  derByCat[cat] = derByCat[cat] ?? { ok: 0, total: 0 };
  derByCat[cat].total++;
  const results = A.analyze(t.word);
  if (checkDerivation(t, results[0], results)) derByCat[cat].ok++;
  else fail(`DERIVAÇÃO/${cat}`, `${t.id} "${t.word}"`, describeDerivation(t, results[0]));
}

// ---------------------------------------------------------------------------
// 4) Testes de flexão
// ---------------------------------------------------------------------------

let infTotal = 0;
let infOk = 0;
for (const t of docs['tests-inflection.json'].tests) {
  infTotal++;
  const exp = t.expected;
  if (t.op === 'inflect') {
    const forms = A.inflectAll({ lemma: t.lemma, paradigmId: t.paradigm }, t.features);
    if (forms.some((f) => norm(f) === norm(exp.form))) infOk++;
    else fail('FLEXÃO', t.id, `inflect(${t.lemma}, ${t.paradigm}, ${t.features}) esperado ${exp.form}; obtido ${JSON.stringify(forms)}`);
  } else if (t.op === 'lemmatize') {
    const hits = A.lemmatize(t.form);
    const ok = hits.some((h) => norm(h.lemma) === norm(exp.lemma) && (!exp.features || h.featureKey === exp.features));
    if (ok) infOk++;
    else fail('FLEXÃO', t.id, `lemmatize(${t.form}) esperado ${exp.lemma} ${exp.features ?? ''}; obtido ${JSON.stringify(hits)}`);
  } else {
    fail('FLEXÃO', t.id, `op desconhecida: ${t.op}`);
  }
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

const pct = (ok, total) => total === 0 ? '—' : `${((ok / total) * 100).toFixed(1)}% (${ok}/${total})`;
const derFails = failures.filter((f) => f.category.startsWith('DERIVAÇÃO'));
const exFails = failures.filter((f) => f.category === 'EXEMPLOS_DE_REGRA');
const byPos = {};
for (const e of docs['seed-roots.json'].entries) byPos[e.pos] = (byPos[e.pos] ?? 0) + 1;

const lines = [];
lines.push('='.repeat(74));
lines.push('VERIFICADOR — rede gerativa do português');
lines.push('='.repeat(74));
lines.push('');
lines.push('INVENTÁRIO');
lines.push(`  regras de formação ................ ${docs['affix-rules.json'].rules.length}`);
lines.push(`  paradigmas propostos .............. ${docs['inflection-paradigms-proposed.json'].paradigms.length}`);
lines.push(`  verbos irregulares completos ...... ${docs['irregular-verbs.json'].verbs.length}`);
lines.push(`  particípios suplementares ......... ${docs['irregular-verbs.json'].supplementaryParticiples.length}`);
lines.push(`  léxico-semente .................... ${docs['seed-roots.json'].entries.length} (${Object.entries(byPos).map(([k, v]) => `${k} ${v}`).join(', ')})`);
lines.push(`  molduras de argumentos ............ ${docs['frames.json'].frames.length}`);
lines.push(`  tipos / funções semânticas ........ ${docs['semantic-types.json'].types.length} / ${docs['semantic-functions.json'].functions.length}`);
lines.push(`  frases anotadas ................... ${docs['tests-sentences.json'].sentences.length}`);
lines.push('');
lines.push('ESQUEMA E REFERÊNCIAS CRUZADAS');
if (schemaErrors.length === 0) lines.push('  OK — nenhum erro de esquema, id duplicado ou referência quebrada.');
else for (const e of schemaErrors) lines.push(`  ERRO: ${e}`);
for (const w of warnings) lines.push(`  AVISO: ${w}`);
lines.push('');
lines.push('EXEMPLOS DE REGRA REPRODUZIDOS POR generate');
lines.push(`  ${pct(exampleTotal - exFails.length, exampleTotal)}`);
lines.push('');
lines.push('TESTES DE DERIVAÇÃO (por categoria)');
for (const [cat, v] of Object.entries(derByCat).sort()) lines.push(`  ${cat.padEnd(16)} ${pct(v.ok, v.total)}`);
lines.push(`  ${'TOTAL'.padEnd(16)} ${pct(derTotal - derFails.length, derTotal)}`);
lines.push('');
lines.push('TESTES DE FLEXÃO');
lines.push(`  ${pct(infOk, infTotal)}`);
lines.push('');
lines.push(`FALHAS (${failures.length})`);
if (failures.length === 0) lines.push('  nenhuma');
else {
  const byCat = {};
  for (const f of failures) (byCat[f.category] = byCat[f.category] ?? []).push(f);
  for (const [cat, list] of Object.entries(byCat)) {
    lines.push(`  [${cat}] ${list.length}`);
    for (const f of list.slice(0, 200)) lines.push(`    ${f.id}: ${f.detail}`);
  }
}
lines.push('='.repeat(74));

const report = lines.join('\n');
console.log(report);
writeFileSync(join(ROOT, 'validation-report.txt'), report + '\n');

console.log(`\nResumo: esquema ${schemaErrors.length} erro(s); derivação ${derTotal - derFails.length}/${derTotal}; flexão ${infOk}/${infTotal}.`);
console.log('Relatório completo em research/morfologia/validation-report.txt');
process.exitCode = schemaErrors.length + exFails.length > 0 ? 1 : 0;
