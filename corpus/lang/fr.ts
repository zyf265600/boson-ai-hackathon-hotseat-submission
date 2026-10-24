// Français (France). Structure et raisons dans en.ts. Les noms de champs et valeurs du JSON (finished, intent, assessment…) restent en anglais : le code les lit ainsi.
import type { LanguagePack } from "./types";

export const fr: LanguagePack = {
  roles: {
    moderator: "Modératrice",
    technical_lead: "Responsable technique",
    mentor: "Mentore",
    candidate: "Candidat",
  },

  askerLines: {
    moderator: {
      silence: {
        8: "Prenez votre temps, rien ne presse.",
        15: "Avez-vous besoin d'un peu plus de temps ?",
        25: "Voulez-vous passer à la question suivante ?",
      },
      wrapUp: "Merci, c'est très utile. Pour tenir le temps, arrêtons-nous là.",
    },
    technical_lead: {
      silence: {
        8: "Prenez votre temps, rien ne presse.",
        15: "Avez-vous besoin d'un peu plus de temps ?",
        25: "Voulez-vous passer à la question suivante ?",
      },
      wrapUp: "Merci, c'est très utile. Pour tenir le temps, arrêtons-nous là.",
    },
    mentor: {
      silence: {
        8: "Prenez votre temps, rien ne presse du tout.",
        15: "Vous voulez encore un petit moment ?",
        25: "Voulez-vous passer à la question suivante ?",
      },
      wrapUp: "Merci beaucoup, c'était très utile. Le temps nous manque, alors arrêtons-nous là.",
    },
  },
  closing: {
    timeUp:
      "Nous arrivons à la fin du temps, alors terminons ici. Merci beaucoup de nous avoir présenté votre projet, et bonne chance !",
    endEarly: "Bien sûr, arrêtons-nous ici. Merci pour votre temps aujourd'hui, et bonne chance !",
  },
  openingQuestion:
    "Pourriez-vous décrire un projet technique que vous avez réalisé : le problème, l'architecture et votre propre contribution ?",
  backupQuestions: {
    technical_lead: {
      easy: [
        "Quelle partie du projet avez-vous construite vous-même, et que faisait-elle ?",
        "Est-ce que quelque chose s'est mal passé ou vous a surpris pendant le projet ? Que s'est-il passé ?",
        "Sur quel outil ou quelle bibliothèque vous êtes-vous le plus appuyé dans ce projet ?",
      ],
      medium: [
        "Pouvez-vous m'expliquer étape par étape le fonctionnement d'un composant clé de votre système ?",
        "Si un composant de votre système cessait de fonctionner, que verrait l'utilisateur ?",
        "Quel était le principal goulot d'étranglement de votre système, et comment l'avez-vous trouvé ?",
      ],
      hard: [
        "Comment avez-vous vérifié que votre résultat principal était réel, et qu'est-ce qui pourrait rendre cette mesure trompeuse ?",
        "Quelle est l'hypothèse la plus fragile de votre conception, et que se passerait-il si elle s'avérait fausse ?",
        "Qu'est-ce qui casserait en premier si la charge de votre système était multipliée par cent ?",
      ],
    },
    mentor: {
      easy: [
        "De quelle partie de ce projet êtes-vous le plus fier ?",
        "Qu'avez-vous appris dans ce projet que vous utilisez encore aujourd'hui ?",
        "Comment vous êtes-vous réparti le travail avec les personnes qui l'ont construit avec vous ?",
      ],
      medium: [
        "Comment avez-vous réussi à faire vraiment fonctionner la partie la plus difficile du projet ?",
        "Comment avez-vous su que votre projet fonctionnait comme vous le vouliez ?",
        "Que feriez-vous différemment si vous recommenciez ce projet ?",
      ],
      hard: [
        "Si vous aviez trois mois de plus sur ce projet, que construiriez-vous ensuite pour l'améliorer ?",
        "De quelle décision de ce projet êtes-vous le moins sûr aujourd'hui, et pourquoi ?",
        "Quel compromis de votre conception voudriez-vous qu'un nouveau coéquipier comprenne en premier ?",
      ],
    },
  },

  moderatorPrompt:
    "Vous êtes la modératrice d'un jury de trois personnes qui interroge un candidat sur un projet technique auquel il a travaillé. " +
    "Les autres membres du jury sont un Responsable technique et une Mentore ; leurs questions apparaissent dans la conversation avec leur rôle. " +
    "Vous ouvrez et clôturez l'entretien et le faites avancer. Ne posez pas vous-même de questions techniques approfondies. " +
    "Chaque intervention tient en une ou deux phrases orales courtes, sans listes ni markdown. " +
    "Parlez uniquement français pendant tout l'entretien.",
  opening: (role, company, say, names) =>
    `Saluez le candidat, présentez-vous comme ${names.moderator}, la modératrice, puis présentez le jury en une phrase : ` +
    `${names.technical_lead}, le Responsable technique, et ${names.mentor}, la Mentore. ` +
    "Dites qu'il s'agit d'un entretien d'entraînement pour le poste de " +
    `${role}${company ? ` chez ${company}` : ""}, et demandez-lui de décrire un projet technique qu'il a réalisé : ` +
    "le problème, l'architecture et sa propre contribution." +
    (company && say !== company
      ? ` Prononcez le nom de l'entreprise « ${company} » pour qu'il sonne comme « ${say} » (ce n'est qu'une indication de prononciation : ne l'épelez pas et ne lisez pas les traits d'union).`
      : ""),
  openingReply: (said, heard, names, role, company, say) =>
    (heard ? `Vous aviez dit « ${heard} »` : "Vous n'aviez encore rien dit") +
    ` quand le candidat vous a interrompue et a dit : « ${said} ». Votre réponse entière tient en deux phrases courtes. ` +
    "Répondez d'abord à ce qu'il a réellement dit, en quelques mots (saluez-le par son prénom s'il l'a donné ; ne dites pas bonjour deux fois). " +
    `Si vous n'aviez pas fini de présenter le jury, nommez-le en quelques mots : ${names.technical_lead}, le Responsable technique, ` +
    `et ${names.mentor}, la Mentore (et vous-même, ${names.moderator}, si vous n'aviez pas encore dit votre prénom). ` +
    "Puis demandez brièvement un projet qu'il a réalisé, par exemple « Pourriez-vous nous parler d'un projet que vous avez réalisé ? » " +
    "N'énumérez pas ce qu'il doit couvrir (problème, architecture, contribution) et ne répétez pas toute la question d'ouverture." +
    ` Les faits, s'il les demande : il s'agit d'un entretien d'entraînement pour le poste de ${role}${company ? ` chez ${company}` : ""} ; le jury, c'est vous (${names.moderator}, la modératrice), ${names.technical_lead} (le Responsable technique) et ${names.mentor} (la Mentore). ` +
    "Ne répétez pas ce que vous aviez déjà dit : répondez seulement à sa question." +
    (company && say !== company
      ? ` Prononcez « ${company} » pour qu'il sonne comme « ${say} » (simple indication de prononciation).`
      : ""),
  handoff: (after, next) =>
    `${
      {
        introduction: "Merci de nous avoir présenté votre projet.",
        addition: "Merci pour cette précision.",
        unanswered: "Ce n'est pas grave du tout.",
      }[after]
    } ${next}, à vous.`,
  timeBuyer: (said, next) =>
    `L'entretien est déjà en cours. Le candidat vient de présenter son projet : « ${said} ». ` +
    "En une courte phrase, remerciez-le (sans compliment, sans salutation). Posez ensuite une question courte et légère sur le " +
    "contexte du projet, à laquelle il n'a pas encore répondu : par exemple pour qui c'était, si c'était une équipe au sein d'une entreprise, " +
    `la taille de l'équipe ou sa propre part. Ne posez rien de technique ni d'approfondi : ${next}, le Responsable technique, s'en charge ensuite. ` +
    "Une seule question, et moins de 30 mots en tout.",
  sayAgain: "Désolée, je n'ai pas bien entendu. Pourriez-vous répéter ?",
  missedPart: "Désolée, j'ai manqué une partie de votre réponse. Pourriez-vous la répéter ?",
  resume: "Désolée, la connexion a coupé un instant. Nous sommes de retour, alors continuons.",
  answerAgain: "Pourriez-vous répondre à nouveau à la dernière question, s'il vous plaît ?",
  endEarly: (said) =>
    `L'entretien est déjà en cours. Le candidat a demandé d'arrêter maintenant : « ${said} ». En une ou deux phrases orales courtes, ` +
    "acceptez chaleureusement, remerciez-le pour son temps et souhaitez-lui bonne chance. Ne saluez pas et ne posez pas de question.",
  readAloud: (line) =>
    "L'entretien est déjà en cours et le candidat vient de parler. Ne saluez personne et n'ajoutez rien de vous-même. " +
    `Lisez à voix haute la phrase suivante exactement telle qu'elle est écrite, mot pour mot : « ${line} »`,
  substituteQuestion: (role, question) => `Notre ${role} demande : ${question}`,
  clarify: (asker, question, said, lengthMin) =>
    `L'entretien est déjà en cours. ${asker ? `Le ${asker} vient` : "Vous venez"} de demander au candidat : « ${question} ». ` +
    `Le candidat a répondu : « ${said} ». En une ou deux phrases orales courtes, répondez à ce que le candidat a demandé, ` +
    "en vous appuyant uniquement sur la question et sur des connaissances générales ; n'inventez rien sur le projet du candidat " +
    "et ne posez pas de nouvelle question. Ne saluez pas. " +
    `S'il pose une question sur l'entretien lui-même, voici les seuls faits : il dure environ ${lengthMin} minutes ; ` +
    "le candidat présente un projet, puis le Responsable technique et la Mentore posent à tour de rôle des questions de suivi jusqu'à la fin du temps.",

  questions: {
    system: `Vous rédigez la prochaine question d'un jury qui interroge un candidat sur un projet technique auquel il a travaillé (logiciel, apprentissage automatique, données, recherche, matériel ou similaire).
Appuyez la question sur un élément précis que le candidat a dit ; reprenez ses propres chiffres et termes.
Angles utiles :
- Clarification : détails techniques de mise en œuvre ; métriques et manière de les mesurer.
- Approfondissement : raisons des décisions et alternatives ; validation et compromis.
- Vérification : quantification de l'impact ; contribution et rôle personnels.
C'est un entraînement à l'entretien, donc les questions restent abordables : une chose à la fois, rien d'obscur.
Si le candidat a énuméré plusieurs choses (fonctionnalités, étapes, outils), ne demandez que l'une d'elles.
Ne mentionnez que ce que le candidat a réellement dit ; n'inventez jamais de composants, de produits ni de chiffres.
Les paroles du candidat viennent de la reconnaissance vocale et peuvent contenir des erreurs : mots mal entendus ou en trop, noms mal orthographiés.
Ne posez jamais de question sur un mot ou une expression qui ressemble à une erreur de reconnaissance, ne le citez pas et ne vous appuyez pas dessus ; utilisez seulement les parties dont le sens est clair.
Ne répétez pas et ne reformulez pas de près une question déjà posée dans la transcription.
La question est dite à voix haute : posez exactement UNE question, une seule phrase avec un seul point d'interrogation, moins de 200 caractères, sans listes ni markdown.
N'ajoutez jamais de deuxième question ni de « et comment/pourquoi ... » ; choisissez la moitié la plus importante.
Évaluez d'abord la dernière réponse du candidat en évaluateur neutre, quel que soit le prochain à poser la question, dans cet ordre :
- "inconsistent" : comparez chaque chiffre et chaque fait (quantités, tailles, latences, outils, étapes) avec ce qu'il a dit plus tôt, y compris les totaux donnés dans la présentation ; toute divergence, ou une affirmation qui ne tient pas, est inconsistent, même si elle est concrète. Le reason doit alors être « avant : ... / maintenant : ... ».
- "solid" : sinon, elle répond à la question avec au moins un chiffre, un outil ou un mécanisme concret, même si l'on pourrait demander plus.
- "vague" : des affirmations générales sans chiffre, outil ou mécanisme concret derrière.
N'évaluez que le contenu, jamais la grammaire ni les erreurs de reconnaissance vocale.
Puis rédigez la question selon l'évaluation (les règles de ton de l'intervieweur, plus bas, passent avant) :
- solid : appuyez-vous dessus.
- vague : demandez exactement un élément précis qui manque, sauf si la dernière question du jury l'a déjà demandé ; dans ce cas, passez à une partie pas encore abordée.
- inconsistent : nommez les deux éléments qui ne concordent pas et demandez lequel est juste.
Chaque question porte sur une seule chose : ne reliez jamais deux demandes par « et ».
Rédigez la question et le reason en français.
Remplissez "check" avant tout : listez chaque chiffre ou fait de la dernière réponse à côté de ce qu'il en a dit plus tôt (« avant ... / maintenant ... »), ou « rien à comparer ».
Répondez en json : {"check": "...", "assessment": "solid" | "vague" | "inconsistent", "reason": "<une phrase courte>", "question": "..."}`,
    persona:
      "précis et curieux de savoir comment les choses fonctionnent vraiment ; insiste poliment sur les preuves faibles, les hypothèses et les approximations",
    difficulty: {
      easy:
        "Facile : un échauffement amical et non technique sur sa propre expérience, auquel on répond de mémoire en une ou deux phrases. " +
        "Ne demandez jamais pourquoi il a choisi une approche, un outil ou une conception ; pas de détails internes, de chiffres ni de cas limites. " +
        "Pour cette question, ignorez le conseil ci-dessus sur les chiffres et les métriques.",
      medium:
        "Moyen : une question technique sur un composant, un modèle, une étape ou un résultat précis qu'il a mentionné, " +
        "à laquelle on répond par une courte explication.",
      hard:
        "Difficile : la question technique qu'un ingénieur ou un chercheur expérimenté pose après avoir lu la description du projet ; " +
        "elle peut porter sur les chiffres derrière un résultat (latence, précision, débit ou coût). " +
        "Elle reste juste et on y répond en une minute environ ; pas de piège ni de culture générale.",
    },
    angles: {
      easy: [
        "quelle partie du travail il a faite lui-même",
        "avec qui il a travaillé et quel était son rôle dans l'équipe",
        "ce qui a été le plus difficile pour lui personnellement",
        "ce qu'il a appris, ou ce qu'il ferait différemment la prochaine fois",
        "ce dont il est le plus fier dans ce projet",
      ],
      medium: [
        "comment fonctionne un composant, un modèle ou une étape qu'il a mentionné",
        "comment il a construit ou mis en œuvre une partie précise",
        "comment il a mesuré ou évalué un résultat qu'il a mentionné",
        "de quelles données ou entrées dépend une partie, et d'où elles viennent",
        "comment une partie qu'il a mentionnée s'intègre au reste du système ou de la chaîne",
      ],
      hard: [
        "comment un chiffre ou un résultat qu'il a mentionné a été mesuré ou validé, et jusqu'où on peut s'y fier",
        "ce qui a limité la performance, la précision ou la qualité : le goulot d'étranglement",
        "ce qui changerait à plus grande échelle : plus de données, d'utilisateurs, de trafic ou un modèle plus gros",
        "ce qui se passe quand une entrée, un composant ou une hypothèse échoue",
        "un compromis qu'il a accepté, et ce qu'il lui a coûté",
        "une référence ou une alternative à laquelle il s'est comparé, ou aurait pu se comparer",
      ],
    },
    goals: {
      technical_lead: [
        {
          goal: "Approfondissement technique : demandez comment fonctionne une partie du système, du modèle ou de la méthode, ou comment un résultat mentionné a été mesuré.",
          easyGoal:
            "Échauffement : demandez quelle était sa propre part, ou de décrire une chose concrète qu'il a mentionnée.",
        },
        {
          goal: "Remise en question : questionnez une hypothèse, un compromis ou une incohérence dans ce qu'il a dit, ou introduisez une condition de panne (mauvaise entrée, composant en panne, données qui changent, charge accrue) et demandez comment sa conception ou sa méthode la gérerait.",
          easyGoal:
            "Remise en question douce : demandez ce qu'il ferait différemment la prochaine fois, ou si quelque chose s'est mal passé ou l'a surpris en chemin.",
        },
      ],
      mentor: [
        {
          goal: "Suivi : choisissez une partie du projet pas encore abordée, ou approfondissez une réponse : comment il l'a fait fonctionner, comment il a su que ça marchait, ou ce qu'il construirait ensuite.",
          easyGoal:
            "Suivi : demandez ce qu'il a appris, ce qu'il ferait ensuite, ou une partie pas encore abordée de ce qu'il a décrit.",
        },
      ],
    },
    followUp: (round, asker, persona) =>
      `Question de suivi ${round} ; le Responsable technique et la Mentore se relaient jusqu'à la fin du temps. Posée par : ${asker}, dont le style est : ${persona}.`,
    practising: (role, company) =>
      `Le candidat s'entraîne pour un poste de ${role}${company ? ` chez ${company}` : ""}. ` +
      "Servez-vous-en seulement pour choisir ce qui compte le plus ; la question doit toujours partir de ce qu'il vient de dire.",
    freshTopic: "Demandez une partie ou un angle que le jury n'a pas encore abordé dans la transcription.",
    goal: (goal) => `Objectif : ${goal}`,
    difficultyLine: (guide) => `Difficulté : ${guide}`,
    angle: (angle) => `Angle pour cette question : ${angle}.`,
    priority: "La difficulté et l'angle comptent plus que l'objectif : de l'objectif, ne gardez que le sujet.",
    unanswered: (question) =>
      `Le candidat n'a pas pu répondre à la dernière question (« ${question} »). Ne la reposez pas, ` +
      "même autrement formulée (par exemple quel outil il a utilisé ou comment il l'a trouvé) ; " +
      "demandez une autre partie de ce qu'il a décrit.",
    pending: (asker, question) =>
      `On vient de demander (${asker}) : « ${question} », et le candidat y répond en ce moment ; cette réponse n'est pas encore dans la transcription. ` +
      "Ne relancez pas cette question et ne demandez rien qui la recoupe. " +
      "Appuyez votre question sur la dernière réponse du candidat dans la transcription.",
    background: (asked) =>
      asked
        ? `La modératrice a déjà posé au candidat une question de contexte : « ${asked} ». Ne la reposez pas, même autrement formulée.`
        : "La modératrice pose en ce moment au candidat une question légère de contexte (pour qui était le projet, si c'était une équipe au sein d'une entreprise, la taille de l'équipe ou sa propre part). Ne demandez rien de tout cela.",
    earlierSkipped: (questions) =>
      "Le candidat n'a pas non plus pu répondre à ces questions précédentes ; n'y revenez pas, ni à leur sujet : " +
      questions.map((q) => `« ${q} »`).join(" ; "),
    alreadyAsked: "Questions déjà posées par le jury (n'en reposez jamais aucune, même reformulée) :",
    transcript: "Transcription jusqu'ici :",
    repeated: (draft, earlier) =>
      `Votre dernier brouillon, « ${draft} », répète la question précédente « ${earlier} ». Demandez autre chose.`,
  },

  turn: {
    system:
      "Vous suivez un entretien oral en direct. Le candidat vient de marquer une pause. À partir de la transcription de ce qu'il a dit jusqu'ici, " +
      "décidez deux choses.\n" +
      "1. finished : s'il a terminé son tour ou s'il fait seulement une pause au milieu d'une idée et va continuer. " +
      "Les réponses courtes sont souvent complètes. Répondez false seulement si la transcription s'arrête au milieu d'une phrase, finit par un connecteur ou une hésitation " +
      "(et, donc, parce que, mais, euh, ben), ou annonce une suite (par ex. « il y a deux parties », « laissez-moi réfléchir », « un instant »). " +
      "Une demande adressée au jury est un tour terminé. Sinon répondez true.\n" +
      '2. intent : "repeat" s\'il demande à réentendre la question ; "clarify" s\'il demande ce que signifie la question ou un de ses mots, ' +
      "ou laquelle de deux interprétations est la bonne ; \"skip\" s'il dit qu'il ne sait pas ou demande de passer ; " +
      '"wait" seulement juste après une relance après un silence (voir plus bas), s\'il veut plus de temps pour réfléchir (« donnez-moi une minute ») ; ' +
      "\"end\" s'il demande d'arrêter l'entretien ; \"noise\" si ce n'est qu'une marque d'écoute ou une hésitation sans contenu " +
      '(mm, hum, d\'accord, oui, euh) ; sinon "answer" (une réponse, un ajout à la précédente, un remerciement, une politesse). ' +
      "Une question posée au sein d'une réponse (« pourquoi est-ce important ? Parce que ... ») est une réponse.\n" +
      "Si le candidat a interrompu un membre du jury, les mots du membre du jury avant la coupure sont donnés ; " +
      "une demande se rapporte alors à la question à laquelle il répondait.\n" +
      "Si le jury vient de lui demander quelque chose après un silence (par ex. « Avez-vous besoin d'un peu plus de temps ? »), c'est indiqué ; " +
      'lisez la réponse comme une réponse à cela : vouloir plus de temps est "wait", vouloir passer est "skip".\n' +
      "L'entretien se déroule en français.\n" +
      'Répondez uniquement en JSON, par ex. {"finished": true, "intent": "answer"}.',
    question: "Question : ",
    cutInto: "Le candidat a interrompu pendant qu'un membre du jury disait : ",
    prompt: "Après un silence, le jury vient de demander au candidat : ",
    candidate: "Le candidat jusqu'ici : ",
  },

  rules: {
    end: [
      /\b(?:arrêter|terminer|finir) (?:l'entretien|le test|l'exercice|ici|maintenant)\b/,
      /\bje dois (?:partir|y aller|raccrocher)\b/,
      /\b(?:on peut|pouvons-nous|est-ce qu'on peut) (?:arrêter|s'arrêter|terminer)\b/,
      /\bje vais raccrocher\b/,
      /\bje veux (?:arrêter|abandonner)\b/,
    ],
    backchannel: [
      "mm",
      "hm",
      "hum",
      "euh",
      "ben",
      "oui",
      "ouais",
      "ok",
      "okay",
      "d'accord",
      "voilà",
      "bien",
      "entendu",
      "exact",
      "ah",
    ],
    courtesy: /^(?:(?:merci(?: beaucoup)?|d\'accord|ok|okay|voilà|c\'est tout|oui)\s*)+$/,
    repeat: [
      /\b(?:répéter|répétez|répète|redire|redites)\b/,
      /\bpouvez-vous (?:la )?répéter\b/,
      /\bje n'ai pas (?:bien )?(?:entendu|compris)\b/,
      /^(?:pardon|comment)[?.!]?$/,
      /\bquelle était la question\b/,
      /\bla question (?:encore|à nouveau)\b/,
      /^(?:(?:pardon|euh),? )?encore une fois\b/,
    ],
    clarify: [
      /\bqu'est-ce que vous voulez dire\b/,
      /\bque voulez-vous dire\b/,
      /\bque (?:veut dire|signifie)\b/,
      /\bvous voulez dire\b/,
      /\b(?:pouvez-vous|pourriez-vous) (?:préciser|expliquer|clarifier)\b/,
      /\blequel\b|\blaquelle\b/,
      /\bvous me demandez\b/,
      /\bquand vous dites\b/,
      /\bplus précis\b|\breformuler\b/,
      /\bje ne suis pas sûr de (?:comprendre|suivre)\b/,
      /^(?!.*\d).*\bou\b.*\?$/,
      /\bqu'est-ce que .+ \?$|\bqu'est-ce qu'un .+\?$/,
      /^(?:(?:euh|ben|donc),? )?c'est quoi (?:un |une |le |la |les )?[\p{L}0-9-]+(?: [\p{L}0-9-]+)?$/u,
    ],
    dontKnow: [
      /\bje (?:ne )?sais pas\b/,
      /\baucune idée\b/,
      /\bpas sûr\b/,
      /\bje (?:ne )?(?:me )?souviens (?:plus|pas)\b/,
      /\bje n'ai pas de réponse\b/,
    ],
    skip: [
      /\b(?:on peut|pouvons-nous|est-ce qu'on peut) (?:passer|sauter)\b/,
      /\b(?:passons|je préfère passer|je voudrais passer|je veux passer)\b/,
      /\bpasser (?:cette|la) question\b/,
      /\bquestion suivante\b/,
      /^je passe\b/,
    ],
    yes: /^(?:(?:euh|mm) )?(?:oui|ouais|d'accord|ok|okay|volontiers|s'il vous plaît|un peu|un petit peu)\b/,
    no: /^(?:non|pas encore|ça va|c'est bon)\b/,
    holdOn:
      /\b(?:une|un) (?:seconde|instant|minute|moment)\b|\blaissez-moi réfléchir\b|\bje réfléchis encore\b|\bje veux essayer\b/,
    filler: /^(?:euh+|hum+|mm+|ben|donc|genre|bah)[,.]?$/,
    longClarify:
      /\b(?:vous me demandez|quand vous dites|vous voulez dire|je ne suis pas sûr de comprendre|pour être sûr)\b/,
    trailing: ["et", "donc", "parce", "que", "mais", "ou", "euh", "ben", "alors"],
    thinking: /laissez-moi réfléchir$|je réfléchis$/,
    secondAsk: /,\s+et\s+(?:que|qu'|comment|quel|quelle|quels|quelles|pourquoi|où|quand|qui|combien)\b/i,
    stopWords:
      "un une des le la les l' et ou de du d' à au aux en avec par pour que qu' quoi comment quel quelle quels quelles pourquoi quand où qui est sont était été être se sa son ses votre vos vous il elle ils elles ce cette ces cela ça dans sur comme plus très".split(
        " ",
      ),
  },
};
