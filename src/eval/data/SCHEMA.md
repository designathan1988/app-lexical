# Esquema dos conjuntos de avaliação

Este documento permite escrever casos novos sem ler o código. Toda assinatura
descrita aqui é produzida por `src/eval/signatures.ts` e verificada contra a
execução real pelo `runner.ts`.

## 1. Envelope do arquivo

```json
{
  "version": "1.0.0",
  "schemaVersion": "1.0.0",
  "description": "texto livre",
  "records": [ ... ]
}
```

`schemaVersion` precisa ser exatamente `1.0.0` (constante
`DATASET_SCHEMA_VERSION`). IDs de registro não podem repetir.

## 2. Registro

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Identificador único (prefixos: `dev-`, `reg-`, `fin-`, `morph-`). |
| `input` | string | O comando avaliado. |
| `seed` | `SeedNodeJson[]` | Documento inicial, em pré-ordem. Nós recebem ids `node_1..node_N` na ordem em que são criados (mesma ordem do seed). |
| `selection` | número \| `"all"` | Índice em pré-ordem do seed a selecionar antes do comando. |
| `discourse` | string[] | Comandos executados antes, apenas para montar o discurso. |
| `undoBeforeInput` | bool | Desfaz o último comando do discurso antes de executar `input`. |
| `expected` | objeto | Ver seção 3. |
| `expectError` | bool | O comando deve produzir algum diagnóstico `ERROR`. |
| `expectNoMutation` | bool | O documento deve ficar idêntico ao estado anterior. |
| `tags` | string[] | Rótulos livres (`D1`…`D11`, `morph`, `§36`…). |

### `SeedNodeJson`

```json
{ "entityConceptId": "C_ENT_BUTTON", "text": "Entrar",
  "properties": { "C_PROP_BG_COLOR": "#dc2626" },
  "children": [ ... ] }
```

Valores de propriedade em JSON: cor = hexadecimal minúsculo (`"#dc2626"`),
tamanho = string com unidade (`"2px"`, `"50%"`), largura de borda idem,
contagem = número, texto = string.

## 3. Expectativas (`expected`)

Todas são opcionais. **Métrica sem expectativa em nenhum registro do conjunto é
`n/a`, nunca 100%.** A métrica é medida só sobre os registros que declaram o
campo.

| Campo | Base da métrica | Unidade |
|---|---|---|
| `tokens` | lexical + sentido | por token anotado |
| `readings` | morfológica | por token anotado |
| `attachments` | attachment | por tripla |
| `bindings` | binding | por tripla |
| `resolvedReferences` | referências | por registro |
| `ast` | AST exata | por registro |
| `plan` | plano exato | por registro |
| `finalTree` | árvore final | por registro (falha do caso) |
| `diagnostics` | códigos presentes | por registro (falha do caso) |
| `finishTree` etc. | — | — |
| `ambiguous` | detecção de ambiguidade | por registro |
| `severities` | severidade mínima por código | por registro |

### 3.1 Referência a nó (`NodeRef`)

- `"@N"` — índice N em pré-ordem do documento **final** (para `bindings`/`attachments`);
- `"#C_ENT_BUTTON"` — o único nó do documento com esse conceito;
- `"only"` — o único nó do documento;
- `"BUTTON"`, `"CONTAINER"` — atalho: o único nó de `C_ENT_<MAIÚSCULAS>`.

### 3.2 `tokens` — anotação lexical e de sentido

```json
{ "surface": "botão", "lexemeId": "L_BUTTON", "conceptId": "C_ENT_BUTTON" }
```

- `surface` casa com o token real pela forma escrita, ignorando caixa e acento,
  na ordem de ocorrência (duas ocorrências iguais casam com dois tokens, em ordem).
- `lexemeId: null` significa **não deve resolver para nenhum lexema**.
- `conceptId` (opcional): `null` = sem sentido ontológico (palavra gramatical ou
  desconhecida); string = o sentido escolhido deve ser exatamente aquele.

### 3.3 `readings` — leitura morfológica

```json
{ "surface": "botões", "lemma": "botão", "feats": "Gender=Masc|Number=Plur" }
```

`feats` é a assinatura canônica dos traços, no formato do Universal
Dependencies, **sempre nesta ordem**, separados por `|`:

1. `Gender` — `Masc`, `Fem`, `Neut`, `Inv`
2. `Number` — `Sing`, `Plur`, `Inv`
3. `Person` — `1`, `2`, `3`
4. `Mood` — `Ind`, `Sub`, `Imp` (só verbos finitos; sempre acompanhado de `VerbForm=Fin`)
5. `VerbForm` — `Fin`, `Inf`, `Ger`, `Part`
6. `Tense` — `Pres`, `Past`, `Fut`
7. `Degree` — `Dim` (diminutivo)

String vazia (`""`) quando a forma não tem traços (ex.: preposições).
Exemplos:

- `botões` → `Gender=Masc|Number=Plur`
- `crie` → `Mood=Imp|VerbForm=Fin` (imperativo; sem pessoa no léxico legado)
- `criar` → `VerbForm=Inf`

O que estiver ausente do léxico fica ausente da assinatura — um `feats` só
tem o que a análise realmente produz.

### 3.4 `bindings` — triplas (entidade, propriedade, valor)

```json
["only", "C_PROP_BG_COLOR", "#dc2626"]
```

Comparação exata do **conjunto ordenado de todas as propriedades do documento**
— um binding esperado a mais ou a menos reprova o caso.

### 3.5 `attachments` — triplas (fonte, relação, alvo)

```json
["@1", "C_SPAT_INSIDE", "@0"]
```

Comparado com todas as relações de parentesco do documento
(`CHILD_OF` é normalizado como `C_SPAT_INSIDE`).

### 3.6 `resolvedReferences`

Lista de índices em **pré-ordem do documento antes do comando**, na ordem em
que os passos `DELETE_NODE`/`MOVE_NODE` do plano resolvem o alvo.

## 4. Assinatura canônica da AST (`expected.ast`)

Uma linha por comando, comandos separados por `\n`.

- `NO_OP`
- `CREATE [<entidade> | <entidade> …] [<placement> | …]`
  - entidade: `CREATE <tmp> <C_ENT_X>[ x<N>][ "<texto>"][ <mutação> …]`
    - `<tmp>` é `tmp_1`, `tmp_2`, … na ordem de criação;
    - `x<N>` só aparece quando a quantidade > 1;
    - mutação: `set(<propriedade>,<CATEGORIA>:<literal>)` ou
      `clear(<propriedade>)`; categoria ∈ `COLOR, SIZE, NUMBER, TEXT, BOOLEAN,
      ALIGNMENT, WEIGHT, DISPLAY, ENUM, ORDINAL, CARDINAL`.
  - placement: `PLACE <ref> <relação> <ref>`
- `UPDATE <ref> <mutação> …`
- `DELETE <ref>`
- `MOVE <ref> <relação> <ref>`
- `QUERY <ref>`

`<ref>`: `new:tmp_1` (entidade criada no próprio comando), `node:node_3`,
`selection` (seleção atual), ou `sel:<seletor>`.

Seletor: campos na ordem fixa separados por `;`,
`<C_ENT_X>[;ord=N][;all][;count=N][;text="…"][;prop[<P>=<valor>]][;dir=<DIREÇÃO>][;parent[<seletor>]][;distinct[<seletor>]][;elided=<C_ENT_X>][;minus[<seletor>,…]]`.
Sem campo nenhum: `any`. Campos de acordo com o que o seletor realmente tem:

- `ord=N` — ordinal 0-based (negativo conta do fim);
- `all` — definido plural sem numeral ("os botões"): todos os que casam;
- `count=N` — numeral;
- `prop[C_PROP_BG_COLOR=#2563eb]` — filtro de propriedade ("os botões azuis");
- `dir=RIGHTMOST|LEFTMOST|TOPMOST|BOTTOMMOST` — "da direita", "mais à esquerda";
- `parent[...]` — posse/contidação ("o botão dentro da caixa");
- `distinct[...]` — "outro";
- `elided=C_ENT_X` — elipse (tipo herdado do discurso);
- `minus[...]` — exclusão ("menos o primeiro").

Quantidade > 1: a entidade criada aparece como `CREATE <tmp> <C_ENT_X> x<N>` uma
única vez; o plano expande em `CREATE_NODE <tmp>_1 … <tmp>_N` e cada passo
referencia a instância (`temp:tmp_1_2`).

Exemplo:

```
CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#000000) | CREATE tmp_2 C_ENT_BUTTON] PLACE new:tmp_2 C_SPAT_INSIDE new:tmp_1
```

## 5. Assinatura canônica do plano (`expected.plan`)

Uma linha por passo, separadas por `\n`:

- `CREATE_NODE <tmp> <C_ENT_X>[ "<texto>"]`
- `SET_PROPERTY <ref> <propriedade> <valor>`
- `CLEAR_PROPERTY <ref> <propriedade>`
- `PLACE_NODE <ref> <relação> <ref>`
- `DELETE_NODE <nodeId>`
- `MOVE_NODE <nodeId> <relação> <ref>`
- `QUERY_NODE <nodeId>`

`<ref>`: `temp:<tmpId>` ou `node:<id>`. Diferente da AST, os passos referenciam
nós **reais**: nós do seed têm ids determinísticos `node_1..node_N` (mesma ordem
do seed); nós criados pelo comando são referenciados por `temp:tmp_*`.

Exemplo:

```
CREATE_NODE tmp_1 C_ENT_BUTTON
SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #2563eb
```

## 6. Árvore final (`expected.finalTree`)

Uma linha por nó, pré-ordem, indentação de dois espaços por nível:

```
C_ENT_CONTAINER{C_PROP_BG_COLOR=#000000}
  C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}
```

Formato do nó: `<conceito>[ "<texto>"][{prop=valor,prop=valor}]` — as
propriedades em ordem alfabética, separadas por vírgula, sem espaço.
Nó sem texto e sem propriedades: `C_ENT_BUTTON{}`.

## 7. Diagnósticos

- `diagnostics`: lista de códigos que **precisam aparecer** nos diagnósticos do
  comando (subconjunto; códigos extras não reprovam, exceto via `expectError`).
- `severities`: por código, a severidade mínima que o primeiro diagnóstico
  daquele código deve ter (`INFO` < `WARNING` < `ERROR`).
- `expectError: true` exige **algum** diagnóstico `ERROR`.
- Invariantes válidas para todo diagnóstico de todo caso: `0 ≤ start ≤ end ≤
  input.length`; nenhum par de diagnósticos com o mesmo `(code, start, end)`;
  `layer` ∈ lista de camadas válidas (`lexer`, `segmenter`, `morphology`,
  `disambiguation`, `mwe`, `syntax`, `semantics`, `binder`, `resolver`,
  `validator`, `planner`, `executor`).

## 8. Política de expectativas

1. Esperado novo vai em commit `DATASET:` ou `TEST-EXPECTATION:` **anterior**
   ao código que o satisfaz.
2. Esperado alterado exige entrada no `CHANGES.md` com justificativa semântica
   independente da saída do motor.
3. Nunca copiar a saída do motor para "fazer passar": o esperado descreve o
   comportamento correto por raciocínio sobre o domínio.
