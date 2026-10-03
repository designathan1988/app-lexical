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

### Alterações de esperados existentes

| Data | Registro | Campo | Antes | Depois | Motivo |
|---|---|---|---|---|---|
| 2026-10-03 | 139 registros de dev/regression (142 leituras) | `readings[].feats` | `Mood=Imp\|VerbForm=Fin`; `Person=3\|Mood=Ind\|…` | `Number=Sing\|Person=3\|Mood=Imp\|VerbForm=Fin`; `Number=Sing\|Person=3\|Mood=Ind\|…` | Justificativa linguística independente do motor: o imperativo de 3ª pessoa ("crie", "apague") e o indicativo de 3ª pessoa ("criou") são SINGULARES e de PESSOA 3 — a anotação anterior, feita sobre a morfologia legada incompleta, omitia pessoa e número. Com a geração por paradigma a análise passou a expressar os traços completos; a expectativa foi completada para descrever a análise CORRETA, não a saída do front-end antigo. |

Nenhuma outra alteração de esperado existente. As alterações acima foram
feitas nos registros `dev-*`, `reg-*` e `morph-*` listados no commit
`DATASET:` correspondente.
