# PROMPT — Correção da análise de frases (falhas da verificação oculta)

## Contexto

Seu trabalho na branch `codex/sintaxe-significado` foi avaliado com **44 frases novas que você não viu**:
- ligações entre palavras corretas: 92%;
- sujeito: 100%;
- papéis do grafo: 95%;
- frases totalmente certas: 82%.

O resultado é bom, mas há **erros de generalização** que o gabarito e as suas frases extras não pegaram. Corrija **todos** os itens abaixo, nesta ordem.

**As frases da verificação oculta não estão no repositório e continuarão ocultas.** Os exemplos abaixo são **outros**: eles ilustram o fenômeno, não são as frases do teste. Depois da sua entrega, eu rodo de novo a verificação oculta e mais frases novas. Regra feita sob medida para os exemplos deste prompt vai falhar.

---

## 0. Regras (valem todas as do prompt anterior, mais estas)

1. **Siga o `AGENTS.md` da raiz do projeto.** Ele vale para todo trabalho novo e tem prioridade sobre este prompt. Em especial:
   - lógica nova não pode usar desvio condicional (`if`, `else`, `switch`, ternário ou equivalente);
   - lógica nova não pode usar expressão regular nem outra técnica de casamento de padrão;
   - nada de pares fixos de resposta.

   Por isso, **faça as correções nos dados** (regras JSON) interpretados pelos motores que já existem (`Tagger`, `DependencyParser`, `MeaningGraphBuilder`), estendendo o **formato** das regras quando preciso.

   Se algum item exigir lógica nova proibida pelo `AGENTS.md`, **pare naquele item**, explique o conflito no relatório (o que tentou, por que não dá) e siga para o próximo. **Não contorne.**
2. **Pesquise antes de corrigir:**
   - relações UD (https://universaldependencies.org/u/dep/index.html), em especial `nmod`, `obl`, `advcl`, `conj`, `cop`, `advmod`;
   - páginas do português (https://universaldependencies.org/pt/index.html);
   - contextos com varredura e barreira do CG-3 (https://edu.visl.dk/cg3/chunked/: posições `*n`, `BARRIER`, `CBARRIER`);
   - diretrizes AMR para `:poss`, `:degree`, `:op1…:opN` (https://github.com/amrisi/amr-guidelines/blob/master/amr.md).

   Cite no relatório a fonte de cada decisão.
3. **Testes primeiro.** Para cada item:
   - commit `TEST-EXPECTATION: ...` com **pelo menos 6 frases suas, novas**, de vocabulário variado e fora do gabarito, no novo arquivo `tests/fixtures/sentences-extra-2.json` (mesmo formato de `tests-sentences.json`);
   - depois, os commits de correção.

   Não reaproveite só os exemplos deste prompt: escreva frases diferentes.
4. **Nada piora.**
   - Os 587 testes atuais continuam verdes em todo commit.
   - As métricas do gabarito (80 frases) e das extras (20) **não podem cair**; imprima as de antes e as de depois.
   - Nenhum limiar é afrouxado e nenhum teste antigo é editado.
5. **Sem aumento de escopo.**
   - Não mexa em persistência (IndexedDB/`KnowledgeBaseStore`), layout ou funcionalidades fora desta lista.
   - Não altere `research/morfologia/tests-sentences.json`, exceto por `GOLD-FIX` justificado como antes.
6. Commits na mesma branch `codex/sintaxe-significado`; sem `--amend`, `rebase` ou `push --force`. Todo texto em **português do Brasil**.

---

## 1. Os erros a corrigir

### 1.1 Sintagma com "de" depois de substantivo se liga ao substantivo (`nmod`), não ao verbo

**Erro observado:** em "SUJEITO + de + NOME + verbo", o "de + nome" foi ligado ao verbo como `obl`. O grafo passou a dizer que o verbo tinha esse nome como objeto: "o X do Y come" virou "X come Y". É o erro mais grave.

**Correto (UD):** um PP adjacente a um núcleo nominal se liga a esse nome como `nmod`, com o `case` no PP.
- Só se liga ao verbo (`obl`) quando a **moldura do verbo** declara aquela preposição como argumento e não há núcleo nominal mais próximo que o aceite.
- Vale também para contrações: do, da, dos, das, no, na, pelo…

Exemplos ilustrativos:
- "A porta da cozinha está aberta."
- "O carro do meu irmão quebrou."
- "Ela gosta do jardim da avó": *gostar de* → `obl` em jardim; *da avó* → `nmod` em jardim.
- "Os livros da escola chegaram."

**Grafo:** o PP genitivo vira `:poss` ou `:mod` do nome, conforme a diretriz AMR (posse → `:poss`). Documente a regra. Nunca vira argumento do verbo.

### 1.2 Cópula com advérbio entre ela e o predicativo; "foi" de *ser* × *ir*

**Erro observado:** "SUJEITO foi muito ADJ" foi lido com *ir* e o adjetivo ficou sem cópula. A regra de cópula só olhava a palavra imediatamente seguinte.

**Correto:**
- a cópula seleciona o predicativo **saltando advérbios de grau e de modo** (varredura com barreira, como no CG-3);
- formas homógrafas de *ser* e *ir* (foi, fomos, foram, fora…) se resolvem pelo contexto:
  - predicativo (ADJ/NOUN/particípio, mesmo com advérbio no meio) → *ser*, `cop`;
  - "a/para + lugar", infinitivo ou advérbio de lugar → *ir*.

Exemplos:
- "A prova foi muito difícil."
- "O jantar estava bem quente."
- "Ele foi à feira."
- "Nós fomos dormir tarde."
- "A viagem foi realmente longa."

### 1.3 Oração subordinada copular (porque/quando/se + ser/estar + adjetivo)

**Erro observado:** em "SUJEITO VERBO ... porque estou ADJ", a raiz da frase passou a ser o adjetivo da subordinada e o verbo principal virou `dep`. O grafo perdeu a oração principal inteira.

**Correto:**
- a raiz é o predicado da **oração principal**;
- a subordinada copular tem como núcleo o predicativo, ligado ao verbo principal como `advcl`, com `mark` (porque/quando/se) e `cop` no predicativo;
- vale com a subordinada antes ou depois da principal.

**Grafo:** `:cause`, `:condition` e `:TIME`, conforme os marcadores de `adjunct-roles.json`.

Exemplos:
- "Ele saiu cedo porque estava cansado."
- "Quando está frio, nós ficamos em casa."
- "Se o dia for bonito, eles vão à praia."
- "Eu não trabalho hoje porque sou novo aqui."

### 1.4 Enumeração com vírgulas

**Erro observado:** em "VERBO A, B e C", cada item virou um `obj` separado do verbo. Só o último par virou `conj`, e o grafo ficou com dois `:ARG1`.

**Correto (UD):**
- o 1º item é o núcleo;
- os demais são `conj` do 1º;
- cada vírgula é `punct` do item que vem **depois** dela;
- o `cc` ("e"/"ou") fica no último item;
- vale para sujeitos, objetos, adjetivos e verbos coordenados ("Eu lavo, seco e guardo a louça").

**Grafo:** um único `and` (ou `or`) com `:op1 … :opN`, e um único `:ARG1`.

Exemplos:
- "Ela comprou maçã, banana e uva."
- "João, Maria e Pedro chegaram."
- "Nós cantamos, dançamos e comemos."
- "Quer chá, café ou água?"

### 1.5 Lema de adjetivos com feminino ou plural irregular

**Erro observado:** "boa" saiu com lema "boa" e conceito "boa" no grafo.

**Correto:** boa/bons/boas → *bom*; má/maus/más → *mau*.

Pesquise e corrija **todas** as raízes adjetivais da semente cujo paradigma atribuído não gera o feminino e o plural reais (não só *bom*): use paradigmas próprios, no formato existente. O grafo usa sempre o **lema**.

Teste:
- o lema e os traços de cada forma flexionada por **geração** a partir do paradigma;
- uma frase copular com cada forma ("As frutas estão boas.").

### 1.6 Advérbio de grau modificando advérbio ou adjetivo

**Erro observado:** em "VERBO muito bem", o "muito" foi ligado ao verbo.

**Correto (UD):** advérbio de grau diante de ADV/ADJ é `advmod` **desse** ADV/ADJ (muito bem, bem devagar, tão cedo, muito cansado, pouco claro).

**Grafo:** `:degree` no conceito modificado, não no verbo.

### 1.7 Sintagma preposicional depois de complemento infinitivo

**Erro observado:** em "SUJEITO quer VIAJAR para LUGAR", o PP foi ligado a *querer*.

**Correto:**
- o PP que segue o infinitivo de um `xcomp` se liga ao verbo **mais próximo** (o infinitivo), salvo quando a moldura do verbo principal declara aquela preposição e a do infinitivo não;
- registre no trace qual moldura decidiu.

Exemplos:
- "Ela precisa voltar para casa."
- "Nós tentamos chegar à estação."
- "Eles começaram a trabalhar na fábrica."

### 1.8 Lema dos pronomes de tratamento no plural

"vocês" tem lema **você**, com `Number=Plur`, como no Bosque (confira e cite). Conceito no grafo: o lema. O mesmo vale para outros pronomes de tratamento flexionados, se houver.

### 1.9 Mensagem do chat para frase que não é comando

**Hoje:** uma frase comum ("Eu quero tomar café.") mostra no chat **"Bloqueado: N erro(s)"**, embora a análise geral esteja certa.

**Correto:**
- quando a entrada não é comando do construtor e a análise geral produz árvore e grafo sem erro, o chat mostra **"Frase analisada (não é um comando do construtor)"**, com um link para as abas Classes/Sintaxe/Significado;
- o documento continua sem alteração e os diagnósticos continuam disponíveis na aba Diagnósticos;
- **não** mude o comportamento do compilador de comandos nem os diagnósticos (os testes de regressão de `UNKNOWN_WORD` continuam valendo); só a mensagem da interface.

Teste de interface (no padrão de `tests/language-ui.test.ts`) e verificação no navegador.

---

## 2. Entrega

1. Seção nova em `RELATORIO_SINTAXE.md`: **"Correções da verificação oculta"**. Para cada item:
   - a fonte pesquisada (link);
   - a regra de dados criada ou alterada (id);
   - as frases de teste;
   - o resultado.

   Inclua também:
   - a tabela de métricas **antes × depois** (gabarito, extras, extras-2);
   - a saída real de `npm test`, `npx tsc --noEmit` e `npm run build`;
   - a lista do que ainda falha;
   - os itens bloqueados pelo `AGENTS.md`, se houver, com a explicação.
2. Capturas no navegador (`npm run dev`):
   - uma frase de cada item;
   - a mensagem nova do chat;
   - console sem erros.
3. Critério de pronto:
   - [ ] itens 1.1 a 1.9 corrigidos, ou bloqueados com explicação;
   - [ ] suíte 100% verde;
   - [ ] métricas antigas não caíram;
   - [ ] `extras-2` com ligações ≥ 95% e papéis do grafo ≥ 95%;
   - [ ] nenhuma palavra do português no TypeScript da camada geral;
   - [ ] nenhum dado externo importado;
   - [ ] nada fora do escopo alterado.

**Lembrete:** a próxima avaliação usa **frases que você não verá**. Generalize.
