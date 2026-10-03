// Gera frames.json: molduras de argumentos (estilo PropBank) para CADA sentido
// de verbo-semente. As molduras abaixo são escritas à mão (verbos de controle,
// desambiguação por preferência de seleção e verbos das frases de teste); os
// demais sentidos recebem uma moldura estrutural padrão (ARG0/ARG1 com
// preferências genéricas), marcada "defaultTemplate": true.
// Rode com: node research/morfologia/ref/build-frames.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(join(HERE, '..', 'seed-roots.json'), 'utf8'));

const f = (id, roles, opts = {}) => {
  if (!roles) return null; // placeholder para sentido cuja moldura é escrita em outro ponto
  return {
    id,
    roles,
    syntax: opts.syntax ?? Object.keys(roles).map((r) => ({ [r]: r === 'ARG0' ? 'nsubj' : 'obj' })),
    examples: opts.examples ?? [],
    ...(opts.control ? { control: opts.control, complement: opts.complement ?? 'xcomp' } : {}),
    ...(opts.extra ?? {})
  };
};

const HAND = [
  // --- Desambiguação central (tomar) ---
  f('tomar.INGERIR', {
    ARG0: { label: 'quem ingere', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é ingerido', prefers: ['BEBIDA', 'ALIMENTO', 'REMEDIO'] }
  }, { examples: ['Eu tomo café.', 'Ela tomou o remédio.'] }),
  f('tomar.CONQUISTAR', {
    ARG0: { label: 'quem conquista', prefers: ['PESSOA', 'GRUPO'] },
    ARG1: { label: 'o que é conquistado', prefers: ['LUGAR', 'ENTIDADE'] }
  }, { examples: ['O exército tomou a cidade.'] }),
  f('tomar.EMBARCAR', {
    ARG0: { label: 'quem embarca', prefers: ['PESSOA'] },
    ARG1: { label: 'veículo', prefers: ['VEICULO'] }
  }, { examples: ['Eu tomei o ônibus.', 'Ela tomou o metrô.'] }),
  // --- Beber / comer ---
  f('beber.INGERIR', {
    ARG0: { label: 'quem bebe', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é bebido', prefers: ['BEBIDA'] }
  }, { examples: ['Ela bebe água.'] }),
  f('beber.ALCOOL', {
    ARG0: { label: 'quem bebe', prefers: ['PESSOA'] }
  }, { examples: ['Ele bebe demais.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('comer.INGERIR', {
    ARG0: { label: 'quem come', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é comido', prefers: ['ALIMENTO'] }
  }, { examples: ['O homem come pão.'] }),
  f('comer.CONSUMIR', {
    ARG0: { label: 'quem consome', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é consumido', prefers: ['DINHEIRO', 'ENTIDADE'] }
  }, { examples: ['Os impostos comem o salário.'] }),
  // --- Controle e auxiliares ---
  f('querer.DESEJAR', {
    ARG0: { label: 'quem deseja', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é desejado', prefers: ['ENTIDADE', 'ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu quero tomar café.', 'Ela quer um carro.'] }),
  f('querer.AMAR', {
    ARG0: { label: 'quem ama', prefers: ['PESSOA'] },
    ARG1: { label: 'a pessoa amada', prefers: ['PESSOA'] }
  }, { examples: ['Eu quero bem os meus filhos.'] }),
  f('poder.POSSIBILIDADE', {
    ARG0: { label: 'quem pode', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é possível', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu posso ajudar você.'] }),
  f('poder.PERMISSAO', {
    ARG0: { label: 'quem é autorizado', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é permitido', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Você pode entrar.'] }),
  f('precisar.PRECISAR', {
    ARG0: { label: 'quem precisa', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é necessário', prefers: ['ENTIDADE', 'ACAO'] }
  }, { control: 'SUBJECT', examples: ['Ele precisa de ajuda.', 'Eu preciso dormir.'] }),
  f('gostar.GOSTAR', {
    ARG0: { label: 'quem gosta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é apreciado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu gosto de café.'] }),
  f('gostar.GOSTAR_DE_INF', {
    ARG0: { label: 'quem gosta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'atividade apreciada', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu gosto de tomar café.'] }),
  f('ir.MOVIMENTO', {
    ARG0: { label: 'quem vai', prefers: ['SER_VIVO'] },
    ARG1: { label: 'destino', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu vou à escola.'] }),
  f('ir.FUTURO', {
    ARG0: { label: 'quem vai', prefers: ['SER_VIVO'] },
    ARG1: { label: 'ação futura', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Nós vamos viajar amanhã.'] }),
  f('vir.VIR', {
    ARG0: { label: 'quem vem', prefers: ['SER_VIVO'] },
    ARG1: { label: 'origem/destino', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela vem de longe.'] }),
  f('tentar.TENTAR', {
    ARG0: { label: 'quem tenta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que se tenta', prefers: ['ACAO', 'ENTIDADE'] }
  }, { control: 'SUBJECT', examples: ['Ela tenta abrir a porta.'] }),
  f('conseguir.CONSEGUIR', {
    ARG0: { label: 'quem consegue', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é conseguido', prefers: ['ENTIDADE', 'ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu consegui terminar o trabalho.'] }),
  f('começar.INICIAR', {
    ARG0: { label: 'quem começa', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que começa', prefers: ['ACAO', 'ENTIDADE'] }
  }, { control: 'SUBJECT', examples: ['Eu começo a trabalhar cedo.'] }),
  f('dever.OBRIGACAO', {
    ARG0: { label: 'quem deve', prefers: ['SER_VIVO'] },
    ARG1: { label: 'obrigação', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Você deve estudar.'] }),
  f('dever.DIVIDA', {
    ARG0: { label: 'quem deve', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é devido', prefers: ['DINHEIRO'] },
    ARG2: { label: 'credor', prefers: ['PESSOA'] }
  }, { examples: ['Eu devo dinheiro ao banco.'] }),
  f('saber.SABER', {
    ARG0: { label: 'quem sabe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que se sabe', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu sei que você trabalha muito.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'ccomp' }] }),
  f('saber.SABER_INF', {
    ARG0: { label: 'quem sabe', prefers: ['PESSOA'] },
    ARG1: { label: 'habilidade', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Ela sabe nadar.'] }),
  f('decidir.DECIDIR', {
    ARG0: { label: 'quem decide', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é decidido', prefers: ['ENTIDADE', 'ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu decidi viajar.'] }),
  f('pretender.PRETENDER', {
    ARG0: { label: 'quem pretende', prefers: ['PESSOA'] },
    ARG1: { label: 'intenção', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Ela pretende mudar de casa.'] }),
  f('costumar.COSTUMAR', {
    ARG0: { label: 'quem costuma', prefers: ['PESSOA'] },
    ARG1: { label: 'hábito', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu costumo acordar cedo.'] }),
  f('continuar.CONTINUAR', {
    ARG0: { label: 'quem continua', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que continua', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Ela continuou trabalhando.'] }),
  f('resolver.RESOLVER', {
    ARG0: { label: 'quem resolve', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é resolvido', prefers: ['ENTIDADE', 'ACAO'] }
  }, { control: 'SUBJECT', examples: ['Ele resolveu ficar.'] }),
  f('pensar.PRETENDER', {
    ARG0: { label: 'quem pensa', prefers: ['PESSOA'] },
    ARG1: { label: 'intenção', prefers: ['ACAO'] }
  }, { control: 'SUBJECT', examples: ['Eu penso em viajar.'] }),
  f('esperar.TER_EXPECTATIVA', {
    ARG0: { label: 'quem espera', prefers: ['PESSOA'] },
    ARG1: { label: 'expectativa', prefers: ['ACAO', 'ENTIDADE'] }
  }, { control: 'SUBJECT', examples: ['Eu espero chegar cedo.'] }),
  // --- Verbo de ligação e estado ---
  f('ser.COPULA', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'predicativo', prefers: ['QUALIDADE', 'ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'cop' }], examples: ['A casa é grande.'] }),
  f('ser.IDENTIDADE', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'identidade', prefers: ['PESSOA', 'ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'cop' }], examples: ['Ele é médico.'] }),
  f('estar.ESTADO', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'estado/lugar', prefers: ['QUALIDADE', 'LUGAR'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'cop' }], examples: ['O café está quente.'] }),
  f('estar.AUXILIAR', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'ação em curso', prefers: ['ACAO'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'xcomp' }], examples: ['Ela está dormindo.'] }),
  f('ficar.PERMANECER', {
    ARG0: { label: 'quem fica', prefers: ['SER_VIVO'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu fico em casa.'] }),
  f('ficar.LOCALIZADO', {
    ARG1: { label: 'o que fica', prefers: ['LUGAR', 'OBJETO'] },
    ARG2: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obl' }], examples: ['Onde fica a escola?'] }),
  f('ficar.TORNAR_SE', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'estado resultante', prefers: ['QUALIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'cop' }], examples: ['Ele ficou triste.'] }),
  f('parecer.PARECER', {
    ARG1: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG2: { label: 'aparência', prefers: ['QUALIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'cop' }], examples: ['O dia parece bonito.'] }),
  // --- Fazer / ter / dar / ver / dizer ---
  f('fazer.FAZER', {
    ARG0: { label: 'quem faz', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é feito', prefers: ['ENTIDADE'] }
  }, { examples: ['Como você faz isso?'] }),
  f('fazer.CAUSAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem sofre a causa', prefers: ['SER_VIVO'] },
    ARG2: { label: 'efeito', prefers: ['ACAO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'xcomp' }], examples: ['A notícia fez a menina chorar.'] }),
  f('fazer.TEMPO', {
    ARG1: { label: 'estado do tempo', prefers: ['QUALIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Faz frio hoje.'] }),
  f('ter.POSSE', {
    ARG0: { label: 'possuidor', prefers: ['PESSOA'] },
    ARG1: { label: 'posse', prefers: ['ENTIDADE'] }
  }, { examples: ['A menina tem um gato.'] }),
  f('ter.CONTER', {
    ARG0: { label: 'continente', prefers: ['ENTIDADE'] },
    ARG1: { label: 'conteúdo', prefers: ['ENTIDADE'] }
  }, { examples: ['O livro tem cem páginas.'] }),
  f('ter.EXISTENCIA', {
    ARG1: { label: 'o que existe', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Tem um gato no telhado.'] }),
  f('dar.DAR', {
    ARG0: { label: 'quem dá', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é dado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'quem recebe', prefers: ['SER_VIVO'] }
  }, { examples: ['Eu dei o livro para a menina.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'iobj' }] }),
  f('dar.RESULTAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'resultado', prefers: ['ENTIDADE'] }
  }, { examples: ['Isso dá certo.'] }),
  f('ver.VER', {
    ARG0: { label: 'quem vê', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é visto', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu vejo o pássaro no telhado.'] }),
  f('ver.ENTENDER', {
    ARG0: { label: 'quem entende', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é entendido', prefers: ['INFORMACAO'] }
  }, { examples: ['Você vê o problema?'] }),
  f('dizer.DIZER', {
    ARG0: { label: 'quem diz', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é dito', prefers: ['INFORMACAO'] },
    ARG2: { label: 'a quem se diz', prefers: ['PESSOA'] }
  }, { examples: ['Ele disse que vai chover.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'ccomp' }, { ARG2: 'iobj' }] }),
  f('dizer.SIGNIFICAR', {
    ARG1: { label: 'palavra', prefers: ['INFORMACAO'] },
    ARG2: { label: 'sentido', prefers: ['INFORMACAO'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obj' }], examples: ['Isso não diz nada.'] }),
  // --- Comunicação ---
  f('falar.FALAR', {
    ARG0: { label: 'quem fala', prefers: ['PESSOA'] },
    ARG1: { label: 'assunto', prefers: ['INFORMACAO'] },
    ARG2: { label: 'interlocutor', prefers: ['PESSOA'] }
  }, { examples: ['Eu falo com o médico.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'obl' }] }),
  f('falar.FALAR_IDIOMA', {
    ARG0: { label: 'quem fala', prefers: ['PESSOA'] },
    ARG1: { label: 'língua', prefers: ['INFORMACAO'] }
  }, { examples: ['Ele fala bem português.'] }),
  f('contar.NUMERAR', {
    ARG0: { label: 'quem conta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é contado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela conta as moedas.'] }),
  f('contar.NARRAR', {
    ARG0: { label: 'quem conta', prefers: ['PESSOA'] },
    ARG1: { label: 'história', prefers: ['INFORMACAO'] },
    ARG2: { label: 'ouvinte', prefers: ['PESSOA'] }
  }, { examples: ['Ele contou uma história para as crianças.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'iobj' }] }),
  f('contar.CONFIAR', {
    ARG0: { label: 'quem confia', prefers: ['PESSOA'] },
    ARG1: { label: 'em quem se confia', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu conto com você.'] }),
  f('pedir.PEDIR', {
    ARG0: { label: 'quem pede', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é pedido', prefers: ['ENTIDADE', 'ACAO'] },
    ARG2: { label: 'a quem se pede', prefers: ['PESSOA'] }
  }, { examples: ['Eu pedi um favor ao amigo.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'iobj' }] }),
  f('perguntar.PERGUNTAR', {
    ARG0: { label: 'quem pergunta', prefers: ['PESSOA'] },
    ARG1: { label: 'pergunta', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu pergunto a hora.'] }),
  f('responder.RESPONDER', {
    ARG0: { label: 'quem responde', prefers: ['PESSOA'] },
    ARG1: { label: 'resposta', prefers: ['INFORMACAO'] },
    ARG2: { label: 'a quem se responde', prefers: ['PESSOA'] }
  }, { examples: ['Ela respondeu a pergunta ao professor.'] }),
  f('explicar.EXPLICAR', {
    ARG0: { label: 'quem explica', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é explicado', prefers: ['INFORMACAO'] },
    ARG2: { label: 'a quem se explica', prefers: ['PESSOA'] }
  }, { examples: ['O professor explica a lição aos alunos.'] }),
  f('informar.INFORMAR', {
    ARG0: { label: 'quem informa', prefers: ['PESSOA'] },
    ARG1: { label: 'informação', prefers: ['INFORMACAO'] },
    ARG2: { label: 'quem é informado', prefers: ['PESSOA'] }
  }, { examples: ['Eu informo o horário ao cliente.'] }),
  f('comunicar.COMUNICAR', {
    ARG0: { label: 'quem comunica', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é comunicado', prefers: ['INFORMACAO'] },
    ARG2: { label: 'a quem se comunica', prefers: ['PESSOA'] }
  }, { examples: ['A empresa comunicou a mudança aos clientes.'] }),
  f('indicar.INDICAR', {
    ARG0: { label: 'quem indica', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é indicado', prefers: ['ENTIDADE'] }
  }, { examples: ['O médico indicou o remédio.'] }),
  f('recomendar.RECOMENDAR', {
    ARG0: { label: 'quem recomenda', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é recomendado', prefers: ['ENTIDADE', 'ACAO'] }
  }, { examples: ['Eu recomendo este livro.'] }),
  f('sugerir.SUGERIR', {
    ARG0: { label: 'quem sugere', prefers: ['PESSOA'] },
    ARG1: { label: 'sugestão', prefers: ['ENTIDADE', 'ACAO'] }
  }, { examples: ['Ela sugere uma pausa.'] }),
  f('prometer.PROMETER', {
    ARG0: { label: 'quem promete', prefers: ['PESSOA'] },
    ARG1: { label: 'promessa', prefers: ['ACAO', 'ENTIDADE'] },
    ARG2: { label: 'a quem se promete', prefers: ['PESSOA'] }
  }, { examples: ['Ele prometeu voltar cedo.'] }),
  f('chamar.CHAMAR', {
    ARG0: { label: 'quem chama', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é chamado', prefers: ['PESSOA'] }
  }, { examples: ['Eu chamo o médico.'] }),
  f('telefonar.TELEFONAR', {
    ARG0: { label: 'quem telefona', prefers: ['PESSOA'] },
    ARG1: { label: 'a quem se telefona', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu telefono para a minha mãe.'] }),
  f('ligar.TELEFONAR', {
    ARG0: { label: 'quem liga', prefers: ['PESSOA'] },
    ARG1: { label: 'a quem se liga', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu ligo para você.'] }),
  f('conversar.CONVERSAR', {
    ARG0: { label: 'quem conversa', prefers: ['PESSOA'] },
    ARG1: { label: 'interlocutor', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Nós conversamos sobre o trabalho.'] }),
  f('mentir.MENTIR', {
    ARG0: { label: 'quem mente', prefers: ['PESSOA'] },
    ARG1: { label: 'a quem se mente', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele mentiu para mim.'] }),
  f('agradecer.AGRADECER', {
    ARG0: { label: 'quem agradece', prefers: ['PESSOA'] },
    ARG1: { label: 'motivo', prefers: ['ENTIDADE'] },
    ARG2: { label: 'a quem se agradece', prefers: ['PESSOA'] }
  }, { examples: ['Eu agradeço a ajuda ao amigo.'] }),
  f('perguntar.PERGUNTAR_2', {
    ARG0: { label: 'quem pergunta', prefers: ['PESSOA'] },
    ARG1: { label: 'pergunta', prefers: ['INFORMACAO'] }
  }, { examples: ['Você pergunta muito.'] }),
  f('questionar.QUESTIONAR', {
    ARG0: { label: 'quem questiona', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é questionado', prefers: ['INFORMACAO'] }
  }, { examples: ['Ela questiona a decisão.'] }),
  f('relatar.RELATAR', {
    ARG0: { label: 'quem relata', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é relatado', prefers: ['INFORMACAO'] }
  }, { examples: ['Ele relata o ocorrido.'] }),
  f('reclamar.RECLAMAR', {
    ARG0: { label: 'quem reclama', prefers: ['PESSOA'] },
    ARG1: { label: 'motivo', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela reclama do barulho.'] }),
  f('elogiar.ELOGIAR', {
    ARG0: { label: 'quem elogia', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é elogiado', prefers: ['PESSOA'] }
  }, { examples: ['O chefe elogia o funcionário.'] }),
  f('gritar.GRITAR', {
    ARG0: { label: 'quem grita', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é gritado', prefers: ['INFORMACAO'] }
  }, { examples: ['Ele grita o nome dela.'] }),
  f('discutir.DISCUTIR', {
    ARG0: { label: 'quem discute', prefers: ['PESSOA'] },
    ARG1: { label: 'assunto', prefers: ['INFORMACAO'] }
  }, { examples: ['Eles discutem política.'] }),
  f('jurar.JURAR', {
    ARG0: { label: 'quem jura', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é jurado', prefers: ['ACAO', 'INFORMACAO'] }
  }, { examples: ['Eu juro dizer a verdade.'] }),
  f('traduzir.TRADUZIR', {
    ARG0: { label: 'quem traduz', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é traduzido', prefers: ['INFORMACAO'] }
  }, { examples: ['Ela traduz o livro.'] }),
  f('resumir.RESUMIR', {
    ARG0: { label: 'quem resume', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é resumido', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu resumo o texto.'] }),
  // --- Movimento e localização ---
  f('andar.ANDAR', {
    ARG0: { label: 'quem anda', prefers: ['SER_VIVO'] }
  }, { examples: ['Ela anda devagar.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('andar.FUNCIONAR', {
    ARG1: { label: 'o que funciona', prefers: ['INSTRUMENTO', 'VEICULO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['O carro anda bem.'] }),
  f('correr.CORRER', {
    ARG0: { label: 'quem corre', prefers: ['SER_VIVO'] }
  }, { examples: ['O cachorro corre na rua.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('caminhar.CAMINHAR', {
    ARG0: { label: 'quem caminha', prefers: ['SER_VIVO'] }
  }, { examples: ['Nós caminhamos no parque.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('passear.PASSEAR', {
    ARG0: { label: 'quem passeia', prefers: ['SER_VIVO'] }
  }, { examples: ['Ela passeia no parque.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('viajar.VIAJAR', {
    ARG0: { label: 'quem viaja', prefers: ['PESSOA'] },
    ARG1: { label: 'destino', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Nós viajamos para a praia.'] }),
  f('morar.MORAR', {
    ARG0: { label: 'quem mora', prefers: ['PESSOA'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela mora em São Paulo.'] }),
  f('viver.MORAR', {
    ARG0: { label: 'quem vive', prefers: ['PESSOA'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele vive no Rio.'] }),
  f('viver.VIVER', {
    ARG0: { label: 'quem vive', prefers: ['SER_VIVO'] }
  }, { examples: ['Ela vive bem.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('chegar.CHEGAR', {
    ARG0: { label: 'quem chega', prefers: ['SER_VIVO'] },
    ARG1: { label: 'destino', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Quando ele chega?'] }),
  f('chegar.BASTAR', {
    ARG1: { label: 'o que basta', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Isso chega.'] }),
  f('sair.SAIR', {
    ARG0: { label: 'quem sai', prefers: ['SER_VIVO'] },
    ARG1: { label: 'origem', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu saio de casa cedo.'] }),
  f('entrar.ENTRAR', {
    ARG0: { label: 'quem entra', prefers: ['SER_VIVO'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele entra na sala.'] }),
  f('voltar.VOLTAR', {
    ARG0: { label: 'quem volta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'destino', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu volto para casa.'] }),
  f('subir.SUBIR', {
    ARG0: { label: 'quem sobe', prefers: ['SER_VIVO'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela sobe a escada.'] }),
  f('descer.DESCER', {
    ARG0: { label: 'quem desce', prefers: ['SER_VIVO'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Nós descemos a ladeira.'] }),
  f('cair.CAIR', {
    ARG0: { label: 'quem cai', prefers: ['SER_VIVO', 'OBJETO'] }
  }, { examples: ['O copo caiu da mesa.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('passar.PASSAR', {
    ARG0: { label: 'quem passa', prefers: ['SER_VIVO'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele passa pela praça.'] }),
  f('passar.TEMPO', {
    ARG1: { label: 'tempo', prefers: ['TEMPO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['O tempo passa rápido.'] }),
  f('percorrer.PERCORRER', {
    ARG0: { label: 'quem percorre', prefers: ['SER_VIVO'] },
    ARG1: { label: 'caminho', prefers: ['LUGAR'] }
  }, { examples: ['Ela percorre a estrada.'] }),
  f('alcançar.ALCANCAR', {
    ARG0: { label: 'quem alcança', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é alcançado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele alcança o topo.'] }),
  f('fugir.FUGIR', {
    ARG0: { label: 'quem foge', prefers: ['SER_VIVO'] },
    ARG1: { label: 'de quê', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['O gato foge do cachorro.'] }),
  f('escapar.ESCAPAR', {
    ARG0: { label: 'quem escapa', prefers: ['SER_VIVO'] },
    ARG1: { label: 'de quê', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele escapa da chuva.'] }),
  f('dirigir.DIRIGIR', {
    ARG0: { label: 'quem dirige', prefers: ['PESSOA'] },
    ARG1: { label: 'veículo', prefers: ['VEICULO'] }
  }, { examples: ['Ela dirige o carro.'] }),
  f('dirigir.COMANDAR', {
    ARG0: { label: 'quem dirige', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é dirigido', prefers: ['INSTITUICAO', 'GRUPO'] }
  }, { examples: ['Ele dirige a empresa.'] }),
  f('pilotar.PILOTAR', {
    ARG0: { label: 'quem pilota', prefers: ['PESSOA'] },
    ARG1: { label: 'veículo', prefers: ['VEICULO'] }
  }, { examples: ['Ele pilota o avião.'] }),
  f('guiar.GUIAR', {
    ARG0: { label: 'quem guia', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é guiado', prefers: ['PESSOA'] }
  }, { examples: ['O guia guia o grupo.'] }),
  f('parar.PARAR', {
    ARG0: { label: 'quem para', prefers: ['SER_VIVO'] }
  }, { examples: ['O carro para no sinal.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('seguir.SEGUIR', {
    ARG0: { label: 'quem segue', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é seguido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela segue o carro.'] }),
  f('levar.LEVAR', {
    ARG0: { label: 'quem leva', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é levado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'destino', prefers: ['LUGAR'] }
  }, { examples: ['Eu levo o livro para a escola.'] }),
  f('levar.DEMORAR', {
    ARG1: { label: 'duração', prefers: ['TEMPO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['A viagem leva duas horas.'] }),
  f('trazer.TRAZER', {
    ARG0: { label: 'quem traz', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é trazido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela traz o café.'] }),
  f('carregar.CARREGAR', {
    ARG0: { label: 'quem carrega', prefers: ['PESSOA'] },
    ARG1: { label: 'carga', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu carrego o celular.'] }),
  f('carregar.LEVAR', {
    ARG0: { label: 'quem carrega', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é transportado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele carrega as malas.'] }),
  // --- Cognição / percepção ---
  f('saber.SABER', null),
  f('conhecer.CONHECER', {
    ARG0: { label: 'quem conhece', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é conhecido', prefers: ['ENTIDADE', 'LUGAR'] }
  }, { examples: ['Eu conheço esta cidade.'] }),
  f('entender.ENTENDER', {
    ARG0: { label: 'quem entende', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é entendido', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu entendo a lição.'] }),
  f('aprender.APRENDER', {
    ARG0: { label: 'quem aprende', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é aprendido', prefers: ['INFORMACAO', 'ACAO'] }
  }, { examples: ['Ela aprende português.'] }),
  f('ensinar.ENSINAR', {
    ARG0: { label: 'quem ensina', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é ensinado', prefers: ['INFORMACAO'] },
    ARG2: { label: 'a quem se ensina', prefers: ['PESSOA'] }
  }, { examples: ['O professor ensina português.'] }),
  f('estudar.ESTUDAR', {
    ARG0: { label: 'quem estuda', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é estudado', prefers: ['INFORMACAO'] }
  }, { examples: ['Nós estudamos na escola.'] }),
  f('ler.LER', {
    ARG0: { label: 'quem lê', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é lido', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu leio um livro.'] }),
  f('escrever.ESCREVER', {
    ARG0: { label: 'quem escreve', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é escrito', prefers: ['INFORMACAO'] }
  }, { examples: ['Ela escreve uma carta.'] }),
  f('ouvir.OUVIR', {
    ARG0: { label: 'quem ouve', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é ouvido', prefers: ['INFORMACAO'] }
  }, { examples: ['Nós ouvimos música.'] }),
  f('escutar.ESCUTAR', {
    ARG0: { label: 'quem escuta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é escutado', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu escuto a rádio.'] }),
  f('olhar.OLHAR', {
    ARG0: { label: 'quem olha', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é olhado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela olha a paisagem.'] }),
  f('enxergar.ENXERGAR', {
    ARG0: { label: 'quem enxerga', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é visto', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu enxergo a placa.'] }),
  f('perceber.PERCEBER', {
    ARG0: { label: 'quem percebe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é percebido', prefers: ['ENTIDADE', 'INFORMACAO'] }
  }, { examples: ['Ele percebe o erro.'] }),
  f('notar.NOTAR', {
    ARG0: { label: 'quem nota', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é notado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela nota a diferença.'] }),
  f('observar.OBSERVAR', {
    ARG0: { label: 'quem observa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é observado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele observa o céu.'] }),
  f('sentir.SENTIR', {
    ARG0: { label: 'quem sente', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é sentido', prefers: ['SENTIMENTO', 'QUALIDADE'] }
  }, { examples: ['Eu sinto frio.'] }),
  f('lembrar.LEMBRAR', {
    ARG0: { label: 'quem lembra', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é lembrado', prefers: ['ENTIDADE', 'INFORMACAO'] }
  }, { examples: ['Eu lembro do seu nome.'] }),
  f('esquecer.ESQUECER', {
    ARG0: { label: 'quem esquece', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é esquecido', prefers: ['ENTIDADE', 'INFORMACAO'] }
  }, { examples: ['Ela esqueceu a chave.'] }),
  f('pensar.PENSAR', {
    ARG0: { label: 'quem pensa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é pensado', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu penso no futuro.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }] }),
  f('refletir.REFLETIR', {
    ARG0: { label: 'quem reflete', prefers: ['PESSOA'] },
    ARG1: { label: 'sobre o quê', prefers: ['INFORMACAO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ele reflete sobre a vida.'] }),
  f('refletir.ESPELHAR', {
    ARG0: { label: 'superfície', prefers: ['OBJETO'] },
    ARG1: { label: 'imagem', prefers: ['ENTIDADE'] }
  }, { examples: ['O espelho reflete a luz.'] }),
  f('imaginar.IMAGINAR', {
    ARG0: { label: 'quem imagina', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é imaginado', prefers: ['ENTIDADE', 'INFORMACAO'] }
  }, { examples: ['Ela imagina a cena.'] }),
  f('acreditar.CRER', {
    ARG0: { label: 'quem acredita', prefers: ['PESSOA'] },
    ARG1: { label: 'no que se acredita', prefers: ['INFORMACAO', 'PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu acredito em você.'] }),
  f('crer.CRER', {
    ARG0: { label: 'quem crê', prefers: ['PESSOA'] },
    ARG1: { label: 'no que se crê', prefers: ['INFORMACAO', 'PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu creio em você.'] }),
  f('confiar.CONFIAR', {
    ARG0: { label: 'quem confia', prefers: ['PESSOA'] },
    ARG1: { label: 'em quem se confia', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu confio em você.'] }),
  f('achar.CONSIDERAR', {
    ARG0: { label: 'quem acha', prefers: ['PESSOA'] },
    ARG1: { label: 'opinião', prefers: ['INFORMACAO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'ccomp' }], examples: ['Eu acho que ela vem.'] }),
  f('achar.ENCONTRAR', {
    ARG0: { label: 'quem acha', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é achado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu achei a chave.'] }),
  f('encontrar.ENCONTRAR', {
    ARG0: { label: 'quem encontra', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é encontrado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela encontra o caminho.'] }),
  f('encontrar.REUNIR', {
    ARG0: { label: 'quem encontra', prefers: ['PESSOA'] },
    ARG1: { label: 'com quem se encontra', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu encontro com ela.'] }),
  f('procurar.PROCURAR', {
    ARG0: { label: 'quem procura', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é procurado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu procuro as chaves.'] }),
  f('buscar.BUSCAR', {
    ARG0: { label: 'quem busca', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é buscado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela busca o filho na escola.'] }),
  f('escolher.ESCOLHER', {
    ARG0: { label: 'quem escolhe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é escolhido', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu escolho o livro.'] }),
  f('preferir.PREFERIR', {
    ARG0: { label: 'quem prefere', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é preferido', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu prefiro café a chá.'] }),
  f('amar.AMAR', {
    ARG0: { label: 'quem ama', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é amado', prefers: ['PESSOA', 'ENTIDADE'] }
  }, { examples: ['Eu amo a minha família.'] }),
  f('odiar.ODIAR', {
    ARG0: { label: 'quem odeia', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é odiado', prefers: ['ENTIDADE', 'ACAO'] }
  }, { examples: ['Ele odeia fila.'] }),
  f('curtir.CURTIR', {
    ARG0: { label: 'quem curte', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é curtido', prefers: ['ENTIDADE', 'ACAO'] }
  }, { examples: ['Ela curte praia.'] }),
  f('desejar.DESEJAR', {
    ARG0: { label: 'quem deseja', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é desejado', prefers: ['ENTIDADE', 'ACAO'] }
  }, { examples: ['Eu desejo sorte a você.'] }),
  f('esperar.ESPERAR', {
    ARG0: { label: 'quem espera', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é esperado', prefers: ['PESSOA', 'ENTIDADE'] }
  }, { examples: ['Eu espero o ônibus.'] }),
  // --- Estados / processos ---
  f('existir.EXISTIR', {
    ARG1: { label: 'o que existe', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Existem várias respostas.'] }),
  f('haver.EXISTIR', {
    ARG1: { label: 'o que existe', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG1: 'obj' }], examples: ['Há um problema.'] }),
  f('haver.AUXILIAR', {
    ARG0: { label: 'sujeito', prefers: ['ENTIDADE'] },
    ARG1: { label: 'ação concluída', prefers: ['ACAO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'aux' }], examples: ['Ele havia saído.'] }),
  f('acontecer.ACONTECER', {
    ARG1: { label: 'o que acontece', prefers: ['EVENTO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['A festa aconteceu ontem à noite.'] }),
  f('nascer.NASCER', {
    ARG0: { label: 'quem nasce', prefers: ['SER_VIVO'] }
  }, { examples: ['O sol nasce de manhã.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('morrer.MORRER', {
    ARG0: { label: 'quem morre', prefers: ['SER_VIVO'] }
  }, { examples: ['A planta morreu.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('crescer.CRESCER', {
    ARG0: { label: 'o que cresce', prefers: ['SER_VIVO', 'ENTIDADE'] }
  }, { examples: ['A cidade cresce rápido.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('dormir.DORMIR', {
    ARG0: { label: 'quem dorme', prefers: ['SER_VIVO'] }
  }, { examples: ['A criança dorme.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('acordar.DESPERTAR', {
    ARG0: { label: 'quem acorda', prefers: ['SER_VIVO'] }
  }, { examples: ['Eu acordo cedo todos os dias.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('acordar.COMBINAR', {
    ARG0: { label: 'quem acorda', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é acordado', prefers: ['ENTIDADE'] }
  }, { examples: ['Nós acordamos o preço.'] }),
  f('descansar.DESCANSAR', {
    ARG0: { label: 'quem descansa', prefers: ['SER_VIVO'] }
  }, { examples: ['Eu descanso no domingo.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('trabalhar.TRABALHAR', {
    ARG0: { label: 'quem trabalha', prefers: ['PESSOA'] }
  }, { examples: ['Você trabalha de manhã.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('funcionar.FUNCIONAR', {
    ARG1: { label: 'o que funciona', prefers: ['INSTRUMENTO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['O elevador funciona.'] }),
  f('servir.PRESTAR', {
    ARG1: { label: 'o que serve', prefers: ['ENTIDADE'] },
    ARG2: { label: 'finalidade', prefers: ['ACAO'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obl' }], examples: ['Isso serve para limpar.'] }),
  f('servir.SERVIR', {
    ARG0: { label: 'quem serve', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é servido', prefers: ['ALIMENTO', 'BEBIDA'] },
    ARG2: { label: 'a quem se serve', prefers: ['PESSOA'] }
  }, { examples: ['Ela serve o jantar aos convidados.'] }),
  f('valer.VALER', {
    ARG1: { label: 'o que vale', prefers: ['ENTIDADE'] },
    ARG2: { label: 'valor', prefers: ['QUANTIDADE', 'DINHEIRO'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obj' }], examples: ['O livro vale trinta reais.'] }),
  f('caber.CABER', {
    ARG1: { label: 'o que cabe', prefers: ['OBJETO'] },
    ARG2: { label: 'lugar', prefers: ['LUGAR'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obl' }], examples: ['O sofá cabe na sala.'] }),
  f('caber.COMPETIR', {
    ARG1: { label: 'o que compete', prefers: ['ACAO'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obl' }], examples: ['A decisão cabe a mim.'] }),
  f('depender.DEPENDER', {
    ARG0: { label: 'o que depende', prefers: ['ENTIDADE'] },
    ARG1: { label: 'de quê', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['O resultado depende do esforço.'] }),
  f('pertencer.PERTENCER', {
    ARG1: { label: 'o que pertence', prefers: ['ENTIDADE'] },
    ARG2: { label: 'dono', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG1: 'nsubj' }, { ARG2: 'obl' }], examples: ['O livro pertence à Maria.'] }),
  f('merecer.MERECER', {
    ARG0: { label: 'quem merece', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é merecido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela merece o prêmio.'] }),
  f('doer.DOER', {
    ARG1: { label: 'o que dói', prefers: ['PARTE_DO_CORPO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Minha cabeça dói.'] }),
  f('importar.TER_IMPORTANCIA', {
    ARG1: { label: 'o que importa', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['Isso importa muito.'] }),
  f('importar.IMPORTAR', {
    ARG0: { label: 'quem importa', prefers: ['PESSOA'] },
    ARG1: { label: 'mercadoria', prefers: ['ENTIDADE'] }
  }, { examples: ['O país importa trigo.'] }),
  // --- Trocas / transações ---
  f('comprar.COMPRAR', {
    ARG0: { label: 'quem compra', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é comprado', prefers: ['ENTIDADE'] }
  }, { examples: ['Nós compramos uma casa.'] }),
  f('vender.VENDER', {
    ARG0: { label: 'quem vende', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é vendido', prefers: ['ENTIDADE'] },
    ARG2: { label: 'comprador', prefers: ['PESSOA'] }
  }, { examples: ['Eles vendem livros.'] }),
  f('pagar.PAGAR', {
    ARG0: { label: 'quem paga', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é pago', prefers: ['DINHEIRO', 'ENTIDADE'] },
    ARG2: { label: 'quem recebe', prefers: ['PESSOA'] }
  }, { examples: ['Eu pago a conta ao garçom.'] }),
  f('gastar.GASTAR', {
    ARG0: { label: 'quem gasta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é gasto', prefers: ['DINHEIRO'] }
  }, { examples: ['Ele gasta muito dinheiro.'] }),
  f('receber.RECEBER', {
    ARG0: { label: 'quem recebe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é recebido', prefers: ['ENTIDADE'] },
    ARG2: { label: 'de quem', prefers: ['PESSOA'] }
  }, { examples: ['Eu recebo o salário da empresa.'] }),
  f('ganhar.GANHAR', {
    ARG0: { label: 'quem ganha', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é ganho', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela ganhou o prêmio.'] }),
  f('entregar.ENTREGAR', {
    ARG0: { label: 'quem entrega', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é entregue', prefers: ['ENTIDADE'] },
    ARG2: { label: 'a quem se entrega', prefers: ['PESSOA'] }
  }, { examples: ['Eu entrego o pacote ao cliente.'] }),
  f('enviar.ENVIAR', {
    ARG0: { label: 'quem envia', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é enviado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'destinatário', prefers: ['PESSOA'] }
  }, { examples: ['Eu enviei uma carta ao amigo.'] }),
  f('mandar.MANDAR', {
    ARG0: { label: 'quem manda', prefers: ['PESSOA'] },
    ARG1: { label: 'ordem/objeto', prefers: ['ACAO', 'ENTIDADE'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { examples: ['Eu mando flores para ela.'] }),
  f('doar.DOAR', {
    ARG0: { label: 'quem doa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é doado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'quem recebe', prefers: ['PESSOA', 'INSTITUICAO'] }
  }, { examples: ['Ela doa roupas à instituição.'] }),
  f('emprestar.EMPRESTAR', {
    ARG0: { label: 'quem empresta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é emprestado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { examples: ['Eu empresto o livro ao colega.'] }),
  f('devolver.DEVOLVER', {
    ARG0: { label: 'quem devolve', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é devolvido', prefers: ['ENTIDADE'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { examples: ['Ele devolve o livro à biblioteca.'] }),
  f('trocar.TROCAR', {
    ARG0: { label: 'quem troca', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é trocado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'pelo quê', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu troco o pneu do carro.'] }),
  f('cobrar.COBRAR', {
    ARG0: { label: 'quem cobra', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é cobrado', prefers: ['DINHEIRO'] },
    ARG2: { label: 'de quem', prefers: ['PESSOA'] }
  }, { examples: ['A loja cobra o cliente.'] }),
  f('economizar.ECONOMIZAR', {
    ARG0: { label: 'quem economiza', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é economizado', prefers: ['DINHEIRO'] }
  }, { examples: ['Nós economizamos dinheiro.'] }),
  // --- Criação / transformação / manipulação ---
  f('montar.MONTAR', {
    ARG0: { label: 'quem monta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é montado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu monto o armário.'] }),
  f('montar.SUBIR_EM', {
    ARG0: { label: 'quem monta', prefers: ['PESSOA'] },
    ARG1: { label: 'animal/veículo', prefers: ['ANIMAL', 'VEICULO'] }
  }, { examples: ['Ela monta no cavalo.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }] }),
  f('abrir.ABRIR', {
    ARG0: { label: 'quem abre', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é aberto', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela tenta abrir a porta.'] }),
  f('abrir.INICIAR', {
    ARG0: { label: 'quem abre', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é iniciado', prefers: ['ACAO'] }
  }, { examples: ['Ele abre a reunião.'] }),
  f('fechar.FECHAR', {
    ARG0: { label: 'quem fecha', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é fechado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu fecho a janela.'] }),
  f('cortar.CORTAR', {
    ARG0: { label: 'quem corta', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é cortado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela corta o pão.'] }),
  f('quebrar.QUEBRAR', {
    ARG0: { label: 'quem quebra', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é quebrado', prefers: ['OBJETO'] }
  }, { examples: ['Eu quebrei o copo.'] }),
  f('dividir.DIVIDIR', {
    ARG0: { label: 'quem divide', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é dividido', prefers: ['ENTIDADE'] }
  }, { examples: ['Nós dividimos o bolo.'] }),
  f('construir.CONSTRUIR', {
    ARG0: { label: 'quem constrói', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é construído', prefers: ['ENTIDADE'] }
  }, { examples: ['Eles constroem a casa.'] }),
  f('produzir.PRODUZIR', {
    ARG0: { label: 'quem produz', prefers: ['PESSOA', 'INSTITUICAO'] },
    ARG1: { label: 'o que é produzido', prefers: ['ENTIDADE'] }
  }, { examples: ['A fábrica produz carros.'] }),
  f('cozinhar.COZINHAR', {
    ARG0: { label: 'quem cozinha', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é cozinhado', prefers: ['ALIMENTO'] }
  }, { examples: ['Ela cozinha o jantar.'] }),
  f('assar.ASSAR', {
    ARG0: { label: 'quem assa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é assado', prefers: ['ALIMENTO'] }
  }, { examples: ['Eu asso o frango.'] }),
  f('almoçar.ALMOCAR', {
    ARG0: { label: 'quem almoça', prefers: ['PESSOA'] }
  }, { examples: ['Nós almoçamos cedo.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('jantar.JANTAR', {
    ARG0: { label: 'quem janta', prefers: ['PESSOA'] }
  }, { examples: ['Nós jantamos às oito.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('lavar.LAVAR', {
    ARG0: { label: 'quem lava', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é lavado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu lavo a louça.'] }),
  f('limpar.LIMPAR', {
    ARG0: { label: 'quem limpa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é limpo', prefers: ['LUGAR', 'OBJETO'] }
  }, { examples: ['Ela limpa a casa.'] }),
  f('arrumar.ARRUMAR', {
    ARG0: { label: 'quem arruma', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é arrumado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu arrumo o quarto.'] }),
  f('guardar.GUARDAR', {
    ARG0: { label: 'quem guarda', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é guardado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela guarda os documentos.'] }),
  f('pôr.POR', {
    ARG0: { label: 'quem põe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é posto', prefers: ['ENTIDADE'] },
    ARG2: { label: 'lugar', prefers: ['LUGAR'] }
  }, { examples: ['Eu ponho o livro na mesa.'], syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }, { ARG2: 'obl' }] }),
  f('organizar.ORGANIZAR', {
    ARG0: { label: 'quem organiza', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é organizado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu organizo os papéis.'] }),
  f('pegar.PEGAR', {
    ARG0: { label: 'quem pega', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é pego', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu pego o lápis.'] }),
  f('pegar.EMBARCAR', {
    ARG0: { label: 'quem pega', prefers: ['PESSOA'] },
    ARG1: { label: 'veículo', prefers: ['VEICULO'] }
  }, { examples: ['Eu pego o ônibus às sete.'] }),
  f('segurar.SEGURAR', {
    ARG0: { label: 'quem segura', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é segurado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela segura a bolsa.'] }),
  f('usar.USAR', {
    ARG0: { label: 'quem usa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é usado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu uso o computador.'] }),
  f('utilizar.UTILIZAR', {
    ARG0: { label: 'quem utiliza', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é utilizado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela utiliza o aplicativo.'] }),
  f('reciclar.RECICLAR', {
    ARG0: { label: 'quem recicla', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é reciclado', prefers: ['MATERIAL'] }
  }, { examples: ['Nós reciclamos o papel.'] }),
  f('preparar.PREPARAR', {
    ARG0: { label: 'quem prepara', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é preparado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela prepara o jantar.'] }),
  f('instalar.INSTALAR', {
    ARG0: { label: 'quem instala', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é instalado', prefers: ['INSTRUMENTO'] }
  }, { examples: ['Eu instalo o programa.'] }),
  f('consertar.CONSERTAR', {
    ARG0: { label: 'quem conserta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é consertado', prefers: ['OBJETO'] }
  }, { examples: ['Ele conserta a máquina.'] }),
  f('plantar.PLANTAR', {
    ARG0: { label: 'quem planta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é plantado', prefers: ['PLANTA'] }
  }, { examples: ['Nós plantamos árvores.'] }),
  f('colher.COLHER', {
    ARG0: { label: 'quem colhe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é colhido', prefers: ['PLANTA', 'ALIMENTO'] }
  }, { examples: ['Ela colhe as flores.'] }),
  f('regar.REGAR', {
    ARG0: { label: 'quem rega', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é regado', prefers: ['PLANTA'] }
  }, { examples: ['Eu rego as plantas.'] }),
  f('pintar.PINTAR', {
    ARG0: { label: 'quem pinta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é pintado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela pinta a parede.'] }),
  f('vestir.VESTIR', {
    ARG0: { label: 'quem veste', prefers: ['PESSOA'] },
    ARG1: { label: 'roupa', prefers: ['VESTUARIO'] }
  }, { examples: ['Eu visto a camisa.'] }),
  // --- Ações sociais / ajudas ---
  f('ajudar.AJUDAR', {
    ARG0: { label: 'quem ajuda', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é ajudado', prefers: ['PESSOA'] }
  }, { examples: ['Eu posso ajudar você.'] }),
  f('cuidar.CUIDAR', {
    ARG0: { label: 'quem cuida', prefers: ['PESSOA'] },
    ARG1: { label: 'de quem se cuida', prefers: ['PESSOA', 'SER_VIVO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela cuida das crianças.'] }),
  f('proteger.PROTEGER', {
    ARG0: { label: 'quem protege', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é protegido', prefers: ['SER_VIVO', 'ENTIDADE'] }
  }, { examples: ['A mãe protege o filho.'] }),
  f('defender.DEFENDER', {
    ARG0: { label: 'quem defende', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é defendido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele defende a tese.'] }),
  f('apoiar.APOIAR', {
    ARG0: { label: 'quem apoia', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é apoiado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu apoio a proposta.'] }),
  f('salvar.SALVAR', {
    ARG0: { label: 'quem salva', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é salvo', prefers: ['SER_VIVO'] }
  }, { examples: ['O médico salva o paciente.'] }),
  f('salvar.GRAVAR', {
    ARG0: { label: 'quem salva', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é salvo', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu salvo o arquivo.'] }),
  f('socorrer.SOCORRER', {
    ARG0: { label: 'quem socorre', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é socorrido', prefers: ['PESSOA'] }
  }, { examples: ['Ele socorre a vítima.'] }),
  f('convidar.CONVIDAR', {
    ARG0: { label: 'quem convida', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é convidado', prefers: ['PESSOA'] },
    ARG2: { label: 'para quê', prefers: ['EVENTO'] }
  }, { examples: ['Eu convido você para a festa.'] }),
  f('visitar.VISITAR', {
    ARG0: { label: 'quem visita', prefers: ['PESSOA'] },
    ARG1: { label: 'quem/o que é visitado', prefers: ['PESSOA', 'LUGAR'] }
  }, { examples: ['Ela visita a avó.'] }),
  f('participar.PARTICIPAR', {
    ARG0: { label: 'quem participa', prefers: ['PESSOA'] },
    ARG1: { label: 'de quê', prefers: ['EVENTO'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Nós participamos da reunião.'] }),
  f('frequentar.FREQUENTAR', {
    ARG0: { label: 'quem frequenta', prefers: ['PESSOA'] },
    ARG1: { label: 'lugar', prefers: ['LUGAR', 'INSTITUICAO'] }
  }, { examples: ['Ele frequenta a academia.'] }),
  f('permitir.PERMITIR', {
    ARG0: { label: 'quem permite', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é permitido', prefers: ['ACAO', 'ENTIDADE'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { examples: ['O chefe permite a pausa.'] }),
  f('proibir.PROIBIR', {
    ARG0: { label: 'quem proíbe', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é proibido', prefers: ['ACAO', 'ENTIDADE'] }
  }, { examples: ['A lei proíbe fumar.'] }),
  f('impedir.IMPEDIR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'o que é impedido', prefers: ['ACAO'] }
  }, { examples: ['A chuva impede a viagem.'] }),
  f('obedecer.OBEDECER', {
    ARG0: { label: 'quem obedece', prefers: ['SER_VIVO'] },
    ARG1: { label: 'a quem se obedece', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['O cão obedece ao dono.'] }),
  f('cumprir.CUMPRIR', {
    ARG0: { label: 'quem cumpre', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é cumprido', prefers: ['ACAO'] }
  }, { examples: ['Ele cumpre a promessa.'] }),
  // --- Perder / ganhar / competir ---
  f('perder.PERDER', {
    ARG0: { label: 'quem perde', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é perdido', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu perdi as chaves.'] }),
  f('vencer.VENCER', {
    ARG0: { label: 'quem vence', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é vencido', prefers: ['PESSOA', 'ENTIDADE'] }
  }, { examples: ['O time vence o jogo.'] }),
  f('vencer.EXPIRAR', {
    ARG1: { label: 'o que expira', prefers: ['TEMPO', 'INFORMACAO'] }
  }, { syntax: [{ ARG1: 'nsubj' }], examples: ['A conta vence amanhã.'] }),
  f('atacar.ATACAR', {
    ARG0: { label: 'quem ataca', prefers: ['SER_VIVO'] },
    ARG1: { label: 'quem é atacado', prefers: ['SER_VIVO', 'LUGAR'] }
  }, { examples: ['O cão ataca o carteiro.'] }),
  f('pescar.PESCAR', {
    ARG0: { label: 'quem pesca', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é pescado', prefers: ['ANIMAL'] }
  }, { examples: ['Ele pesca no rio.'] }),
  f('caçar.CACAR', {
    ARG0: { label: 'quem caça', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é caçado', prefers: ['ANIMAL'] }
  }, { examples: ['O leão caça a zebra.'] }),
  f('perseguir.PERSEGUIR', {
    ARG0: { label: 'quem persegue', prefers: ['SER_VIVO'] },
    ARG1: { label: 'quem é perseguido', prefers: ['SER_VIVO'] }
  }, { examples: ['O gato persegue o rato.'] }),
  f('jogar.JOGAR', {
    ARG0: { label: 'quem joga', prefers: ['PESSOA'] },
    ARG1: { label: 'jogo/objeto', prefers: ['ACAO', 'OBJETO'] }
  }, { examples: ['Nós jogamos futebol.'] }),
  f('brincar.BRINCAR', {
    ARG0: { label: 'quem brinca', prefers: ['PESSOA'] }
  }, { examples: ['O menino e a menina brincam.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('cantar.CANTAR', {
    ARG0: { label: 'quem canta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é cantado', prefers: ['INFORMACAO'] }
  }, { examples: ['O homem canta uma canção.'] }),
  f('dançar.DANCAR', {
    ARG0: { label: 'quem dança', prefers: ['PESSOA'] },
    ARG1: { label: 'dança', prefers: ['ACAO'] }
  }, { examples: ['Ela dança samba.'] }),
  f('tocar.TOCAR', {
    ARG0: { label: 'quem toca', prefers: ['SER_VIVO'] },
    ARG1: { label: 'o que é tocado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu toco a campainha.'] }),
  f('tocar.INSTRUMENTO', {
    ARG0: { label: 'quem toca', prefers: ['PESSOA'] },
    ARG1: { label: 'instrumento', prefers: ['INSTRUMENTO'] }
  }, { examples: ['Ela toca piano.'] }),
  f('chutar.CHUTAR', {
    ARG0: { label: 'quem chuta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é chutado', prefers: ['OBJETO'] }
  }, { examples: ['Ele chuta a bola.'] }),
  f('pular.PULAR', {
    ARG0: { label: 'quem pula', prefers: ['SER_VIVO'] }
  }, { examples: ['A criança pula na cama.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('rir.RIR', {
    ARG0: { label: 'quem ri', prefers: ['PESSOA'] },
    ARG1: { label: 'de quê', prefers: ['ENTIDADE'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Nós rimos da piada.'] }),
  f('sorrir.SORRIR', {
    ARG0: { label: 'quem sorri', prefers: ['PESSOA'] }
  }, { examples: ['Ela sorri para mim.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('chorar.CHORAR', {
    ARG0: { label: 'quem chora', prefers: ['SER_VIVO'] }
  }, { examples: ['O bebê chora.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('torcer.APOIAR', {
    ARG0: { label: 'quem torce', prefers: ['PESSOA'] },
    ARG1: { label: 'por quem se torce', prefers: ['GRUPO', 'PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu torço pelo time.'] }),
  f('votar.VOTAR', {
    ARG0: { label: 'quem vota', prefers: ['PESSOA'] },
    ARG1: { label: 'em quem se vota', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Eu voto no candidato.'] }),
  f('eleger.ELEGER', {
    ARG0: { label: 'quem elege', prefers: ['GRUPO', 'PESSOA'] },
    ARG1: { label: 'quem é eleito', prefers: ['PESSOA'] }
  }, { examples: ['O povo elege o presidente.'] }),
  // --- Emoções ---
  f('assustar.ASSUSTAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem se assusta', prefers: ['SER_VIVO'] }
  }, { examples: ['O barulho assusta o gato.'] }),
  f('preocupar.PREOCUPAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem se preocupa', prefers: ['PESSOA'] }
  }, { examples: ['A notícia preocupa a mãe.'] }),
  f('incomodar.INCOMODAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem é incomodado', prefers: ['PESSOA'] }
  }, { examples: ['O barulho incomoda os vizinhos.'] }),
  f('magoar.MAGOAR', {
    ARG0: { label: 'causa', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é magoado', prefers: ['PESSOA'] }
  }, { examples: ['A crítica magoa a artista.'] }),
  f('ofender.OFENDER', {
    ARG0: { label: 'quem ofende', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é ofendido', prefers: ['PESSOA'] }
  }, { examples: ['A piada ofende o colega.'] }),
  f('perdoar.PERDOAR', {
    ARG0: { label: 'quem perdoa', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é perdoado', prefers: ['PESSOA'] }
  }, { examples: ['Eu perdoo você.'] }),
  f('machucar.MACHUCAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem é machucado', prefers: ['SER_VIVO'] }
  }, { examples: ['Eu machuquei o joelho.'] }),
  f('animar.ANIMAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem é animado', prefers: ['PESSOA'] }
  }, { examples: ['A festa anima a todos.'] }),
  f('divertir.DIVERTIR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem se diverte', prefers: ['PESSOA'] }
  }, { examples: ['O jogo diverte as crianças.'] }),
  f('surpreender.SURPREENDER', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem é surpreendido', prefers: ['PESSOA'] }
  }, { examples: ['O presente surpreende a avó.'] }),
  f('impressionar.IMPRESSIONAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem se impressiona', prefers: ['PESSOA'] }
  }, { examples: ['A vista impressiona o turista.'] }),
  f('inspirar.INSPIRAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem é inspirado', prefers: ['PESSOA'] }
  }, { examples: ['A música inspira a artista.'] }),
  f('interessar.INTERESSAR', {
    ARG0: { label: 'causa', prefers: ['ENTIDADE'] },
    ARG1: { label: 'quem se interessa', prefers: ['PESSOA'] }
  }, { examples: ['O assunto interessa o aluno.'] }),
  f('confiar.CONFIAR', null),
  f('namorar.NAMORAR', {
    ARG0: { label: 'quem namora', prefers: ['PESSOA'] },
    ARG1: { label: 'com quem se namora', prefers: ['PESSOA'] }
  }, { examples: ['Ela namora o João.'] }),
  f('casar.CASAR', {
    ARG0: { label: 'quem casa', prefers: ['PESSOA'] },
    ARG1: { label: 'com quem se casa', prefers: ['PESSOA'] }
  }, { syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obl' }], examples: ['Ela casa com o noivo.'] }),
  f('beijar.BEIJAR', {
    ARG0: { label: 'quem beija', prefers: ['PESSOA'] },
    ARG1: { label: 'quem é beijado', prefers: ['PESSOA'] }
  }, { examples: ['A mãe beija o filho.'] }),
  // --- Finais diversos (usados nas frases de teste) ---
  f('chegar.CHEGAR', null),
  f('mostrar.MOSTRAR', {
    ARG0: { label: 'quem mostra', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é mostrado', prefers: ['ENTIDADE'] },
    ARG2: { label: 'a quem', prefers: ['PESSOA'] }
  }, { examples: ['Eu mostro a foto ao amigo.'] }),
  f('experimentar.EXPERIMENTAR', {
    ARG0: { label: 'quem experimenta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é experimentado', prefers: ['ALIMENTO', 'ENTIDADE'] }
  }, { examples: ['Ela experimenta a sopa.'] }),
  f('provar.EXPERIMENTAR', {
    ARG0: { label: 'quem prova', prefers: ['PESSOA'] },
    ARG1: { label: 'comida', prefers: ['ALIMENTO'] }
  }, { examples: ['Eu provo o bolo.'] }),
  f('provar.PROVAR', {
    ARG0: { label: 'quem prova', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é provado', prefers: ['INFORMACAO'] }
  }, { examples: ['Ela prova a teoria.'] }),
  f('achar.ENCONTRAR', null),
  f('achar.CONSIDERAR', null),
  f('acreditar.CRER', null),
  f('acabar.TERMINAR', {
    ARG0: { label: 'o que acaba', prefers: ['ENTIDADE'] }
  }, { examples: ['A aula acabou.'], syntax: [{ ARG0: 'nsubj' }] }),
  f('terminar.TERMINAR', {
    ARG0: { label: 'quem termina', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é terminado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu termino o trabalho.'] }),
  f('iniciar.INICIAR', {
    ARG0: { label: 'quem inicia', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é iniciado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela inicia o projeto.'] }),
  f('repetir.REPETIR', {
    ARG0: { label: 'quem repete', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é repetido', prefers: ['ENTIDADE', 'INFORMACAO'] }
  }, { examples: ['Eu repito a frase.'] }),
  f('testar.TESTAR', {
    ARG0: { label: 'quem testa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é testado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela testa o programa.'] }),
  f('revisar.REVISAR', {
    ARG0: { label: 'quem revisa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é revisado', prefers: ['INFORMACAO'] }
  }, { examples: ['Eu reviso o texto.'] }),
  f('treinar.TREINAR', {
    ARG0: { label: 'quem treina', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é treinado', prefers: ['ACAO'] }
  }, { examples: ['Ele treina futebol.'] }),
  f('praticar.PRATICAR', {
    ARG0: { label: 'quem pratica', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é praticado', prefers: ['ACAO'] }
  }, { examples: ['Ela pratica natação.'] }),
  f('tocar.TOCAR', null),
  f('sacar.SACAR', {
    ARG0: { label: 'quem saca', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é sacado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele saca a espada.'] }),
  f('sacar.ENTENDER', {
    ARG0: { label: 'quem saca', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é entendido', prefers: ['INFORMACAO'] }
  }, { examples: ['Você saca a matéria?'] }),
  f('manter.MANTER', {
    ARG0: { label: 'quem mantém', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é mantido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela mantém a calma.'] }),
  f('unir.UNIR', {
    ARG0: { label: 'quem une', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é unido', prefers: ['ENTIDADE'] }
  }, { examples: ['Nós unimos esforços.'] }),
  f('separar.SEPARAR', {
    ARG0: { label: 'quem separa', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é separado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu separo o lixo.'] }),
  f('juntar.JUNTAR', {
    ARG0: { label: 'quem junta', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é juntado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela junta as peças.'] }),
  f('misturar.MISTURAR', {
    ARG0: { label: 'quem mistura', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é misturado', prefers: ['ENTIDADE'] }
  }, { examples: ['Eu misturo os ingredientes.'] }),
  f('reverter.REVERTER', {
    ARG0: { label: 'quem reverte', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é revertido', prefers: ['ENTIDADE'] }
  }, { examples: ['Ele reverte a decisão.'] }),
  f('virar.VIRAR', {
    ARG0: { label: 'quem vira', prefers: ['PESSOA'] },
    ARG1: { label: 'o que é virado', prefers: ['ENTIDADE'] }
  }, { examples: ['Ela vira a página.'] }),
  f('achar.ENCONTRAR', null),
  f('passar.PASSAR', null)
].filter((x) => x !== null).filter((frame, i, all) => all.findIndex((other) => other.id === frame.id) === i);

// Moldura padrão estrutural para os demais sentidos.
function defaultFrame(lemma, sense) {
  return {
    id: sense.id,
    defaultTemplate: true,
    roles: {
      ARG0: { label: `quem ${lemma}`, prefers: ['SER_VIVO'] },
      ARG1: { label: `o que é afetado por ${lemma}`, prefers: ['ENTIDADE'] }
    },
    syntax: [{ ARG0: 'nsubj' }, { ARG1: 'obj' }],
    examples: []
  };
}

const handIds = new Set(HAND.map((f) => f.id));
const verbs = seeds.entries.filter((e) => e.pos === 'VERB');
const frames = [...HAND];
for (const verb of verbs) {
  for (const sense of verb.senses ?? []) {
    if (!handIds.has(sense.id)) frames.push(defaultFrame(verb.lemma, sense));
  }
}

const out = {
  version: '1.0.0',
  schemaVersion: '1.0.0',
  description: 'Molduras de argumentos (estilo PropBank, conceito apenas — nada copiado do PropBank-Br) dos sentidos dos verbos-semente. Uma moldura por sentido; verbos de controle informam control: SUBJECT e complement: xcomp. Molduras com defaultTemplate: true são estruturais (geradas por padrão) e pedem passada de curadoria.',
  frames
};

writeFileSync(join(HERE, '..', 'frames.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`frames.json gerado: ${frames.length} molduras (${HAND.length} escritas à mão, ${frames.length - HAND.length} padrão)`);
