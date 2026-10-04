import affixRules from './affix-rules.json';
import seedRoots from './seed-roots.json';
import semanticFunctions from './semantic-functions.json';
import stemRules from './stem-rules.json';
import type { Lexeme, LexemeId } from '../../engine/types';
import type { TeachableRoot } from '../language/teachableRoot';
import {
  DerivationalAnalyzer,
  type AffixRule,
  type LexiconEntry,
  type MorphologyData
} from '../../engine/morphology/DerivationalAnalyzer';

interface SeedEntry {
  id: string;
  lemma: string;
  pos: string;
  senses?: Array<{ gloss?: string }>;
  attestedDerivations?: Array<{ word: string }>;
  lexicalized?: Array<{ word: string }>;
}

/**
 * Dados da rede gerativa (pesquisa em research/morfologia, integrados aqui):
 * regras de formação + regras de radical + léxico-semente + lemas do domínio.
 */
export function buildMorphologyData(domainLexemes: Record<LexemeId, Lexeme> = {}, languageRoots: TeachableRoot[] = []): MorphologyData {
  const seeds = (seedRoots as { entries: SeedEntry[] }).entries;
  const lexicon: LexiconEntry[] = seeds.map((e) => ({
    id: e.id,
    lemma: e.lemma,
    pos: e.pos,
    gloss: e.senses?.[0]?.gloss
  }));
  for (const lexeme of Object.values(domainLexemes)) {
    lexicon.push({ id: lexeme.id, lemma: lexeme.lemma, pos: lexeme.pos, domain: true });
  }
  for (const root of languageRoots) {
    lexicon.push({ id: root.id, lemma: root.lemma, pos: root.pos, gloss: root.sense.gloss });
  }
  const attested = seeds.flatMap((e) => [
    ...(e.attestedDerivations ?? []).map((d) => d.word),
    ...(e.lexicalized ?? []).map((d) => d.word)
  ]);
  const stem = stemRules as unknown as {
    surfaceVariants: MorphologyData['surfaceVariants'];
    extraRules: AffixRule[];
    baseRestorations: MorphologyData['restorations'];
    invalidJunctions: MorphologyData['invalidJunctions'];
    verbalAlternations: MorphologyData['verbalAlternations'];
  };
  return {
    rules: [...(affixRules as { rules: AffixRule[] }).rules, ...stem.extraRules],
    surfaceVariants: stem.surfaceVariants,
    restorations: stem.baseRestorations,
    verbalAlternations: stem.verbalAlternations,
    invalidJunctions: stem.invalidJunctions,
    semanticFunctions: (semanticFunctions as { functions: MorphologyData['semanticFunctions'] }).functions,
    lexicon,
    attested
  };
}

export function createDerivationalAnalyzer(domainLexemes?: Record<LexemeId, Lexeme>, languageRoots?: TeachableRoot[]): DerivationalAnalyzer {
  return new DerivationalAnalyzer(buildMorphologyData(domainLexemes, languageRoots));
}
