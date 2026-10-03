// Aplicador de referência da rede gerativa do português (JavaScript puro, sem
// dependências). Prova que os dados funcionam nos dois sentidos:
//
//   generate(lemmaEntry, ruleId)  → forma(s) derivada(s), seguindo stem+allomorphy
//   analyze(word)                 → TODAS as decomposições até uma raiz-semente
//   inflect(lemmaEntry, featureKey) / lemmatize(form)  → paradigmas e irregulares
//
// Princípio: os EXEMPLOS declarados em cada regra (allomorphy[].example,
// examples[]) são a autoridade nos dois sentidos. A geração segue
// stem + allomorphy; a análise roda as regras ao contrário, reconstruindo
// candidatos de lema (radical + vogal temática) e CONFERINDO cada hipótese
// regerando-a — só passa o que a geração reproduz. Busca limitada a 4 níveis.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (name) => JSON.parse(readFileSync(join(ROOT, name), 'utf8'));

export const affixRules = read('affix-rules.json');
export const paradigms = read('inflection-paradigms-proposed.json');
export const irregular = read('irregular-verbs.json');
export const seedRoots = read('seed-roots.json');
export const frames = read('frames.json');
export const semanticTypes = read('semantic-types.json');
export const semanticFunctions = read('semantic-functions.json');

export const RULES = Object.fromEntries(affixRules.rules.map((r) => [r.id, r]));
export const SEEDS = Object.fromEntries(seedRoots.entries.map((e) => [e.id, e]));
export const SEED_BY_LEMMA = new Map();
for (const entry of seedRoots.entries) {
  const key = entry.lemma.toLowerCase();
  if (!SEED_BY_LEMMA.has(key)) SEED_BY_LEMMA.set(key, entry);
}
export const MAX_DEPTH = 4;

/** Comparação insensível a acento: 'util' casa com o lema 'útil'. */
export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const SEED_BY_NORM = new Map();
for (const entry of seedRoots.entries) {
  const k = normalize(entry.lemma);
  if (!SEED_BY_NORM.has(k)) SEED_BY_NORM.set(k, entry);
}

/** Palavras derivadas declaradas como reais em alguma raiz (bases atestadas). */
export const ATTESTED_FORMS = new Set();
for (const entry of seedRoots.entries) {
  for (const d of entry.attestedDerivations ?? []) ATTESTED_FORMS.add(normalize(d.word));
}
/** Verbos prefixados cuja leitura de unidade é lexicalizada (despedir, descrever). */
export const LEXICALIZED_FORMS = new Set();
for (const entry of seedRoots.entries) {
  for (const d of entry.attestedDerivations ?? []) {
    if (d.lexicalized) LEXICALIZED_FORMS.add(normalize(d.word));
  }
}

// ---------------------------------------------------------------------------
// Particípios: liga CONV_PART_ADJ às formas reais (regulares e irregulares).
// É o dado que permite analisar "dito", "visto", "posto", "aberto", "pago".
// ---------------------------------------------------------------------------

const PARTICIPLE = new Map(); // lema do verbo → particípio masculino singular

for (const v of irregular.verbs) {
  const p = v.forms['Gender=Masc|Number=Sing|VerbForm=Part'];
  if (p) PARTICIPLE.set(normalize(v.lemma), p);
}
for (const v of irregular.supplementaryParticiples) {
  const p = v.variants['Gender=Masc|Number=Sing|VerbForm=Part'];
  if (p?.length) PARTICIPLE.set(normalize(v.lemma), p[0]);
}
for (const entry of seedRoots.entries) {
  if (entry.pos !== 'VERB') continue;
  const k = normalize(entry.lemma);
  if (PARTICIPLE.has(k)) continue;
  const cls = verbClass(entry.lemma);
  if (cls === 'AR') PARTICIPLE.set(k, stemOf(entry.lemma, 'VERB_ROOT') + 'ado');
  else if (cls === 'ER' || cls === 'IR') PARTICIPLE.set(k, stemOf(entry.lemma, 'VERB_ROOT') + 'ido');
}
// Os exemplos declarados na regra mandam (limpar → limpo, não limpado).
for (const [k, v] of Object.entries(Object.fromEntries(PARTICIPLE))) void v;
for (const rule of affixRules.rules) {
  if (rule.id !== 'CONV_PART_ADJ') continue;
  for (const ex of rule.examples ?? []) PARTICIPLE.set(normalize(ex.base), ex.derived);
  for (const all of rule.allomorphy ?? []) {
    if (all.example?.includes('→')) {
      const [b, d] = all.example.split(/\s*→\s*/);
      PARTICIPLE.set(normalize(b.trim()), d.trim());
    }
  }
}

/** O particípio real de um verbo, se conhecido. */
export function participleOf(lemma) {
  return PARTICIPLE.get(normalize(lemma)) ?? null;
}

/**
 * Formas derivadas declaradas como reais: permitem PARAR a decomposição numa
 * palavra atestada (reescrever, descrever) em vez de forçar a descida até a
 * raiz. A semântica, nesse caso, dobra a função da palavra atestada.
 */
export const ATTESTED_INFO = new Map();
for (const entry of seedRoots.entries) {
  for (const d of entry.attestedDerivations ?? []) {
    const k = normalize(d.word);
    if (!ATTESTED_INFO.has(k)) {
      ATTESTED_INFO.set(k, {
        seedId: entry.id,
        seedLemma: entry.lemma,
        rule: d.rule,
        lexicalized: Boolean(d.lexicalized)
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pares declarados: base → derivado e derivado → base, por regra.
// ---------------------------------------------------------------------------

/** Todas as formas licenciadas por uma regra, declaradas em allomorphy. */
const EXPLICIT = new Map();          // "RULE|base"  → [derivado, ...]
const EXPLICIT_REVERSE = new Map();  // "RULE|derivado" → base

/** Chaves sem acento: 'visivel' casa com o exemplo declarado 'visível'. */
const key = (ruleId, form) =>
  `${ruleId}|${form.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`;

function addPair(ruleId, base, derived) {
  const fwd = key(ruleId, base);
  if (!EXPLICIT.has(fwd)) EXPLICIT.set(fwd, []);
  if (!EXPLICIT.get(fwd).includes(derived)) EXPLICIT.get(fwd).push(derived);
  const rev = key(ruleId, derived);
  if (!EXPLICIT_REVERSE.has(rev)) EXPLICIT_REVERSE.set(rev, base);
}

for (const rule of affixRules.rules) {
  for (const all of rule.allomorphy ?? []) {
    if (!all.example || !all.example.includes('→')) continue;
    const [base, derived] = all.example.split(/\s*→\s*/);
    if (base && derived) addPair(rule.id, base.trim(), derived.trim());
  }
  for (const ex of rule.examples ?? []) {
    if (ex.base && ex.derived) addPair(rule.id, ex.base, ex.derived);
  }
}
// Conversão particípio→adjetivo: as formas reais (inclusive irregulares) entram
// como pares declarados, porque o particípio não se deriva do infinitivo.
for (const [lemmaNorm, participle] of PARTICIPLE) {
  const seed = SEED_BY_NORM.get(lemmaNorm);
  if (seed) addPair('CONV_PART_ADJ', seed.lemma, participle);
}

// ---------------------------------------------------------------------------
// Radicais, classes e concordância
// ---------------------------------------------------------------------------

export function stemOf(lemma, strategy) {
  switch (strategy) {
    case 'LEMMA': return lemma;
    case 'INFINITIVE_MINUS_R': return /r$/.test(lemma) ? lemma.slice(0, -1) : lemma;
    case 'VERB_ROOT':
    case 'PARTICIPLE_STEM':
    case 'LATINATE_STEM':
      return /(ar|er|ir)$/.test(lemma) ? lemma.slice(0, -2) : lemma;
    case 'MINUS_FINAL_VOWEL': return /[aeo]$/.test(lemma) ? lemma.slice(0, -1) : lemma;
    default: return lemma;
  }
}

export function verbClass(lemma) {
  if (/ar$/.test(lemma)) return 'AR';
  if (/er$/.test(lemma)) return 'ER';
  if (/ir$/.test(lemma)) return 'IR';
  return null;
}

/** Gênero inferido do próprio lema (para as regras que concordam). */
export function genderOf(lemma, fallback = 'Masc') {
  if (/[ãa]$/.test(lemma)) return 'Fem';
  if (/[o]$/.test(lemma)) return 'Masc';
  return fallback;
}

/**
 * Sufixos licenciados por classe verbal (tabela derivada dos exemplos das
 * regras). Onde há alternância, listam-se TODAS as variantes licenciadas e a
 * análise confere-as regerando.
 */
const CLASS_SUFFIX = {
  SUF_DOR: { AR: ['ador'], ER: ['edor'], IR: ['idor'] },
  SUF_NTE: { AR: ['ante'], ER: ['ente'], IR: ['ente', 'inte'] },
  SUF_CAO: { AR: ['ação'], ER: ['ção'], IR: ['ção'] },
  SUF_MENTO: { AR: ['amento'], ER: ['imento'], IR: ['imento'] },
  SUF_VEL: { AR: ['ável'], ER: ['ível'], IR: ['ível'] }
};

/** Regras cuja saída concorda em gênero com a base. */
const AGREES = {
  SUF_INHO: { Masc: 'inho', Fem: 'inha' },
  SUF_OSO: { Masc: 'oso', Fem: 'osa' },
  SUF_EIRO: { Masc: 'eiro', Fem: 'eira' },
  SUF_ADA: { Masc: 'ada', Fem: 'ada' },
  SUF_AL: { Masc: 'al', Fem: 'al' },
  SUF_ICO: { Masc: 'ico', Fem: 'ica' },
  SUF_ES: { Masc: 'ês', Fem: 'esa' }
};

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

/** Formas que uma regra produz a partir de uma base. */
export function generateFrom(baseForm, ruleId, opts = {}) {
  const rule = RULES[ruleId];
  if (!rule) return [];
  const bases = Array.isArray(baseForm) ? baseForm : [baseForm];
  const out = [];
  for (const base of bases) {
    out.push(...generateOne(base, rule, opts));
  }
  return [...new Set(out)];
}

function generateOne(base, rule, opts = {}) {
  const explicit = EXPLICIT.get(key(rule.id, base));
  if (explicit) return explicit;

  const pos = opts.pos ?? rule.input?.pos ?? 'VERB';
  const { process } = rule;

  if (process === 'PREFIX') {
    switch (rule.id) {
      case 'PRE_PRE': return [`pré-${base}`];
      // Só 'contra-atacar' leva hífen, e esse par está declarado na regra.
      case 'PRE_CONTRA': return [`contra${base}`];
      // Hífen diante de h; 'anti-inflamatório' é par declarado na regra.
      // Diante de s-, o encontro dobra o s (anti + social → antissocial).
      case 'PRE_ANTI': {
        if (/^h/.test(base)) return [`anti-${base}`];
        if (/^s/.test(base)) return [`antis${base}`];
        return [`anti${base}`];
      }
      case 'PRE_SUPER': return [/^h/.test(base) ? `super-${base}` : `super${base}`];
      case 'PRE_AUTO': return [/^[aeiou]/.test(base) ? `auto${base}` : `auto${base}`];
      case 'PRE_IN': {
        if (/^[l]/.test(base)) return [`i${base}`];
        if (/^[pb]/.test(base)) return [`im${base}`];
        if (/^[r]/.test(base)) return [`ir${base}`];
        return [`in${base}`];
      }
      // des- + base iniciada por "es"+consoante elide o e- da base:
      // des + escrever → descrever.
      case 'PRE_DES': {
        if (/^es[bcdfgjklmnpqrstvxz]/.test(base)) return [`des${base.slice(2)}`];
        return [`des${base}`];
      }
      default: return [`${rule.form.prefix}${base}`];
    }
  }

  if (process === 'SUFFIX') {
    const cls = verbClass(base);
    const perClass = CLASS_SUFFIX[rule.id];
    // Nas regras de classe verbal o radical é sempre o verbal (falar → falante,
    // não falaante), independentemente da estratégia declarada para nomes.
    if (perClass && cls) return perClass[cls].map((s) => stemOf(base, 'VERB_ROOT') + s);
    if (perClass && !cls) return [];

    const acceptsVerb = (Array.isArray(rule.input?.pos) ? rule.input.pos : [rule.input?.pos]).includes('VERB');
    // Sufixo que aceita verbo, sobre base verbal: o radical é o verbal.
    const stem = cls && acceptsVerb ? stemOf(base, 'VERB_ROOT') : stemOf(base, rule.stem);
    const agree = AGREES[rule.id];
    if (agree) return [stem + (agree[genderOf(base)] ?? agree.Masc)];

    switch (rule.id) {
      case 'SUF_ADE': {
        if (/z$/.test(stem)) return [`${stem.slice(0, -1)}cidade`];       // feliz → felicidade
        if (/vel$/.test(stem)) return [`${stem.slice(0, -3)}bilidade`];    // possível → possibilidade
        // Bases em -l licenciam as duas séries: leal → lealdade, imoral → imoralidade.
        if (/l$/.test(stem)) return [`${stem}dade`, `${stem}idade`];
        return [`${stem}idade`];                                           // útil → utilidade
      }
      case 'SUF_EZ': return [/z$/.test(stem) ? `${stem.slice(0, -1)}ez` : `${stem}eza`];
      case 'SUF_URA': return [/c$/.test(stem) ? `${stem.slice(0, -1)}çura` : `${stem}ura`];
      case 'SUF_IFICAR': return [`${stem}ificar`];
      case 'SUF_MENTE': return [`${stem}mente`];
      default: return [`${stem}${rule.form.suffix}`];
    }
  }

  if (process === 'PARASYNTHETIC') {
    const stem = stemOf(base, rule.stem);
    const suffix = rule.form.suffix;
    const prefix = /^[pb]/.test(base) ? rule.form.prefix.replace(/^en/, 'em') : rule.form.prefix;
    // ajustes ortográficos declarados (c→ç, qu→c)
    if (/c$/.test(stem) && suffix === 'ar') return [`${prefix}${stem.slice(0, -1)}çar`];
    if (/qu$/.test(stem) && suffix === 'ecer') return [`${prefix}${stem}e${suffix}`];
    return [`${prefix}${stem}${suffix}`];
  }

  if (process === 'REGRESSIVE') {
    const stem = stemOf(base, rule.stem);
    const s = rule.form.suffix;
    if (/c$/.test(stem) && s === 'e') return [`${stem.slice(0, -1)}que`];
    if (/ç$/.test(stem) && s === 'e') return [`${stem.slice(0, -1)}ce`];
    // A regressiva de verbos -ar licencia a variante feminina -ada/-ida
    // (caçada, tomada, descarga), ao lado da forma curta (caça, compra).
    if (s === 'a' && verbClass(base) === 'AR') return [`${stem}a`, `${stem}ada`];
    return [`${stem}${s}`];
  }

  if (process === 'CONVERSION') return [base];
  if (process.startsWith('COMPOUND')) return [opts.surface ?? base];
  return [];
}

/** generate(lemmaEntry, ruleId): formas que a regra produz a partir do lema. */
export function generate(lemmaEntry, ruleId) {
  const lemma = typeof lemmaEntry === 'string' ? lemmaEntry : lemmaEntry.lemma;
  const pos = typeof lemmaEntry === 'string' ? undefined : lemmaEntry.pos;
  return generateFrom(lemma, ruleId, { pos });
}

// ---------------------------------------------------------------------------
// Análise (regras ao contrário, ≤ 4 níveis)
// ---------------------------------------------------------------------------

function blockedBy(word) {
  for (const rule of affixRules.rules) {
    for (const ce of rule.counterExamples ?? []) {
      if (ce.wouldBe && ce.wouldBe.toLowerCase() === word.toLowerCase()) {
        return { ruleId: rule.id, reason: ce.reason };
      }
    }
  }
  return null;
}

/** Terminações inversas por regra, com a vogal temática que reconstroem. */
const SUFFIX_INVERSE = [
  ['SUF_ADE', [/bilidade$/, /cidade$/, /dade$/, /idade$/]],
  ['SUF_URA', [/ura$/]],
  ['SUF_EZ', [/eza$/, /ez$/]],
  ['SUF_MENTE', [/mente$/]],
  ['SUF_MENTO', [/amento$/, /imento$/]],
  ['SUF_CAO', [/ação$/, /ção$/]],
  ['SUF_DOR', [/ador$/, /edor$/, /idor$/]],
  ['SUF_NTE', [/ante$/, /ente$/, /inte$/]],
  ['SUF_VEL', [/ável$/, /ível$/]],
  ['SUF_OSO', [/oso$/, /osa$/]],
  ['SUF_EIRO', [/eiro$/, /eira$/]],
  ['SUF_ISTA', [/ista$/]],
  ['SUF_ISMO', [/ismo$/]],
  ['SUF_IZAR', [/izar$/]],
  ['SUF_IFICAR', [/ificar$/]],
  ['SUF_ECER', [/ecer$/, /escer$/]],
  ['SUF_AGEM', [/agem$/]],
  ['SUF_ADA', [/ada$/]],
  ['SUF_INHO', [/inho$/, /inha$/, /zinho$/, /zinha$/]],
  ['SUF_AO_AUG', [/rão$/, /zarrão$/, /eirão$/]],
  ['SUF_AL', [/al$/]],
  ['SUF_ICO', [/ico$/, /ica$/]],
  ['SUF_ES', [/ês$/, /esa$/]],
  ['SUF_ENSE', [/ense$/]],
  ['REG_A', [/ada$/, /ida$/, /a$/]],
  ['REG_O', [/o$/]],
  ['REG_E', [/e$/]]
];

const PREFIX_INVERSE = [
  ['PRE_CONTRA', /^contra-?/],
  ['PRE_PRE', /^pré-/],
  ['PRE_ANTI', /^anti-?/],
  ['PRE_SUPER', /^super-?/],
  ['PRE_INTER', /^inter/],
  ['PRE_AUTO', /^auto/],
  ['PRE_SUB', /^sub/],
  ['PRE_DES', /^des/],
  ['PRE_RE', /^re/],
  ['PRE_IN', /^(im|ir|il|in)/]
];

const PARASYNTH_INVERSE = [
  ['PAR_A_ECER', /^a/, /ecer$/],
  ['PAR_EN_ECER', /^(en|em)/, /ecer$/],
  ['PAR_ES_ECER', /^es/, /ecer$/],
  ['PAR_A_AR', /^a/, /ar$/],
  ['PAR_EN_AR', /^(en|em)/, /ar$/],
  ['PAR_ES_AR', /^es/, /ar$/]
];

/** Candidatos de lema a partir de um radical (reconstrói a vogal temática). */
function verbLemmaCandidates(stem) {
  return [`${stem}ar`, `${stem}er`, `${stem}ir`];
}
function nounLemmaCandidates(stem) {
  return [stem, `${stem}a`, `${stem}e`, `${stem}o`];
}

/**
 * Para cada regra, os lemas que poderiam ter gerado `word` — já conferidos
 * por regeração. Devolve [{ruleId, lemma, kind}].
 */
function inverseCandidates(word) {
  const out = [];
  const push = (ruleId, lemma, kind) => {
    const forms = generateFrom(lemma, ruleId, { pos: RULES[ruleId].input?.pos });
    if (!forms.some((f) => f.toLowerCase() === word.toLowerCase())) return;
    if (!out.some((c) => c.ruleId === ruleId && c.lemma === lemma)) out.push({ ruleId, lemma, kind });
  };

  // 1) Pares explicitamente declarados na regra (autoridade máxima).
  for (const rule of affixRules.rules) {
    const base = EXPLICIT_REVERSE.get(key(rule.id, word));
    if (base) out.push({ ruleId: rule.id, lemma: base, kind: 'EXPLICIT' });
  }

  // 2) Prefixos.
  for (const [ruleId, pattern] of PREFIX_INVERSE) {
    const m = pattern.exec(word);
    if (!m) continue;
    const rest = word.slice(m[0].length);
    if (rest.length >= 3) push(ruleId, rest, 'PREFIX');
    // anti- + s- dobra o s (antissocial ← anti + social): desfaz o encontro.
    if (ruleId === 'PRE_ANTI' && /^s/.test(rest)) push(ruleId, rest.slice(1), 'PREFIX');
    // des- + base começada por consoante de grupo: o e- da base se restitui
    // (descrever ← des + escrever).
    if (ruleId === 'PRE_DES' && /^[bcdfgjklmnpqrstvxz]/.test(rest)) push(ruleId, `es${rest}`, 'PREFIX');
  }

  // 3) Sufixos.
  for (const [ruleId, patterns] of SUFFIX_INVERSE) {
    const rule = RULES[ruleId];
    if (!rule) continue;
    for (const pattern of patterns) {
      const m = pattern.exec(word);
      if (!m) continue;
      const stem = word.slice(0, m.index);
      if (stem.length < 3) continue;
      // Tenta radicais nominais e verbais: a própria regeração (push) filtra.
      const candidates = [...new Set([...nounLemmaCandidates(stem), ...verbLemmaCandidates(stem)])];
      for (const cand of candidates) push(ruleId, cand, 'SUFFIX');
      // Troca de consoante na fronteira do sufixo -idade.
      if (/bilidade$/.test(word)) push(ruleId, `${stem}vel`, 'SUFFIX');   // possível → possibilidade
      if (/cidade$/.test(word)) push(ruleId, `${stem}z`, 'SUFFIX');       // feliz → felicidade
    }
  }

  // 4) Parassíntese.
  for (const [ruleId, pre, suf] of PARASYNTH_INVERSE) {
    const mp = pre.exec(word);
    const ms = suf.exec(word);
    if (!mp || !ms) continue;
    const stem = word.slice(mp[0].length, ms.index);
    if (stem.length < 3) continue;
    const candidates = [
      ...verbLemmaCandidates(stem),
      ...nounLemmaCandidates(stem),
      ...['o', 'a', 'e'].map((v) => stem + v)
    ];
    for (const cand of [...new Set(candidates)]) push(ruleId, cand, 'PARASYNTHETIC');
  }

  // 5) Compostos: decompõe pela fronteira (hífen ou mudança de palavra) e casa
  // cada elemento com uma raiz. O primeiro elemento é a base (verbal ou nominal).
  for (const [ruleId, lemma] of hyphenCompoundCandidates(word)) {
    out.push({ ruleId, lemma, kind: 'COMPOUND' });
  }

  // 6) Conversão sem afixo: a palavra é ela mesma a base de outra classe.
  const direct = SEED_BY_NORM.get(normalize(word));
  if (direct) {
    if (direct.pos === 'VERB') out.push({ ruleId: 'CONV_INF_NOUN', lemma: word, kind: 'CONVERSION' });
    if (direct.pos === 'ADJECTIVE') out.push({ ruleId: 'CONV_ADJ_NOUN', lemma: word, kind: 'CONVERSION' });
  }
  const part = PARTICIPLE.get(normalize(word));
  if (part) {
    const verbSeed = SEED_BY_NORM.get(normalize(part));
    if (verbSeed) out.push({ ruleId: 'CONV_PART_ADJ', lemma: word, kind: 'CONVERSION' });
  }

  return out;
}

/**
 * Candidatos de composto para uma palavra com hífen: "guarda-chuva" →
 * "guardar chuva". O primeiro elemento casa com um verbo na 3ª pessoa do
 * singular (guarda ← guardar) ou com um nome; o segundo, com um nome ou
 * adjetivo da semente (aceitando plural: rolhas → rolha).
 */
function hyphenCompoundCandidates(word) {
  if (!word.includes('-')) return [];
  const parts = word.split('-');
  if (parts.length !== 2) return [];
  const [first, second] = parts;

  const firstLemmas = [];
  for (const entry of seedRoots.entries) {
    if (entry.pos === 'VERB') {
      const cls = verbClass(entry.lemma);
      if (!cls) continue;
      const root = stemOf(entry.lemma, 'VERB_ROOT');
      // 3ª pessoa do singular do presente: guarda, beija, saca, bate, pisa, vira,
      // lava, corta, porta (trabalhar → trabalha, vender → vende, subir → sobe).
      const form3 = cls === 'AR' ? root + 'a' : cls === 'ER' ? root + 'e' : root + 'e';
      if (normalize(form3) === normalize(first)) firstLemmas.push(entry.lemma);
    } else if (normalize(entry.lemma) === normalize(first) || normalize(entry.lemma) === normalize(first + 'a')) {
      firstLemmas.push(entry.lemma);
    }
  }
  const secondLemmas = [];
  for (const entry of seedRoots.entries) {
    if (entry.pos !== 'NOUN' && entry.pos !== 'ADJECTIVE') continue;
    const n = normalize(entry.lemma);
    if (n === normalize(second) || n === normalize(second.replace(/s$/, '')) ||
        n === normalize(second.replace(/éis$/, 'el')) || n === normalize(second.replace(/is$/, 'il'))) {
      secondLemmas.push(entry.lemma);
    }
  }
  const out = [];
  for (const a of firstLemmas) for (const b of secondLemmas) out.push(['COMP_JUST', `${a} ${b}`]);
  return out;
}

const semanticFunctionOf = Object.fromEntries(semanticFunctions.functions.map((f) => [f.id, f]));
/** Nome da função semântica, como nos testes gold (ex.: POSSIBLE_PASSIVE). */
const relationOf = (ruleId) => {
  const fn = RULES[ruleId]?.semantics?.function ?? 'CONVERSION';
  return semanticFunctionOf[fn] ? fn : fn;
};

/**
 * analyze(word) → todas as decomposições até uma raiz-semente (≤ 4 níveis).
 * status: ATTESTED | HYPOTHESIS | HYPOTHESIS_BLOCKED | NOT_A_WORD.
 */
export function analyze(word) {
  const target = word.toLowerCase();
  const blocked = blockedBy(target);
  const results = [];
  const seen = new Set();

  function record(seed, chain) {
    // A cadeia descoberta de fora para dentro já sai em ordem de aplicação
    // (raiz → palavra). Antes de aceitar, confere a coerência de classe: cada
    // regra recebe a classe que a regra anterior produziu. Isso rejeita
    // parses como re-+organização (o prefixo verbal exige base verbal).
    // Compostos combinam palavras, não classes: a checagem linear de classe não
    // se aplica (cada elemento foi validado onde foi construído).
    const isCompound = chain.some((s) => RULES[s.rule]?.process?.startsWith('COMPOUND'));
    if (!isCompound) {
      let pos = seed.pos;
      for (const step of chain) {
        const rule = RULES[step.rule];
        const wants = rule.input?.pos;
        const wanted = Array.isArray(wants) ? wants : wants ? [wants] : [];
        if (wanted.length && pos && !wanted.includes(pos)) return;
        if (rule.output?.pos) pos = rule.output.pos;
      }
    }
    const key = `${seed.id}|${chain.map((s) => s.rule).join('>')}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(buildResult(seed, chain, target, blocked));
  }

  function walk(current, chain, depth) {
    if (depth > MAX_DEPTH) return;
    for (const cand of inverseCandidates(current)) {
      // Nos compostos, o "+" dos exemplos declarados sai: "couve + flor" → "couve flor".
      const from = RULES[cand.ruleId]?.process?.startsWith('COMPOUND')
        ? cand.lemma.split(/\s+/).filter((t) => t !== '+').join(' ')
        : cand.lemma;
      const step = { rule: cand.ruleId, from, to: current };
      const nextChain = [step, ...chain];

      // Compostos: a raiz é a do primeiro elemento; o segundo pode ser derivado.
      if (/\s/.test(cand.lemma)) {
        const tokens = cand.lemma.split(/\s+/).filter((t) => t !== '+');
        const seed = SEED_BY_NORM.get(normalize(tokens[0]));
        if (!seed) continue;
        // Se o segundo elemento for derivado (falante ← falar), prefixa a cadeia.
        let compoundChain = nextChain;
        const secondSeed = SEED_BY_NORM.get(normalize(tokens[1] ?? ''));
        if (!secondSeed && tokens[1]) {
          const inner = analyze(tokens[1]).find((r) => r.root && r.chain.length);
          if (inner) {
            compoundChain = [...inner.chain.map((s) => ({ ...s })), ...nextChain];
            record(seed, compoundChain);
            continue;
          }
        }
        record(seed, compoundChain);
        continue;
      }

      const seed = SEED_BY_NORM.get(normalize(cand.lemma));
      if (seed) {
        // O primeiro passo sai da RAIZ: usa o lema canônico (útil, não util).
        const first = { ...nextChain[0], from: seed.lemma };
        record(seed, [first, ...nextChain.slice(1)]);
      } else {
        walk(cand.lemma, nextChain, depth + 1);
      }
    }
  }

  walk(target, [], 1);

  const direct = SEED_BY_NORM.get(normalize(target));
  if (direct) record(direct, []);

  if (results.length === 0) {
    return [{
      word: target, chain: [], root: null, pos: null, semantics: null,
      status: blocked ? 'NOT_A_WORD' : 'HYPOTHESIS_BLOCKED',
      reason: blocked?.reason ?? 'SEM_RAIZ_NA_SEMENTE', confidence: blocked ? 'HIGH' : 'MEDIUM',
      source: blocked ? 'counterexample' : 'exhausted-search'
    }];
  }
  // Ordenação: ATTESTED primeiro; depois a decomposição mais econômica
  // (menos níveis) e, em empate, a que mais usa pares declarados na regra.
  return results.sort((a, b) => {
    const rank = (r) => (r.status === 'ATTESTED' ? 0 : r.status === 'HYPOTHESIS_BLOCKED' ? 2 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.chain.length !== b.chain.length) return a.chain.length - b.chain.length;
    const explicit = (r) => r.chain.filter((s) => isExplicitStep(s)).length;
    if (explicit(a) !== explicit(b)) return explicit(b) - explicit(a);
    // Prefere a cadeia cujas formas intermediárias são PALAVRAS REAIS
    // (antissocialismo = anti + socialismo, não antissocial + ismo).
    const att = (r) => r.chain.reduce((n, s) => n + (ATTESTED_FORMS.has(normalize(s.from)) ? 1 : 0), 0);
    if (att(a) !== att(b)) return att(b) - att(a);
    // Particípio real é análise mais específica que a regressiva homógrafa.
    const part = (r) => (r.chain[0]?.rule === 'CONV_PART_ADJ' ? 0 : 1);
    if (part(a) !== part(b)) return part(a) - part(b);
    // Por fim, prefixo tende a grudar na base antes dos sufixos.
    return inversions(a.chain) - inversions(b.chain);
  });
}

/** Quantos sufixos vieram antes do primeiro prefixo da cadeia. */
function inversions(chain) {
  const firstPrefix = chain.findIndex((s) => RULES[s.rule]?.process === 'PREFIX');
  if (firstPrefix <= 0) return 0;
  return chain.slice(0, firstPrefix).filter((s) => RULES[s.rule]?.process === 'SUFFIX').length;
}

const explicitCache = new Map();
function isExplicitStep(step) {
  const k = key(step.rule, step.from);
  if (!explicitCache.has(k)) explicitCache.set(k, EXPLICIT.has(k));
  return explicitCache.get(k);
}

function buildResult(seed, chain, word, blocked) {
  if (chain.length === 0) {
    return {
      word, chain: [], root: seed.id, pos: seed.pos, semantics: seed.lemma,
      status: blocked ? 'HYPOTHESIS_BLOCKED' : 'ATTESTED', confidence: 'HIGH', source: 'seed-root',
      ...(blocked ? { reason: blocked.reason } : {})
    };
  }
  const attested = (seed.attestedDerivations ?? []).some(
    (d) => normalize(d.word) === normalize(word)
  );
  // Semântica: parte da raiz. Se a cadeia atravessa uma forma LEXICALIZADA
  // (despedir, descrever), a composição para ali: a palavra vale como unidade
  // ("ACTION_OF(despedir)", não REVERSAL(pedir)).
  let base = seed.lemma;
  let steps = chain;
  const lexIndex = chain.findIndex((s) => LEXICALIZED_FORMS.has(normalize(s.to)));
  if (lexIndex >= 0) {
    base = chain[lexIndex].to;
    steps = chain.slice(lexIndex + 1);
  }

  // Uma regra pode licenciar mais de uma leitura (ACTION_OF e RESULT_OF, por
  // exemplo). A principal vem em `semantics`; as demais, em `alternatives`.
  const compose = (pick) => steps.reduce((acc, step) => {
    const rule = RULES[step.rule];
    if (rule.process?.startsWith('COMPOUND')) {
      const elements = step.from.split(/\s+/).filter((t) => t !== '+').join(',');
      return `${relationOf(step.rule)}(${elements})`;
    }
    return `${pick(step.rule)}(${acc})`;
  }, base);

  const primary = compose((ruleId) => relationOf(ruleId));
  const alternatives = [];
  for (const step of steps) {
    for (const alt of RULES[step.rule]?.semantics?.alsoPossible ?? []) {
      const altExpr = compose((ruleId) => (ruleId === step.rule ? alt : relationOf(ruleId)));
      if (altExpr !== primary && !alternatives.includes(altExpr)) alternatives.push(altExpr);
    }
  }

  return {
    word,
    chain,
    root: seed.id,
    pos: RULES[chain[chain.length - 1].rule]?.output?.pos ?? seed.pos,
    semantics: primary,
    alternatives,
    status: blocked ? 'HYPOTHESIS_BLOCKED' : attested ? 'ATTESTED' : 'HYPOTHESIS',
    confidence: attested ? 'HIGH' : 'MEDIUM',
    source: 'rule',
    ...(blocked ? { reason: blocked.reason } : {})
  };
}

/** Nome da função semântica de uma regra, para dobrar palavras atestadas. */
function relationFromRule(ruleId) {
  return relationOf(ruleId);
}

// ---------------------------------------------------------------------------
// Flexão
// ---------------------------------------------------------------------------

const FEATURE_ORDER = ['Gender', 'Number', 'Person', 'Mood', 'VerbForm', 'Tense', 'Degree'];

export function featureKey(feats) {
  return FEATURE_ORDER.filter((k) => feats[k] !== undefined).map((k) => `${k}=${feats[k]}`).join('|');
}

export const PARADIGMS = Object.fromEntries(paradigms.paradigms.map((p) => [p.id, p]));
export const IRREGULAR = Object.fromEntries(irregular.verbs.map((v) => [v.id, v]));
export const SUPPLEMENTARY_PARTICIPLES = Object.fromEntries(
  irregular.supplementaryParticiples.map((v) => [v.id, v])
);

const FORM_INDEX = new Map();
const SURFACE_INDEX = new Map();

function addForm(paradigmId, lemma, key, surface) {
  FORM_INDEX.set(`${paradigmId}|${lemma.toLowerCase()}|${key}`, surface);
  const sk = surface.toLowerCase();
  if (!SURFACE_INDEX.has(sk)) SURFACE_INDEX.set(sk, []);
  SURFACE_INDEX.get(sk).push({ paradigmId, lemma, featureKey: key });
}

function paradigmForms(paradigm, lemma) {
  const stem = paradigm.strip && lemma.endsWith(paradigm.strip)
    ? lemma.slice(0, lemma.length - paradigm.strip.length)
    : lemma;
  return paradigm.cells.map((cell) => ({ key: featureKey(cell.feats), surface: stem + cell.suffix }));
}

for (const p of paradigms.paradigms) {
  for (const lemma of p.examples ?? []) {
    for (const { key, surface } of paradigmForms(p, lemma)) addForm(p.id, lemma, key, surface);
  }
}
for (const v of irregular.verbs) {
  for (const [key, surface] of Object.entries(v.forms)) addForm(v.id, v.lemma, key, surface);
}
for (const v of irregular.supplementaryParticiples) {
  for (const [key, surfaces] of Object.entries(v.variants)) {
    surfaces.forEach((s) => addForm(v.id, v.lemma, key, s));
  }
}

/** Paradigma de um lema, por exemplo declarado ou por forma de dicionário. */
export function findParadigmFor(lemma, hint) {
  if (hint && PARADIGMS[hint]) return hint;
  for (const v of irregular.verbs) if (v.lemma === lemma) return v.id;
  for (const v of irregular.supplementaryParticiples) if (v.lemma === lemma) return v.id;
  for (const [id] of Object.entries(IRREGULAR)) if (IRREGULAR[id].lemma === lemma) return id;
  return null;
}

const paradigmIdOf = (lemmaEntry) =>
  typeof lemmaEntry === 'string'
    ? findParadigmFor(lemmaEntry)
    : lemmaEntry.paradigmId ?? lemmaEntry.inflection?.paradigmId;

/** inflect(lemmaEntry, featureKey) → forma (ou null). */
export function inflect(lemmaEntry, key) {
  const forms = inflectAll(lemmaEntry, key);
  return forms.length ? forms[0] : null;
}

/** inflectAll: particípios abundantes licenciam mais de uma forma. */
export function inflectAll(lemmaEntry, key) {
  const lemma = typeof lemmaEntry === 'string' ? lemmaEntry : lemmaEntry.lemma;
  const paradigmId = paradigmIdOf(lemmaEntry);
  if (!paradigmId) return [];
  const found = [];
  const v = IRREGULAR[paradigmId] ?? SUPPLEMENTARY_PARTICIPLES[paradigmId];
  if (v?.forms?.[key]) found.push(v.forms[key]);
  if (v?.variants?.[key]) found.push(...v.variants[key]);
  const single = FORM_INDEX.get(`${paradigmId}|${lemma.toLowerCase()}|${key}`);
  if (single !== undefined && !found.includes(single)) found.push(single);
  return found;
}

/** lemmatize(form) → leituras (lemma, paradigmId, featureKey). */
export function lemmatize(form) {
  const hits = SURFACE_INDEX.get(form.toLowerCase()) ?? [];
  const seen = new Set();
  return hits.filter((h) => {
    const k = `${h.lemma}|${h.featureKey}|${h.paradigmId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Molduras e tipos
// ---------------------------------------------------------------------------

export const FRAMES = Object.fromEntries(frames.frames.map((f) => [f.id, f]));
export const TYPE_IDS = new Set(semanticTypes.types.map((t) => t.id));
export const FUNCTION_IDS = new Set(semanticFunctions.functions.map((f) => f.id));
