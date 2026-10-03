# CONTRATO de ids — pesquisa de morfologia

Este arquivo fixa os identificadores usados por todos os arquivos de
`research/morfologia/`. Nenhum arquivo pode inventar id fora desta lista.

## 1. Chave de traços (formato exato do projeto)

Ordem canônica fixa: `Gender`, `Number`, `Person`, `Mood`, `VerbForm`, `Tense`, `Degree`.
Ex.: `Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres`.
Valores: Gender ∈ Masc|Fem|Neut|Inv; Number ∈ Sing|Plur|Inv; Person ∈ 1|2|3;
Mood ∈ Ind|Sub|Imp|Cnd; VerbForm ∈ Fin|Inf|Ger|Part; Tense ∈ Pres|Past|Imp|Fut; Degree ∈ Dim.

## 2. Ids de lema-semente: `LEX_<LEMA SEM ACENTO EM MAIÚSCULAS>`

`pão` → `LEX_PAO`, `café` → `LEX_CAFE`, `água` → `LEX_AGUA`, `história` → `LEX_HISTORIA`.
Sentido: `<id-do-lema sem LEX_>.<CHAVE>` → `tomar.INGERIR` (sentido do LEX_TOMAR).
A moldura do sentido usa o MESMO id: frame `tomar.INGERIR`.

### Ids PROIBIDOS (já existem em src/knowledge/knowledgeBase.ts):
LEX_CRIAR, LEX_ADICIONAR, LEX_COLOCAR, LEX_BOTAR, LEX_FAZER, LEX_INSERIR, LEX_MUDAR,
LEX_DEIXAR, LEX_ALTERAR, LEX_TROCAR, LEX_PINTAR, LEX_APAGAR, LEX_REMOVER, LEX_EXCLUIR,
LEX_DELETAR, LEX_TIRAR, LEX_MOVER, LEX_SELECIONAR, LEX_MARCAR, LEX_PODER_OP,
LEX_QUERER_OP, LEX_GOSTAR_OP, LEX_BOTAO, LEX_CAIXA, LEX_CONTAINER, LEX_TEXTO,
LEX_BORDA, LEX_FUNDO, LEX_COR, LEX_ROTULO, LEX_CONTEUDO, LEX_AZUL, LEX_VERMELHO,
LEX_VERDE, LEX_AMARELO, LEX_PRETO, LEX_BRANCO, LEX_CINZA, LEX_LARANJA, LEX_ROXO,
LEX_REDONDO, LEX_AZUL_CLARO, LEX_AZUL_ESCURO, LEX_VERDE_CLARO, LEX_VERDE_ESCURO,
LEX_CINZA_CLARO, LEX_ORD_*, LEX_CARD_*, LEX_VAGUE_*, LEX_NAO, LEX_SEM, LEX_MENOS,
LEX_MAIS, LEX_EXCETO, LEX_SALVO, LEX_COM, LEX_PARA, LEX_DE, LEX_E, LEX_O, LEX_UM,
LEX_TODO, LEX_OUTRO, LEX_EU, LEX_VOCE, LEX_ELE, LEX_ESSE, LEX_ESTE, LEX_AQUELE,
LEX_MESMO, LEX_DENTRO, LEX_DEPOIS, LEX_ANTES, LEX_LADO, LEX_DIREITA, LEX_ESQUERDA.

### Exceção:
- `fazer` (geral, com todos os sentidos) usa `LEX_FAZER_GERAL` (LEX_FAZER é do domínio).

## 3. Paradigmas EXISTENTES no projeto (não re-propor):
V_AR, V_AR_GAR, V_AR_CAR, V_AR_CED, V_ER, V_ER_GER, V_IR, V_FAZER, V_POR, V_TER,
V_ESTAR, V_SER, V_PODER, V_QUERER, V_TRAZER, V_IR_VERB, N_S, N_AO_OES, N_AO_AES,
N_AO_AOS, N_L_IS, N_R_Z_ES, N_INVARIANT, ADJ_O, ADJ_L, ADJ_UNIFORM, ADJ_INVARIANT,
DET_E, DET_UM.

## 4. Paradigmas PROPOSTOS (inflection-paradigms-proposed.json):
N_M_NS, N_AL_AIS, N_EL_EIS, N_OL_OIS, N_UL_UIS, N_IL_IS, N_IL_EIS, N_SX_INV,
N_OR_ORES_ORA, ADJ_ES_ESA, ADJ_OR_ORA, ADJ_AO_A, ADJ_AO_ONA, V_EAR, V_IAR_REG,
V_UIR, V_GER, V_CER, V_GUER, V_CAR, V_ODIAR.

## 5. Verbos irregulares (irregular-verbs.json), paradigma `V_<LEMA>`:
V_HAVER, V_VIR, V_DIZER, V_SABER, V_VER, V_DAR, V_LER, V_CRER, V_OUVIR, V_PEDIR,
V_MEDIR, V_DORMIR, V_SAIR, V_CAIR, V_CABER, V_VALER, V_PERDER, V_SEGUIR, V_SENTIR,
V_SERVIR, V_SUBIR, V_FUGIR, V_RIR, V_CONSTRUIR, V_DESTRUIR, V_CONSEGUIR,
V_PREFERIR, V_MENTIR, V_COBRIR, V_DESCOBRIR, V_ABRIR.

## 6. Regras de derivação (affix-rules.json):
SUF_DOR, SUF_NTE, SUF_CAO, SUF_MENTO, SUF_VEL, SUF_ADE, SUF_EZ, SUF_URA, SUF_OSO,
SUF_EIRO, SUF_ISTA, SUF_ISMO, SUF_IZAR, SUF_IFICAR, SUF_ECER, SUF_AL, SUF_ICO,
SUF_ES, SUF_ENSE, SUF_ADA, SUF_AGEM, SUF_INHO, SUF_AO_AUG, SUF_MENTE, PRE_RE,
PRE_DES, PRE_IN, PRE_PRE, PRE_SUPER, PRE_SUB, PRE_INTER, PRE_ANTI, PRE_AUTO,
PRE_CONTRA, PAR_A_ECER, PAR_EN_ECER, PAR_ES_ECER, PAR_A_AR, PAR_EN_AR, PAR_ES_AR,
REG_A, REG_O, REG_E, CONV_INF_NOUN, CONV_ADJ_NOUN, CONV_PART_ADJ, COMP_JUST,
COMP_AGLUT.

## 7. Funções de significado (semantic-functions.json, já escritas):
AGENT_OF, INSTRUMENT_OF, PLACE_OF, ACTION_OF, RESULT_OF, POSSIBLE_PASSIVE,
QUALITY_OF, MANNER, FULL_OF, PROFESSION_OR_CONTAINER, COLLECTIVE, ADHERENT,
DOCTRINE, CAUSE_TO_BE, BECOME, NEGATION, REVERSAL, REPETITION, PRIOR, EXCESS,
SUBORDINATE, BETWEEN, OPPOSITE, SELF_REFLEXIVE, AGAINST, DIMINUTIVE, AUGMENTATIVE,
RELATIONAL_ADJ, NATIONALITY_ORIGIN, CONVERSION.

## 8. Tipos semânticos (semantic-types.json, já escritos):
ENTIDADE, CONCRETO, ABSTRATO, SER_VIVO, PESSOA, ANIMAL, PLANTA, OBJETO, ALIMENTO,
BEBIDA, REMEDIO, VEICULO, FERRAMENTA, INSTRUMENTO, ELEMENTO_DE_INTERFACE, MOVEL,
VESTUARIO, MATERIAL, NATUREZA, PARTE_DO_CORPO, LUGAR, DINHEIRO, EVENTO, ACAO,
PROCESSO, COMUNICACAO, ESTADO, QUALIDADE, FORMA, QUANTIDADE, MEDIDA, TEMPO,
INFORMACAO, SENTIMENTO, RELACAO, INSTITUICAO, RESULTADO, GRUPO, COR, TAMANHO.

## 9. Partes do discurso (projeto): NOUN, VERB, ADJECTIVE, ADVERB, PREPOSITION,
PRONOUN, NUMERAL, CONJUNCTION, DETERMINER.

## 10. Raízes OBRIGATÓRIAS do léxico-semente
(todas precisam existir em seed-roots.json; os testes de derivação só usam bases desta lista)

Verbos: abrir, agir, amar, andar, armar, assistir, atacar, beber, caber, cair,
cantar, casar, chorar, cobrir, colher, comer, comunicar, comprar, construir,
contar, cortar, crer, criar, dançar, dar, decidir, dever, dirigir, dizer, dormir,
escrever, estudar, falar, fazer, fechar, fugir, gastar, gostar, guardar, haver,
informar, ir, jantar, jogar, lavar, ler, ligar, medir, mentir, montar, morar,
morrer, ouvir, pagar, passear, pedir, perder, pescar, pintar, poder, precisar,
preferir, produzir, querer, reciclar, rir, saber, sair, sentir, seguir, ser,
servir, subir, ter, tocar, tomar, trabalhar, usar, vender, vencer, ver, vir,
viajar, viver.

Substantivos: água, análise, animal, arte, avião, banho, boi, café, câmbio,
capital, carne, carta, casa, ceará (Ceará), chefe, cheiro, china (China), chuva,
cidade, ciência, colher, comércio, controle, coração, criança, cultura, decisão,
defesa, dia, dinheiro, divisão, dente, escola, estima, faca, ferro, flor, folha,
frança (França), futebol, gosto, herói, história, homem, informação, japão (Japão),
jornal, leite, livro, luz, mão, manhã, mar, medo, menino, mercado, mesa, mundo,
nação, noite, país, pássaro, pau, pão, pé, pessoa, perigo, piano, plano, pluma,
política, porta, praia, rua, sol, solo, suficiência, tempo, título, trabalho,
tristeza, veneno, vírus, voz.

Adjetivos: alto, amargo, ardente, baixo, belo, bom, bonito, capaz, certo, claro,
doce, duro, fácil, feliz, feminino, fino, forte, fraco, fresco, frio, gordo,
grande, injusto, jovem, justo, largo, legal, leal, lento, livre, maduro, mau,
moderno, moral, nacional, normal, novo, pequeno, podre, popular, possível, pobre,
puro, quente, rápido, real, rico, simples, social, sólido, triste, útil, velho,
verdadeiro.

Advérbios não derivados: agora, ali, ainda, amanhã, antes, aqui, assim, bem, cá,
cedo, depressa, depois, devagar, hoje, já, jamais, lá, logo, longe, mal,
muito, nunca, ontem, perto, pouco, sempre, sim, talvez, tarde.

### Raízes ADICIONAIS exigidas pelos testes (fora da lista acima, mas obrigatórias):
Verbos: aceitar, ajudar, alcançar, assar, avaliar, beijar, bater, brigar,
caçar, carregar, combater, conquistar, consumir, correr, descansar, dividir,
eleger, entregar, entrar, errar, esquecer, falhar, gritar, indicar, integrar,
jogar, limpar, morar, olhar, partir, pegar, pensar, pilotar, pisar, portar,
pôr (id LEX_POR), preservar, quebrar, reverter, sacar, superar, utilizar,
valorizar, virar.
Substantivos: amapá (Amapá), arco, barco, brasil (Brasil), brasília (Brasília),
cabeça, cachorro, classe, copo, couve, espinho, feira, filho, fogo, garrafa,
holanda (Holanda), íris, lata, louça, natal, papo, papel, pedra, perna, piauí
(Piauí), porco, portugal (Portugal), quinta, retrato, rolha, roupa, são paulo
(São Paulo), tocantins (Tocantins).
Adjetivos: amargo, calmo, curto, escuro, estável, feio, frio, inflamatório,
longo, magro, morno, móvel, possível, próximo, rápido, surdo, útil, vazio,
viva.
Exceção de id para palavra do domínio: `trocar` (domínio tem LEX_TROCAR) usa
`LEX_TROCAR_GERAL`; `fazer` usa `LEX_FAZER_GERAL`.

Observação: cores (azul, vermelho, verde…) e palavras do domínio (botão, caixa,
texto) NÃO entram na semente — já existem no léxico do domínio.
