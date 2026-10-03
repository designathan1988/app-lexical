# Motor Semântico — Relatório de Implementação

Compilador semântico de domínio para português que opera um pagebuilder através
de uma representação intermediária tipada e validada.

Contrato arquitetural: `LEXICAL.txt`. Nada da arquitetura especificada foi
simplificado, e nenhuma camada existe apenas em TypeScript sem participar da
execução.

---

## 1. Arquitetura realmente implementada

O pipeline especificado está conectado ponta a ponta e é observável na interface:

```
entrada bruta
  → RawLexer.lex                     (não destrutivo, preserva offsets)
  → expandContractions               (normalização gramatical PT-BR)
  → MultiwordTrie.match              (longest-match real, dados dirigem)
  → LexicalIndex.resolve             (exato → fonético como fallback)
  → SemanticTokenBuilder.build       (tokens semânticos + literais)
  → DomainParser.parse               (AST semântica)
  → PropertyBinder.bind              (propriedade × valor)
  → ReferenceResolver.resolve        (instâncias reais do documento)
  → ConstraintValidator.validate     (affordances executadas)
  → ExecutionPlanner.build           (plano determinístico)
  → ExecutionEngine.execute          (runtime real do builder)
  → BuilderStore                     (transação + undo/redo)
```

Separação preservada:

```
SurfaceForm ≠ Lexeme ≠ Concept ≠ Mention ≠ DocumentInstance
SemanticAST ≠ ExecutionPlan ≠ RuntimeMutation
```

### Camadas e arquivos

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Tipos | `src/engine/types.ts` | identidades e morfologia fundamentais |
| Léxico | `src/engine/lexical/RawLexer.ts` | tokenização não destrutiva |
| Léxico | `src/engine/lexical/GrammarNormalizer.ts` | contrações PT-BR |
| Léxico | `src/engine/lexical/MultiwordTrie.ts` | MWE com longest-match |
| Léxico | `src/engine/lexical/PortuguesePhonetic.ts` | chave fonética (só candidatos) |
| Léxico | `src/engine/lexical/LexicalIndex.ts` | índices hash exato/fonético |
| Ontologia | `src/engine/ontology/Concept.ts` | união discriminada real |
| Parser | `src/engine/parser/SemanticTokenBuilder.ts` | tokens semânticos |
| Parser | `src/engine/parser/DomainParser.ts` | parser sintático-semântico |
| Parser | `src/engine/parser/PropertyBinder.ts` | binding propriedade/valor |
| Parser | `src/engine/parser/DiscourseContext.ts` | coreferência por mentions |
| AST | `src/engine/ast/ast.ts` | AST serializável, sem DOM |
| Documento | `src/engine/document/DocumentModel.ts` | modelo vivo |
| Documento | `src/engine/document/ReferenceResolver.ts` | referência → nó real |
| Planejamento | `src/engine/planning/ExecutionPlanner.ts` | AST → plano |
| Planejamento | `src/engine/planning/ConstraintValidator.ts` | constraints executadas |
| Runtime | `src/engine/runtime/ExecutionEngine.ts` | executor por operação |
| Runtime | `src/builder/BuilderRuntimeAdapterImpl.ts` | adaptador ao builder |
| Builder | `src/builder/BuilderStore.ts` | estado + undo/redo transacional |
| Conhecimento | `src/knowledge/knowledgeBase.ts` | dados persistíveis (JSON) |
| Conhecimento | `src/knowledge/KnowledgeBaseStore.ts` | versionamento + settings |
| Fachada | `src/engine/SemanticCompiler.ts` | orquestra + trace |
| Fachada | `src/engine/SemanticEngine.ts` | composição + discurso persistente |
| UI | `src/ui/**` | chat, preview, painel administrativo |

---

## 2. Integração com o builder

O projeto era greenfield (a pasta continha apenas `LEXICAL.txt`), então o
runtime real foi construído junto com o motor, e é o **único** estado do
documento — não existe árvore paralela.

- `BuilderStore` é a fonte única de verdade (`document.nodes`, `rootIds`,
  `selectionIds`).
- Todas as mutações semânticas passam por `BuilderRuntimeAdapterImpl`, que
  chama operações reais transacionais (`createNode`, `setProperty`,
  `clearProperty`, `place`, `deleteNode`, `inspectNode`).
- CREATE, UPDATE, DELETE e MOVE têm executor próprio — não existe
  `operação → createElement`.
- O renderizador (`DocumentRenderer`) lê `document.nodes`/`rootIds` do store;
  não há cópia do documento para a UI.
- O motor **nunca** manipula DOM e **nunca** executa texto do usuário
  (sem `eval`, sem `new Function`). Dados semânticos viram operações tipadas.

---

## 3. Quantidade de testes

```
158 testes · 13 arquivos · 158 aprovados · 0 reprovados · 0 pulados
```

| Arquivo | Testes | Cobre |
|---|---|---|
| `lexical.test.ts` | 19 | Unicode, acentos, SurfaceForm, flexões, coloquial, misspelling, fonética, Trie/MWE, tokenização, CSS, cores, strings |
| `parser.test.ts` | 16 | containment, quantidade, ordinal, negação (ação e propriedade), exclusão, pronomes, binding, ação ambígua |
| `references.test.ts` | 7 | conceito vs instância, ordinal, texto, parent, exclusão, ambiguidade |
| `planning.test.ts` | 6 | expansão de quantidade, determinismo, IDs determinísticos, constraints |
| `runtime.test.ts` | 7 | create/place/move/delete, ciclos, undo/redo transacional, atomicidade |
| `e2e.test.ts` | 4 | 14 casos obrigatórios, composição, negativos, sequência §38 |
| `composition.test.ts` | 62 | geração combinatória: verbos × entidades × cores × propriedades × quantidade × posição |
| `robustness.test.ts` | 18 | acento, maiúsculas, espaços, pontuação, sinônimos, flexões, frases longas, segurança de fuzzy, settings, coreferência |
| `persistence.test.ts` | 7 | serializabilidade JSON, round-trip, versionamento, extensão de dados viva |
| `rendering.test.ts` | 7 | precedência ontologia × propriedades explícitas |
| `metrics.test.ts` | 3 | métricas por camada, separação de conjuntos |
| `benchmark.test.ts` | 1 | performance por camada |
| `bench-report.test.ts` | 1 | impressão do relatório de benchmark |

---

## 4. Métricas semânticas

Medidas sobre o dataset completo (31 casos: 14 regressão + 10 composição +
10 negativos):

| Métrica | Valor |
|---|---|
| Lexical resolution accuracy | 94,0 % |
| Command/sense accuracy | 100,0 % |
| Entity attachment accuracy | 100,0 % |
| Final tree accuracy (end-to-end) | 100,0 % |
| End-to-end command success | 100,0 % |
| False-positive rate | 0,0 % |
| Ambiguity detection rate | 0,0 % (nenhum caso ambíguo no conjunto) |

A resolução lexical de 94 % é honesta e esperada: os casos negativos contêm
propositalmente palavras inexistentes (`banana`, `xyzzy`, `quux`) e palavras
fora do domínio. Nos casos válidos a resolução é integral.

---

## 5. Benchmark

Medido com 100.000 SurfaceForms e 10.000 MWEs sintéticos (Node 24, Windows):

| Etapa | Tempo | Custo unitário |
|---|---|---|
| LexicalIndex build (100.000 SurfaceForms) | 225,47 ms | 2,3 µs/forma |
| MultiwordTrie build (10.000 MWEs) | 26,93 ms | 2,7 µs/MWE |
| Tokenização (5.000 iterações) | 14,39 ms | 2,9 µs |
| Lookup lexical (5.000 iterações) | 1,63 ms | 0,33 µs |
| MWE match (5.000 iterações) | 0,54 ms | 0,11 µs |
| Parsing (2.000 iterações) | 14,21 ms | 7,1 µs |
| Planner + Validator (2.000 iterações) | 4,34 ms | 2,2 µs |
| Compile completo (5.000 iterações) | 95,18 ms | 19,0 µs |
| Execução end-to-end (5.000 comandos) | 65,19 ms | 13,0 µs |

O lookup lexical é hash (O(1)); o dicionário nunca é varrido por comando.
A Trie mantém o custo do longest-match proporcional ao tamanho da expressão,
não ao número de expressões.

---

## 6. Casos obrigatórios — prova de execução

Os 14 casos de `LEXICAL.txt §45` passam com asserção por camada (lexer, MWE,
candidatos, AST, seletor, binding, plano, constraints e mutação final). Não é
verificada apenas a aparência final.

Exemplos de AST e plano **realmente produzidos** pela aplicação:

### `crie uma caixa azul com um botão vermelho dentro`

AST:
```
CREATE [CREATE tmp_1 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#2563eb)
      | CREATE tmp_2 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#dc2626)]
PLACE new:tmp_2 C_SPAT_INSIDE new:tmp_1
```

Plano:
```
CREATE_NODE tmp_1 C_ENT_CONTAINER
SET_PROPERTY temp:tmp_1 C_PROP_BG_COLOR #2563eb
CREATE_NODE tmp_2 C_ENT_BUTTON
SET_PROPERTY temp:tmp_2 C_PROP_BG_COLOR #dc2626
PLACE_NODE temp:tmp_2 C_SPAT_INSIDE temp:tmp_1
```

### `crie um botão dentro de uma caixa azul` (direção do containment)

```
CREATE [CREATE tmp_1 C_ENT_BUTTON | CREATE tmp_2 C_ENT_CONTAINER set(C_PROP_BG_COLOR,COLOR:#2563eb)]
PLACE new:tmp_1 C_SPAT_INSIDE new:tmp_2
```

O botão é o `source`; a caixa é o `target`. Nunca o inverso.

### `deixe a borda azul` (com seleção)

```
UPDATE selection set(C_PROP_BORDER_COLOR,COLOR:#2563eb)
```
→ `borderColor = #2563eb`. `deixe a borda com 2px` → `borderWidth = 2px`.
O grupo BORDER resolve a propriedade concreta pela **categoria do valor**.

### `crie um botão azul sem borda`

```
CREATE [CREATE tmp_1 C_ENT_BUTTON set(C_PROP_BG_COLOR,COLOR:#2563eb) clear(C_PROP_GROUP_BORDER)]
```
→ plano emite `CLEAR_PROPERTY` para `borderColor`, `borderWidth`, `borderStyle`.

### `não apague o botão`

```
NO_OP
```
Nenhum `DELETE_NODE` é emitido; a negação tem escopo sobre a ação.

### `apague o segundo botão`

```
DELETE sel:C_ENT_BUTTON;ord=1
```

### `deixe todos os botões azuis menos o primeiro`

```
UPDATE sel:C_ENT_BUTTON;all;minus[C_ENT_BUTTON;ord=0] set(C_PROP_BG_COLOR,COLOR:#2563eb)
```

### `mova o botão de dentro da caixa para depois dela`

```
MOVE sel:C_ENT_BUTTON;parent[C_ENT_CONTAINER;any] C_SPAT_AFTER sel:C_ENT_CONTAINER;any
```
A ocorrência `ela` resolve para a **menção** de `caixa` nesta frase, não para o
conceito global.

### `apague o botão azul` (referência por propriedade)

```
DELETE sel:C_ENT_BUTTON;propertyFilter{C_PROP_BG_COLOR=#2563eb}
```

---

## 7. Verificação na aplicação real

Executado contra o documento real, com conferência de árvore antes/depois:

**Sequência §38** (via chat real em `http://localhost:5173`):

| Comando | Mutações | Árvore após |
|---|---|---|
| `crie uma caixa` | 1 | `CONTAINER` |
| `crie dois botões dentro dela` | 4 | `CONTAINER > [BUTTON, BUTTON]` |
| `deixe o segundo azul` | 1 | segundo botão com `#2563eb` |
| `mova o primeiro para depois da caixa` | 1 | `CONTAINER > [BUTTON azul]`, `BUTTON` |
| `apague o botão azul` | 1 | `CONTAINER`, `BUTTON` |

Árvore final verificada no DOM do preview:
`node_1:container[] | node_2:button[]` — o botão azul (segundo) foi apagado,
o primeiro permanece depois da caixa.

**Undo/redo** (verificado no navegador):
`node_1 | node_2 | node_3` → undo → `node_1 | node_2` → redo → `node_1 | node_2 | node_3`.

**Bordas** (verificado no DOM do preview):
container com `4px solid rgb(37,99,235)`; botão com `none` (limpeza do grupo).

**Ciclo painel → chat**: adicionado `C_VAL_PINK (#ec4899)` + `LEX_ROSA` +
`SF_ROSA` pelo painel; `crie um botão rosa` no chat produziu imediatamente
`rgb(236,72,153)` no preview.

**Suítes pelo painel** (navegador): regressão 14/14, composição 10/10,
negativos 10/10, completa 31/31.

---

## 8. Interface

### Chat + Preview (`/`)
- Campo de comando, botões **Executar** e **Apenas Analisar**.
- Preview renderizado em tempo real a partir do documento real.
- Desfazer / Refazer / Limpar.
- Inspetor de pipeline com 7 abas: Tokens (brutos e normalizados), MWEs,
  Candidatos, AST (assinatura + JSON), ExecutionPlan (assinatura + JSON),
  Diagnósticos, Execução (mutações aplicadas + nós materializados).

### Painel administrativo
Áreas separadas: **Dados**, **Treinamento**, **Testes**, **Métricas**,
**Erros/Diagnósticos**, **Configurações**, **Histórico**.

- **Dados**: CRUD e busca de SurfaceForms, lexemas, conceitos (incluindo novos
  valores), MWEs; import/export de backup JSON.
- **Treinamento**: compila a frase no motor real, captura AST/plano/árvore e
  salva como dado de treino; salva correções manuais; export/import de dataset.
- **Testes**: executa regressão, composição, negativos, completa, o dataset de
  treinamento e o benchmark; mostra acurácia por caso e diff esperado × obtido.
- **Métricas**: métricas por camada, falsos positivos, ambiguidades,
  diagnósticos agrupados por camada, taxa de regressão.
- **Erros/Diagnósticos**: analisa uma frase e exibe tokens, candidatos,
  sentidos, AST, constraints e plano.
- **Configurações**: thresholds de confiança (exata e fonética), recuperação
  fonética on/off, máx. candidatos fonéticos, ambiguidade como aviso ou erro fatal.
- **Histórico**: captura de versões, comparação (diff) e restauração.

Tudo usa o mesmo motor e os mesmos dados da aplicação real.

---

## 9. Extensibilidade demonstrada

- **Nova palavra/flexão/cor/alias** → apenas dados
  (`addConcept` + `addLexeme` + `addSurfaceForm`); nenhuma alteração no parser.
  Coberto por `persistence.test.ts`.
- **Nova MWE** → apenas dado; a Trie a reconhece atomicamente sem tocar no parser.
- **Nova entidade** → conceito + propriedades aceitas + bindings + renderer +
  léxico.
- **Nova propriedade** → PropertyConcept + categorias + formas lexicais.

O parser trabalha por categorias e relações; não existem listas de
`if palavra === ...` nem regex sobre frases de teste. Regex aparece somente no
lexer, para classes lexicais (números, unidades, hex).

---

## 10. Casos não suportados e limitações reais

Encontrados durante a implementação e **não** mascarados:

1. **Coordenação complexa de mutações por conjunção** — `crie uma caixa azul e
   redonda` não acumula os dois adjetivos sobre a mesma entidade; o segundo
   adjetivo é reportado como entrada não consumida. Coordenação funciona para
   entidades (`crie uma caixa e um botão`) e para comandos (`crie uma caixa e
   coloque um botão dentro dela`).
2. **Orações subordinadas** — `crie uma caixa que tenha borda azul` não é
   suportado; não há tratamento de pronomes relativos.
3. **Anáfora além do pronome pessoal** — `a mesma`, `aquela`, `o último` só
   funcionam como ordinal; não há descrição definida anafórica.
4. **Resolução espacial real por posição** — as direções `LEFTMOST`/
   `RIGHTMOST`/`TOPMOST`/`BOTTOMMOST` existem no seletor e no resolver, mas os
   nós só recebem `rect` quando o runtime mede o layout; na aplicação web o
   `rect` não é preenchido automaticamente, então `o botão da direita` cai no
   filtro sem ordenação espacial.
5. **Elipse nominal** — `apague o azul` (sem substantivo) não é suportado;
   exige o tipo da entidade.
6. **Comparativos e superlativos** — `o maior botão`, `mais largo` não existem
   no léxico nem na ontologia espacial.
7. **Quantidade não numérica** — `alguns botões`, `vários botões` não produzem
   quantidade; o plural sozinho não implica cardinalidade.
8. **Precedência de estilo na renderização** — o runtime guarda propriedades
   por ConceptId e o renderizador traduz para CSS. Um valor padrão `none` de
   borda chegou a mascarar borda explícita; corrigido e coberto por
   `rendering.test.ts`, mas qualquer novo par propriedade/valor interagindo
   precisa da mesma atenção.
9. **Fonética é palpite** — `rosa` (não cadastrada) chega a `LEX_ROXO` via
   chave fonética. A partir da correção, todo palpite fonético emite
   `PHONETIC_MATCH` com a forma candidata e o score; nunca é silencioso. É
   desativável nas Configurações.
10. **Ambiguidade de sentido verbal** — quando um verbo tem mais de um sentido
    de ação (`colocar` = CREATE ou MOVE), a desambiguação usa heurística de
    determinante e emite `AMBIGUOUS_SENSE` com os candidatos considerados.
    Não é um modelo probabilístico.
11. **Persistência** — a base é 100 % JSON (export/import e round-trip
    testados), mas não há gravação automática em disco; o estado da UI vive em
    memória.
12. **`AMBIGUOUS_REFERENCE` é aviso por padrão** — um seletor singular sobre
    vários nós escolhe o primeiro e avisa. Pode ser tornado fatal nas
    Configurações, mas o padrão é permissivo.

---

## 11. Critério de aceitação — situação

| Requisito | Situação |
|---|---|
| Camadas de `LEXICAL.txt` conectadas | ✅ todas, verificável no inspetor |
| Testes de regressão passam | ✅ 14/14 |
| Frases semanticamente equivalentes → planos equivalentes | ✅ testado |
| Frases estruturalmente diferentes → planos diferentes | ✅ testado |
| Referências a instâncias reais | ✅ testado |
| Propriedades e valores desambiguados | ✅ testado |
| Negação com escopo | ✅ testado |
| Quantidade funciona | ✅ testado |
| Pronomes funcionam | ✅ testado |
| Containment com direção correta | ✅ testado |
| DELETE apaga / MOVE move / UPDATE atualiza / CREATE cria | ✅ verificado no runtime |
| Operações inválidas bloqueadas por constraints | ✅ testado |
| Undo/redo preserva a operação como unidade | ✅ testado |
| Nenhuma camada só em TypeScript | ✅ todas executam |

---

## 12. Como executar

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npx vitest run tests/bench-report.test.ts
```

```bash
npm run build
```
