# Integridade dos dados de avaliação

Este documento registra toda alteração feita em registros de avaliação —
novos esperados, esperados removidos e esperados alterados — com a
justificativa semântica, independente da saída do motor.

## Alterações conhecidas antes do controle de versão (não reconstruíveis)

**Declaração honesta: o conteúdo anterior destas alterações é irrecuperável.**

O projeto não estava sob controle de versão até `F0.1` (baseline em
2026-10-03 12:16). O auditor (PARTE I, seção I.4) estabeleceu, por
timestamps de arquivo, que:

- `src/eval/data/final.json` foi regravado às **11:49**, depois de
  alterações em `src/engine/document/traversal.ts` (11:27),
  `tests/defects.test.ts` (11:29) e `src/engine/lexical/ApproximateMatcher.ts`
  (11:40) — ou seja, depois de correções de código, quebrando o protocolo de
  conjunto held-out;
- `src/eval/data/regression.json` foi alterado entre **11:50 e 11:52**, em
  um período em que a suíte não estava verde.

Não existe em lugar nenhum do projeto (nem em `dist/`, `public/`, `.claude/`
ou qualquer outro diretório) cópia anterior de nenhum dos dois arquivos —
busca feita em 2026-10-03 12:3x por `find` por `final*.json`,
`regression*.json` e `dev*.json` fora de `node_modules`. Sem versão anterior
preservada e sem histórico, é **impossível** reconstruir:

- quais registros foram adicionados, removidos ou reescritos;
- quais valores esperados mudaram, de quê para quê;
- se algum esperado foi ajustado para coincidir com a saída do motor.

Escrever aqui qualquer reconstrução seria invenção. O que se pode afirmar com
base apenas no que está em disco hoje:

- `dev.json` (70 registros, mtime 11:28) não foi tocado no período final e
  mantém todas as suas expectativas no formato antigo (sem `ast`/`plan`);
- `regression.json` (102 registros, mtime 11:52) tem 2 registros com
  `expected.ast` e `expected.plan`, 3 com `resolvedReferences` e 4 com
  `bindings`/`attachments` — concentração típica de remendos pontuais;
- `final.json` (50 registros, mtime 11:49) tem cobertura de expectativas
  próxima de zero (0 `ast`, 0 `plan`, 0 `resolvedReferences`) apesar de se
  declarar "held-out escrito por raciocínio ANTES das correções".

## Consequências (a partir de 2026-10-03)

1. `final.json` foi renomeado para `final-v1-compromised.json` e o loader o
   expõe como `FINAL_V1_DATASET`, rotulado **"comprometido"** em todo o
   painel, no `score.ts` e no relatório. Ele deixa de ser held-out e passa a
   ser um conjunto de regressão como qualquer outro.
2. **Não foi criado um novo held-out.** A avaliação final será feita pelo
   auditor com um conjunto externo, fora deste repositório.
3. Qualquer esperado novo ou alterado a partir de agora exige commit
   `DATASET:` ou `TEST-EXPECTATION:` **anterior** ao commit de código que o
   satisfaz, e toda alteração de valor já existente exige uma entrada nesta
   tabela com justificativa semântica.

## Tabela de alterações (a partir do baseline)

| Data | Registro | Campo | Antes | Depois | Motivo |
|---|---|---|---|---|---|
| 2026-10-03 | (registros com falha conhecida do conjunto `morph` — ver F1.5) | — | — | — | Registros novos; ver seção abaixo |

### Registros novos: conjunto morfossintático (F1.5)

Os 40 casos da PARTE V foram adicionados a `regression.json` com a tag
`morph` em commit `DATASET:` anterior a qualquer código das Fases 2/3. Eles
codificam o comportamento-alvo (oráculo) e a maioria FALHA no front-end
legado na data de escrita — as falhas conhecidas são registradas no
relatório da fase, nunca "consertadas" ajustando o esperado.

Estado na data de escrita (2026-10-03, front-end legado):

- **12/40 passam** (`morph-01, 04, 10, 18, 19, 28, 29, 30, 32, 37, 38, 39`);
- **28/40 falham** (`morph-02, 03, 05, 06, 07, 08, 09, 11, 12, 13, 14, 15,
  16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 31, 33, 34, 35, 36, 40`), cobrindo:
  concordância de adjetivo com coordenação (02–06), definido plural com
  filtro (07), ambiguidade singular (08), MWE flexionada (09), pronomes
  enclíticos (11–14), diminutivos (15–17), pedido indireto (20–23), modo/tempo
  (24), exclusão (25), PP topicalizado (26–27), borda como grupo (31, já
  parcial), grupo de texto semântico (33–34), direção (35), comparativo (36),
  cor composta (40).

A lista exata de falhas conhecidas é verificada por
`tests/metrics.test.ts` (`KNOWN_MORPH_FAILURES`): qualquer falha fora dela
quebra a suíte, e qualquer caso dela que passe também (exigindo atualização
consciente da lista — o oráculo só encolhe).

**Atualização F2.2 (2026-10-03):** os diminutivos produtivos entraram pela
geração por paradigma e `morph-15`, `morph-16` e `morph-17` passaram —
removidos da lista (28 → 25 falhas conhecidas). Nenhum esperado foi alterado.

**Atualização F3/F4 (2026-10-03):** PP topicalizado ("dentro da caixa, crie um
botão"; "crie, dentro da caixa preta, dois botões") e MWE por lema ("cores de
fundo" casa o padrão "cor de fundo" com o lexema cor/cores, sem sentido
ontológico, criado só para o casamento). ,  e 
passaram: **as 40 falhas conhecidas zeraram — todo o conjunto morph passa**.

**Atualização F4 (B5, 2026-10-03):** "texto" vira grupo de propriedades
(cor do texto, conteúdo, tamanho da fonte) com C_PROP_FONT_SIZE novo; a
leitura de grupo só vale quando a entidade aceita algum membro e o núcleo
não é entidade. `morph-33` e `morph-34` passaram (5 → 3).

**Atualização F3/F4 (2026-10-03):** verbo no passado/futuro deixa de ser
comando (NOT_A_COMMAND); comparativo virou UNSUPPORTED_OPERATION com o span
do sintagma; cores compostas (azul-claro, azul-escuro, verde-claro,
verde-escuro, cinza-claro) entraram como valores em dados. `morph-24`,
`morph-36` e `morph-40` passaram (10 → 7).

**Atualização F3 (G7 pedido indireto, 2026-10-03):** [eu/você] + pode/
poderia/quero/gostaria/queria + opcional "de" (e "por favor" no fim) são
operadores gramaticais (dados) que envolvem o comando interno, registrando
 na AST.  passaram (14 → 10).

**Atualização F3 (definido plural, ambiguidade e B4, 2026-10-03):** definido
plural sem numeral vale por todos os que casam com os filtros; ambiguidade
fatal não gera passos no plano nem TARGET_NOT_FOUND em cascata; direção
espacial (da direita/esquerda/cima/baixo, mais à direita) vira
`selector.direction` com fallback de ordem do documento + INFO
ORDER_FALLBACK. `morph-07`, `morph-08` e `morph-35` passaram (17 → 14).
tests/layout.test.ts corrigido (TEST-EXPECTATION) — ver tabela.

**Atualização F3 (concordância, 2026-10-03):** adjetivo com coordenação/adjunção
(G1–G6): plural concordante distribui para todos os núcleos coordenados;
singular vale para o núcleo mais próximo que concorda; nenhum núcleo concorda
→ AGREEMENT_MISMATCH sem mutação. `morph-02`, `morph-03`, `morph-05` e
`morph-06` passaram — removidos da lista (21 → 17).

**Atualização F3.3.B (2026-10-03):** o segmentador de contrações/ênclise e a
referência de grupo (`NODE_SET`) fizeram `morph-11`, `morph-12`, `morph-13` e
`morph-14` passarem — removidos da lista (25 → 21). O esperado de `morph-14`
foi alterado com justificativa semântica na tabela acima.

### Alterações de esperados existentes

| Data | Registro | Campo | Antes | Depois | Motivo |
|---|---|---|---|---|---|
| 2026-10-03 | 139 registros de dev/regression (142 leituras) | `readings[].feats` | `Mood=Imp\|VerbForm=Fin`; `Person=3\|Mood=Ind\|…` | `Number=Sing\|Person=3\|Mood=Imp\|VerbForm=Fin`; `Number=Sing\|Person=3\|Mood=Ind\|…` | Justificativa linguística independente do motor: o imperativo de 3ª pessoa ("crie", "apague") e o indicativo de 3ª pessoa ("criou") são SINGULARES e de PESSOA 3 — a anotação anterior, feita sobre a morfologia legada incompleta, omitia pessoa e número. Com a geração por paradigma a análise passou a expressar os traços completos; a expectativa foi completada para descrever a análise CORRETA, não a saída do front-end antigo. |

| 2026-10-03 | `morph-14` | `expected.ast` | `MOVE sel:C_ENT_BUTTON;all C_SPAT_INSIDE sel:C_ENT_CONTAINER` | `MOVE nodes:node_1,node_2 C_SPAT_INSIDE sel:C_ENT_CONTAINER` | Justificativa semântica independente do motor: o pronome plural "os" retoma **os botões mencionados** ("crie dois botões"), não "todos os botões que casam com o seletor" — se um terceiro botão existisse no documento, ele não seria movido. A referência de grupo (`NODE_SET`) é a representação fiel dessa leitura; o seletor `all` a sobre-generalizaria. O efeito sobre a árvore (os dois botões movidos para dentro da caixa) é o mesmo. |
| 2026-10-03 | `tests/layout.test.ts` (teste, não dataset) | caso "sem rect, RIGHTMOST" | esperava o **primeiro** nó do `Map` | espera o **último** nó na ordem do documento | Justificativa semântica: "o botão da direita" ordena pela ordem visual do documento; sem métricas de layout a ordem do documento é a única ordem existente, e o último nó é o mais à direita. O teste anterior lia a ordem de inserção do `Map`, que não é a ordem do documento — defeito apontado pelo auditor (B4). Adicionado caso simétrico para "da esquerda". |
| 2026-10-03 | `fin-050` («crie um botão amarela», conjunto comprometido) | `expectError`, `expected` | sucesso com `C_ENT_BUTTON{C_PROP_BG_COLOR=#eab308}` | `AGREEMENT_MISMATCH`, documento intacto | Justificativa semântica independente do motor: "amarela" é feminino e "botão" é masculino; a PARTE IV 3.F de `PROMPT_DEEPSEEK_COMPLETO.md` define a concordância de gênero e número como restrição RÍGIDA. O esperado anterior aceitava uma frase agramatical. |
| 2026-10-03 | `tests/composition.test.ts` (teste) | gerador "CREATE com cor" | usava sempre a forma masculina da cor ("uma caixa vermelho") | flexiona a cor pelo gênero do núcleo ("uma caixa vermelha") | O gerador combinatório ignorava a concordância e passou a exigir, como positivo, uma frase agramatical — contrária à mesma regra rígida (3.F). O teste continua cobrindo verbo × entidade × cor; só a forma da cor passa a ser a gramatical. |
| 2026-10-03 | `tests/agreement-binding.test.ts` (teste próprio) | caso de discordância | «mude o texto para amarela» | «deixe o botão amarelas» | Depois de "para"/"de" a cor é complemento nominal ("mude para azul", "pinte de verde"), não predicativo: não há concordância a exigir. O caso substituto testa o predicativo sem preposição, onde a concordância vale. |
| 2026-10-03 | `tests/termination.test.ts` (teste) | caso L1 | media a 1ª compilação de um worker frio | aquece o motor com uma análise antes de medir | Robustez de medição, não de expectativa: o orçamento de 50 ms e o resultado exigido (UNSUPPORTED_OPERATION, sem mutação) não mudaram. Sob a suíte paralela, a 1ª compilação (JIT) chegou a 125 ms sem relação com a frase. Um laço infinito continuaria reprovando. |
| 2026-10-03 | `tests/parser.test.ts` (teste) | «crie botões» | CREATE com `quantity = 1` | sem CREATE; `UNSUPPORTED_OPERATION/BARE_PLURAL` | O esperado anterior inventava uma cardinalidade (1) para um plural sem quantidade — exatamente o que a PARTE IV 3.G proíbe ("plural nu → UNSUPPORTED_OPERATION, quantos?"). |
| 2026-10-03 | `tests/composition.test.ts` (teste) | gerador "verbos × entidades", entidade plural | frase sem numeral («crie botões») | usa o numeral da própria tabela («crie dois botões») | Defeito do gerador: a tabela `ENTITIES` já define `article: 'dois'` para o plural e o teste já conta 2 nós quando a frase contém "dois", mas o template omitia o artigo no plural. |

Nenhuma outra alteração de esperado existente. As alterações acima foram
feitas nos registros `dev-*`, `reg-*` e `morph-*` listados no commit
`DATASET:` correspondente.
