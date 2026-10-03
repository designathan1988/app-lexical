/**
 * Análise derivacional REVERSA: palavra desconhecida → base conhecida, por
 * regras de formação (Koskenniemi: as mesmas regras servem para gerar e
 * analisar). Nenhum par palavra→base é consultado: a palavra é desmontada
 * afixo por afixo, a base é restaurada pelas regras de radical (vogal
 * temática, feminino do -mente, alternâncias c/z, bil/vel, n/m, radical
 * latino) e só se aceita uma base que EXISTA no léxico com a classe exigida
 * pela regra. O significado é a composição das funções semânticas.
 *
 * Status:
 *   ATTESTED          — a palavra consta como derivação real nos dados;
 *   HYPOTHESIS        — formada por regra, não atestada (palavra possível);
 *   HYPOTHESIS_BLOCKED — a palavra é contraexemplo declarado de uma regra.
 */

export type MorphPos = 'VERB' | 'NOUN' | 'ADJECTIVE' | 'ADVERB' | string;

export interface LexiconEntry {
  id: string;
  lemma: string;
  pos: MorphPos;
  gloss?: string;
  /** Lexema do domínio do construtor (não do léxico-semente geral). */
  domain?: boolean;
}

export interface AffixRule {
  id: string;
  process: string;
  form: { prefix?: string; suffix?: string };
  input?: { pos?: MorphPos | MorphPos[] };
  output?: { pos?: MorphPos };
  semantics?: { function?: string };
  productivity?: string;
  examples?: Array<{ base: string; derived: string }>;
  counterExamples?: Array<{ wouldBe?: string; reason?: string }>;
}

export interface Restoration {
  end: string;
  add?: string;
  replace?: string;
}

export interface InvalidJunction {
  rule: string;
  residueEnd?: string;
  suffixStartsWithVowel?: boolean;
  surface?: string;
  restStartsWith?: string[];
}

export interface MorphologyData {
  rules: AffixRule[];
  /** Fronteiras impossíveis (alomorfia obrigatória): rejeitam bases candidatas. */
  invalidJunctions?: InvalidJunction[];
  surfaceVariants: Array<{ rule: string; surface: string }>;
  restorations: { VERB: Restoration[]; NOMINAL: Restoration[] };
  semanticFunctions: Array<{ id: string; glossTemplate?: string }>;
  lexicon: LexiconEntry[];
  attested: string[];
}

export interface DerivationStep {
  rule: string;
  from: string;
  to: string;
}

export interface DerivationAnalysis {
  word: string;
  root: LexiconEntry;
  chain: DerivationStep[];
  pos: MorphPos;
  semantics: string;
  gloss: string;
  status: 'ATTESTED' | 'HYPOTHESIS' | 'HYPOTHESIS_BLOCKED';
  score: number;
  /** Flexão desfeita antes da análise (ex.: plural). */
  inflection?: string;
}

const MAX_DEPTH = 4;
const MIN_BASE = 2;

export const normalizeWord = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const asList = (p?: MorphPos | MorphPos[]): MorphPos[] => (p === undefined ? [] : Array.isArray(p) ? p : [p]);

const PRODUCTIVITY: Record<string, number> = { HIGH: 1, MEDIUM: 0.8, LOW: 0.6 };

interface Partial {
  root: LexiconEntry;
  chain: DerivationStep[];
  pos: MorphPos;
  score: number;
}

export class DerivationalAnalyzer {
  private byLemma = new Map<string, LexiconEntry[]>();
  private surfaces = new Map<string, string[]>();
  private attested = new Set<string>();
  private blocked = new Map<string, string>();
  private glossTemplates = new Map<string, string>();
  private memo = new Map<string, Partial[]>();

  constructor(private data: MorphologyData) {
    for (const entry of data.lexicon) {
      const key = normalizeWord(entry.lemma);
      const list = this.byLemma.get(key) ?? [];
      if (!list.some((e) => e.id === entry.id)) list.push(entry);
      this.byLemma.set(key, list);
    }
    for (const rule of data.rules) {
      // Superfície que a busca casa: prefixo para PREFIX/PARASYNTHETIC, sufixo nos demais.
      const own =
        rule.process === 'PREFIX' || rule.process === 'PARASYNTHETIC' ? rule.form.prefix : rule.form.suffix;
      this.surfaces.set(rule.id, own ? [own] : []);
      for (const ex of rule.examples ?? []) this.attested.add(normalizeWord(ex.derived));
      for (const ce of rule.counterExamples ?? []) {
        if (ce.wouldBe) this.blocked.set(normalizeWord(ce.wouldBe), `${rule.id}: ${ce.reason ?? ''}`);
      }
    }
    for (const v of data.surfaceVariants) this.surfaces.get(v.rule)?.push(v.surface);
    for (const w of data.attested) this.attested.add(normalizeWord(w));
    for (const f of data.semanticFunctions) if (f.glossTemplate) this.glossTemplates.set(f.id, f.glossTemplate);
  }

  /** Lemas conhecidos (léxico). */
  lookup(word: string): LexiconEntry[] {
    return this.byLemma.get(normalizeWord(word)) ?? [];
  }

  /** Todas as análises da palavra, da mais provável para a menos. */
  analyze(word: string): DerivationAnalysis[] {
    this.memo.clear();
    const w = word.trim();
    const out: DerivationAnalysis[] = [];
    for (const { form, inflection } of this.uninflect(w)) {
      for (const p of this.search(form, 0)) {
        if (!p.chain.length && !inflection) continue; // a própria palavra é lema: não é derivação
        out.push(this.finish(w, p, inflection));
      }
    }
    const seen = new Set<string>();
    return out
      .sort((a, b) => b.score - a.score || a.chain.length - b.chain.length)
      .filter((a) => {
        const key = `${a.root.id}|${a.chain.map((s) => s.rule).join('>')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  /** Flexão nominal desfeita (plural, -ões/-ais/-is): a derivação vem antes da flexão. */
  private uninflect(w: string): Array<{ form: string; inflection?: string }> {
    const out: Array<{ form: string; inflection?: string }> = [{ form: w }];
    const add = (form: string, inflection: string) => {
      if (form.length > MIN_BASE && form !== w) out.push({ form, inflection });
    };
    if (/ões$/.test(w)) add(w.replace(/ões$/, 'ão'), 'Number=Plur');
    if (/ais$/.test(w)) add(w.replace(/ais$/, 'al'), 'Number=Plur');
    if (/eis$/.test(w)) add(w.replace(/eis$/, 'el'), 'Number=Plur');
    if (/res$|zes$/.test(w)) add(w.slice(0, -2), 'Number=Plur');
    if (/s$/.test(w)) add(w.slice(0, -1), 'Number=Plur');
    return out;
  }

  private search(w: string, depth: number): Partial[] {
    const key = `${normalizeWord(w)}@${depth}`;
    const cached = this.memo.get(key);
    if (cached) return cached;
    this.memo.set(key, []);

    const results: Partial[] = [];
    for (const entry of this.lookup(w)) results.push({ root: entry, chain: [], pos: entry.pos, score: 0 });

    const isLemma = results.length > 0;
    if (depth < MAX_DEPTH) {
      for (const rule of this.data.rules) {
        for (const { base, weight } of this.bases(w, rule)) {
          const accepted = asList(rule.input?.pos);
          for (const sub of this.search(base, depth + 1)) {
            if (accepted.length && !accepted.includes(sub.pos)) continue;
            const from = sub.chain.length ? sub.chain[sub.chain.length - 1].to : sub.root.lemma;
            results.push({
              root: sub.root,
              chain: [...sub.chain, { rule: rule.id, from, to: w }],
              pos: rule.output?.pos ?? sub.pos,
              // Cada passo custa (cadeia curta é preferível); regra menos
              // produtiva custa mais; desmontar uma palavra que JÁ é lema
              // conhecido é a última opção.
              score: sub.score + (weight - 1) - 0.3 - (isLemma ? 1.5 : 0)
            });
          }
        }
      }
    }

    this.memo.set(key, results);
    return results;
  }

  /** Bases candidatas de `w` sob a regra (restauradas pelas regras de radical). */
  private bases(w: string, rule: AffixRule): Array<{ base: string; weight: number }> {
    const out: Array<{ base: string; weight: number }> = [];
    const weight = PRODUCTIVITY[rule.productivity ?? 'MEDIUM'] ?? 0.8;
    const lw = w.toLowerCase();
    const nw = normalizeWord(w);
    const accepted = asList(rule.input?.pos);
    const verbal = accepted.includes('VERB');
    const nominal = accepted.some((p) => p === 'NOUN' || p === 'ADJECTIVE');
    const push = (base: string, wgt = weight) => {
      if (base.length >= MIN_BASE && normalizeWord(base) !== nw) out.push({ base, weight: wgt });
    };
    const restore = (raw: string, suffix: string, wgt = weight) => {
      if (raw.length < MIN_BASE) return;
      // O acento na vogal antes do sufixo pertence ao sufixo (aceit-á-vel).
      const residue = raw.replace(/[áéí]$/, (v) => normalizeWord(v));
      const sets = [
        ...(verbal ? this.data.restorations.VERB : []),
        ...(nominal ? this.data.restorations.NOMINAL : [])
      ];
      for (const r of sets) {
        if (!residue.endsWith(r.end) && normalizeWord(residue).endsWith(normalizeWord(r.end)) === false) continue;
        // Fronteira impossível só quando a base é o PRÓPRIO resíduo (jardim+eiro).
        const identity = !r.end && !r.add && r.replace === undefined;
        if (identity && this.invalid(rule.id, { residue: raw, suffix })) continue;
        if (!identity && this.invalid(rule.id, { residue: raw, suffix }) && !this.invalidAllowsRestored(rule.id, raw)) continue;
        const stem = r.end ? residue.slice(0, residue.length - r.end.length) : residue;
        push(r.replace !== undefined ? stem + r.replace : residue + (r.add ?? ''), wgt);
      }
    };

    switch (rule.process) {
      case 'SUFFIX': {
        for (const s of this.surfaces.get(rule.id) ?? []) {
          if (!nw.endsWith(normalizeWord(s))) continue;
          restore(lw.slice(0, lw.length - s.length), s);
        }
        break;
      }
      case 'REGRESSIVE': {
        const s = rule.form.suffix ?? '';
        if (!s || !lw.endsWith(s)) break;
        const root = lw.slice(0, lw.length - s.length);
        // Derivação regressiva é menos provável que a sufixal: peso menor.
        for (const v of ['ar', 'er', 'ir']) push(root + v, 0.5);
        break;
      }
      case 'PREFIX': {
        for (const p of this.surfaces.get(rule.id) ?? []) {
          const np = normalizeWord(p);
          if (!nw.startsWith(np)) continue;
          let rest = lw.slice(p.length).replace(/^-/, '');
          if (this.invalid(rule.id, { surface: p, rest })) continue;
          // Encontro na fronteira: auto+rr, anti+ss, i+rr (o r/s dobra).
          if (/^(rr|ss)/.test(rest) && /[aeiou]$/.test(np)) rest = rest.slice(1);
          if (rest.length < 3) continue;
          push(rest, 0.9);
          if (np === 'des') push(`es${rest}`, 0.85); // des + escrever → descrever
        }
        break;
      }
      case 'PARASYNTHETIC': {
        const suffix = rule.form.suffix ?? '';
        if (!suffix || !nw.endsWith(normalizeWord(suffix))) break;
        for (const p of this.surfaces.get(rule.id) ?? []) {
          if (!nw.startsWith(normalizeWord(p))) continue;
          const residue = lw.slice(p.length, lw.length - suffix.length);
          if (residue.length < MIN_BASE) continue;
          for (const r of this.data.restorations.NOMINAL) {
            if (!residue.endsWith(r.end)) continue;
            const stem = r.end ? residue.slice(0, residue.length - r.end.length) : residue;
            push(r.replace !== undefined ? stem + r.replace : residue + (r.add ?? ''));
          }
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  /** Fronteira impossível segundo os dados (alomorfia obrigatória). */
  private invalid(ruleId: string, ctx: { residue?: string; suffix?: string; surface?: string; rest?: string }): boolean {
    return (this.data.invalidJunctions ?? []).some((j) => {
      if (j.rule !== '*' && j.rule !== ruleId) return false;
      if (j.residueEnd !== undefined) {
        if (ctx.residue === undefined || !ctx.residue.endsWith(j.residueEnd)) return false;
        if (j.suffixStartsWithVowel && !/^[aeiouáéíóúâêôãõ]/.test(ctx.suffix ?? '')) return false;
        return true;
      }
      if (j.surface !== undefined) {
        if (ctx.surface !== j.surface || ctx.rest === undefined) return false;
        return (j.restStartsWith ?? []).some((c) => ctx.rest!.startsWith(c));
      }
      return false;
    });
  }

  /**
   * A restrição de fronteira proíbe a base IDÊNTICA ao resíduo; bases
   * restauradas (tom+ar, plum+a) continuam possíveis.
   */
  private invalidAllowsRestored(_ruleId: string, _residue: string): boolean {
    return true;
  }

  /** Particípio regular para paráfrases ("que pode ser tomado"). */
  private participle(phrase: string): string {
    // O verbo é a primeira palavra da paráfrase ("tomar de novo").
    return phrase.replace(/^([^\s]+?)(ar|er|ir)(?=[\s]|$)/, (_m, stem, v) => stem + (v === 'ar' ? 'ado' : 'ido'));
  }

  private finish(word: string, p: Partial, inflection?: string): DerivationAnalysis {
    let semantics = p.root.lemma;
    let gloss = p.root.lemma;
    for (const step of p.chain) {
      const rule = this.data.rules.find((r) => r.id === step.rule);
      const fn = rule?.semantics?.function ?? step.rule;
      semantics = `${fn}(${semantics})`;
      const template = this.glossTemplates.get(fn);
      // "ser {base}" pede particípio só quando a base é verbo (reciclável),
      // não adjetivo (qualidade de ser feliz).
      const verbal = asList(rule?.input?.pos).includes('VERB');
      const base = template && verbal && /ser {base}/.test(template) ? this.participle(gloss) : gloss;
      gloss = template ? template.replace('{base}', base) : `${fn.toLowerCase()} de ${gloss}`;
    }
    const n = normalizeWord(word);
    const status = this.blocked.has(n)
      ? 'HYPOTHESIS_BLOCKED'
      : this.attested.has(n)
        ? 'ATTESTED'
        : 'HYPOTHESIS';
    return {
      word,
      root: p.root,
      chain: p.chain,
      pos: p.pos,
      semantics,
      gloss,
      status,
      score: p.score + (status === 'ATTESTED' ? 0.5 : 0) - (status === 'HYPOTHESIS_BLOCKED' ? 2 : 0),
      inflection
    };
  }
}
