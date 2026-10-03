# Mudanças no esperado (testes) — com justificativa

Cada linha registra um esperado que foi **corrigido**, com o motivo linguístico
ou estrutural. Nenhuma correção foi feita para fazer um teste passar: os testes
foram escritos antes das regras e as divergências foram investigadas uma a uma.
Onde a divergência era erro do **teste**, o teste mudou; onde era erro da
**regra**, a regra mudou (e essas correções não aparecem aqui).

## `tests-derivation.json`

| id | palavra | antes | depois | motivo |
|---|---|---|---|---|
| `der-m075` | subdivisão | root `LEX_DIVIDIR`, cadeia `SUF_CAO>PRE_SUB` | root `LEX_DIVISAO`, cadeia `PRE_SUB` | `divisão` é lema-semente (substantivo do léxico). Havendo a leitura direta, ela é a econômica: `sub-` cola no nome `divisão`. A leitura por `dividir` continua alcançável e não foi perdida — apenas não é a primeira. |
| `der-a004` | embora | root `LEX_EM`, cadeia `COMP_AGLUT` | root `LEX_CONJ_EMBORA`, cadeia vazia | `embora` entrou no léxico-semente como conjunção (classe fechada). A aglutinação `em + boa + hora` é a etimologia, mas a palavra sincronicamente **é** um lema; a leitura como lema é a correta. |
| `der-l015` | embora | root `LEX_EM`, cadeia `COMP_AGLUT` | root `LEX_CONJ_EMBORA`, cadeia vazia | idem acima. |
| `der-m025` | reescrita | cadeia `[REG_A]` (parando em `reescrever`) | cadeia `[PRE_RE, REG_A]` | A cadeia curta era **inconsistente com os casos irmãos**: `reeleição` e `retomada` exigem a cadeia completa. Uniformizou-se pela leitura completa (a regra passa a ser sempre descer até a raiz); a leitura curta continua disponível, mas não é o esperado. |
| `der-p019` | afundar | root `LEX_FUNDO` | root `LEX_FUNDO_N` | `LEX_FUNDO` é id **do domínio** (`src/knowledge/knowledgeBase.ts`, propriedade de cor de fundo). O contrato proíbe repetir ids existentes, então a raiz da semente recebeu sufixo `_N`. |
| `der-s083` | artístico | root `LEX_ARTISTA`, cadeia `[SUF_ICO]` | root `LEX_ARTE`, cadeia `[SUF_ISTA, SUF_ICO]` | `artista` é **derivável** de `arte` por `SUF_ISTA` e está em `LEX_ARTE.attestedDerivations`. Listá-lo também como raiz criaria duas fontes para a mesma palavra; a semente ficou sem `LEX_ARTISTA` e a derivação é a análise. |
| `der-s061`, `der-s143`, `der-m081`, `der-m085` | nacionalismo, internacional, internacionalização, antinacionalista | root `LEX_NACIONAL` | root `LEX_NACAO`, com `SUF_AL` no início da cadeia | `nacional` é derivado de `nação` (`SUF_AL`), não raiz. Idem ao caso de `artista`. |
| `der-s039` | brancura | base `branco` | base `amargo` | `branco` é palavra **do domínio** (`LEX_BRANCO`, cor). Substituída por `amargo` (adjetivo da semente, mesmo sufixo `-ura`, mesmo padrão). |
| `der-r004` | troca | root `LEX_TROCAR_SEM` | root `LEX_TROCAR_GERAL` | Coerência de nomenclatura: o id da exceção é `_GERAL` (como `LEX_FAZER_GERAL`), não `_SEM`. |
| `der-n076` | podível | root ausente | bloqueio `BLOCKED_BY:possível` | O negativo original era `querível`, que **existe** em jargão jurídico ("questão querível") — logo não servia como não-palavra. Trocado por `podível`, efetivamente bloqueado por `possível`. |


## `tests-inflection.json`

| id | antes | depois | motivo |
|---|---|---|---|
| `inf-035`, `inf-040` | `features: "Number=Plur"` | `features: "Gender=Masc\|Number=Plur"` | No modelo do projeto, o **gênero do substantivo é inerente ao lema** e as células do paradigma trazem `Gender`. Sem o traço, a chave não casa nenhuma célula — e a chave canônica do projeto inclui `Gender` quando ele é marcado. |
| `inf-038` | `lemmatize("professores")` esperando `Number=Plur` | `Gender=Masc\|Number=Plur` | idem: a forma gerada carrega o gênero inerente. |
| `inf-129`, `inf-130` | paradigma `V_UIR` para `construir` | paradigma `V_CONSTRUIR` | `construir` tem 3sg/3pl do presente em `-ói`/`-óem` (`constrói`, `constroem`) — irregularidade que **não** é do padrão `-uir` (`contribuo/contribui`). O paradigma completo está em `irregular-verbs.json`. |
| `inf-293` | `Tense=3` | `Tense=Pres` | erro de digitação na chave de traços. |

## `tests-sentences.json`

| id | correção | motivo |
|---|---|---|
| `sent-020` a `sent-024`, `sent-030` | `cop` passou a depender do **predicativo** (que é o `root`), não do verbo de ligação | Padrão UD para orações copulativas: o predicativo é a raiz e o verbo de ligação é `cop`. A anotação anterior ligava `cop` a si mesmo. |
| `sent-033` | `Tense=3` → `Tense=Pres` | erro de digitação. |

## Teste novo de classes fechadas

- `tests/language-closed-class.test.ts`: a expectativa para o artigo feminino `a`
  passou de lema `a` para lema `o`. A convenção do Bosque registra `a` e `as`
  como formas do lema `o`; a preposição `a` continua com lema `a`.
  Fonte: https://universaldependencies.org/treebanks/pt_bosque/pt_bosque-pos-DET.html.
  Nenhum item dos gabaritos de pesquisa foi alterado.
- `tests/language-inflection.test.ts`: a métrica lexical usa a forma de cada
  token do gabarito como unidade. O gabarito mantém contrações (`na`, `ao`)
  em uma linha e expressões (`São Paulo`, `por favor`) em outra, enquanto o
  tokenizador geral produz as palavras sintáticas do CoNLL-U. Comparar por
  índice dava deslocamentos artificiais. A unidade de superfície é compatível
  com a distinção entre token e palavra do formato CoNLL-U:
  https://universaldependencies.org/format.html#words-tokens-and-empty-nodes.
- `tests/language-closed-class.test.ts`: `que` passa a admitir também `DET`
  interrogativo, mantendo `PRON` e `SCONJ`. O Bosque registra `que` com
  `PronType=Int` na classe `DET`:
  https://universaldependencies.org/treebanks/pt_bosque/index.html.

## Correções feitas nos **dados** (não nos testes)


Registradas por transparência, porque mudaram o comportamento do analisador:

- **Prefixos passaram a preservar a classe** (`output: {}` em vez de
  `output.pos` fixo). Sem isso, `PRE_INTER` declarava saída `NOUN` e a análise de
  `internacionalização` escolhia a ordem errada. Prefixo não muda a classe da
  base — é propriedade linguística, não ajuste para o teste.
- **Lexicalização restrita a `despedir` e `descrever`.** `desligar`,
  `descobrir` e `descarregar` chegaram a ser marcados como lexicalizados e a
  marcação foi **removida**: o sentido deles é composicional (`REVERSAL(ligar)`)
  e os testes estavam certos em exigi-lo.
- **`SUF_ADA` restrita a nomes.** O `-ada` deverbal pertence à `REG_A`
  (`caçada`, `tomada`); manter `SUF_ADA` aceitando verbos criava uma segunda
  análise para as mesmas formas.
- **`SUF_NTE` e as demais regras de classe verbal usam `VERB_ROOT`**, mesmo
  quando a estratégia declarada é outra: `falar → falante`, não `falaante`.
- **`anti-` dobra o `s`** (`social → antissocial`) e **`des-` elide o `e-`**
  (`escrever → descrever`); **`in-`** trata `estável → instável` e
  `móvel → imóvel` como pares declarados (alternâncias reais, não regra geral).
