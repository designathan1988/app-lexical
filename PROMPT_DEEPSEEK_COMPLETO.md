# PROMPT COMPLETO — Estabilização, métricas honestas e novo front-end morfossintático

> Este é o único prompt a executar agora.
> - `PROMPT_CORRECAO_2.md` e `PROMPT_CORRECAO_3.md` são **rascunhos substituídos**: ignore-os.
> - `PROMPT_CORRECAO.md` (já executado em grande parte) continua valendo como especificação de referência dos itens D1–D11 e A1–A11. Em caso de conflito, vale **este** arquivo.

Projeto: `C:\Codex-Shared\Lexical` (Windows). Stack: TypeScript, React 18, Vite 5, Vitest 2.

Antes de alterar qualquer arquivo, leia **este documento inteiro** e depois:
- `LEXICAL.txt`: contrato arquitetural;
- `PROMPT.txt`: requisitos originais §1–§39 e painel administrativo;
- `PROMPT_CORRECAO.md`.

Trabalhe direto no código. Não pare em plano nem peça confirmação entre etapas. Execute as fases **na ordem**: cada fase só começa com a anterior verde.

---

## PARTE I — ESTADO AUDITADO (2026-10-03, 12:16)

O auditor executou o motor real, a suíte, o typecheck, o build e a aplicação no navegador. Fatos:

| Item | Estado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run build` | limpo |
| `npm test` | **quebra**: o worker de `tests/final-phase.test.ts` morre com *JavaScript heap out of memory*. Resultado: 18 arquivos, 271 testes, 259 executados e aprovados, 12 não executados, 1 erro |
| Causa | **loop infinito no parser**: `crie uma caixa que tem` nunca termina (testado isoladamente, timeout de 25 s, sem resposta). No navegador isso **trava a aba**. Introduzido na última edição de `src/engine/parser/DomainParser.ts` (11:58) |
| Git | o projeto **não está sob git** |
| Base de conhecimento | 228 SurfaceForms escritas à mão (`SF_CRIAR`, `SF_CRIE`, `SF_CRIA`, `SF_CRIEM`, `SF_CRIOU`, `SF_APAGUE`…), 88 lexemas, 75 conceitos, 26 MWEs, 4 entidades |
| Parser | `DomainParser.ts` com **1811 linhas**: cresceu de 859 para 1811 com ramificações por construção. É uma abordagem que não escala |
| Gramática fixa | `src/engine/parser/Grammar.ts` ainda tem listas de palavras escritas à mão e é importado por `src/eval/runner.ts` (`FUNCTION_WORDS`) |

### I.1 Funciona hoje e NÃO pode regredir

Cada item tem que continuar valendo, com teste automatizado:

- **D1** — `crie uma caixa banana` → `crie um botão` → `apague ela` resulta em `UNRESOLVED_PRONOUN`, e o botão permanece. Pronome cujo antecedente foi desfeito por undo também resulta em `UNRESOLVED_PRONOUN`.
- **D2** — ordinais seguem a ordem do documento (pré-ordem), também depois de MOVE.
- **D3** — `mude a cor de fundo do botão para 2px` dá `INVALID_VALUE_CATEGORY`; `crie um botão 2px` dá `INVALID_PROPERTY`. Nenhuma exceção chega à UI; o chat mostra "Bloqueado".
- **D4** — `crie um botão rosa` é bloqueado. `vermelo` vira C_VAL_RED com WARNING. Verbo destrutivo aproximado é bloqueado. `apaga` é reconhecido por correspondência exata.
- **D5** — `apague todos` sem contexto resulta em `INCOMPLETE_REFERENCE`.
- **D6** — `analyze` produz o mesmo plano que `execute` e não altera o discurso.
- **D7** — `apague os dois últimos botões` e `apague os três primeiros botões` funcionam.
- **D8** — em documento vazio, `crie uma caixa dentro de outra caixa` cria duas caixas aninhadas. Com 3 caixas e discurso vazio, resulta em `AMBIGUOUS_REFERENCE`.
- **D9** — ciclo, ou nó relativo a si mesmo, resulta em `INVALID_CONTAINMENT`, sem mutação.
- **D10** — com 2 botões e discurso vazio, `apague o botão` resulta em `AMBIGUOUS_REFERENCE`. `crie um botão` → `crie outro botão` → `deixe ele azul` pinta o segundo.
- **D11** — `crie uma caixa` → `deixe a borda azul` funciona.
- **A1** — teste de arquitetura sem literais de palavra no parser; `salvo` adicionado só por dados funciona.
- **A2** — `crie um botão e não apague a caixa` funciona.
- **A3/A4** — funcionam: `crie um botão com fundo azul e borda vermelha`, `crie uma caixa azul e redonda`, `crie um botão com texto "Ok"`, `crie um botão escrito "Ok"`, `remova o botão`, `mude o texto do botão para "Sair"`, `crie uma caixa com texto "Olá"` (caixa com TEXT filho), `pinte o botão de azul`.
- **Fase final do PROMPT_CORRECAO**:
  - `apague o botão que está dentro da caixa` e `crie uma caixa que tenha borda azul` funcionam;
  - `mude a mesma caixa para azul` e `mude aquela caixa para verde` funcionam;
  - `apague alguns botões` e `crie vários botões` resultam em `UNSUPPORTED_OPERATION`.
- **§36** — as 8 variações funcionam.
- **§38** — a sequência dá o resultado correto.
- Undo/redo da frase como unidade. Plano determinístico.
- A base de conhecimento persiste em localStorage (`lexical.knowledgeBase.v1`).

### I.2 Defeitos confirmados (reproduzidos pelo auditor contra o código atual)

| ID | Entrada | Obtido | Correto |
|---|---|---|---|
| **L1** | `crie uma caixa que tem` | **loop infinito / falta de memória** | `UNSUPPORTED_OPERATION` em < 50 ms |
| **G1** | `crie uma caixa com um botão preta` | **pinta o botão de preto**, sem aviso | "preta" (fem. sing.) só concorda com "caixa": caixa preta com botão dentro |
| **G2** | `crie uma caixa e um botão vermelhos` | só o botão fica vermelho | masc. plural após coordenação: **os dois** vermelhos |
| **G3** | `apague os botões azuis` (2 azuis) | `AMBIGUOUS_REFERENCE` | definido plural = **todos** os azuis |
| **G4** | `mude as cores de fundo dos botões para azul` | `UNKNOWN_WORD` | MWE flexionada; pinta todos os botões |
| **G5** | `coloca-o depois da caixa`, `deixe-a azul`, `apague-a` | `UNKNOWN_WORD` | pronome enclítico resolvido |
| **G6** | `crie um botãozinho` | `UNKNOWN_WORD` | diminutivo de botão |
| **G7** | `você pode criar um botão?`, `quero um botão azul` | `UNKNOWN_WORD` | pedido indireto → CREATE |
| **B1** | `pague o botão`, `apgue o botão`, `mva o botão para depois da caixa` | AST `NO_OP` com `reason: NEGATED_ACTION` + `INFO:NEGATED_ACTION` | não há negação: um único `UNKNOWN_WORD`, com sugestões |
| **B2** | `mude a cor de fundo do botão para 2px` | `INVALID_VALUE_CATEGORY` pela camada `binder` **e** de novo pela `parser`, mesmo span e mesma mensagem | um diagnóstico |
| B2 | `crie um botão 2px` | `INVALID_PROPERTY` `binder` + `parser` | um |
| B2 | `apague o quinto botão` (1 botão) | `TARGET_NOT_FOUND` específico + genérico | um |
| B2 | `pague o botão` | `UNKNOWN_WORD` duas vezes | um |
| B2 | `apague alguns botões` | `UNSUPPORTED_OPERATION` + `AMBIGUOUS_REFERENCE` em cascata | só o primeiro, ou o derivado marcado `causedBy` |
| **B3** | `apague o quinto botão` | span do erro `[7,8]` (só "o"); seletor de `o botão` com span `[6,7]`; comando com span só no verbo | span do sintagma inteiro / do comando inteiro |
| **B4** | `deixe o botão da direita azul` | token `da direita → C_SPAT_RIGHT` reconhecido e **descartado em silêncio**: AST sem `direction` | `direction: RIGHTMOST` no seletor |
| B4 | `apague o botão mais à direita` | `UNCONSUMED_INPUT`, embora a MWE `mais à direita` exista | reconhecido |
| B4 | `tests/layout.test.ts` | espera o **primeiro** nó para RIGHTMOST sem `rect` e usa a ordem do `Map` | fallback: RIGHTMOST/BOTTOMMOST = último, LEFTMOST/TOPMOST = primeiro, na ordem do documento |
| **B5** | `deixe o texto do botão vermelho`, `deixe o texto do botão com 18px` | `INVALID_VALUE_CATEGORY` ×2 | "texto" como grupo de propriedades: cor do texto / tamanho da fonte |
| **B6** | trace de `botão` | `C_ENT_BUTTON[EXACT:1.00] C_ENT_BUTTON[EXACT:0.96]` | candidatos mesclados |
| **B8** | `crie um botão azul e não vermelho`; `mova a caixa para depois dela mesma` | `UNCONSUMED_INPUT` | semântica definida ou `UNSUPPORTED_OPERATION`; `dela mesma` como reflexivo |
| **M1** | painel Métricas | **100% em todas as 10 métricas, nos 3 conjuntos** | ver M1 abaixo |

Mais casos que não são entendidos hoje: `deixe a caixa mais escura` (comparativo), `deixe o botão azul-claro` (cor composta), `adicione um título "Olá"` (entidade inexistente). Todos dão `UNKNOWN_WORD`, quando deveriam dar um diagnóstico preciso.

### I.3 Por que as métricas mentem (M1)

Os registros dos datasets têm estes campos de expectativa:

| Conjunto | Registros | `expected.ast` | `expected.plan` | `resolvedReferences` | `bindings` | `attachments` |
|---|---|---|---|---|---|---|
| dev | 70 | 0 | 0 | 0 | 0 | 0 |
| regression | 102 | 2 | 2 | 3 | 4 | 4 |
| final | 50 | 0 | 0 | 0 | 4 | 2 |

Em `src/eval/runner.ts`:
- `astOk = rec.expected.ast === undefined ? true : …`, e o mesmo vale para plano e árvore;
- `ratio(num, 0)` retorna `1`.

Resultado: "AST exact match 100%" sem nenhum AST esperado, e "Ambiguity detection 100%" em conjuntos com zero casos ambíguos.

Além disso, o painel lista uma camada `analyze` (TARGET_NOT_FOUND×35) que não existe no pipeline.

### I.4 Violação de processo

- `src/eval/data/final.json` (o conjunto held-out) foi **regravado às 11:49**, depois de várias correções: `traversal.ts` às 11:27, `defects.test.ts` às 11:29, `ApproximateMatcher.ts` às 11:40.
- `regression.json` foi alterado às 11:50–11:52, com testes falhando.
- Sem git, é impossível auditar o que mudou.

---

## PARTE II — REGRAS INVIOLÁVEIS

1. **Sem lógica por frase.** Proibido `if (input.includes(...))`, regex de frase de teste, ramo especial para uma frase. Regex só para classes lexicais (números, unidades, hex) no lexer.
2. **Sem literais de palavra portuguesa fora de `src/knowledge/`** (dados): nada de listas, `Set`, `switch`/`case`, `===`, `.has('…')` ou `includes('…')` com palavras. O teste de arquitetura deve cobrir **todo** `src/engine/` e `src/eval/`.
3. **Determinismo:** mesma entrada + mesmo estado → mesmo AST, mesmo plano, mesmos diagnósticos. Sem `Math.random`, `eval` ou `new Function` no motor. **Sem LLM em tempo de execução.** O executor não gera código; continua sendo plano tipado → `BuilderRuntimeAdapter` → `BuilderStore`, com undo/redo.
4. **Terminação garantida:** todo laço do front-end consome pelo menos um token por iteração ou termina, e todo algoritmo tem orçamento (seção IV.F). Nenhuma frase pode travar o motor.
5. **Nenhuma exceção escapa do motor.** Todo problema vira `Diagnostic` com `severity`, `code`, `message`, `start`/`end` (span real), `layer` e `candidates` quando houver.
6. **Teste antes do código.** O teste ou o registro de dataset é escrito e commitado **antes** do código que o faz passar (Parte III, F0.3).
7. **Nunca enfraqueça testes:** não remova asserção, não afrouxe regex, não troque `toBe` por `toContain`, não amplie lista de permissões e não altere um esperado para coincidir com a saída do motor.
8. **Não leia, crie nem altere nada em `audit/`.** É reservado ao auditor.
9. Se tiver acesso à web, consulte as referências da Parte VI antes de implementar cada técnica e cite-as no relatório. Se não tiver, diga isso no relatório.

---

## PARTE III — FASE 0: ESTABILIZAR E TORNAR AUDITÁVEL

### F0.1 Git (primeira ação)

```
git init
git add -A
git commit -m "baseline: estado auditado 2026-10-03 12:16"
```

- Confirme que `.gitignore` contém `node_modules/` e `dist/`.
- Faça **um commit por item**, com mensagem começando pelo ID (`L1: …`, `M1: …`, `F2.3: …`).
- Nunca use `--amend` em commits já feitos, `rebase`, `reset --hard` nem `push --force`.

### F0.2 L1 — loop infinito (crítico)

1. Escreva `tests/termination.test.ts`, com timeout de 1 s por caso:
   - `crie uma caixa que tem` termina em < 50 ms com `UNSUPPORTED_OPERATION` (span da oração relativa) e sem mutação;
   - **fuzz determinístico**: um gerador pseudoaleatório com **semente fixa** (implementado no teste, não `Math.random`) produz 5.000 sequências de 1 a 15 palavras, sorteadas entre todas as formas da base, as palavras de função, 50 palavras fora do domínio e literais (`"x"`, `#fff`, `2px`, `3`). Cada uma deve terminar em < 50 ms, sem exceção, com resultado bem formado. Registre a semente e o caso mais lento.
2. Corrija a causa no `DomainParser` atual. Ele será substituído na Fase 3, mas até lá a suíte precisa ficar verde.
3. `npm test` completo precisa rodar **sem nenhum worker morto**, com o heap padrão do Node.

### F0.3 Integridade dos dados de avaliação

1. Crie `src/eval/data/CHANGES.md` com uma declaração honesta do que foi alterado em `final.json` e `regression.json` depois de criados: registros, esperado antigo × novo e motivo. Se não souber reconstruir, escreva isso. Não invente.
2. Renomeie `final.json` para `final-v1-compromised.json`. Daqui em diante ele é um conjunto de regressão, sempre rotulado "comprometido". **Não crie um novo held-out**: a avaliação final será feita pelo auditor com um conjunto externo.
3. `scripts/score.ts` aceita `--dataset <caminho.json>` e `--out <saida.json>`, valida o arquivo pelo `datasetSchema.ts` e imprime e grava todas as métricas da F1.
4. `src/eval/data/SCHEMA.md` documenta todos os campos: formato canônico das assinaturas de AST e de plano (IDs normalizados), `resolvedReferences` (índices de pré-ordem do seed), `lexemes`/`concepts`/`readings` por token e `diagnostics`. Precisa ser suficiente para alguém escrever casos sem ler o código.
5. **Política de expectativas:**
   - todo esperado novo vai num commit `DATASET:` ou `TEST-EXPECTATION:` **anterior** ao commit de código;
   - todo esperado **alterado** exige entrada em `CHANGES.md`, com justificativa semântica independente da saída do motor.

---

## PARTE IV — FASES DE IMPLEMENTAÇÃO

### FASE 1 — Métricas honestas e dataset-oráculo

**F1.1 (M1) Cálculo correto:**
- Cada métrica é calculada **só sobre os registros que têm aquela expectativa**.
- Com denominador 0, a métrica é `n/a`, nunca 100%.
- Painel e `score.ts` mostram, ao lado de cada métrica, a **cobertura** (`n com expectativa / total`).
- Métricas:
  - lexical accuracy — `expected.lexemes` por token de conteúdo;
  - sense accuracy — `expected.concepts`;
  - **morphological accuracy** (nova) — `expected.readings`: lema + traços por token após a desambiguação;
  - attachment accuracy;
  - binding accuracy;
  - reference accuracy;
  - AST exact match;
  - plan exact match;
  - end-to-end;
  - false-positive rate;
  - ambiguity detection rate.

**F1.2 (M3)** As camadas válidas são só as do pipeline (lista em IV.F). Cada caso conta uma vez. A camada `analyze` some.

**F1.3 Invariantes globais**, como testes por propriedade sobre todos os registros de todos os conjuntos, mais o fuzz da F0.2:
- **consumo**: todo token com leitura ou literal é consumido por algum nó do AST **ou** reportado em diagnóstico (cada nó do AST registra os índices dos tokens que consumiu);
- **sem duplicatas**: nenhum par de diagnósticos com o mesmo `(code, start, end)`;
- **spans válidos**: `0 ≤ start ≤ end ≤ input.length` em todo diagnóstico de toda camada;
- **analyze ≡ execute** (plano).

**F1.4 Cobertura mínima.** Escreva as expectativas **à mão**, por raciocínio, e commite-as antes de rodar:

| | dev | regression |
|---|---|---|
| `ast` + `plan` | ≥ 70% dos positivos | ≥ 70% dos positivos |
| `resolvedReferences` | 100% dos casos com referência | 100% |
| `bindings` | 100% dos casos com propriedade | 100% |
| `attachments` | 100% dos casos com relação | 100% |
| `readings` | ≥ 40 registros | ≥ 40 registros |
| genuinamente ambíguos | ≥ 10 | ≥ 10 |
| negativos | ≥ 25 | ≥ 25 |

Os 14 casos obrigatórios, as 8 variações do §36 e a sequência do §38 têm **todas** as expectativas.

**F1.5 Conjunto morfossintático.** Adicione a `regression.json`, com tag `morph`, os casos da Parte V. A maioria vai **falhar** agora: registre-os como "falhas conhecidas" no relatório da fase. Eles são o oráculo das Fases 2 e 3.

### FASE 2 — Léxico por paradigma (fim das SurfaceForms escritas à mão)

O `Lexeme` já é o identificador que agrupa as flexões. O que muda é o **cadastro**: em vez de 228 SurfaceForms manuais, cadastra-se **lema + paradigma**, e as formas são **geradas** na construção do índice. É o modelo de Hunspell (raiz + regras de afixo), Apertium (`pardef`), LMF (LexicalEntry → Lemma + WordForms), UniMorph (lema, traços, forma) e dos "smart paradigms" do Grammatical Framework.

**F2.1 Modelo de dados** (`src/engine/types.ts` + `src/knowledge/`):

```ts
interface Lexeme {
  id: LexemeId; lemma: string; pos: PartOfSpeech; senseConceptIds: ConceptId[];
  paradigmId?: ParadigmId;            // classe flexional
  inherent?: Features;                 // ex.: substantivo: { Gender: 'Fem' }
  irregular?: Record<FeatureKey, string | string[]>;   // sobrescreve células do paradigma
  disabledForms?: FeatureKey[];        // células desativadas pelo curador
  derivedFrom?: LexemeId;              // derivação (ex.: criação ← criar)
  allowsDiminutive?: boolean;
}
interface Paradigm {
  id: ParadigmId; pos: PartOfSpeech;
  stem: { strip: string };             // ex.: 'ar' em criar → stem 'cri'
  cells: Record<FeatureKey, string[]>; // sufixos por feixe de traços
}
// Regras ortográficas (dados): c→qu, g→gu, ç→c antes de e/i;
// ão→ões/ães/ãos conforme a classe; l→is (azul→azuis); acentuação gráfica
```

- Traços usam os nomes do **Universal Dependencies** (`Gender`, `Number`, `Person`, `Mood`, `Tense`, `VerbForm`, `Degree`). O `FeatureKey` é a forma canônica ordenada, por exemplo `Mood=Imp|Number=Sing|Person=3|VerbForm=Fin`.
- **SurfaceForm gerada:** `id = ${lexemeId}#${FeatureKey}`, `formType: 'INFLECTION'` (ou `CANONICAL` para o lema), `morphology` completa e `generated: true`.
- **SurfaceForms manuais** ficam só para `MISSPELLING`, `COLLOQUIAL`, `ABBREVIATION` e exceções não cobertas pelo paradigma.
- Paradigmas mínimos:
  - verbos `-ar`, `-er`, `-ir`, com o paradigma **completo** (todas as pessoas de presente, pretérito perfeito e imperfeito, futuro, condicional, subjuntivo presente, imperativo, infinitivo, gerúndio, particípio com gênero e número);
  - verbos irregulares necessários: `fazer`, `pôr`, `ter`, `estar`, `ser`, `poder`, `querer`, `trazer`, `ir`;
  - substantivos: `+s`, `-ão→-ões`, `-ão→-ães`, `-ão→-ãos`, `-l→-is`, `-r/-z→-es`, invariáveis;
  - adjetivos: `-o/-a/-os/-as`, uniformes em gênero (`azul/azuis`, `verde/verdes`), invariáveis (`cinza`; cores-substantivo como `rosa` e `laranja` aceitam `botões rosa` **e** `botões rosas`).
- **Derivação produtiva** (dados): diminutivo `-inho/-inha/-zinho/-zinha` e plurais (`botõezinhos`, `caixinhas`), produzindo leitura com `Degree=Dim` e o **mesmo** lexema base. Vale só para lexemas com `allowsDiminutive`.
- **Nominalizações são lexemas próprios** (`criação`, `remoção`, `exclusão`, `mudança`), com `pos: NOUN` e `derivedFrom`. **Nunca** flexões do verbo (PROMPT.txt §1).

**F2.2 Migração.**
- Converta a base atual: cada entrada `INFLECTION`/`CANONICAL` manual vira geração.
- Teste de não-regressão: **toda** forma que existia antes ainda resolve para o mesmo lexema, com morfologia compatível.
- Liste no relatório as formas que deixaram de existir e o motivo.

**F2.3 Golden tables.**
- Antes do gerador (commit `TEST-EXPECTATION:`), escreva à mão tabelas de conjugação/flexão completas de: `criar`, `apagar` (g→gu), `colocar` (c→qu), `mover`, `mudar`, `deixar`, `fazer`, `pôr`, `botão`, `caixa`, `azul`, `preto`, `vermelho`.
- O gerador precisa reproduzi-las exatamente.
- Se houver acesso à web, confira as tabelas contra UniMorph (por) ou MorphoBr e registre a fonte.

**F2.4 Homógrafos.** A construção do índice lista as formas compartilhadas por lexemas diferentes ou por células diferentes (`cria`: verbo/substantivo; `crie`: imperativo/subjuntivo; `move`: indicativo/imperativo). A lista aparece no relatório e no painel. A desambiguação é da Fase 3, nunca do índice.

**F2.5 Painel.**
- Lexemas: seletor de paradigma, prévia das formas geradas, desativar ou sobrescrever célula, campo `derivedFrom`.
- SurfaceForms: geradas (somente leitura, selo "gerada") separadas das manuais.
- Nova aba **Paradigmas**: editar células e regras ortográficas, com validação.
- Tudo persistido e validável na hora pelo chat.

### FASE 3 — Novo front-end morfossintático (substitui o `DomainParser`)

O contrato de saída **não muda**: o front-end produz a mesma `SemanticDocumentAst`. Binding, referências, discurso, constraints, planner e runtime continuam como estão.

Pipeline novo, cada etapa um módulo com testes próprios (sugestão: `src/engine/morphology/` e `src/engine/syntax/`):

```
A. Tokenização não destrutiva + literais (já existe — manter)
B. Segmentação de contrações e clíticos
C. Análise morfológica → todas as leituras de cada token
D. Desambiguação por restrições (estilo Constraint Grammar)
E. MWEs sobre lemas
F. Parser de gramática de traços (chart) + ranking de análises
G. Composição semântica → SemanticDocumentAst
```

**3.B Contrações e clíticos** (tabelas em dados):
- **Contrações:** `do/da/dos/das`, `no/na/nos/nas`, `dele/dela/deles/delas`, `nele/nela`, `num/numa`, `pelo/pela`, `ao/aos/à/às`, `deste/neste/desse/nesse/daquele/naquele` e variantes.
- **Ênclise com hífen:** `-o -a -os -as -lo -la -los -las -no -na -lhe -me -se`. Restaure o verbo quando necessário: `deixá-la` → `deixar` + `a`; `coloca-o` → `coloca` + `o`; `apague-a` → `apague` + `a`; `põe-no` → `põe` + `o`.
- Cada subtoken guarda o span **do original**.
- Mesóclise (`colocá-lo-ei`) → `UNSUPPORTED_OPERATION` com span.

**3.C Análise morfológica.** Cada token gera uma *coorte* de leituras:
`{lexemeId, lemma, pos, feats, senseConceptIds, source: EXACT | GENERATED | DERIVED | CLOSED_CLASS | LITERAL | GUESSED | APPROXIMATE, score}`.

Ordem de tentativa:
1. índice exato (formas geradas + manuais), case-insensitive, com remoção de diacríticos só como chave;
2. análise derivacional (remover o sufixo de diminutivo e consultar de novo);
3. classes fechadas;
4. literais;
5. **adivinhador por sufixo** (só pos e traços, sem lexema; serve para diagnóstico, ex.: "`imprima`: verbo no imperativo, lema provável `imprimir`, não cadastrado");
6. correção aproximada, **somente se o token não for palavra real** (3.H) e respeitando a política atual (nada de resolver ação destrutiva por aproximação).

**3.D Desambiguação por restrições.**
- Regras em dados (JSON), com ações `SELECT`/`REMOVE`, alvo (pos/traços/lema) e condições de contexto: posição relativa, posição com barreira, negação de condição.
- Aplicação iterativa até ponto fixo, com teto de iterações. **Nunca remove a última leitura** de um token.
- Cada regra aplicada fica no trace com o seu id.
- Regras iniciais, cada uma com teste:
  - `a` (DET / PREP / PRON);
  - `o` (DET / PRON clítico);
  - `cria` e `bote` (V / N);
  - `move` (V Ind / V Imp);
  - `que` (REL / CONJ);
  - `para` (PREP / V parar);
  - imperativo × subjuntivo no início de oração;
  - particípio × adjetivo.
- Aba de painel **Regras de desambiguação**: editar, testar sobre uma frase e ver o antes/depois da coorte.

**3.E MWEs sobre lemas.**
- O padrão é uma sequência de restrições de lema e traços, com elementos opcionais e um **núcleo** que define número e gênero do todo. Exemplo: `[lema:cor] [lema:de] [DET?] [lema:fundo]`, com núcleo 0, gera C_PROP_BG_COLOR e casa "cor de fundo", "cores de fundo", "cor do fundo" e "cores dos fundos".
- Expressões fixas (`ao lado de`, `em cima de`, `dentro de`, `mais à direita`) usam o mesmo mecanismo.
- Trie sobre lemas, com longest-match.
- Migre as 26 MWEs atuais.

**3.F Gramática de traços + parser de chart.**
- **Gramática em dados**: regras sobre categorias com traços e unificação. Esboço:
  ```
  S        → CMD (CONJ CMD)*
  CMD      → WRAPPER? NEG? VP | PP_TOPIC VP
  VP       → V[Mood=Imp|VerbForm=Inf] ARGS          (ARGS conforme a moldura do verbo)
  NP[g,n]  → DET[g,n]? QUANT? NUM? ORD[g,n]? N[g,n] MOD*
  MOD      → ADJ[g,n] | VAL | PP | REL | LIT | PROP_PHRASE
  NPc[Gender=resolve, Number=Plur] → NP (CONJ NP)+   (masc. se houver algum masc.)
  PP       → P NP | P PRON
  REL      → que V[lema∈{ter,estar,ser}] …
  WRAPPER  → (você)? V[poder|conseguir] (…) + V[Inf]  |  V[querer|gostar de] …
  ```
- **Molduras de verbo** (dados, por conceito de ação):
  - CREATE: objeto NP + localização opcional (PP espacial, ou construção "X com Y dentro");
  - MOVE: objeto NP (definido ou pronome) + destino (PP espacial);
  - UPDATE: objeto NP + predicativo (ADJ/VAL), ou `para` VAL, ou `com` PROP VAL, ou PROP `de` NP `para` VAL; construção `pintar NP de COR`;
  - DELETE: objeto NP;
  - QUERY/SELECT: objeto NP;
  - pedido indireto: `você pode/poderia V-inf …`, `quero/queria NP` (= CREATE NP), `eu gostaria de V-inf …`, `por favor` (neutro). O AST registra `politeness: true`.
- **Algoritmo:** chart parser (Earley ou CKY sobre gramática binarizada) gerando floresta compactada, com extração das k melhores análises. Termina por construção. Tem orçamento de itens (IV.F).
- **Ranking**, com pesos em dados:
  1. **concordância** de gênero e número: **restrição rígida** (análise que viola é descartada);
  2. satisfação da moldura do verbo;
  3. affordances da ontologia (ex.: só anexar "com borda azul" a quem aceita borda; só pôr dentro de quem aceita filhos);
  4. proximidade (preferir o núcleo compatível mais próximo);
  5. score lexical;
  6. saliência no discurso, para definidos.
- Se a melhor análise não superar a segunda por uma margem δ configurável → `AMBIGUOUS_SENSE` (subcódigo `ATTACHMENT` ou `SENSE`), com as duas leituras no diagnóstico e **sem execução**.
- Desempate final determinístico (ordem de ids de regra), documentado.
- **Política de concordância com coordenação** (documentar em `SCHEMA.md`):
  - adjetivo **plural** concordando com a coordenação → distribui para todos;
  - adjetivo singular → vale só para o núcleo mais próximo que concorda;
  - nenhum núcleo concorda → erro `AGREEMENT_MISMATCH` (code novo, camada `syntax`), com span do adjetivo e núcleos candidatos.
- **Saída**: árvore sintática serializável no trace, com spans e índices de tokens por nó.

**3.G Composição semântica** (árvore → AST atual):
- **Número e definitude:**
  - definido plural sem numeral → `ALL` sobre os que casam com os filtros;
  - definido singular → `ONE` + saliência, ou ambiguidade;
  - numeral → `COUNT`;
  - plural nu (`crie botões`) → `UNSUPPORTED_OPERATION` ("quantos?").
- Adjetivos e PPs viram mutações (CREATE/UPDATE) ou filtros (referência), conforme a função na árvore.
- Coordenação distribui modificadores conforme a política acima.
- A negação tem escopo por oração e por sintagma.
- Exclusão, ordinais, relativas, elipse e anáfora definida: comportamento atual mantido.
- **Sentido decidido pela moldura:** `colocar` + objeto indefinido = CREATE; `colocar` + objeto definido/pronome = MOVE; `texto` = entidade ou grupo de propriedades conforme a posição na moldura.
- **Tempo e modo:** comando só com imperativo, infinitivo ou pedido indireto. `criou um botão` → `UNSUPPORTED_OPERATION` ("não é um comando").

**3.H Filtro de palavras reais** (protege a correção aproximada):
- Mantenha um conjunto compacto de formas do português (Bloom filter ou DAFSA). A correção aproximada só se aplica a token que **não** está nesse conjunto.
- Palavra real fora do domínio → diagnóstico com classe adivinhada: entidade inexistente → `UNSUPPORTED_OPERATION` ("`título` não existe na ontologia"); verbo não suportado → `UNSUPPORTED_OPERATION`. Nunca uma "correção".
- **Fonte:** se houver acesso à rede, use MorphoBr ou DELAF-PB (registre a licença em `THIRD_PARTY.md`). Sem rede, implemente o mecanismo alimentado pelas formas geradas da base, deixe o carregamento de lista externa pronto e declare a limitação.

**3.I Migração segura** (padrão strangler):
1. Configuração `frontEnd: 'legacy' | 'grammar'` em `EngineSettings` e no painel.
2. `scripts/diff-frontends.ts` roda todos os datasets nos dois front-ends e lista as diferenças de AST e plano.
3. O padrão só vira `grammar` quando **todos** os casos que passavam no legado passam no novo, mais os casos `morph` da Parte V.
4. Depois disso, apague `DomainParser.ts` (legado), `Grammar.ts` e o código que ficar morto.

**3.J Observabilidade.** O inspetor do chat ganha estas abas:
- Contrações/Clíticos;
- Leituras (coorte antes e depois da desambiguação, com ids das regras);
- MWEs (lema);
- **Árvore sintática** (desenhada);
- **Ranking** (k melhores análises, com componentes do score).

No painel: abas Paradigmas, Regras de desambiguação, Gramática/Molduras e Construções, todas editáveis, validadas e persistidas.

### FASE 4 — Correções que dependem do novo front-end

| ID | Exigência |
|---|---|
| B1 | Sem ação reconhecida → um único `UNKNOWN_WORD` no verbo, com sugestões (`apgue` → `apague`, bloqueada por ser destrutiva). `NEGATED_ACTION` só com operador de negação sobre ação reconhecida. |
| B2 | Cada problema reportado **uma vez**, pela camada que o detectou. Diagnóstico derivado leva `causedBy` e não conta como erro novo. Nenhuma camada repropaga diagnóstico alheio como seu. |
| B3 | Spans vêm da árvore: sintagma do determinante ao último modificador; comando inteiro. Asserções com `start`/`end` exatos em ≥ 15 frases, incluindo `apague o quinto botão` → `[7,21]`. |
| B4 | `da direita / da esquerda / de cima / de baixo / mais à direita / mais à esquerda` → `selector.direction`. Sem `rect`: ordem do documento (RIGHTMOST/BOTTOMMOST = último; LEFTMOST/TOPMOST = primeiro) + INFO `ORDER_FALLBACK`. Com `rect`: empate no eixo (tolerância configurável) → `AMBIGUOUS_REFERENCE` com os empatados. Corrija `tests/layout.test.ts` com commit `TEST-EXPECTATION:` e justificativa em `CHANGES.md`. |
| B5 | `PropertyGroupConcept` de texto: COLOR → `C_PROP_TEXT_COLOR`, TEXT → `C_PROP_TEXT_CONTENT`, SIZE → `C_PROP_FONT_SIZE` (novo, via dados, com mapeamento no renderer). |
| B6 | Candidatos mesclados por `(conceptId, lexemeId)`. |
| B7 | `Grammar.ts` removido; `runner.ts` usa o índice derivado dos dados. |
| B8 | `crie um botão azul e não vermelho`: semântica definida (negação de valor = nenhuma mutação para "vermelho", com INFO) ou `UNSUPPORTED_OPERATION` explicado. `dela mesma` = reflexivo → só `INVALID_CONTAINMENT`. |
| Comparativo | `deixe a caixa mais escura` → `UNSUPPORTED_OPERATION` com span `mais escura`, não `UNKNOWN_WORD`. |
| Cores compostas | `azul-claro`, `azul-escuro`, `verde-claro`, `verde-escuro`, `cinza-claro` como valores (dados), com hífen preservado pelo lexer. |

### FASE 5 — Requisitos pendentes

| Item | Exigência |
|---|---|
| `test:report` | O script existe, mas `public/test-report.json` não é gerado nem lido. Gerar e exibir na aba Testes, com data, contagem e falhas. |
| E2E por camada (A8) | Para **cada** um dos 14 casos obrigatórios: tokens com offsets, leituras morfológicas, MWEs, conceitos, árvore sintática (assinatura), AST, referências resolvidas, plano, árvore final, undo e redo, tudo com valores explícitos por caso. |
| Persistência (A10) | Provar por teste (com localStorage simulado) que base, **configurações**, **dataset de treino**, **histórico de versões** e as novas abas (paradigmas, regras, gramática) sobrevivem a reload. "Restaurar padrão de fábrica". |
| Edição (A10) | Testes de edição pelo store e conferência no painel de cada tipo de conceito, MWE, paradigma, regra de desambiguação, moldura e constraint/binding, com validação de integridade. |
| Histórico (A10) | Comparar versões da base **e** métricas entre versões, destacando regressões. |
| Benchmark (A11) | Construção do índice morfológico (formas geradas) com 100 / 1k / 10k / 100k lexemas sintéticos; análise morfológica, desambiguação, MWE e parser (tempo × tamanho da frase, 3 a 25 tokens); busca aproximada nos 4 tamanhos (crescimento sublinear); memória (`process.memoryUsage`). O benchmark **não pode** derrubar a suíte. |

### FASE 6 — Validação e relatório

1. `scripts/validate-sequences.ts` (rodável com `npx vite-node`). Para cada comando, imprime: árvore antes, frase, coorte desambiguada, árvore sintática, AST, plano, diagnósticos, árvore depois, propriedades e ordem dos nós, além de undo e redo no fim de cada sequência. Sequências:
   - §38;
   - todas as de I.1;
   - todos os casos da Parte V.
2. Navegador (`npm run dev`), no chat:
   - §38;
   - G1, G2, G5, L1 e B4;
   - recarregar e conferir a persistência;
   - abrir Métricas (com cobertura) e Testes (relatório do vitest);
   - console sem erros gerados pela aplicação.

   Sem navegador disponível, declare isso no relatório. Não afirme validação visual que não fez.
3. Todos estes comandos terminam limpos:
   ```
   npx tsc --noEmit
   npm test
   npm run build
   npm run test:report
   npx vite-node scripts/score.ts --dataset src/eval/data/regression.json
   npx vite-node scripts/diff-frontends.ts
   ```
4. Nenhum arquivo de depuração no projeto.
5. Reescreva `RELATORIO.md`. Todo número e toda saída vêm de script executado. Conteúdo:
   - tabela de todos os IDs deste prompt: status, commits, testes, saída real antes × depois;
   - `CHANGES.md` na íntegra;
   - contagem de testes;
   - métricas por conjunto **com cobertura** (o conjunto comprometido rotulado);
   - benchmark;
   - exemplos reais de coorte, árvore, AST e plano com spans;
   - saída do `validate-sequences.ts`;
   - o que foi e o que não foi validado no navegador;
   - formas removidas na migração do léxico e lista de homógrafos;
   - limitações restantes;
   - `git log --oneline` desde o baseline.

### IV.F Orçamentos e camadas

- **Camadas válidas** em diagnósticos: `lexer`, `segmenter`, `morphology`, `disambiguation`, `mwe`, `syntax`, `semantics`, `binder`, `resolver`, `validator`, `planner`, `executor`.
- **Orçamentos** (configuráveis, com padrão):
  - itens do chart ≤ 20.000;
  - análises extraídas k ≤ 16;
  - iterações da desambiguação ≤ 50;
  - tokens por frase ≤ 60.

  Estouro de orçamento → `UNSUPPORTED_OPERATION` (subcódigo `BUDGET`) com span, nunca travamento.
- **Desempenho** (Node, máquina comum):
  - compilação de frase de ≤ 20 tokens com p95 < 5 ms;
  - inicialização do índice da base de domínio < 200 ms.

---

## PARTE V — CASOS MORFOSSINTÁTICOS OBRIGATÓRIOS (oráculo)

Escreva estes casos em `regression.json`, com tag `morph`, **antes** das Fases 2 e 3. Os resultados abaixo são a especificação.
- "Doc" = documento semeado antes do comando.
- `bg` = cor de fundo, nos literais da base (azul `#2563eb`, vermelho `#dc2626`, preto `#000000`, branco `#ffffff`).

| # | Doc / comandos anteriores | Entrada | Resultado exigido |
|---|---|---|---|
| 1 | vazio | `coloque uma caixa preta com um botão azul dentro` | caixa bg preto ⊃ botão bg azul |
| 2 | vazio | `crie uma caixa com um botão preta` | caixa bg preto ⊃ botão **sem** cor |
| 3 | vazio | `crie uma caixa e um botão vermelhos` | caixa **e** botão bg vermelho (irmãos) |
| 4 | vazio | `crie uma caixa e um botão vermelho` | caixa sem cor; botão vermelho |
| 5 | vazio | `crie um botão e uma caixa pretos` | os dois bg preto |
| 6 | vazio | `crie um botão e uma caixa pretas` | erro `AGREEMENT_MISMATCH`, nada criado |
| 7 | 2 botões azuis + 1 vermelho | `apague os botões azuis` | apaga os 2 azuis |
| 8 | 2 botões azuis | `apague o botão azul` | `AMBIGUOUS_REFERENCE`, nada apagado |
| 9 | 2 botões | `mude as cores de fundo dos botões para azul` | os 2 bg azul |
| 10 | 1 botão | `mude a cor do fundo do botão para azul` | bg azul |
| 11 | `crie uma caixa`; `crie um botão` | `coloca-o depois da caixa` | botão movido para depois da caixa |
| 12 | `crie uma caixa` | `deixe-a azul` | caixa bg azul |
| 13 | `crie uma caixa` | `apague-a` | caixa apagada |
| 14 | `crie dois botões`; `crie uma caixa` | `mova-os para dentro da caixa` | caixa ⊃ os 2 botões |
| 15 | vazio | `crie um botãozinho` | 1 botão |
| 16 | vazio | `crie dois botõezinhos azuis` | 2 botões bg azul |
| 17 | vazio | `crie uma caixinha` | 1 caixa |
| 18 | vazio | `criem dois botões` | 2 botões |
| 19 | vazio | `cria um botão` | 1 botão (leitura verbal no início da oração) |
| 20 | vazio | `você pode criar um botão azul?` | botão bg azul |
| 21 | vazio | `poderia criar uma caixa, por favor?` | 1 caixa |
| 22 | vazio | `quero um botão vermelho` | botão bg vermelho |
| 23 | 1 botão | `eu gostaria de apagar o botão` | botão apagado |
| 24 | vazio | `criou um botão` | `UNSUPPORTED_OPERATION` (não é comando), nada criado |
| 25 | 3 botões | `pinte os botões de vermelho menos o primeiro` | 2º e 3º bg vermelho |
| 26 | 1 caixa | `dentro da caixa, crie um botão` | caixa ⊃ botão |
| 27 | 1 caixa preta | `crie, dentro da caixa preta, dois botões` | caixa ⊃ 2 botões |
| 28 | vazio | `crie duas caixas e três botões` | 5 nós na raiz |
| 29 | vazio | `crie uma caixa preta com dois botões brancos dentro` | caixa bg preto ⊃ 2 botões bg branco |
| 30 | 1 caixa preta + 1 botão azul na raiz | `coloque o botão azul dentro da caixa preta` | MOVE: caixa ⊃ botão (nada criado) |
| 31 | 1 caixa preta | `coloque um botão azul dentro da caixa preta` | CREATE: caixa ⊃ novo botão bg azul |
| 32 | vazio | `crie um botão com borda azul de 3px` | botão borderColor azul + borderWidth 3px |
| 33 | 1 botão | `deixe o texto do botão vermelho` | textColor vermelho |
| 34 | 1 botão | `deixe o texto do botão com 18px` | fontSize 18px |
| 35 | 3 botões (sem rect) | `apague o botão da direita` | apaga o 3º + INFO `ORDER_FALLBACK` |
| 36 | 1 caixa preta | `deixe a caixa mais escura` | `UNSUPPORTED_OPERATION` com span de `mais escura` |
| 37 | vazio | `adicione um título "Olá"` | `UNSUPPORTED_OPERATION` ("título" fora da ontologia) ou `UNKNOWN_WORD` se 3.H estiver sem fonte; nunca uma correção |
| 38 | vazio | `crie uma caixa que tem` | `UNSUPPORTED_OPERATION`, < 50 ms |
| 39 | 1 botão | `pague o botão` | um `UNKNOWN_WORD` (ou `UNSUPPORTED_OPERATION` se "pagar" for reconhecida como palavra real), sem `NEGATED_ACTION`, nada apagado |
| 40 | vazio | `crie um botão azul-claro` | botão bg = literal de `azul-claro` definido na base |

Para cada caso, além da árvore final, registre: `readings` dos tokens de conteúdo, `attachments`, `bindings`, `ast`, `plan` e `diagnostics`.

---

## PARTE VI — REFERÊNCIAS TÉCNICAS

- Hunspell, raiz + regras de afixo: https://man.archlinux.org/man/hunspell.5.en
- Apertium, paradigmas: https://aclanthology.org/2012.freeopmt-1.4
- Lexical Markup Framework (LexicalEntry, Lemma, WordForm, RelatedForm): https://en.wikipedia.org/wiki/Lexical_Markup_Framework
- UniMorph (lema, traços, forma): https://huggingface.co/datasets/unimorph/universal_morphologies
- MorphoBr, léxico de formas plenas do português, com diminutivos por morfologia de estados finitos: https://periodicos.ufmg.br/index.php/textolivre/article/view/16809
- DELAF-PB / Unitex-PB: https://aclanthology.org/W15-5621/
- FreeLing, dicionário + afixos + clíticos + adivinhador por sufixo: https://freeling-user-manual.readthedocs.io/en/v4.2/basics/
- Constraint Grammar (VISL CG-3), SELECT/REMOVE sobre coortes: https://edu.visl.dk/cg3/chunked/
- PALAVRAS, parser CG do português: https://edu.visl.dk/visl/pt/info/palavras_papers.html
- GF Resource Grammar Library e smart paradigms: https://journals.colorado.edu/index.php/lilt/article/view/1205
- Universal Dependencies para português (contrações, ênclise, traços): https://universaldependencies.org/pt/
- Tokenização de clíticos em português: https://github.com/LuceleneL/portTokenizer

---

## PARTE VII — CRITÉRIO DE PRONTO

- [ ] Git com baseline, um commit por item, expectativas commitadas antes do código que as satisfaz, sem histórico reescrito.
- [ ] L1 corrigido; fuzz de 5.000 frases termina sem travar; `npm test` completo sem worker morto.
- [ ] `CHANGES.md`, `SCHEMA.md`, `final-v1-compromised.json`, `score.ts --dataset`; nada lido em `audit/`.
- [ ] Métricas sem 100% falso: `n/a` quando não houver base, cobertura visível, cobertura mínima da F1.4 atingida.
- [ ] Invariantes de consumo, duplicatas, spans e analyze ≡ execute verdes em todos os conjuntos.
- [ ] Léxico por paradigma: SurfaceForms de flexão **geradas**; manuais só para erro, coloquial, abreviação e exceção; golden tables batendo; homógrafos listados.
- [ ] Novo front-end ativo por padrão; `DomainParser` legado e `Grammar.ts` removidos; `diff-frontends` sem regressão.
- [ ] Os 40 casos da Parte V passam com todas as expectativas.
- [ ] Tudo de I.1 continua valendo.
- [ ] B1–B8, comparativo e cores compostas resolvidos, com testes.
- [ ] Fase 5 entregue.
- [ ] `tsc`, `test`, `build`, `test:report`, `score`, `diff-frontends` limpos.
- [ ] Validação por script feita; validação no navegador feita ou declarada como não feita.
- [ ] `RELATORIO.md` gerado a partir da execução real, sem esconder limitações.
