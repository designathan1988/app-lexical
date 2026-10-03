# Lacunas conhecidas

Registro honesto do que **não** está resolvido. Nada aqui foi escondido atrás de
um esperado afrouxado: os conjuntos de teste passam a 100%, mas o verificador
mede o que os testes cobrem — não a morfologia inteira.

## 1. Molduras estruturais pendentes de curadoria (122 de 422)

`frames.json` tem 300 molduras escritas à mão (verbos de controle,
desambiguação por preferência de seleção e os verbos das frases de teste) e 122
marcadas `"defaultTemplate": true`. Estas últimas têm a forma genérica
`ARG0 (SER_VIVO) / ARG1 (ENTIDADE)` e **não** descrevem a valência real.

Palavras-chave para o engenheiro que for curar: procure
`"defaultTemplate": true` no arquivo. O aplicador e o verificador aceitam-nas
como estão; nenhuma frase de teste depende delas para a desambiguação.

**Por que ficou assim:** escrever 422 molduras à mão, com preferências
verificadas, exigiria consultar a valência de cada verbo — trabalho de semanas.
As 300 escritas cobrem o essencial (controle, movimento, comunicação, ingestão,
troca, emoção, criação) e os 18 verbos de controle estão completos.

## 2. As três coleções latinas não escritas

As regras `-al`, `-ico`, `-ção`, `-vel` e `-dade` usam `LATINATE_STEM`, mas o
aplicador **não** gera radicais latinos: usa a estratégia popular
(`VERB_ROOT`/`MINUS_FINAL_VOWEL`) e só acerta os casos com **par declarado**.
Consequência prática: uma palavra nova cujo radical exija alternância latina
não declarada não será gerada nem analisada.

O que está coberto por pares declarados: `produzir → produção`,
`decidir → decisão`, `dividir → divisão`, `eleger → eleição`,
`descrever → descrição`, `reeleger → reeleição`, `ver → visível`,
`ler → legível`, `ouvir → audível`, `reverter → reversível`,
`destruir → destrutível`, `nação → nacional`, `comércio → comercial`,
`mundo → mundial`, `possível → possibilidade`, `móvel → imobilidade`.

O que **não** está: qualquer radical com supino latino fora dessa lista.

## 3. Concordância e flexão dos compostos

`COMP_JUST` e `COMP_AGLUT` **declaram** a regra de flexão do composto na nota
da regra (flexiona só o segundo elemento, ou ambos, conforme a determinação),
mas o aplicador **não a implementa**: `analyze('guarda-chuvas')` não casa o
plural. O verificador não cobra isso (os testes de composição usam o singular).

Faltam também: compostos com mais de dois elementos (`pé-de-moleque`),
compostos com hífen e preposição interna, e a concordância de gênero do
composto (`couve-flor` é feminino porque `couve` é).

## 4. Alomorfia limitada ao que está declarado

O aplicador confere cada hipótese regerando-a, então **não inventa** formas —
mas isso também significa que ele só acerta a alomorfia que os dados declaram.
Lacunas: alternância vocálica de raiz fora dos irregulares listados
(`medir → meço` está; um verbo novo de padrão análogo não estaria),
`-eiro` de base terminada em consoante, plurais metafônicos
(não cobertos: `pão → pães` está, mas o misto `-ão → -ãos/-ães/-ões` de
palavra nova não é decidível sem o dado).

## 5. Entradas com `confidence: MEDIUM`

- `LEX_CURTIR` (`curtir`) — sentido coloquial corrente no PB.
- `LEX_ADV_QUICA` (`quiçá`), `LEX_ADV_ALHURES` (`alhures`) — formas literárias.
- `LEX_ADV_QUANTO_ADV`, `LEX_ADV_COMO`, `LEX_ADV_QUANDO` — homógrafos de
  pronome/conjunção, isolados por id.
- `SUF_ECER` e `PAR_ES_ECER`, `PAR_ES_AR` — produtividade baixa, poucos membros.
- `LEX_VIVA` (`viva`) — a forma é sobretudo interjeição; o uso adjetival
  (`água-viva`) está registrado, o interjetivo não.

## 6. Duas regras com menos de 5 exemplos (avisos do verificador)

`PAR_ES_ECER` (3 exemplos) e `PAR_ES_AR` (3 exemplos). O padrão `es-…-ecer`/
`es-…-ar` **realmente** tem pouquíssimos membros correntes no PB: listar mais
exigiria inventar formas ou incluir arcaísmos. As duas regras declaram
`exampleCountJustified` e o verificador as reporta como **aviso**, não erro —
com a justificativa impressa no relatório.

## 7. Classes fechadas: escolhas e o que ficou de fora

Os numerais vão até mil (cardinais) e décimo (ordinais), como pedido. Ficaram
de fora: cardinais compostos além de mil (`dois mil`, `um milhão`) tratados como
composição e não como léxico; ordinais acima de décimo; as formas arcaicas
(`vós` está, as conjugações correspondentes não estão no léxico-semente porque
os paradigmas verbais cobrem `vós` por célula).

## 8. O que o verificador **não** testa

- Se a decomposição escolhida é a única possível: `analyze` devolve **todas** as
  leituras e o teste aceita a declarada. Uma palavra com leitura espúria não
  testada passa.
- Semântica composicional de verdade: a expressão (`RESULT_OF(REPETITION(x))`) é
  uma **árvore de funções**, não um sentido resolvido no grafo. A ligação com
  `graphRelation` existe em `semantic-functions.json`, mas ninguém a consome.
- Prosódia, acento e a relação entre acento e formação de palavra.
- As 80 frases: os tokens, as dependências e o grafo foram anotados à mão e
  **validados apenas estruturalmente** (relações conhecidas, root único, todo
  token governado). Nenhum parser os produziu — eles são o alvo para as etapas
  seguintes de sintaxe e grafo.
- Alomorfia de `-inho` em bases com ditongo (`herói → heroizinho`) e a
  alternância de registro (`-zinho` pejorativo).
