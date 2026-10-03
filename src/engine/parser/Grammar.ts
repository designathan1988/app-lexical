/**
 * Gramática fechada (function words): artigos, conectivos, ordinais e
 * quantificadores não viram componentes do builder.
 */
export interface GrammarDef {
  definiteArticles: Set<string>;
  indefiniteArticles: Set<string>;
  otherDeterminers: Set<string>;
  conjunctions: Set<string>;
  with: Set<string>;
  to: Set<string>;
  from: Set<string>;
  except: Set<string>;
  all: Set<string>;
  pronouns: Set<string>;
  ordinals: Map<string, number>;
  cardinals: Map<string, number>;
  negation: Set<string>;
  without: Set<string>;
}

export const GRAMMAR: GrammarDef = {
  definiteArticles: new Set(['o', 'a', 'os', 'as']),
  indefiniteArticles: new Set(['um', 'uma', 'uns', 'umas']),
  otherDeterminers: new Set(['outro', 'outra', 'outros', 'outras']),
  conjunctions: new Set(['e']),
  with: new Set(['com']),
  to: new Set(['para']),
  from: new Set(['de']),
  except: new Set(['menos', 'exceto']),
  all: new Set(['todo', 'toda', 'todos', 'todas']),
  pronouns: new Set(['ele', 'ela', 'eles', 'elas']),
  negation: new Set(['nao', 'não']),
  without: new Set(['sem']),

  ordinals: new Map<string, number>([
    ['primeiro', 0],
    ['primeira', 0],
    ['primeiros', 0],
    ['primeiras', 0],
    ['segundo', 1],
    ['segunda', 1],
    ['segundos', 1],
    ['segundas', 1],
    ['terceiro', 2],
    ['terceira', 2],
    ['terceiros', 2],
    ['terceiras', 2],
    ['quarto', 3],
    ['quarta', 3],
    ['quartos', 3],
    ['quartas', 3],
    ['quinto', 4],
    ['quinta', 4],
    ['quintos', 4],
    ['quintas', 4],
    ['sexto', 5],
    ['sexta', 5],
    ['sétimo', 6],
    ['setimo', 6],
    ['oitavo', 7],
    ['nono', 8],
    ['décimo', 9],
    ['decimo', 9],
    ['último', -1],
    ['ultimo', -1],
    ['última', -1],
    ['ultima', -1]
  ]),

  cardinals: new Map<string, number>([
    ['um', 1],
    ['uma', 1],
    ['dois', 2],
    ['duas', 2],
    ['tres', 3],
    ['três', 3],
    ['quatro', 4],
    ['cinco', 5],
    ['seis', 6],
    ['sete', 7],
    ['oito', 8],
    ['nove', 9],
    ['dez', 10]
  ])
};

/**
 * Palavras de função reconhecidas (não geram UNKNOWN_WORD), além das classes
 * gramaticais fechadas. Usadas apenas para diagnósticos.
 */
export const FUNCTION_WORDS: Set<string> = new Set([
  ...GRAMMAR.definiteArticles,
  ...GRAMMAR.indefiniteArticles,
  ...GRAMMAR.otherDeterminers,
  ...GRAMMAR.conjunctions,
  ...GRAMMAR.with,
  ...GRAMMAR.to,
  ...GRAMMAR.from,
  ...GRAMMAR.except,
  ...GRAMMAR.all,
  ...GRAMMAR.pronouns,
  ...GRAMMAR.negation,
  ...GRAMMAR.without,
  ...GRAMMAR.ordinals.keys(),
  ...GRAMMAR.cardinals.keys(),
  'em',
  'no',
  'na',
  'por',
  'que',
  'a',
  'as',
  'os',
  'o',
  'dentro',
  'fora',
  'antes',
  'depois',
  'lado',
  'ao',
  'outro',
  'outra',
  'outros',
  'outras',
  'mesmo',
  'mesma'
]);
