# PROMPT DE CORREÇÃO 3 — Fechamento integral e verificável

> **Este prompt substitui `PROMPT_CORRECAO_2.md`**, que ficou desatualizado. `PROMPT_CORRECAO.md` continua valendo por inteiro: regras, D1–D11, A1–A11, fase final e critério de pronto. Onde houver conflito, vale este arquivo.

Projeto: `C:\Codex-Shared\Lexical` (Windows). Stack: TypeScript, React 18, Vite 5, Vitest 2.

Leia este arquivo inteiro antes de alterar qualquer coisa. Trabalhe direto no código, sem parar em plano e sem pedir confirmação entre etapas.

---

## 0. ESTADO AUDITADO (2026-10-03, 11:59)

O auditor executou o motor real, a suíte, o build e o navegador.

- `npx tsc --noEmit`: limpo.
- `npm run build`: limpo.
- `npm test`: **271 testes, 270 passam, 1 falha**:
  - `final-phase.test.ts › Oração relativa simples › relação relativa sem conteúdo reconhecido produz diagnóstico`: esperava `UNSUPPORTED_OPERATION`, obteve `UNCONSUMED_INPUT`.
- O projeto **não está sob git**.

### 0.1 Verificado como correto — não pode regredir

Cada item abaixo precisa continuar valendo e estar coberto por teste:

- D1: pronome após comando falho ou após undo resulta em `UNRESOLVED_PRONOUN`.
- D2: ordinais seguem a ordem do documento.
- D3: valor incompatível resulta em `INVALID_VALUE_CATEGORY` / `INVALID_PROPERTY`. No chat aparece "Bloqueado", sem exceção.
- D4: palavra fora do vocabulário é bloqueada (`crie um botão rosa`). Erro de digitação não destrutivo é aceito com WARNING (`vermelo`). Verbo destrutivo aproximado é bloqueado.
- D5: `apague todos` sem contexto resulta em `INCOMPLETE_REFERENCE`.
- D6: `analyze` produz o mesmo plano que `execute`.
- D7: `apague os dois últimos botões` funciona.
- D8: `outra caixa` em documento vazio cria duas caixas aninhadas; com 3 caixas e discurso vazio, resulta em `AMBIGUOUS_REFERENCE`.
- D9: mover um nó para dentro de si mesmo, ou criar um ciclo, resulta em `INVALID_CONTAINMENT`.
- D10: com 2 botões e discurso vazio, `apague o botão` resulta em `AMBIGUOUS_REFERENCE`. A sequência `crie um botão` → `crie outro botão` → `deixe ele azul` aplica no segundo.
- D11: `crie uma caixa` → `deixe a borda azul` funciona.
- A1: o parser não tem literais de palavra; o teste do `salvo` via dados passa.
- A2: `crie um botão e não apague a caixa` funciona.
- A3/A4: `com fundo azul e borda vermelha`, `azul e redonda`, `com texto "Ok"`, `escrito "Ok"`, `remova` e `mude o texto do botão para "Sair"` funcionam.
- Fase final:
  - `apague o botão que está dentro da caixa` e `crie uma caixa que tenha borda azul` funcionam;
  - `deixe a mesma vermelha` funciona;
  - `apague alguns botões` e `crie vários botões` resultam em `UNSUPPORTED_OPERATION`.
- A sequência do §38 dá o resultado correto.
- A base de conhecimento persiste em localStorage.

---

## 1. PRIMEIRO: GIT E INTEGRIDADE DOS DADOS DE AVALIAÇÃO

### 1.1 Versionamento — antes de qualquer alteração

```
git init
git add -A
git commit -m "baseline: estado auditado 2026-10-03 11:59"
```

Confirme que `.gitignore` contém `node_modules/` e `dist/`. Daqui em diante:

- faça **um commit por item**, com a mensagem começando pelo ID do item (`M1: …`, `B4: …`);
- nunca use `--amend` em commits já feitos, `rebase` ou `reset --hard`.

### 1.2 O conjunto held-out foi reescrito durante as correções

- `scripts/score.ts` (11:28) já importava `final.json`, mas o arquivo foi regravado às **11:49**. Isso foi depois de `traversal.ts` (11:27), `defects.test.ts` (11:29) e `ApproximateMatcher.ts` (11:40).
- `PROMPT_CORRECAO.md` proibia isso. Sem git, não há como saber o que mudou.

**Ações obrigatórias:**

1. Crie `src/eval/data/CHANGES.md` com uma declaração honesta do que foi alterado em `final.json` e `regression.json` depois de criados: registros, valor esperado antigo × novo e motivo. Se não souber reconstruir, escreva isso. Não invente.
2. Renomeie `final.json` para `final-v1-compromised.json`. Trate-o como conjunto de regressão e rotule-o como "comprometido" no painel e nos relatórios.
3. **Não crie um novo held-out.** A avaliação final será feita pelo auditor, com um conjunto externo que você não verá.
4. `scripts/score.ts` precisa aceitar `--dataset <caminho.json> [--out <saida.json>]`, validar o arquivo pelo `datasetSchema.ts` e imprimir e gravar todas as métricas da seção 2.
5. Documente o schema em `src/eval/data/SCHEMA.md` com todos os campos, o formato canônico das assinaturas de AST e de plano (IDs normalizados) e o formato de `resolvedReferences` (índices de pré-ordem do seed). O objetivo é que outra pessoa consiga escrever casos sem ler o código.
6. **Não leia, crie nem altere nada em `audit/`.**

### 1.3 Política para valores esperados e testes

- Qualquer valor esperado novo ou alterado em datasets, ou qualquer asserção em teste existente, entra em um commit **separado e anterior** ao commit de código que o faz passar. Use o prefixo `DATASET:` ou `TEST-EXPECTATION:`. O histórico do git precisa mostrar que o esperado veio antes da implementação.
- Alterar um esperado já existente exige uma entrada em `CHANGES.md` com justificativa semântica independente da saída do motor.
- É proibido enfraquecer teste: remover asserção, afrouxar regex, trocar `toBe` por `toContain`, adicionar exceções a listas de permissão ou mudar o esperado para coincidir com a saída.

---

## 2. CRÍTICO: AS MÉTRICAS ESTÃO MASCARADAS (M1–M3)

O painel **Métricas** mostra **100% em todas as dez métricas, em todos os conjuntos**. A auditoria verificou que o número é falso:

| Conjunto | Registros | com `expected.ast` | com `expected.plan` | com `resolvedReferences` | com `bindings` | com `attachments` |
|---|---|---|---|---|---|---|
| dev | 70 | 0 | 0 | 0 | 0 | 0 |
| regression | 102 | 2 | 2 | 3 | 4 | 4 |
| final | 50 | 0 | 0 | 0 | 4 | 2 |

### M1. Expectativa ausente conta como acerto

Em `src/eval/runner.ts`:
- `astOk = rec.expected.ast === undefined ? true : …`, e o mesmo para plano e árvore;
- `ratio(num, 0)` retorna `1`.

Resultado: "AST exact match 100%" sem nenhum AST esperado, e "Ambiguity detection rate 100%" em conjuntos com **zero** casos ambíguos.

**Correção:**
- Cada métrica é calculada **só sobre os registros que têm aquela expectativa**.
- Com denominador 0, a métrica é `n/a`, nunca 100%.
- O painel e o `score.ts` mostram, ao lado de cada métrica, a **cobertura** (`n` registros com expectativa / total).
- Métricas de lexical e de sense precisam de expectativas explícitas por token (`expected.lexemes` / `expected.concepts`), e não de "tudo que resolveu".

### M2. Cobertura mínima de expectativas

Escreva as expectativas **à mão**, por raciocínio semântico, no formato canônico do `SCHEMA.md`, e **commite-as antes** de rodar o motor (seção 1.3).

| Conjunto | `ast` + `plan` | `resolvedReferences` (registros com referência a nó existente) | `bindings` (registros com propriedade) | `attachments` (registros com relação espacial) | `lexemes` + `concepts` |
|---|---|---|---|---|---|
| dev | ≥ 70% dos positivos | 100% | 100% | 100% | ≥ 40 registros |
| regression | ≥ 70% dos positivos | 100% | 100% | 100% | ≥ 40 registros |

Além disso:
- os 14 casos obrigatórios, as 8 variações do §36 e a sequência do §38 têm **todas** as expectativas;
- cada conjunto tem ≥ 10 casos genuinamente ambíguos e ≥ 25 negativos. Hoje há 0 ambíguos em dev e 12 em regression.

Se, depois de escritas, as expectativas divergirem do motor, a regra é: **corrija o motor**. Só altere o esperado com justificativa em `CHANGES.md` e commit próprio.

### M3. Camada inexistente nos diagnósticos

O painel lista uma camada `analyze` (TARGET_NOT_FOUND×35) e `planner` com TARGET_NOT_FOUND×106. `analyze` não é camada do pipeline. Provavelmente execuções de análise estão contaminando a contagem.

**Correção:**
- As camadas válidas são só as do pipeline: `lexer`, `normalizer`, `mwe`, `lexical`, `parser`, `binder`, `resolver`, `validator`, `planner`, `executor`.
- As métricas contam cada caso uma única vez.

**Aceitação de M1–M3:**
- Os números exibidos refletem expectativas reais, com cobertura visível.
- Teste: um dataset sintético com 0 casos ambíguos mostra `n/a`; um registro sem `expected.ast` não entra no denominador de AST.

---

## 3. DEFEITOS CONFIRMADOS NA AUDITORIA (B1–B9)

Para cada item: teste vermelho (commit `TEST-EXPECTATION:`), depois a correção, depois o teste verde (commit com o ID).

### B1. Verbo desconhecido vira `NEGATED_ACTION`

**Reprodução:** com um botão no documento, `pague o botão`, `apgue o botão` e `mva o botão para depois da caixa` produzem:

- AST `{"kind":"NO_OP","reason":"NEGATED_ACTION"}`;
- diagnósticos `ERROR:UNKNOWN_WORD ERROR:UNKNOWN_WORD INFO:NEGATED_ACTION`.

Não há negação nessas frases.

**Correção:**
- `NO_OP/NEGATED_ACTION` só quando um operador de negação tem escopo sobre uma ação reconhecida.
- Sem ação reconhecida → um único `UNKNOWN_WORD` (camada `lexical`) no token do verbo, com sugestões em `candidates`. Sem NO_OP no AST.

**Aceitação:**
- as três frases não têm `NEGATED_ACTION` nem no AST nem nos diagnósticos;
- `apgue o botão` sugere `apague`;
- `não apague o botão` continua `NEGATED_ACTION`.

### B2. Diagnósticos duplicados e em cascata

| Entrada | Saída atual |
|---|---|
| `mude a cor de fundo do botão para 2px` | `INVALID_VALUE_CATEGORY` pela camada `binder` **e** de novo pela `parser`, mesma mensagem e mesmo span |
| `crie um botão 2px` | `INVALID_PROPERTY` `binder` + `parser` |
| `apague o quinto botão` (1 botão) | `TARGET_NOT_FOUND` específico **e** `TARGET_NOT_FOUND` genérico ("O alvo da exclusão não foi encontrado") |
| `pague o botão` | `UNKNOWN_WORD` duas vezes (aproximação + "Não foi possível compreender") |
| `apague alguns botões` | `UNSUPPORTED_OPERATION` + `AMBIGUOUS_REFERENCE` (a segunda é consequência da primeira) |

**Correção:**
- Cada problema é reportado **uma vez**, pela camada que o detectou.
- Uma camada não repropaga o diagnóstico de outra como se fosse dela.
- Um comando com erro fatal em uma camada não é processado pelas seguintes. Se for, os diagnósticos derivados levam `causedBy` apontando para o original e não contam como erro novo.

**Aceitação:** teste por propriedade sobre todos os registros de todos os conjuntos, mais as frases acima. Não pode haver dois diagnósticos com o mesmo `code` para o mesmo span, nem dois diagnósticos de erro para a mesma causa.

### B3. Spans imprecisos

| Entrada | Span atual | Deveria cobrir |
|---|---|---|
| `deixe o botão da direita azul` | seletor `[6,7]` (só `o`); comando `[0,5]` (só o verbo) | a frase inteira |
| `apague o quinto botão` | `TARGET_NOT_FOUND` em `[7,8]` (`o`) | `o quinto botão` |

**Correção:**
- O span de um sintagma nominal vai do determinante ao último modificador consumido.
- O span do comando cobre todos os tokens do comando.
- Diagnósticos de referência usam o span do sintagma.

**Aceitação:** asserções com valores exatos de `start`/`end` para pelo menos 15 frases, incluindo as duas acima.

### B4. Tokens reconhecidos são descartados em silêncio — "da direita"

**Reprodução:** `crie três botões` → `deixe o botão da direita azul`.

- O trace mostra o token `de a direita → C_SPAT_RIGHT`.
- O AST sai **sem `direction`**: `{"entityConceptId":"C_ENT_BUTTON","quantity":{"mode":"ONE"}}`.
- Nenhum diagnóstico avisa que o token foi ignorado. O resultado é `AMBIGUOUS_REFERENCE` pelo motivo errado.
- O mesmo acontece com `da esquerda`.
- `apague o botão mais à direita` dá `UNCONSUMED_INPUT`, embora a MWE `mais à direita` exista.

Isso viola o §20 ("não silencie tokens importantes").

**Correção:**
1. Modificadores espaciais de seletor (`da direita`, `da esquerda`, `de cima`, `de baixo`, `mais à direita`, `mais à esquerda`) viram `selector.direction`.
2. Corrija a MWE `mais à direita` (verifique normalização de `à` e crase).
3. **Invariante de consumo.** Cada nó do AST registra os índices dos tokens que consumiu. Todo token com candidatos ou literal precisa estar consumido por algum nó do AST **ou** reportado em diagnóstico. Crie um teste que verifica isso sobre todas as frases de todos os conjuntos.
4. **Fallback sem `rect`** (em Node, ou antes da primeira medição):
   - siga a ordem do documento, coerente com fluxo esquerda→direita e cima→baixo: `RIGHTMOST` / `BOTTOMMOST` = **último**, `LEFTMOST` / `TOPMOST` = **primeiro**;
   - emita INFO `ORDER_FALLBACK`.

   Hoje `tests/layout.test.ts` espera o **primeiro** nó para `RIGHTMOST` e usa `Array.from(nodes.keys())` (ordem do Map). Os dois estão errados. Corrija o teste com commit `TEST-EXPECTATION:` e justificativa em `CHANGES.md`.
5. **Com `rect`:** se os candidatos empatam no eixo pedido (tolerância configurável; ex.: botões empilhados verticalmente têm o mesmo x), o resultado é `AMBIGUOUS_REFERENCE` com os empatados, e não uma escolha arbitrária.

**Aceitação:**
- Em Node, `deixe o botão da direita azul` com 3 botões pinta o **terceiro**, com `ORDER_FALLBACK`.
- Com `rect` sintético horizontal, pinta o de maior `x + width`.
- Com `rect` sintético empilhado verticalmente, resulta em `AMBIGUOUS_REFERENCE` para direita e no de baixo para `de baixo`.
- No navegador, com o layout real, o comportamento é coerente com o que se vê.

### B5. "texto" deve funcionar como grupo de propriedades

**Reprodução:** `crie um botão` → `deixe o texto do botão vermelho` resulta em `INVALID_VALUE_CATEGORY` (C_PROP_TEXT_CONTENT aceita só TEXT). `deixe o texto do botão com 18px` também falha.

**Correção:** use o mesmo mecanismo de `borda`. Crie um `PropertyGroupConcept` de texto com `bindingByValueCategory`:
- COLOR → `C_PROP_TEXT_COLOR`;
- TEXT → `C_PROP_TEXT_CONTENT`;
- SIZE → `C_PROP_FONT_SIZE` (novo, via dados, com mapeamento no renderer).

A escolha entre o sentido de entidade TEXT e o de grupo é feita pelo contexto sintático e pela categoria do valor, com score registrado. Sem `if` por palavra.

**Aceitação:**
- `deixe o texto do botão vermelho` → `textColor`;
- `deixe o texto do botão com 18px` → `fontSize`;
- `mude o texto do botão para "Sair"` → conteúdo;
- `crie um texto vermelho` → entidade TEXT;
- `crie uma caixa com texto "Olá"` → caixa com TEXT filho.

### B6. Candidato duplicado no mesmo token

**Reprodução:** o trace de `botão` mostra `C_ENT_BUTTON[EXACT:1.00] C_ENT_BUTTON[EXACT:0.96]`. As formas `botão` e `botao` normalizam para a mesma chave.

**Correção:**
- Mescle candidatos por `(conceptId, lexemeId)`, ficando com o maior score e guardando as SurfaceForms de origem.
- Remova da base as formas que só diferem por diacrítico (a indexação já os remove), ou ignore-as ao construir o índice.

**Aceitação:** nenhum token de nenhuma frase do dataset tem dois candidatos com o mesmo `conceptId`.

### B7. `Grammar.ts` com listas fixas ainda é usado

`src/engine/parser/Grammar.ts` mantém conjuntos fixos (`['um','uma',…]`, ordinais, `negation`…), e `src/eval/runner.ts` importa `FUNCTION_WORDS` dele. A métrica lexical usa uma lista diferente da que o motor usa.

**Correção:**
- Apague `Grammar.ts`.
- Todo consumidor usa o `GrammarIndex` derivado da base de conhecimento.
- Estenda o teste de arquitetura: nenhum arquivo em `src/` (exceto `src/knowledge/`) pode conter lista literal de palavras portuguesas.

### B8. Coordenação negativa e reflexivo

| Entrada | Hoje | Exigido |
|---|---|---|
| `crie um botão azul e não vermelho` | `UNCONSUMED_INPUT` | ou semântica definida e documentada, ou `UNSUPPORTED_OPERATION` explicando o motivo |
| `mova a caixa para depois dela mesma` | `UNCONSUMED_INPUT` ("mesma" sobra) + `INVALID_CONTAINMENT` | `dela mesma` resolvido como reflexivo, gerando só o diagnóstico de auto-relação |

### B9. Teste falhando

`final-phase.test.ts › relação relativa sem conteúdo reconhecido produz diagnóstico`: corrija o **código**, para que uma oração relativa sem conteúdo reconhecido gere `UNSUPPORTED_OPERATION` (com span da oração) em vez de `UNCONSUMED_INPUT`.

---

## 4. REQUISITOS AINDA INCOMPLETOS

| Item | Estado na auditoria | Exigido |
|---|---|---|
| `test:report` | o script existe, mas `public/test-report.json` não foi gerado e a UI não o lê | gerar o arquivo e exibi-lo na aba Testes, com data, contagem e falhas |
| `score.ts --dataset` | não existe (só `--json`) | seção 1.2 |
| A8 e2e por camada | asserções genéricas (offsets crescentes), não por caso | para **cada** um dos 14 casos: tokens esperados com offsets, MWEs, conceitos, AST, referências resolvidas, plano, árvore final, undo e redo, tudo com valores explícitos |
| A10 persistência | só `lexical.knowledgeBase.v1` no localStorage | provar por teste (com localStorage simulado) que base, **configurações**, **dataset de treino** e **histórico de versões** sobrevivem a reload; "restaurar padrão de fábrica" |
| A10 edição | não verificada | testes que editam pelo store, e conferência no painel, de cada tipo de conceito, MWE, classe gramatical e constraint/binding, com validação de integridade |
| A10 histórico | não verificado | comparar métricas entre versões da base, destacando regressões |
| A11 benchmark aproximado | não verificado | tempo de geração de candidatos com 100 / 1k / 10k / 100k formas, mostrando crescimento sublinear |

---

## 5. VALIDAÇÃO

1. `scripts/validate-sequences.ts` (rodável com `npx vite-node`). Para cada comando, imprime: árvore antes, frase, AST, plano, diagnósticos, árvore depois, propriedades e ordem dos nós, além de undo e redo no fim de cada sequência. Sequências:
   - §38;
   - todas as reproduções da seção 0.1;
   - todas as de B1–B9.
2. Navegador (`npm run dev`):
   - sequência §38;
   - D3, B1, B4 (`crie três botões` → `deixe o botão da direita azul`) e B5;
   - recarregar a página e conferir a persistência;
   - abrir as abas Métricas (com cobertura visível) e Testes (com o relatório do vitest);
   - console sem erros gerados pela aplicação.

   Sem acesso a navegador, declare isso no relatório. Não afirme validação visual que não fez.
3. Todos estes comandos precisam terminar limpos:
   ```
   npx tsc --noEmit
   npm test
   npm run build
   npm run test:report
   npx vite-node scripts/score.ts --dataset src/eval/data/regression.json
   ```
4. Nenhum arquivo de depuração deixado no projeto.

---

## 6. RELATÓRIO FINAL

Reescreva `RELATORIO.md`. Todo número e toda saída vêm de script executado de verdade. O relatório contém:

1. Tabela com D1–D11, A1–A11, M1–M3 e B1–B9: status, commits, testes que cobrem e saída real antes × depois.
2. `CHANGES.md` na íntegra.
3. Contagem de testes.
4. Métricas por conjunto, **com a cobertura** de cada uma. O conjunto `final-v1-compromised` aparece rotulado.
5. Benchmark completo.
6. Exemplos reais de AST e plano com spans.
7. Saída do `validate-sequences.ts`.
8. O que foi e o que não foi validado no navegador.
9. Limitações restantes.
10. `git log --oneline` desde o baseline.

---

## 7. CRITÉRIO DE PRONTO

- [ ] Git com baseline, um commit por item, e expectativas commitadas antes do código que as satisfaz.
- [ ] `CHANGES.md` escrito; `final.json` renomeado para comprometido; `score.ts --dataset` funcionando; nada em `audit/`.
- [ ] M1–M3: nenhuma métrica com denominador vazio aparece como 100%; cobertura visível; cobertura mínima do M2 atingida.
- [ ] B1–B9 corrigidos, com testes; a invariante de consumo de tokens passa em todo o dataset.
- [ ] Tudo da seção 0.1 continua valendo.
- [ ] Itens da seção 4 entregues.
- [ ] Nenhum teste enfraquecido.
- [ ] `tsc`, `test`, `build`, `test:report` e `score` limpos.
- [ ] Validação por script feita; validação no navegador feita ou declarada como não feita.
- [ ] `RELATORIO.md` gerado a partir da execução real.
