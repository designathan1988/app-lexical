/**
 * Anexa os 40 casos morfossintáticos da PARTE V a `regression.json`,
 * com a tag `morph`. Autorados por raciocínio sobre a semântica do domínio
 * (regra 6: expectativas antes do código que as satisfaz).
 *
 * Uso: node scripts/seed-morph-cases.mjs
 */
import fs from 'node:fs';

const PATH = 'src/eval/data/regression.json';

const B = (gender, number) => `Gender=${gender}|Number=${number}`;

const records = [
  {
    id: 'morph-01',
    input: 'coloque uma caixa preta com um botão azul dentro',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#000000) | ' +
        'CREATE tmp_2 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#2563eb)] ' +
        'PLACE new:tmp_2 C_SPAT_INSIDE new:tmp_1',
      plan:
        'CREATE_NODE tmp_1 C_ENT_CONTAINER\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #000000\n' +
        'CREATE_NODE tmp_2 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_2 C_PROP_BG_COLOR #2563eb\n' +
        'PLACE_NODE temp:tmp_2 C_SPAT_INSIDE temp:tmp_1',
      finalTree:
        'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      attachments: [['button', 'C_SPAT_INSIDE', 'container']],
      readings: [
        { surface: 'coloque', lemma: 'colocar', feats: 'Mood=Imp|VerbForm=Fin' },
        { surface: 'caixa', lemma: 'caixa', feats: B('Fem', 'Sing') },
        { surface: 'preta', lemma: 'preto', feats: B('Fem', 'Sing') },
        { surface: 'botão', lemma: 'botão', feats: B('Masc', 'Sing') },
        { surface: 'azul', lemma: 'azul', feats: 'Number=Sing' }
      ]
    },
    tags: ['morph', 'create', 'agreement', 'containment']
  },
  {
    id: 'morph-02',
    input: 'crie uma caixa com um botão preta',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#000000) | ' +
        'CREATE tmp_2 C_ENT_BUTTON] PLACE new:tmp_2 C_SPAT_INSIDE new:tmp_1',
      plan:
        'CREATE_NODE tmp_1 C_ENT_CONTAINER\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #000000\n' +
        'CREATE_NODE tmp_2 C_ENT_BUTTON\n' +
        'PLACE_NODE temp:tmp_2 C_SPAT_INSIDE temp:tmp_1',
      finalTree:
        'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n  C_ENT_BUTTON{}',
      attachments: [['button', 'C_SPAT_INSIDE', 'container']],
      readings: [
        { surface: 'caixa', lemma: 'caixa', feats: B('Fem', 'Sing') },
        { surface: 'botão', lemma: 'botão', feats: B('Masc', 'Sing') },
        { surface: 'preta', lemma: 'preto', feats: B('Fem', 'Sing') }
      ]
    },
    tags: ['morph', 'create', 'agreement']
  },
  {
    id: 'morph-03',
    input: 'crie uma caixa e um botão vermelhos',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#dc2626) | ' +
        'CREATE tmp_2 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#dc2626)]',
      plan:
        'CREATE_NODE tmp_1 C_ENT_CONTAINER\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #dc2626\n' +
        'CREATE_NODE tmp_2 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_2 C_PROP_BG_COLOR #dc2626',
      finalTree:
        'C_ENT_CONTAINER{C_PROP_BG_COLOR=#dc2626}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}',
      readings: [
        { surface: 'vermelhos', lemma: 'vermelho', feats: B('Masc', 'Plur') }
      ]
    },
    tags: ['morph', 'create', 'coordination', 'agreement']
  },
  {
    id: 'morph-04',
    input: 'crie uma caixa e um botão vermelho',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_CONTAINER | ' +
        'CREATE tmp_2 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#dc2626)]',
      plan:
        'CREATE_NODE tmp_1 C_ENT_CONTAINER\n' +
        'CREATE_NODE tmp_2 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_2 C_PROP_BG_COLOR #dc2626',
      finalTree: 'C_ENT_CONTAINER{}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}',
      readings: [{ surface: 'vermelho', lemma: 'vermelho', feats: B('Masc', 'Sing') }]
    },
    tags: ['morph', 'create', 'coordination', 'agreement']
  },
  {
    id: 'morph-05',
    input: 'crie um botão e uma caixa pretos',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#000000) | ' +
        'CREATE tmp_2 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#000000)]',
      plan:
        'CREATE_NODE tmp_1 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #000000\n' +
        'CREATE_NODE tmp_2 C_ENT_CONTAINER\n' +
        'SET_PROPERTY temp:tmp_2 C_PROP_BG_COLOR #000000',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#000000}\nC_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}',
      readings: [{ surface: 'pretos', lemma: 'preto', feats: B('Masc', 'Plur') }]
    },
    tags: ['morph', 'create', 'coordination', 'agreement']
  },
  {
    id: 'morph-06',
    input: 'crie um botão e uma caixa pretas',
    expected: {
      finalTree: '',
      diagnostics: ['AGREEMENT_MISMATCH'],
      readings: [{ surface: 'pretas', lemma: 'preto', feats: B('Fem', 'Plur') }]
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'agreement']
  },
  {
    id: 'morph-07',
    input: 'apague os botões azuis',
    seed: [
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#2563eb' } },
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#2563eb' } },
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#dc2626' } }
    ],
    expected: {
      ast: 'DELETE sel:C_ENT_BUTTON;all;prop[C_PROP_BG_COLOR=#2563eb]',
      plan: 'DELETE_NODE node_1\nDELETE_NODE node_2',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}',
      resolvedReferences: [0, 1],
      readings: [
        { surface: 'apague', lemma: 'apagar', feats: 'Mood=Imp|VerbForm=Fin' },
        { surface: 'botões', lemma: 'botão', feats: B('Masc', 'Plur') },
        { surface: 'azuis', lemma: 'azul', feats: 'Number=Plur' }
      ]
    },
    tags: ['morph', 'delete', 'definite-plural', 'property-filter']
  },
  {
    id: 'morph-08',
    input: 'apague o botão azul',
    seed: [
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#2563eb' } },
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#2563eb' } }
    ],
    expected: {
      finalTree:
        'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      resolvedReferences: [],
      diagnostics: ['AMBIGUOUS_REFERENCE'],
      ambiguous: true
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'ambiguity']
  },
  {
    id: 'morph-09',
    input: 'mude as cores de fundo dos botões para azul',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }, { entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      ast: 'UPDATE sel:C_ENT_BUTTON;all set(C_PROP_BG_COLOR,COLOR:#2563eb)',
      plan:
        'SET_PROPERTY node:node_1 C_PROP_BG_COLOR #2563eb\n' +
        'SET_PROPERTY node:node_2 C_PROP_BG_COLOR #2563eb',
      finalTree:
        'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      bindings: [
        ['@0', 'C_PROP_BG_COLOR', '#2563eb'],
        ['@1', 'C_PROP_BG_COLOR', '#2563eb']
      ]
    },
    tags: ['morph', 'update', 'mwe-inflection']
  },
  {
    id: 'morph-10',
    input: 'mude a cor do fundo do botão para azul',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      ast: 'UPDATE sel:C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#2563eb)',
      plan: 'SET_PROPERTY node:node_1 C_PROP_BG_COLOR #2563eb',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      bindings: [['@0', 'C_PROP_BG_COLOR', '#2563eb']]
    },
    tags: ['morph', 'update', 'mwe-inflection']
  },
  {
    id: 'morph-11',
    input: 'coloca-o depois da caixa',
    discourse: ['crie uma caixa', 'crie um botão'],
    expected: {
      ast: 'MOVE node:node_2 C_SPAT_AFTER sel:C_ENT_CONTAINER',
      plan: 'MOVE_NODE node_2 C_SPAT_AFTER node:node_1',
      finalTree: 'C_ENT_CONTAINER{}\nC_ENT_BUTTON{}',
      resolvedReferences: [1]
    },
    tags: ['morph', 'move', 'enclitic']
  },
  {
    id: 'morph-12',
    input: 'deixe-a azul',
    discourse: ['crie uma caixa'],
    expected: {
      ast: 'UPDATE node:node_1 set(C_PROP_BG_COLOR,COLOR:#2563eb)',
      plan: 'SET_PROPERTY node:node_1 C_PROP_BG_COLOR #2563eb',
      finalTree: 'C_ENT_CONTAINER{C_PROP_BG_COLOR=#2563eb}'
    },
    tags: ['morph', 'update', 'enclitic']
  },
  {
    id: 'morph-13',
    input: 'apague-a',
    discourse: ['crie uma caixa'],
    expected: {
      ast: 'DELETE node:node_1',
      plan: 'DELETE_NODE node_1',
      finalTree: '',
      resolvedReferences: [0]
    },
    tags: ['morph', 'delete', 'enclitic']
  },
  {
    id: 'morph-14',
    input: 'mova-os para dentro da caixa',
    discourse: ['crie dois botões', 'crie uma caixa'],
    expected: {
      ast: 'MOVE sel:C_ENT_BUTTON;all C_SPAT_INSIDE sel:C_ENT_CONTAINER',
      plan:
        'MOVE_NODE node_1 C_SPAT_INSIDE node:node_3\n' +
        'MOVE_NODE node_2 C_SPAT_INSIDE node:node_3',
      finalTree: 'C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}\n  C_ENT_BUTTON{}',
      resolvedReferences: [0, 1],
      attachments: [
        ['@1', 'C_SPAT_INSIDE', '@0'],
        ['@2', 'C_SPAT_INSIDE', '@0']
      ]
    },
    tags: ['morph', 'move', 'enclitic', 'plural']
  },
  {
    id: 'morph-15',
    input: 'crie um botãozinho',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON]',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON',
      finalTree: 'C_ENT_BUTTON{}',
      readings: [
        { surface: 'botãozinho', lemma: 'botão', feats: 'Gender=Masc|Number=Sing|Degree=Dim' }
      ]
    },
    tags: ['morph', 'create', 'diminutive']
  },
  {
    id: 'morph-16',
    input: 'crie dois botõezinhos azuis',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON x2 set(C_PROP_BG_COLOR,COLOR:#2563eb)]',
      plan:
        'CREATE_NODE tmp_1_1 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_1_1 C_PROP_BG_COLOR #2563eb\n' +
        'CREATE_NODE tmp_1_2 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_1_2 C_PROP_BG_COLOR #2563eb',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      readings: [
        { surface: 'botõezinhos', lemma: 'botão', feats: 'Gender=Masc|Number=Plur|Degree=Dim' },
        { surface: 'azuis', lemma: 'azul', feats: 'Number=Plur' }
      ]
    },
    tags: ['morph', 'create', 'diminutive', 'plural']
  },
  {
    id: 'morph-17',
    input: 'crie uma caixinha',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_CONTAINER]',
      plan: 'CREATE_NODE tmp_1 C_ENT_CONTAINER',
      finalTree: 'C_ENT_CONTAINER{}',
      readings: [
        { surface: 'caixinha', lemma: 'caixa', feats: 'Gender=Fem|Number=Sing|Degree=Dim' }
      ]
    },
    tags: ['morph', 'create', 'diminutive']
  },
  {
    id: 'morph-18',
    input: 'criem dois botões',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON x2]',
      plan: 'CREATE_NODE tmp_1_1 C_ENT_BUTTON\nCREATE_NODE tmp_1_2 C_ENT_BUTTON',
      finalTree: 'C_ENT_BUTTON{}\nC_ENT_BUTTON{}',
      readings: [
        { surface: 'criem', lemma: 'criar', feats: 'Number=Plur|Mood=Imp|VerbForm=Fin' }
      ]
    },
    tags: ['morph', 'create', 'imperative-plural']
  },
  {
    id: 'morph-19',
    input: 'cria um botão',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON]',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON',
      finalTree: 'C_ENT_BUTTON{}',
      readings: [
        { surface: 'cria', lemma: 'criar', feats: 'Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres' }
      ]
    },
    tags: ['morph', 'create', 'finite-verb-as-command']
  },
  {
    id: 'morph-20',
    input: 'você pode criar um botão azul?',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#2563eb)]',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON\nSET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #2563eb',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}'
    },
    tags: ['morph', 'create', 'politeness']
  },
  {
    id: 'morph-21',
    input: 'poderia criar uma caixa, por favor?',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_CONTAINER]',
      plan: 'CREATE_NODE tmp_1 C_ENT_CONTAINER',
      finalTree: 'C_ENT_CONTAINER{}'
    },
    tags: ['morph', 'create', 'politeness']
  },
  {
    id: 'morph-22',
    input: 'quero um botão vermelho',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#dc2626)]',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON\nSET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #dc2626',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}',
      readings: [
        { surface: 'quero', lemma: 'querer', feats: 'Person=1|Mood=Ind|VerbForm=Fin|Tense=Pres' }
      ]
    },
    tags: ['morph', 'create', 'politeness']
  },
  {
    id: 'morph-23',
    input: 'eu gostaria de apagar o botão',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      ast: 'DELETE sel:C_ENT_BUTTON',
      plan: 'DELETE_NODE node_1',
      finalTree: '',
      resolvedReferences: [0]
    },
    tags: ['morph', 'delete', 'politeness']
  },
  {
    id: 'morph-24',
    input: 'criou um botão',
    expected: {
      finalTree: '',
      diagnostics: ['UNSUPPORTED_OPERATION'],
      readings: [
        { surface: 'criou', lemma: 'criar', feats: 'Person=3|Mood=Ind|VerbForm=Fin|Tense=Past' }
      ]
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'not-a-command']
  },
  {
    id: 'morph-25',
    input: 'pinte os botões de vermelho menos o primeiro',
    seed: [
      { entityConceptId: 'C_ENT_BUTTON' },
      { entityConceptId: 'C_ENT_BUTTON' },
      { entityConceptId: 'C_ENT_BUTTON' }
    ],
    expected: {
      ast: 'UPDATE sel:C_ENT_BUTTON;all;minus[sel:C_ENT_BUTTON;ord=0] set(C_PROP_BG_COLOR,COLOR:#dc2626)',
      plan:
        'SET_PROPERTY node:node_2 C_PROP_BG_COLOR #dc2626\n' +
        'SET_PROPERTY node:node_3 C_PROP_BG_COLOR #dc2626',
      finalTree:
        'C_ENT_BUTTON{}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}',
      bindings: [
        ['@1', 'C_PROP_BG_COLOR', '#dc2626'],
        ['@2', 'C_PROP_BG_COLOR', '#dc2626']
      ]
    },
    tags: ['morph', 'update', 'exclusion']
  },
  {
    id: 'morph-26',
    input: 'dentro da caixa, crie um botão',
    seed: [{ entityConceptId: 'C_ENT_CONTAINER' }],
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON] PLACE new:tmp_1 C_SPAT_INSIDE sel:C_ENT_CONTAINER',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON\nPLACE_NODE temp:tmp_1 C_SPAT_INSIDE node:node_1',
      finalTree: 'C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}',
      attachments: [['button', 'C_SPAT_INSIDE', 'container']]
    },
    tags: ['morph', 'create', 'topicalized-pp']
  },
  {
    id: 'morph-27',
    input: 'crie, dentro da caixa preta, dois botões',
    seed: [
      { entityConceptId: 'C_ENT_CONTAINER', properties: { C_PROP_BG_COLOR: '#000000' } }
    ],
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_BUTTON x2] PLACE new:tmp_1 C_SPAT_INSIDE ' +
        'sel:C_ENT_CONTAINER;prop[C_PROP_BG_COLOR=#000000]',
      plan:
        'CREATE_NODE tmp_1_1 C_ENT_BUTTON\n' +
        'CREATE_NODE tmp_1_2 C_ENT_BUTTON\n' +
        'PLACE_NODE temp:tmp_1_1 C_SPAT_INSIDE node:node_1\n' +
        'PLACE_NODE temp:tmp_1_2 C_SPAT_INSIDE node:node_1',
      finalTree:
        'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n  C_ENT_BUTTON{}\n  C_ENT_BUTTON{}',
      attachments: [
        ['@1', 'C_SPAT_INSIDE', '@0'],
        ['@2', 'C_SPAT_INSIDE', '@0']
      ]
    },
    tags: ['morph', 'create', 'topicalized-pp', 'plural']
  },
  {
    id: 'morph-28',
    input: 'crie duas caixas e três botões',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_CONTAINER x2 | CREATE tmp_2 C_ENT_BUTTON x3]',
      plan:
        'CREATE_NODE tmp_1_1 C_ENT_CONTAINER\n' +
        'CREATE_NODE tmp_1_2 C_ENT_CONTAINER\n' +
        'CREATE_NODE tmp_2_1 C_ENT_BUTTON\n' +
        'CREATE_NODE tmp_2_2 C_ENT_BUTTON\n' +
        'CREATE_NODE tmp_2_3 C_ENT_BUTTON',
      finalTree:
        'C_ENT_CONTAINER{}\nC_ENT_CONTAINER{}\nC_ENT_BUTTON{}\nC_ENT_BUTTON{}\nC_ENT_BUTTON{}',
      readings: [
        { surface: 'caixas', lemma: 'caixa', feats: B('Fem', 'Plur') },
        { surface: 'botões', lemma: 'botão', feats: B('Masc', 'Plur') }
      ]
    },
    tags: ['morph', 'create', 'coordination', 'quantity']
  },
  {
    id: 'morph-29',
    input: 'crie uma caixa preta com dois botões brancos dentro',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#000000) | ' +
        'CREATE tmp_2 C_ENT_BUTTON x2 set(C_PROP_BG_COLOR,COLOR:#ffffff)] ' +
        'PLACE new:tmp_2 C_SPAT_INSIDE new:tmp_1',
      plan:
        'CREATE_NODE tmp_1 C_ENT_CONTAINER\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #000000\n' +
        'CREATE_NODE tmp_2_1 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_2_1 C_PROP_BG_COLOR #ffffff\n' +
        'CREATE_NODE tmp_2_2 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_2_2 C_PROP_BG_COLOR #ffffff\n' +
        'PLACE_NODE temp:tmp_2_1 C_SPAT_INSIDE temp:tmp_1\n' +
        'PLACE_NODE temp:tmp_2_2 C_SPAT_INSIDE temp:tmp_1',
      finalTree:
        'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n' +
        '  C_ENT_BUTTON{C_PROP_BG_COLOR=#ffffff}\n' +
        '  C_ENT_BUTTON{C_PROP_BG_COLOR=#ffffff}',
      attachments: [
        ['@1', 'C_SPAT_INSIDE', '@0'],
        ['@2', 'C_SPAT_INSIDE', '@0']
      ],
      readings: [
        { surface: 'brancos', lemma: 'branco', feats: B('Masc', 'Plur') }
      ]
    },
    tags: ['morph', 'create', 'containment', 'plural', 'agreement']
  },
  {
    id: 'morph-30',
    input: 'coloque o botão azul dentro da caixa preta',
    seed: [
      { entityConceptId: 'C_ENT_CONTAINER', properties: { C_PROP_BG_COLOR: '#000000' } },
      { entityConceptId: 'C_ENT_BUTTON', properties: { C_PROP_BG_COLOR: '#2563eb' } }
    ],
    expected: {
      ast:
        'MOVE sel:C_ENT_BUTTON;prop[C_PROP_BG_COLOR=#2563eb] C_SPAT_INSIDE ' +
        'sel:C_ENT_CONTAINER;prop[C_PROP_BG_COLOR=#000000]',
      plan: 'MOVE_NODE node_2 C_SPAT_INSIDE node:node_1',
      finalTree: 'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      resolvedReferences: [1],
      attachments: [['@1', 'C_SPAT_INSIDE', '@0']]
    },
    tags: ['morph', 'move', 'definite-object']
  },
  {
    id: 'morph-31',
    input: 'coloque um botão azul dentro da caixa preta',
    seed: [
      { entityConceptId: 'C_ENT_CONTAINER', properties: { C_PROP_BG_COLOR: '#000000' } }
    ],
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#2563eb)] ' +
        'PLACE new:tmp_1 C_SPAT_INSIDE sel:C_ENT_CONTAINER;prop[C_PROP_BG_COLOR=#000000]',
      plan:
        'CREATE_NODE tmp_1 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #2563eb\n' +
        'PLACE_NODE temp:tmp_1 C_SPAT_INSIDE node:node_1',
      finalTree: 'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}\n  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}',
      attachments: [['@1', 'C_SPAT_INSIDE', '@0']]
    },
    tags: ['morph', 'create', 'indefinite-object']
  },
  {
    id: 'morph-32',
    input: 'crie um botão com borda azul de 3px',
    expected: {
      ast:
        'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BORDER_COLOR,COLOR:#2563eb) ' +
        'set(C_PROP_BORDER_WIDTH,SIZE:3px)]',
      plan:
        'CREATE_NODE tmp_1 C_ENT_BUTTON\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BORDER_COLOR #2563eb\n' +
        'SET_PROPERTY temp:tmp_1 C_PROP_BORDER_WIDTH 3px',
      finalTree: 'C_ENT_BUTTON{C_PROP_BORDER_COLOR=#2563eb,C_PROP_BORDER_WIDTH=3px}',
      bindings: [
        ['@0', 'C_PROP_BORDER_COLOR', '#2563eb'],
        ['@0', 'C_PROP_BORDER_WIDTH', '3px']
      ]
    },
    tags: ['morph', 'create', 'border', 'property-group']
  },
  {
    id: 'morph-33',
    input: 'deixe o texto do botão vermelho',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      ast: 'UPDATE sel:C_ENT_BUTTON set(C_PROP_TEXT_COLOR,COLOR:#dc2626)',
      plan: 'SET_PROPERTY node:node_1 C_PROP_TEXT_COLOR #dc2626',
      finalTree: 'C_ENT_BUTTON{C_PROP_TEXT_COLOR=#dc2626}',
      bindings: [['@0', 'C_PROP_TEXT_COLOR', '#dc2626']]
    },
    tags: ['morph', 'update', 'text-group']
  },
  {
    id: 'morph-34',
    input: 'deixe o texto do botão com 18px',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      ast: 'UPDATE sel:C_ENT_BUTTON set(C_PROP_FONT_SIZE,SIZE:18px)',
      plan: 'SET_PROPERTY node:node_1 C_PROP_FONT_SIZE 18px',
      finalTree: 'C_ENT_BUTTON{C_PROP_FONT_SIZE=18px}',
      bindings: [['@0', 'C_PROP_FONT_SIZE', '18px']]
    },
    tags: ['morph', 'update', 'text-group', 'font-size']
  },
  {
    id: 'morph-35',
    input: 'apague o botão da direita',
    seed: [
      { entityConceptId: 'C_ENT_BUTTON' },
      { entityConceptId: 'C_ENT_BUTTON' },
      { entityConceptId: 'C_ENT_BUTTON' }
    ],
    expected: {
      ast: 'DELETE sel:C_ENT_BUTTON;dir=RIGHTMOST',
      plan: 'DELETE_NODE node_3',
      finalTree: 'C_ENT_BUTTON{}\nC_ENT_BUTTON{}',
      resolvedReferences: [2],
      diagnostics: ['ORDER_FALLBACK'],
      severities: { ORDER_FALLBACK: 'INFO' }
    },
    tags: ['morph', 'delete', 'direction']
  },
  {
    id: 'morph-36',
    input: 'deixe a caixa mais escura',
    seed: [
      { entityConceptId: 'C_ENT_CONTAINER', properties: { C_PROP_BG_COLOR: '#000000' } }
    ],
    expected: {
      finalTree: 'C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}',
      diagnostics: ['UNSUPPORTED_OPERATION']
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'comparative']
  },
  {
    id: 'morph-37',
    input: 'adicione um título "Olá"',
    expected: {
      finalTree: '',
      diagnostics: ['UNSUPPORTED_OPERATION']
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'out-of-ontology']
  },
  {
    id: 'morph-38',
    input: 'crie uma caixa que tem',
    expected: {
      finalTree: '',
      diagnostics: ['UNSUPPORTED_OPERATION']
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'incomplete-relative']
  },
  {
    id: 'morph-39',
    input: 'pague o botão',
    seed: [{ entityConceptId: 'C_ENT_BUTTON' }],
    expected: {
      finalTree: 'C_ENT_BUTTON{}',
      diagnostics: ['UNKNOWN_WORD']
    },
    expectError: true,
    expectNoMutation: true,
    tags: ['morph', 'negative', 'unknown-word']
  },
  {
    id: 'morph-40',
    input: 'crie um botão azul-claro',
    expected: {
      ast: 'CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#93c5fd)]',
      plan: 'CREATE_NODE tmp_1 C_ENT_BUTTON\nSET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #93c5fd',
      finalTree: 'C_ENT_BUTTON{C_PROP_BG_COLOR=#93c5fd}',
      bindings: [['@0', 'C_PROP_BG_COLOR', '#93c5fd']]
    },
    tags: ['morph', 'create', 'compound-color']
  }
];

const dataset = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const existing = new Set(dataset.records.map((r) => r.id));
for (const rec of records) {
  if (existing.has(rec.id)) throw new Error(`id já existe: ${rec.id}`);
}
dataset.records.push(...records);
fs.writeFileSync(PATH, JSON.stringify(dataset, null, 2) + '\n');
console.log(`ok: ${records.length} registros morph anexados (${dataset.records.length} no total)`);
