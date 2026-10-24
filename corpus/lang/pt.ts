// Português (Brasil). Estrutura e motivos em en.ts. Os nomes de campo e valores do JSON (finished, intent, assessment…) ficam em inglês: o código os lê assim.
import type { LanguagePack } from "./types";

export const pt: LanguagePack = {
  roles: { moderator: "Moderadora", technical_lead: "Líder Técnico", mentor: "Mentora", candidate: "Candidato" },

  askerLines: {
    moderator: {
      silence: {
        8: "Fique à vontade, sem pressa.",
        15: "Você precisa de mais tempo?",
        25: "Quer passar para a próxima pergunta?",
      },
      wrapUp: "Obrigada, isso ajuda muito. Por questão de tempo, vamos parar por aqui.",
    },
    technical_lead: {
      silence: {
        8: "Fique à vontade, sem pressa.",
        15: "Você precisa de mais tempo?",
        25: "Quer passar para a próxima pergunta?",
      },
      wrapUp: "Obrigado, isso ajuda muito. Por questão de tempo, vamos parar por aqui.",
    },
    mentor: {
      silence: {
        8: "Fique à vontade, não tem pressa nenhuma.",
        15: "Você precisa de um pouco mais de tempo?",
        25: "Quer passar para a próxima pergunta?",
      },
      wrapUp: "Muito obrigada, isso foi muito útil. Nosso tempo está acabando, então vamos parar por aqui.",
    },
  },
  closing: {
    timeUp:
      "Nosso tempo acabou, então vamos encerrar por aqui. Muito obrigada por nos apresentar o seu projeto, e boa sorte!",
    endEarly: "Claro, vamos parar por aqui. Obrigada pelo seu tempo hoje, e boa sorte!",
  },
  openingQuestion:
    "Você poderia descrever um projeto técnico que você construiu: o problema, a arquitetura e a sua própria contribuição?",
  backupQuestions: {
    technical_lead: {
      easy: [
        "Que parte do projeto você mesmo construiu, e o que ela fazia?",
        "Alguma coisa deu errado ou te surpreendeu durante o projeto? O que aconteceu?",
        "Em qual ferramenta ou biblioteca você mais se apoiou neste projeto?",
      ],
      medium: [
        "Você pode me explicar passo a passo como funciona um componente principal do seu sistema?",
        "Se um componente do seu sistema parasse de funcionar, o que o usuário veria?",
        "Qual foi o principal gargalo do seu sistema, e como você o encontrou?",
      ],
      hard: [
        "Como você verificou que o seu resultado principal era real, e o que poderia tornar essa medição enganosa?",
        "Qual é a suposição mais fraca do seu projeto, e o que aconteceria se ela fosse falsa?",
        "O que quebraria primeiro se a carga do seu sistema crescesse cem vezes?",
      ],
    },
    mentor: {
      easy: [
        "De qual parte deste projeto você mais se orgulha?",
        "O que você aprendeu neste projeto que ainda usa hoje?",
        "Como vocês dividiram o trabalho entre as pessoas que construíram isso com você?",
      ],
      medium: [
        "Como você fez a parte mais difícil deste projeto realmente funcionar?",
        "Como você soube que o seu projeto estava funcionando do jeito que você queria?",
        "O que você faria diferente se começasse este projeto de novo?",
      ],
      hard: [
        "Se você tivesse mais três meses neste projeto, o que construiria em seguida para deixá-lo ainda melhor?",
        "Sobre qual decisão deste projeto você tem menos certeza hoje, e por quê?",
        "Qual compromisso do seu projeto você mais gostaria que um novo colega de equipe entendesse?",
      ],
    },
  },

  moderatorPrompt:
    "Você é a moderadora de uma banca de três pessoas que entrevista um candidato sobre um projeto técnico em que ele trabalhou. " +
    "Os outros membros são um Líder Técnico e uma Mentora; as perguntas deles aparecem na conversa marcadas com o papel de cada um. " +
    "Você abre e encerra a entrevista e a mantém em andamento. Não faça você mesma perguntas técnicas profundas. " +
    "Cada fala deve ter uma ou duas frases faladas e curtas, sem listas nem markdown. " +
    "Fale somente português durante toda a entrevista.",
  opening: (role, company, say, names) =>
    `Cumprimente o candidato, apresente-se como ${names.moderator}, a moderadora, e apresente a banca em uma frase: ` +
    `${names.technical_lead}, o Líder Técnico, e ${names.mentor}, a Mentora. ` +
    "Diga que esta é uma entrevista de treino para a vaga de " +
    `${role}${company ? ` em ${company}` : ""} e peça que ele descreva um projeto técnico que construiu: ` +
    "o problema, a arquitetura e a própria contribuição." +
    (company && say !== company
      ? ` Pronuncie o nome da empresa "${company}" de forma que soe como "${say}" (é só uma indicação de pronúncia: não soletre nem leia os hifens).`
      : ""),
  openingReply: (said, heard, names, role, company, say) =>
    (heard ? `Você tinha dito "${heard}"` : "Você ainda não tinha dito nada") +
    ` quando o candidato interrompeu e disse: "${said}". Sua resposta inteira deve ter duas frases curtas. ` +
    "Primeiro responda ao que ele realmente disse, em poucas palavras (cumprimente pelo nome se ele disse o nome; não diga olá duas vezes). " +
    `Se você não tinha terminado de apresentar a banca, cite-a em poucas palavras: ${names.technical_lead}, o Líder Técnico, ` +
    `e ${names.mentor}, a Mentora (e você mesma, ${names.moderator}, se ainda não tinha dito seu nome). ` +
    'Depois peça brevemente um projeto que ele construiu, por exemplo "Você poderia nos contar sobre um projeto que construiu?" ' +
    "Não liste o que ele deve cobrir (problema, arquitetura, contribuição) e não repita a pergunta de abertura inteira." +
    ` Fatos, se ele perguntar: esta é uma entrevista de treino para a vaga de ${role}${company ? ` em ${company}` : ""}; a banca é você (${names.moderator}, a moderadora), ${names.technical_lead} (o Líder Técnico) e ${names.mentor} (a Mentora). ` +
    "Não repita o que você já tinha dito: responda só ao que ele perguntou." +
    (company && say !== company
      ? ` Pronuncie "${company}" de forma que soe como "${say}" (só uma indicação de pronúncia).`
      : ""),
  handoff: (after, next) =>
    `${
      {
        introduction: "Obrigada por nos apresentar o seu projeto.",
        addition: "Obrigada por complementar.",
        unanswered: "Tudo bem, não tem problema nenhum.",
      }[after]
    } ${next}, com você.`,
  timeBuyer: (said, next) =>
    `A entrevista já está em andamento. O candidato acabou de apresentar o projeto: "${said}". ` +
    "Em uma frase curta, agradeça (sem elogios, sem cumprimentos). Depois faça uma pergunta curta e leve sobre o contexto do " +
    "projeto que ele ainda não respondeu, por exemplo para quem era, se era uma equipe dentro de uma empresa, qual o tamanho da equipe ou qual foi a parte dele. " +
    `Não pergunte nada técnico ou aprofundado: isso fica para ${next}, o Líder Técnico, em seguida. ` +
    "Faça uma só pergunta e use menos de 30 palavras no total.",
  sayAgain: "Desculpe, não ouvi direito. Você poderia repetir?",
  missedPart: "Desculpe, perdi uma parte da sua resposta. Você poderia repetir?",
  resume: "Desculpe, a conexão caiu por um momento. Já voltamos, então vamos continuar.",
  answerAgain: "Você poderia responder de novo à última pergunta, por favor?",
  endEarly: (said) =>
    `A entrevista já está em andamento. O candidato pediu para parar agora: "${said}". Em uma ou duas frases faladas e curtas, ` +
    "concorde com gentileza, agradeça pelo tempo dele e deseje boa sorte. Não cumprimente ninguém e não faça perguntas.",
  readAloud: (line) =>
    "A entrevista já está em andamento e o candidato acabou de falar. Não cumprimente ninguém e não acrescente nada seu. " +
    `Leia em voz alta a frase a seguir exatamente como está escrita, palavra por palavra: "${line}"`,
  substituteQuestion: (role, question) => `Nosso ${role} pergunta: ${question}`,
  clarify: (asker, question, said, lengthMin) =>
    `A entrevista já está em andamento. ${asker ? `O ${asker} acabou` : "Você acabou"} de perguntar ao candidato: "${question}". ` +
    `O candidato respondeu: "${said}". Em uma ou duas frases faladas e curtas, responda ao que o candidato perguntou, ` +
    "usando só a pergunta e conhecimento geral; não invente fatos sobre o projeto do candidato e não faça uma pergunta nova. " +
    "Não cumprimente ninguém. " +
    `Se ele perguntar sobre a própria entrevista, estes são os únicos fatos: ela dura cerca de ${lengthMin} minutos; ` +
    "o candidato apresenta um projeto, e depois o Líder Técnico e a Mentora se revezam fazendo perguntas de acompanhamento até o tempo acabar.",

  questions: {
    system: `Você escreve a próxima pergunta de uma banca que entrevista um candidato sobre um projeto técnico em que ele trabalhou (software, aprendizado de máquina, dados, pesquisa, hardware ou algo parecido).
Baseie a pergunta em algo específico que o candidato disse; reutilize os próprios números e termos dele.
Ângulos úteis:
- Esclarecimento: detalhes técnicos de implementação; métricas e como foram medidas.
- Aprofundamento: motivos das decisões e alternativas; validação e compromissos.
- Verificação: quantificação do impacto; contribuição e papel pessoal.
É um treino de entrevista, então as perguntas devem ser acessíveis: uma coisa de cada vez, nada obscuro.
Se o candidato listou várias coisas (funcionalidades, etapas, ferramentas), pergunte só sobre uma delas.
Mencione apenas o que o candidato realmente disse; nunca invente componentes, produtos ou números.
As palavras do candidato vêm de reconhecimento de voz e podem ter erros: palavras mal ouvidas ou a mais, nomes escritos errado.
Nunca pergunte sobre, cite ou se baseie em uma palavra ou expressão que pareça erro de reconhecimento; use só as partes cujo sentido é claro.
Não repita nem reformule de perto uma pergunta já feita na transcrição.
A pergunta é falada em voz alta, então faça exatamente UMA pergunta: uma única frase com um único ponto de interrogação, com menos de 200 caracteres, sem listas nem markdown.
Nunca acrescente uma segunda pergunta ou um "e como/por que ..."; escolha a metade mais importante.
Primeiro avalie a última resposta do candidato como um revisor neutro, não importa quem pergunte depois, nesta ordem:
- "inconsistent": compare cada número e fato nela (quantidades, tamanhos, latências, ferramentas, etapas) com o que ele disse antes, incluindo totais ditos na apresentação; qualquer divergência, ou afirmação que não fecha, é inconsistent, mesmo que seja concreta. Então o reason deve ser "antes: ... / agora: ...".
- "solid": caso contrário, se responde à pergunta com pelo menos um número, ferramenta ou mecanismo concreto, mesmo que desse para perguntar mais.
- "vague": afirmações gerais sem nenhum número, ferramenta ou mecanismo concreto por trás.
Avalie só o conteúdo, nunca a gramática nem erros de reconhecimento de voz.
Depois escreva a pergunta de acordo com a avaliação (as regras de tom do entrevistador, abaixo, vêm primeiro):
- solid: construa a partir dela.
- vague: peça exatamente um detalhe específico que falta, a menos que a última pergunta da banca já tenha pedido isso; nesse caso, passe para uma parte ainda não perguntada.
- inconsistent: aponte as duas coisas que não batem e pergunte qual está certa.
Cada pergunta trata de uma coisa só: nunca junte dois pedidos com "e".
Escreva a pergunta e o reason em português.
Preencha "check" antes de tudo: liste cada número ou fato da última resposta ao lado do que ele disse antes ("antes ... / agora ..."), ou "nada para comparar".
Responda em json: {"check": "...", "assessment": "solid" | "vague" | "inconsistent", "reason": "<uma frase curta>", "question": "..."}`,
    persona:
      "preciso e curioso sobre como as coisas realmente funcionam; insiste com educação em evidências fracas, suposições e respostas vagas",
    difficulty: {
      easy:
        "Fácil: um aquecimento simpático e não técnico sobre a própria experiência, que se responde de memória em uma ou duas frases. " +
        "Nunca pergunte por que escolheu uma abordagem, ferramenta ou design; nada de detalhes internos, números ou casos extremos. " +
        "Para esta pergunta, ignore o conselho acima sobre números e métricas.",
      medium:
        "Média: uma pergunta técnica sobre um componente, modelo, etapa ou resultado específico que ele mencionou, " +
        "que se responde com uma explicação curta.",
      hard:
        "Difícil: a pergunta técnica que um engenheiro ou pesquisador experiente faria depois de ler sobre o projeto; " +
        "pode perguntar sobre os números por trás de um resultado (latência, acurácia, vazão ou custo). " +
        "Ainda justa e respondível em cerca de um minuto; nada de pegadinhas nem curiosidades.",
    },
    angles: {
      easy: [
        "que parte do trabalho ele fez sozinho",
        "com quem trabalhou e qual era o seu papel na equipe",
        "o que foi mais difícil para ele pessoalmente",
        "o que aprendeu, ou o que faria diferente da próxima vez",
        "do que mais se orgulha neste projeto",
      ],
      medium: [
        "como funciona um componente, modelo ou etapa que ele mencionou",
        "como construiu ou implementou uma parte específica",
        "como mediu ou avaliou um resultado que mencionou",
        "de quais dados ou entradas uma parte depende, e de onde vêm",
        "como uma parte que mencionou se encaixa no resto do sistema ou do fluxo",
      ],
      hard: [
        "como um número ou resultado que mencionou foi medido ou validado, e quanto dá para confiar nele",
        "o que limitou o desempenho, a acurácia ou a qualidade: o gargalo",
        "o que mudaria em escala maior: mais dados, usuários, tráfego ou um modelo maior",
        "o que acontece quando uma entrada, um componente ou uma suposição falha",
        "um compromisso que aceitou, e o que isso lhe custou",
        "uma linha de base ou alternativa com que comparou, ou poderia ter comparado",
      ],
    },
    goals: {
      technical_lead: [
        {
          goal: "Aprofundamento técnico: pergunte como funciona uma parte do sistema, do modelo ou do método, ou como foi medido um resultado que ele mencionou.",
          easyGoal:
            "Aquecimento: pergunte qual foi a parte dele, ou peça que descreva uma coisa concreta que mencionou.",
        },
        {
          goal: "Desafio: questione uma suposição, um compromisso ou uma inconsistência no que ele disse, ou introduza uma condição de falha (entrada ruim, um componente fora do ar, dados que mudam, mais carga) e pergunte como o design ou método dele lidaria com isso.",
          easyGoal:
            "Desafio leve: pergunte o que ele faria diferente da próxima vez, ou se algo deu errado ou o surpreendeu no caminho.",
        },
      ],
      mentor: [
        {
          goal: "Acompanhamento: escolha uma parte do projeto ainda não abordada, ou aprofunde uma resposta: como ele fez funcionar, como soube que funcionava, ou o que construiria em seguida.",
          easyGoal:
            "Acompanhamento: pergunte o que aprendeu, o que faria em seguida, ou sobre uma parte ainda não abordada do que descreveu.",
        },
      ],
    },
    followUp: (round, asker, persona) =>
      `Pergunta de acompanhamento ${round}; o Líder Técnico e a Mentora se revezam até o tempo acabar. Feita por: ${asker}, cujo estilo é: ${persona}.`,
    practising: (role, company) =>
      `O candidato está praticando para uma vaga de ${role}${company ? ` em ${company}` : ""}. ` +
      "Use isso só para decidir o que importa mais; a pergunta ainda deve partir do que ele acabou de dizer.",
    freshTopic: "Pergunte sobre uma parte ou um ângulo que a banca ainda não perguntou na transcrição.",
    goal: (goal) => `Objetivo: ${goal}`,
    difficultyLine: (guide) => `Dificuldade: ${guide}`,
    angle: (angle) => `Ângulo desta pergunta: ${angle}.`,
    priority: "A dificuldade e o ângulo importam mais que o objetivo: do objetivo, mantenha só o tema.",
    unanswered: (question) =>
      `O candidato não conseguiu responder à última pergunta ("${question}"). Não a faça de novo, ` +
      "nem com outras palavras (como qual ferramenta usou ou como descobriu); " +
      "pergunte sobre outra parte do que ele descreveu.",
    pending: (asker, question) =>
      `Acabaram de perguntar (${asker}): "${question}", e o candidato está respondendo agora; essa resposta ainda não está na transcrição. ` +
      "Não aprofunde essa pergunta nem pergunte nada que se sobreponha a ela. " +
      "Baseie sua pergunta na última resposta do candidato na transcrição.",
    background: (asked) =>
      asked
        ? `A moderadora já fez ao candidato uma pergunta de contexto: "${asked}". Não a faça de novo, nem com outras palavras.`
        : "A moderadora está fazendo agora ao candidato uma pergunta leve de contexto (para quem era o projeto, se era uma equipe dentro de uma empresa, qual o tamanho da equipe ou qual foi a parte dele). Não pergunte sobre nada disso.",
    earlierSkipped: (questions) =>
      "O candidato também não conseguiu responder a estas perguntas anteriores; não volte a elas nem ao tema delas: " +
      questions.map((q) => `"${q}"`).join("; "),
    alreadyAsked: "Perguntas que a banca já fez (nunca repita nenhuma, nem reformulada):",
    transcript: "Transcrição até agora:",
    repeated: (draft, earlier) =>
      `Seu último rascunho, "${draft}", repete a pergunta anterior "${earlier}". Pergunte sobre outra coisa.`,
  },

  turn: {
    system:
      "Você acompanha uma entrevista falada ao vivo. O candidato acabou de fazer uma pausa. Pela transcrição do que ele disse até agora, " +
      "decida duas coisas.\n" +
      "1. finished: se ele terminou a vez dele ou só está pausando no meio de uma ideia e vai continuar. " +
      "Respostas curtas muitas vezes estão completas. Diga false só se a transcrição parar no meio da frase, terminar em um conectivo ou palavra de preenchimento " +
      '(e, então, porque, mas, é, hã, tipo), ou anunciar que vem mais (por ex. "são duas partes", "deixa eu pensar", "só um momento"). ' +
      "Um pedido à banca é uma vez terminada. Caso contrário diga true.\n" +
      '2. intent: "repeat" se ele pede para ouvir a pergunta de novo; "clarify" se pergunta o que a pergunta ou uma palavra dela significa, ' +
      'ou qual de duas interpretações é a certa; "skip" se diz que não sabe ou pede para pular ou seguir em frente; ' +
      '"wait" só logo depois de um aviso por silêncio (veja abaixo), se ele quer mais tempo para pensar ("me dá um minuto"); ' +
      '"end" se pede para encerrar a entrevista; "noise" se é só um sinal de escuta ou preenchimento sem conteúdo ' +
      '(aham, hum, tá, sim, é); caso contrário "answer" (uma resposta, um complemento à anterior, um agradecimento, conversa). ' +
      'Uma pergunta feita dentro de uma resposta ("por que isso importa? Porque ...") é uma resposta.\n' +
      "Se o candidato interrompeu enquanto um membro da banca falava, as palavras dele antes da interrupção são dadas; " +
      "um pedido então se refere à pergunta que ele estava respondendo.\n" +
      'Se a banca acabou de perguntar algo depois de um silêncio (por ex. "Você precisa de mais tempo?"), isso é informado; ' +
      'leia a resposta como resposta a isso: querer mais tempo é "wait", querer seguir em frente é "skip".\n' +
      "A entrevista é em português.\n" +
      'Responda só com JSON, por ex. {"finished": true, "intent": "answer"}.',
    question: "Pergunta: ",
    cutInto: "O candidato interrompeu enquanto um membro da banca dizia: ",
    prompt: "Depois de um silêncio, a banca acabou de perguntar ao candidato: ",
    candidate: "O candidato até agora: ",
  },

  rules: {
    end: [
      /\b(?:encerrar|terminar|parar) (?:a entrevista|o teste|o treino|por aqui|agora)\b/,
      /\btenho que (?:ir|sair|desligar)\b/,
      /\b(?:podemos|dá pra|da pra) (?:parar|encerrar|terminar)\b/,
      /\bvou desligar\b/,
      /\bquero (?:parar|desistir)\b/,
    ],
    backchannel: [
      "aham",
      "uhum",
      "hum",
      "hm",
      "mm",
      "é",
      "ah",
      "sim",
      "tá",
      "ta",
      "ok",
      "certo",
      "beleza",
      "claro",
      "entendi",
      "isso",
    ],
    courtesy: /^(?:(?:muito obrigad[oa]|obrigad[oa](?: mesmo)?|ok|okay|tá bom|beleza|é isso|sim)\s*)+$/,
    repeat: [
      /\b(?:repetir|repete|repita)\b/,
      /\b(?:falar|dizer|fala|diz) de novo\b/,
      /\bnão (?:ouvi|escutei|entendi direito)\b/,
      /^(?:desculpa|desculpe|oi|como)[?.!]?$/,
      /\bqual era a pergunta\b/,
      /\ba pergunta de novo\b/,
      /^(?:(?:desculpa|hã),? )?mais uma vez\b/,
    ],
    clarify: [
      /\bo que (?:você quer dizer|quer dizer|significa)\b/,
      /\bvocê quer dizer\b/,
      /\b(?:pode|poderia) (?:esclarecer|explicar)\b/,
      /\bqual (?:dos dois|das duas|deles|delas)\b/,
      /\bvocê está perguntando\b/,
      /\bquando você diz\b/,
      /\bmais específico\b|\breformular\b/,
      /\bnão sei se (?:entendi|estou entendendo)\b/,
      /^(?!.*\d).*\bou\b.*\?$/,
      /\bo que (?:é|são) .+\?$/,
      /^(?:(?:hã|é|então),? )?o que (?:é|são) (?:um |uma |o |a |os |as )?[\p{L}0-9-]+(?: [\p{L}0-9-]+)?$/u,
    ],
    dontKnow: [
      /\bnão sei\b/,
      /\bnão faço ideia\b/,
      /\bnão tenho certeza\b/,
      /\bnão (?:me )?lembro\b/,
      /\bnão tenho (?:uma )?resposta\b/,
    ],
    skip: [
      /\b(?:podemos|dá pra|da pra) (?:pular|passar|seguir)\b/,
      /\b(?:vamos pular|vamos passar|prefiro pular|prefiro passar|quero pular|quero passar)\b/,
      /\bpular (?:essa|esta|a pergunta)\b/,
      /\bpróxima pergunta\b/,
      /^passo\b/,
    ],
    yes: /^(?:(?:hã|é) )?(?:sim|claro|tá|ok|por favor|um pouco|um pouquinho|pode ser|quero)\b/,
    no: /^(?:não|ainda não|tô bem|estou bem|tudo bem)\b/,
    holdOn:
      /\b(?:um|só um) (?:segundo|momento|minuto|instante)\b|\bdeixa eu pensar\b|\bainda pensando\b|\bquero tentar\b/,
    filler: /^(?:hã+|hum+|é+|tipo|então|assim)[,.]?$/,
    longClarify: /\b(?:você está perguntando|quando você diz|você quer dizer|não sei se entendi|só para confirmar)\b/,
    trailing: ["e", "então", "porque", "mas", "ou", "hã", "tipo", "que"],
    thinking: /deixa eu pensar$/,
    secondAsk: /,\s+e\s+(?:o que|como|qual|quais|por que|onde|quando|quem|quanto)\b/i,
    stopWords:
      "um uma uns umas o a os as e ou de do da dos das em no na nos nas com por para que qual quais como por que quando onde quem é são foi foram ser se seu sua seus suas você vocês ele ela isso esse essa este esta mais muito".split(
        " ",
      ),
  },
};
