// Español (Latinoamérica). Estructura y motivos en en.ts. Los nombres de campo y valores del JSON (finished, intent, assessment…) quedan en inglés: el código los lee así.
import type { LanguagePack } from "./types";

export const es: LanguagePack = {
  roles: { moderator: "Moderadora", technical_lead: "Líder Técnico", mentor: "Mentora", candidate: "Candidato" },

  askerLines: {
    moderator: {
      silence: {
        8: "Tómate tu tiempo, sin prisa.",
        15: "¿Necesitas más tiempo?",
        25: "¿Quieres pasar a la siguiente pregunta?",
      },
      wrapUp: "Gracias, esto es muy útil. Por cuestión de tiempo, dejémoslo aquí.",
    },
    technical_lead: {
      silence: {
        8: "Tómate tu tiempo, sin prisa.",
        15: "¿Necesitas más tiempo?",
        25: "¿Quieres pasar a la siguiente pregunta?",
      },
      wrapUp: "Gracias, esto es muy útil. Por cuestión de tiempo, dejémoslo aquí.",
    },
    mentor: {
      silence: {
        8: "Tómate tu tiempo, no hay ninguna prisa.",
        15: "¿Necesitas un poco más de tiempo?",
        25: "¿Quieres pasar a la siguiente pregunta?",
      },
      wrapUp: "Muchas gracias, fue muy útil. Nos queda poco tiempo, así que dejémoslo aquí.",
    },
  },
  closing: {
    timeUp:
      "Se nos acabó el tiempo, así que cerremos aquí. Muchas gracias por contarnos sobre tu proyecto, ¡y mucho éxito!",
    endEarly: "Claro, dejémoslo aquí. Gracias por tu tiempo hoy, ¡y mucho éxito!",
  },
  openingQuestion:
    "¿Podrías describir un proyecto técnico que hayas construido: el problema, la arquitectura y tu propia contribución?",
  backupQuestions: {
    technical_lead: {
      easy: [
        "¿Qué parte del proyecto construiste tú mismo y qué hacía?",
        "¿Algo salió mal o te sorprendió durante el proyecto? ¿Qué pasó?",
        "¿En qué herramienta o biblioteca te apoyaste más en este proyecto?",
      ],
      medium: [
        "¿Me puedes explicar paso a paso cómo funciona un componente clave de tu sistema?",
        "Si un componente de tu sistema dejara de funcionar, ¿qué vería el usuario?",
        "¿Cuál fue el principal cuello de botella de tu sistema y cómo lo encontraste?",
      ],
      hard: [
        "¿Cómo comprobaste que tu resultado principal era real y qué podría hacer engañosa esa medición?",
        "¿Cuál es la suposición más débil de tu diseño y qué pasaría si resultara falsa?",
        "¿Qué se rompería primero si la carga de tu sistema creciera cien veces?",
      ],
    },
    mentor: {
      easy: [
        "¿De qué parte de este proyecto te sientes más orgulloso?",
        "¿Qué aprendiste en este proyecto que todavía usas hoy?",
        "¿Cómo se repartieron el trabajo con las personas que lo construyeron contigo?",
      ],
      medium: [
        "¿Cómo lograste que la parte más difícil del proyecto funcionara de verdad?",
        "¿Cómo supiste que tu proyecto funcionaba como querías?",
        "¿Qué harías diferente si empezaras este proyecto de nuevo?",
      ],
      hard: [
        "Si tuvieras tres meses más para este proyecto, ¿qué construirías después para mejorarlo?",
        "¿De qué decisión de este proyecto estás menos seguro ahora y por qué?",
        "¿Qué compromiso de tu diseño querrías que un nuevo compañero de equipo entendiera primero?",
      ],
    },
  },

  moderatorPrompt:
    "Eres la moderadora de un panel de tres personas que entrevista a un candidato sobre un proyecto técnico en el que trabajó. " +
    "Los otros panelistas son un Líder Técnico y una Mentora; sus preguntas aparecen en la conversación con la etiqueta de su rol. " +
    "Tú abres y cierras la entrevista y la mantienes en marcha. No hagas tú preguntas técnicas profundas. " +
    "Cada intervención debe ser de una o dos frases habladas y breves, sin listas ni markdown. " +
    "Habla solo en español durante toda la entrevista.",
  opening: (role, company, say, names) =>
    `Saluda al candidato, preséntate como ${names.moderator}, la moderadora, y presenta al panel en una frase: ` +
    `${names.technical_lead}, el Líder Técnico, y ${names.mentor}, la Mentora. Di que es una entrevista de práctica para el puesto de ` +
    `${role}${company ? ` en ${company}` : ""} y pídele que describa un proyecto técnico que haya construido: ` +
    "el problema, la arquitectura y su propia contribución." +
    (company && say !== company
      ? ` Pronuncia el nombre de la empresa "${company}" de modo que suene como "${say}" (solo es una guía de pronunciación: no lo deletrees ni leas los guiones).`
      : ""),
  openingReply: (said, heard, names, role, company, say) =>
    (heard ? `Habías dicho "${heard}"` : "Todavía no habías dicho nada") +
    ` cuando el candidato te interrumpió y dijo: "${said}". Tu respuesta completa debe tener dos frases breves. ` +
    "Primero responde a lo que realmente dijo, en pocas palabras (salúdalo por su nombre si lo dio; no saludes dos veces). " +
    `Si no habías terminado de presentar al panel, nómbralo en pocas palabras: ${names.technical_lead}, el Líder Técnico, ` +
    `y ${names.mentor}, la Mentora (y tú, ${names.moderator}, si aún no habías dicho tu nombre). ` +
    'Luego pídele brevemente un proyecto que haya construido, por ejemplo "¿Nos podrías contar sobre un proyecto que hayas construido?" ' +
    "No enumeres qué debe cubrir (problema, arquitectura, contribución) y no repitas la pregunta de apertura completa." +
    ` Datos, si los pregunta: es una entrevista de práctica para el puesto de ${role}${company ? ` en ${company}` : ""}; el panel son tú (${names.moderator}, la moderadora), ${names.technical_lead} (el Líder Técnico) y ${names.mentor} (la Mentora). ` +
    "No repitas lo que ya habías dicho: responde solo a lo que preguntó." +
    (company && say !== company
      ? ` Pronuncia "${company}" de modo que suene como "${say}" (solo una guía de pronunciación).`
      : ""),
  handoff: (after, next) =>
    `${
      {
        introduction: "Gracias por contarnos sobre tu proyecto.",
        addition: "Gracias por agregar eso.",
        unanswered: "No te preocupes, está perfectamente bien.",
      }[after]
    } ${next}, te cedo la palabra.`,
  timeBuyer: (said, next) =>
    `La entrevista ya está en curso. El candidato acaba de presentar su proyecto: "${said}". ` +
    "En una frase corta, dale las gracias (sin elogios, sin saludar). Luego haz una pregunta corta y ligera sobre el contexto " +
    "del proyecto que todavía no haya respondido, por ejemplo para quién era, si era un equipo dentro de una empresa, qué tan grande era el equipo " +
    `o cuál fue su propia parte. No preguntes nada técnico ni en profundidad: eso lo pregunta a continuación ${next}, el Líder Técnico. ` +
    "Haz una sola pregunta y que toda la respuesta tenga menos de 30 palabras.",
  timeBuyerAgain: (said, asked, answer, next) =>
    `La entrevista ya está en curso. El candidato presentó su proyecto: "${said}". Luego preguntaste: "${asked}", y respondió: "${answer}". ` +
    "En pocas palabras, reconoce la respuesta (sin elogios, sin saludar). Luego haz otra pregunta corta y ligera sobre el contexto " +
    "del proyecto que nada de esto haya cubierto todavía, por ejemplo para quién era, cuánto tiempo llevó, qué tan grande era el equipo o cuál fue su propia parte. " +
    `No preguntes nada técnico ni en profundidad: eso lo pregunta a continuación ${next}, el Líder Técnico. ` +
    "Haz una sola pregunta y que toda la respuesta tenga menos de 25 palabras.",
  sayAgain: "Perdón, no te escuché bien. ¿Podrías repetirlo?",
  missedPart: "Perdón, me perdí una parte de tu respuesta. ¿Podrías repetirla?",
  resume: "Perdón, la conexión se cortó un momento. Ya estamos de vuelta, así que sigamos.",
  answerAgain: "¿Podrías responder de nuevo a la última pregunta, por favor?",
  endEarly: (said) =>
    `La entrevista ya está en curso. El candidato pidió terminar ahora: "${said}". En una o dos frases habladas y breves, ` +
    "acepta con amabilidad, agradécele su tiempo y deséale suerte. No saludes y no hagas preguntas.",
  readAloud: (line) =>
    "La entrevista ya está en curso y el candidato acaba de hablar. No saludes a nadie y no agregues nada propio. " +
    `Lee en voz alta la siguiente frase exactamente como está escrita, palabra por palabra: "${line}"`,
  substituteQuestion: (role, question) => `Nuestro ${role} pregunta: ${question}`,
  clarify: (asker, question, said, lengthMin) =>
    `La entrevista ya está en curso. ${asker ? `El ${asker}` : "Tú"} acaba${asker ? "" : "s"} de preguntarle al candidato: "${question}". ` +
    `El candidato respondió: "${said}". En una o dos frases habladas y breves, responde lo que preguntó el candidato, ` +
    "usando solo la pregunta y conocimiento general; no inventes datos sobre el proyecto del candidato y no hagas una pregunta nueva. " +
    "No saludes. " +
    `Si pregunta sobre la entrevista en sí, estos son los únicos datos: dura unos ${lengthMin} minutos; ` +
    "el candidato presenta un proyecto y luego el Líder Técnico y la Mentora se turnan para hacer preguntas de seguimiento hasta que se acabe el tiempo.",

  questions: {
    system: `Escribes la siguiente pregunta para un panel que entrevista a un candidato sobre un proyecto técnico en el que trabajó (software, aprendizaje automático, datos, investigación, hardware o similar).
Basa la pregunta en algo concreto que dijo el candidato; reutiliza sus propios números y términos.
Ángulos útiles:
- Aclaración: detalles técnicos de implementación; métricas y cómo se midieron.
- Profundización: razones de las decisiones y alternativas; validación y compromisos.
- Verificación: cuantificación del impacto; contribución y rol personal.
Es una práctica de entrevista, así que las preguntas deben ser accesibles: una cosa a la vez, nada rebuscado.
Si el candidato enumeró varias cosas (funciones, pasos, herramientas), pregunta solo por una.
Menciona solo lo que el candidato realmente dijo; nunca inventes componentes, productos ni números.
Las palabras del candidato vienen del reconocimiento de voz y pueden tener errores: palabras mal oídas o de más, nombres mal escritos.
Nunca preguntes, cites ni te bases en una palabra o frase que parezca un error de reconocimiento; usa solo las partes cuyo significado es claro.
No repitas ni reformules de cerca una pregunta que ya se hizo en la transcripción.
La pregunta se dice en voz alta, así que haz exactamente UNA pregunta: una sola oración con un solo signo de interrogación, menos de 200 caracteres, sin listas ni markdown.
Nunca agregues una segunda pregunta ni un "y cómo/por qué ..."; elige la mitad más importante.
Primero evalúa la última respuesta del candidato como un revisor neutral, sin importar quién pregunte después, en este orden:
- "inconsistent": compara cada número y dato (cantidades, tamaños, latencias, herramientas, pasos) con lo que dijo antes, incluidos los totales de la presentación; cualquier discrepancia, o una afirmación que no cuadra, es inconsistent, aunque sea concreta. Entonces el reason debe decir "antes: ... / ahora: ...".
- "solid": si no, responde la pregunta con al menos un número, herramienta o mecanismo concreto, aunque se pueda preguntar más.
- "vague": afirmaciones generales sin ningún número, herramienta o mecanismo concreto detrás.
Evalúa solo el contenido, nunca la gramática ni los errores de reconocimiento de voz.
Luego escribe la pregunta según la evaluación (las reglas de tono del entrevistador, abajo, van primero):
- solid: construye sobre ella.
- vague: pide exactamente un dato concreto que falta, salvo que la última pregunta del panel ya lo haya pedido; en ese caso pasa a una parte por la que aún no se preguntó.
- inconsistent: nombra las dos cosas que no cuadran y pregunta cuál es la correcta.
Cada pregunta trata una sola cosa: nunca unas dos preguntas con "y".
Escribe la pregunta y el reason en español.
Llena "check" antes que nada: lista cada número o dato de la última respuesta junto a lo que dijo antes ("antes ... / ahora ..."), o "nada que comparar".
Responde en json: {"check": "...", "assessment": "solid" | "vague" | "inconsistent", "reason": "<una frase corta>", "question": "..."}`,
    persona:
      "preciso y con curiosidad por cómo funcionan realmente las cosas; insiste con cortesía en la evidencia débil, las suposiciones y las vaguedades",
    difficulty: {
      easy:
        "Fácil: un calentamiento amable y no técnico sobre su propia experiencia, que se responde de memoria en una o dos frases. " +
        "Nunca preguntes por qué eligió un enfoque, una herramienta o un diseño; nada de detalles internos, números ni casos límite. " +
        "Para esta pregunta ignora el consejo de arriba sobre números y métricas.",
      medium:
        "Media: una pregunta técnica sobre un componente, modelo, paso o resultado concreto que mencionó, " +
        "que se responde con una explicación breve.",
      hard:
        "Difícil: la pregunta técnica que haría un ingeniero o investigador con experiencia tras leer sobre el proyecto; " +
        "puede preguntar por los números detrás de un resultado (latencia, precisión, rendimiento o costo). " +
        "Debe seguir siendo justa y responderse en un minuto aproximadamente; nada de trampas ni curiosidades.",
    },
    angles: {
      easy: [
        "qué parte del trabajo hizo él mismo",
        "con quién trabajó y cuál fue su rol en el equipo",
        "qué fue lo más difícil para él personalmente",
        "qué aprendió o qué haría diferente la próxima vez",
        "de qué está más orgulloso en este proyecto",
      ],
      medium: [
        "cómo funciona un componente, modelo o paso que mencionó",
        "cómo construyó o implementó una parte concreta",
        "cómo midió o evaluó un resultado que mencionó",
        "de qué datos o entradas depende una parte y de dónde vienen",
        "cómo encaja una parte que mencionó en el resto del sistema o del flujo",
      ],
      hard: [
        "cómo se midió o validó un número o resultado que mencionó, y cuánto se puede confiar en él",
        "qué limitó el rendimiento, la precisión o la calidad: el cuello de botella",
        "qué cambiaría a mayor escala: más datos, usuarios, tráfico o un modelo más grande",
        "qué pasa cuando falla una entrada, un componente o una suposición",
        "un compromiso que aceptó y lo que le costó",
        "una línea base o alternativa con la que comparó, o pudo haber comparado",
      ],
    },
    goals: {
      technical_lead: [
        {
          goal: "Profundización técnica: pregunta cómo funciona una parte del sistema, modelo o método, o cómo se midió un resultado que mencionó.",
          easyGoal: "Calentamiento: pregunta cuál fue su parte, o pídele que describa una cosa concreta que mencionó.",
        },
        {
          goal: "Desafío: cuestiona una suposición, un compromiso o una inconsistencia en lo que dijo, o plantea una condición de falla (entrada incorrecta, un componente caído, datos que cambian, más carga) y pregunta cómo la manejaría su diseño o método.",
          easyGoal:
            "Desafío suave: pregunta qué haría diferente la próxima vez, o si algo salió mal o lo sorprendió en el camino.",
        },
      ],
      mentor: [
        {
          goal: "Seguimiento: elige una parte del proyecto que aún no se cubrió, o profundiza en una respuesta: cómo lo hizo funcionar, cómo supo que funcionaba o qué construiría después.",
          easyGoal:
            "Seguimiento: pregunta qué aprendió, qué haría después, o por una parte aún no cubierta de lo que describió.",
        },
      ],
    },
    followUp: (round, asker, persona) =>
      `Pregunta de seguimiento ${round}; el Líder Técnico y la Mentora se turnan hasta que se acabe el tiempo. La hace: ${asker}, cuyo estilo es: ${persona}.`,
    practising: (role, company) =>
      `El candidato está practicando para un puesto de ${role}${company ? ` en ${company}` : ""}. ` +
      "Úsalo solo para decidir qué importa más; la pregunta debe seguir partiendo de lo que acaba de decir.",
    freshTopic: "Pregunta por una parte o un ángulo por el que el panel aún no preguntó en la transcripción.",
    goal: (goal) => `Objetivo: ${goal}`,
    difficultyLine: (guide) => `Dificultad: ${guide}`,
    angle: (angle) => `Ángulo para esta pregunta: ${angle}.`,
    priority: "La dificultad y el ángulo importan más que el objetivo: del objetivo conserva solo el tema.",
    unanswered: (question) =>
      `El candidato no pudo responder la última pregunta ("${question}"). No la vuelvas a hacer, ` +
      "ni siquiera con otras palabras (como qué herramienta usó o cómo lo descubrió); " +
      "pregunta por otra parte de lo que describió.",
    pending: (asker, question) =>
      `Acaban de preguntar (${asker}): "${question}", y el candidato la está respondiendo ahora; esa respuesta todavía no está en la transcripción. ` +
      "No hagas seguimiento de esa pregunta ni preguntes nada que se superponga con ella. " +
      "Basa tu pregunta en la última respuesta del candidato en la transcripción.",
    background: (asked) =>
      asked
        ? `La moderadora ya le hizo al candidato una pregunta de contexto: "${asked}". No la vuelvas a hacer, ni siquiera con otras palabras.`
        : "La moderadora le está haciendo ahora al candidato una pregunta ligera de contexto (para quién era el proyecto, si era un equipo dentro de una empresa, qué tan grande era el equipo o cuál fue su propia parte). No preguntes por nada de eso.",
    earlierSkipped: (questions) =>
      "El candidato tampoco pudo responder estas preguntas anteriores; no vuelvas a ellas ni a su tema: " +
      questions.map((q) => `"${q}"`).join("; "),
    alreadyAsked: "Preguntas que el panel ya hizo (nunca vuelvas a hacer ninguna, ni siquiera reformulada):",
    transcript: "Transcripción hasta ahora:",
    repeated: (draft, earlier) =>
      `Tu último borrador, "${draft}", repite la pregunta anterior "${earlier}". Pregunta por otra cosa.`,
  },

  turn: {
    system:
      "Observas una entrevista hablada en vivo. El candidato acaba de hacer una pausa. A partir de la transcripción de lo que ha dicho hasta ahora, " +
      "decide dos cosas.\n" +
      "1. finished: si terminó su turno o solo está pausando a mitad de una idea y va a continuar. " +
      "Las respuestas cortas suelen estar completas. Di false solo si la transcripción se corta a mitad de frase, termina en un conector o muletilla " +
      '(y, entonces, porque, pero, eh, este), o anuncia que viene más (p. ej. "hay dos partes", "déjame pensar", "un momento"). ' +
      "Una petición al panel es un turno terminado. En otro caso di true.\n" +
      '2. intent: "repeat" si pide escuchar la pregunta otra vez; "clarify" si pregunta qué significa la pregunta o una palabra de ella, ' +
      'o cuál de dos interpretaciones es la correcta; "skip" si dice que no sabe o pide saltar o pasar a la siguiente; ' +
      '"wait" solo justo después de un aviso por silencio (ver abajo), si quiere más tiempo para pensar ("dame un minuto"); ' +
      '"end" si pide terminar la entrevista; "noise" si es solo una señal de escucha o muletilla sin contenido ' +
      '(ajá, mm, okey, sí, eh); en otro caso "answer" (una respuesta, un agregado a la anterior, un agradecimiento, charla). ' +
      'Una pregunta dentro de una respuesta ("¿por qué importa? Porque ...") es una respuesta.\n' +
      "Si el candidato interrumpió mientras hablaba un panelista, se dan las palabras del panelista antes del corte; " +
      "una petición entonces se refiere a la pregunta que estaba respondiendo.\n" +
      'Si el panel acaba de preguntarle algo tras un silencio (p. ej. "¿Necesitas más tiempo?"), se incluye; ' +
      'lee la respuesta como respuesta a eso: querer más tiempo es "wait", querer pasar a la siguiente es "skip".\n' +
      "La entrevista es en español.\n" +
      'Responde solo con JSON, p. ej. {"finished": true, "intent": "answer"}.',
    question: "Pregunta: ",
    cutInto: "El candidato interrumpió mientras un panelista decía: ",
    prompt: "Tras un silencio, el panel acaba de preguntarle al candidato: ",
    candidate: "El candidato hasta ahora: ",
  },

  rules: {
    end: [
      /\b(?:terminar|terminemos|acabar|acabemos|parar|paremos) (?:la entrevista|la prueba|la práctica|aquí|ya)\b/,
      /\btengo que (?:irme|colgar|salir)\b/,
      /\b(?:podemos|podríamos) (?:terminar|parar)\b/,
      /\bvoy a colgar\b/,
      /\bquiero (?:terminar|parar|salir)\b/,
    ],
    backchannel: [
      "mm",
      "mhm",
      "hm",
      "ajá",
      "aja",
      "eh",
      "este",
      "sí",
      "si",
      "ok",
      "okey",
      "vale",
      "claro",
      "bueno",
      "ya",
      "exacto",
    ],
    courtesy: /^(?:(?:muchas gracias|gracias|vale|ok|okay|bueno|listo|eso es todo|sí)\s*)+$/,
    repeat: [
      /\b(?:repite|repetir|repetirla|repetirlo|repítela|repítelo|repetir la pregunta)\b/,
      /\b(?:dilo|decirlo|decirla) (?:otra vez|de nuevo)\b/,
      /\bno (?:te )?(?:escuché|oí|entendí bien)\b/,
      /^(?:perdón|disculpa|cómo)[?.!]?$/,
      /\bcuál era la pregunta\b/,
      /\bla pregunta (?:otra vez|de nuevo)\b/,
      /^(?:(?:perdón|eh),? )?otra vez\b/,
    ],
    clarify: [
      /\bqué (?:quieres|quiere) decir\b/,
      /\bqué significa\b/,
      /\bte refieres a\b/,
      /\b(?:puedes|podrías) (?:aclarar|explicar)\b/,
      /\bno (?:estoy seguro|entiendo) (?:de )?qu[eé] (?:me )?preguntas\b/,
      /\bcuál de\b/,
      /\bme estás preguntando\b/,
      /\bcuando dices\b/,
      /\bmás específico\b/,
      /\bno (?:te )?(?:sigo|entiendo)\b/,
      /^(?!.*\d).*\bo\b.*\?$/,
      /\bqué es .+\?$/,
      /^(?:(?:eh|este|bueno),? )?qué (?:es|son) (?:un |una |el |la |los |las )?[\p{L}0-9-]+(?: [\p{L}0-9-]+)?$/u,
    ],
    dontKnow: [
      /\bno (?:lo )?sé\b/,
      /\bni idea\b/,
      /\bno estoy seguro\b/,
      /\bno (?:me )?acuerdo\b/,
      /\bno recuerdo\b/,
      /\bno tengo (?:una )?respuesta\b/,
    ],
    skip: [
      /\b(?:podemos|podríamos) (?:saltar|pasar|seguir)\b/,
      /\b(?:saltemos|pasemos|prefiero pasar|quiero pasar|quiero saltar)\b/,
      /\bsaltar (?:esta|esa|la pregunta)\b/,
      /\bsiguiente pregunta\b/,
      /^paso\b/,
    ],
    yes: /^(?:(?:eh|mm) )?(?:sí|si|claro|vale|ok|okey|por favor|un poco|un poquito|bueno)\b/,
    no: /^(?:no|todavía no|aún no|estoy bien)\b/,
    holdOn:
      /\b(?:dame|un) (?:un )?(?:segundo|momento|minuto)\b|\bdéjame pensar\b|\bsigo pensando\b|\bquiero intentar\b/,
    filler: /^(?:eh+|mm+|este|bueno|pues|o sea)[,.]?$/,
    longClarify: /\b(?:me estás preguntando|cuando dices|te refieres a|no estoy seguro de entender|para asegurarme)\b/,
    trailing: ["y", "entonces", "porque", "pero", "o", "eh", "este", "pues", "que"],
    thinking: /déjame pensar$/,
    secondAsk: /,\s+y\s+(?:¿\s*)?(?:qué|cómo|cuál|cuáles|por qué|dónde|cuándo|quién|cuánto)\b/i,
    stopWords:
      "un una unos unas el la los las y o de del a al en con por para que qué cómo cuál cuáles por qué cuándo dónde quién es son fue fueron ser se su sus tu tus te lo le les este esta estos estas eso esa ese como más muy".split(
        " ",
      ),
  },
};
