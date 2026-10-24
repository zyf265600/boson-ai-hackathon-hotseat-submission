// Deutsch. Aufbau und Gründe in en.ts. Feldnamen und Werte im JSON (finished, intent, assessment …) bleiben englisch: der Code liest sie so.
import type { LanguagePack } from "./types";

export const de: LanguagePack = {
  roles: { moderator: "Moderatorin", technical_lead: "Technischer Leiter", mentor: "Mentorin", candidate: "Kandidat" },

  askerLines: {
    moderator: {
      silence: {
        8: "Lassen Sie sich Zeit, keine Eile.",
        15: "Brauchen Sie noch etwas Zeit?",
        25: "Möchten Sie zur nächsten Frage übergehen?",
      },
      wrapUp: "Danke, das ist sehr hilfreich. Aus Zeitgründen machen wir hier einen Punkt.",
    },
    technical_lead: {
      silence: {
        8: "Lassen Sie sich Zeit, keine Eile.",
        15: "Brauchen Sie noch etwas Zeit?",
        25: "Möchten Sie zur nächsten Frage übergehen?",
      },
      wrapUp: "Danke, das ist sehr hilfreich. Aus Zeitgründen machen wir hier einen Punkt.",
    },
    mentor: {
      silence: {
        8: "Lassen Sie sich Zeit, es gibt überhaupt keine Eile.",
        15: "Brauchen Sie noch einen Moment?",
        25: "Möchten Sie zur nächsten Frage übergehen?",
      },
      wrapUp: "Vielen Dank, das war sehr hilfreich. Die Zeit wird knapp, also machen wir hier einen Punkt.",
    },
  },
  closing: {
    timeUp:
      "Unsere Zeit ist um, also schließen wir hier ab. Vielen Dank, dass Sie uns Ihr Projekt vorgestellt haben, und viel Erfolg!",
    endEarly: "Natürlich, hören wir hier auf. Danke für Ihre Zeit heute, und viel Erfolg!",
  },
  openingQuestion:
    "Könnten Sie ein technisches Projekt beschreiben, das Sie gebaut haben: das Problem, die Architektur und Ihren eigenen Beitrag?",
  backupQuestions: {
    technical_lead: {
      easy: [
        "Welchen Teil des Projekts haben Sie selbst gebaut, und was hat er gemacht?",
        "Ist während des Projekts etwas schiefgegangen oder hat Sie überrascht? Was ist passiert?",
        "Auf welches Werkzeug oder welche Bibliothek haben Sie sich in diesem Projekt am meisten gestützt?",
      ],
      medium: [
        "Können Sie mir Schritt für Schritt erklären, wie eine zentrale Komponente Ihres Systems funktioniert?",
        "Wenn eine Komponente Ihres Systems ausfallen würde, was würde der Nutzer sehen?",
        "Was war der wichtigste Engpass in Ihrem System, und wie haben Sie ihn gefunden?",
      ],
      hard: [
        "Wie haben Sie geprüft, dass Ihr Hauptergebnis echt war, und was könnte diese Messung irreführend machen?",
        "Was ist die schwächste Annahme in Ihrem Design, und was würde passieren, wenn sie falsch wäre?",
        "Was würde zuerst kaputtgehen, wenn die Last auf Ihrem System um das Hundertfache steigen würde?",
      ],
    },
    mentor: {
      easy: [
        "Auf welchen Teil dieses Projekts sind Sie am stolzesten?",
        "Was haben Sie in diesem Projekt gelernt, das Sie heute noch nutzen?",
        "Wie haben Sie die Arbeit mit den Leuten aufgeteilt, mit denen Sie es gebaut haben?",
      ],
      medium: [
        "Wie haben Sie den schwierigsten Teil dieses Projekts wirklich zum Laufen gebracht?",
        "Woran haben Sie erkannt, dass Ihr Projekt so funktioniert, wie Sie es wollten?",
        "Was würden Sie anders machen, wenn Sie dieses Projekt neu beginnen würden?",
      ],
      hard: [
        "Wenn Sie drei weitere Monate für dieses Projekt hätten, was würden Sie als Nächstes bauen, um es noch besser zu machen?",
        "Bei welcher Entscheidung in diesem Projekt sind Sie sich heute am wenigsten sicher, und warum?",
        "Welchen Kompromiss in Ihrem Design sollte ein neues Teammitglied am ehesten verstehen?",
      ],
    },
  },

  moderatorPrompt:
    "Sie sind die Moderatorin eines dreiköpfigen Gremiums, das einen Kandidaten zu einem technischen Projekt befragt, an dem er gearbeitet hat. " +
    "Die anderen Mitglieder sind ein Technischer Leiter und eine Mentorin; ihre Fragen erscheinen im Gespräch mit ihrer Rolle gekennzeichnet. " +
    "Sie eröffnen und beenden das Interview und halten es am Laufen. Stellen Sie selbst keine tiefen technischen Fragen. " +
    "Jeder Beitrag besteht aus ein oder zwei kurzen gesprochenen Sätzen, ohne Listen und ohne Markdown. " +
    "Sprechen Sie während des gesamten Interviews nur Deutsch.",
  opening: (role, company, say, names) =>
    `Begrüßen Sie den Kandidaten, stellen Sie sich als ${names.moderator}, die Moderatorin, vor und stellen Sie das Gremium in einem Satz vor: ` +
    `${names.technical_lead}, der Technische Leiter, und ${names.mentor}, die Mentorin. ` +
    "Sagen Sie, dass dies ein Übungsinterview für die Stelle als " +
    `${role}${company ? ` bei ${company}` : ""} ist, und bitten Sie ihn, ein technisches Projekt zu beschreiben, ` +
    "das er gebaut hat: das Problem, die Architektur und seinen eigenen Beitrag." +
    (company && say !== company
      ? ` Sprechen Sie den Firmennamen „${company}“ so aus, dass er wie „${say}“ klingt (nur eine Aussprachehilfe: nicht buchstabieren und die Bindestriche nicht vorlesen).`
      : ""),
  openingReply: (said, heard, names, role, company, say) =>
    (heard ? `Sie hatten „${heard}“ gesagt` : "Sie hatten noch nichts gesagt") +
    `, als der Kandidat Sie unterbrach und sagte: „${said}“. Ihre ganze Antwort besteht aus zwei kurzen Sätzen. ` +
    "Gehen Sie zuerst in wenigen Worten auf das ein, was er tatsächlich gesagt hat (grüßen Sie ihn mit Namen zurück, wenn er ihn genannt hat; grüßen Sie nicht zweimal). " +
    `Wenn Sie das Gremium noch nicht fertig vorgestellt hatten, nennen Sie es in wenigen Worten: ${names.technical_lead}, der Technische Leiter, ` +
    `und ${names.mentor}, die Mentorin (und sich selbst, ${names.moderator}, wenn Sie Ihren Namen noch nicht gesagt hatten). ` +
    "Bitten Sie dann kurz um ein Projekt, das er gebaut hat, zum Beispiel „Könnten Sie uns von einem Projekt erzählen, das Sie gebaut haben?“ " +
    "Zählen Sie nicht auf, was er abdecken soll (Problem, Architektur, Beitrag), und wiederholen Sie nicht die vollständige Eröffnungsfrage." +
    ` Fakten, falls er danach fragt: Dies ist ein Übungsinterview für die Stelle als ${role}${company ? ` bei ${company}` : ""}; das Gremium sind Sie (${names.moderator}, die Moderatorin), ${names.technical_lead} (der Technische Leiter) und ${names.mentor} (die Mentorin). ` +
    "Wiederholen Sie nicht, was Sie schon gesagt hatten: Beantworten Sie nur seine Frage." +
    (company && say !== company
      ? ` Sprechen Sie „${company}“ so aus, dass es wie „${say}“ klingt (nur eine Aussprachehilfe).`
      : ""),
  handoff: (after, next) =>
    `${
      {
        introduction: "Danke, dass Sie uns Ihr Projekt vorgestellt haben.",
        addition: "Danke für die Ergänzung.",
        unanswered: "Das ist völlig in Ordnung.",
      }[after]
    } ${next}, bitte.`,
  timeBuyer: (said, next) =>
    `Das Interview läuft bereits. Der Kandidat hat gerade sein Projekt vorgestellt: „${said}“. ` +
    "Bedanken Sie sich in einem kurzen gesprochenen Satz (kein Lob, keine Begrüßung). Stellen Sie dann eine kurze, leichte Frage " +
    "zum Hintergrund des Projekts, die er noch nicht beantwortet hat, etwa für wen es war, ob es ein Team innerhalb einer Firma war, " +
    "wie groß das Team war oder was sein eigener Anteil war. " +
    `Fragen Sie nichts Technisches oder Vertiefendes: Das fragt als Nächstes ${next}, der Technische Leiter. ` +
    "Stellen Sie nur eine Frage, insgesamt höchstens 30 Wörter.",
  sayAgain: "Entschuldigung, das habe ich nicht verstanden. Könnten Sie es noch einmal sagen?",
  missedPart: "Entschuldigung, ich habe einen Teil Ihrer Antwort verpasst. Könnten Sie das noch einmal sagen?",
  resume: "Entschuldigung, die Verbindung war kurz unterbrochen. Jetzt sind wir wieder da, also machen wir weiter.",
  answerAgain: "Könnten Sie die letzte Frage bitte noch einmal beantworten?",
  endEarly: (said) =>
    `Das Interview läuft bereits. Der Kandidat möchte jetzt aufhören: „${said}“. Stimmen Sie in ein oder zwei kurzen gesprochenen Sätzen ` +
    "freundlich zu, danken Sie ihm für seine Zeit und wünschen Sie ihm viel Erfolg. Begrüßen Sie niemanden und stellen Sie keine Frage.",
  readAloud: (line) =>
    "Das Interview läuft bereits, und der Kandidat hat gerade gesprochen. Begrüßen Sie niemanden und fügen Sie nichts Eigenes hinzu. " +
    `Lesen Sie den folgenden Satz genau so vor, wie er geschrieben ist, Wort für Wort: „${line}“`,
  substituteQuestion: (role, question) => `Unser ${role} fragt: ${question}`,
  clarify: (asker, question, said, lengthMin) =>
    `Das Interview läuft bereits. ${asker ? `Der ${asker} hat` : "Sie haben"} den Kandidaten gerade gefragt: „${question}“. ` +
    `Der Kandidat antwortete: „${said}“. Beantworten Sie in ein oder zwei kurzen gesprochenen Sätzen, was der Kandidat gefragt hat, ` +
    "nur anhand der Frage und allgemeinen Wissens; erfinden Sie nichts über das Projekt des Kandidaten und stellen Sie keine neue Frage. " +
    "Begrüßen Sie niemanden. " +
    `Wenn er nach dem Interview selbst fragt, sind dies die einzigen Fakten: Es dauert etwa ${lengthMin} Minuten; ` +
    "der Kandidat stellt ein Projekt vor, dann stellen der Technische Leiter und die Mentorin abwechselnd Nachfragen, bis die Zeit um ist.",

  questions: {
    system: `Sie schreiben die nächste Frage für ein Gremium, das einen Kandidaten zu einem technischen Projekt befragt, an dem er gearbeitet hat (Software, maschinelles Lernen, Daten, Forschung, Hardware oder Ähnliches).
Stützen Sie die Frage auf etwas Konkretes, das der Kandidat gesagt hat; verwenden Sie seine eigenen Zahlen und Begriffe.
Nützliche Blickwinkel:
- Klärung: technische Umsetzungsdetails; Kennzahlen und wie sie gemessen wurden.
- Vertiefung: Gründe für Entscheidungen und Alternativen; Validierung und Kompromisse.
- Überprüfung: Quantifizierung der Wirkung; persönlicher Beitrag und Rolle.
Es ist ein Interviewtraining, also bleiben die Fragen zugänglich: eine Sache auf einmal, nichts Abwegiges.
Wenn der Kandidat mehrere Dinge aufgezählt hat (Funktionen, Schritte, Werkzeuge), fragen Sie nur nach einem davon.
Erwähnen Sie nur, was der Kandidat tatsächlich gesagt hat; erfinden Sie nie Komponenten, Produkte oder Zahlen.
Die Worte des Kandidaten stammen aus der Spracherkennung und können Fehler enthalten: falsch verstandene oder zusätzliche Wörter, falsch geschriebene Namen.
Fragen Sie nie nach einem Wort oder Ausdruck, der wie ein Erkennungsfehler aussieht, zitieren Sie ihn nicht und bauen Sie nicht darauf auf; verwenden Sie nur die Teile, deren Bedeutung klar ist.
Wiederholen Sie keine Frage aus dem Transkript und formulieren Sie keine nur leicht um.
Die Frage wird laut gesprochen, also stellen Sie genau EINE Frage: ein einziger Satz mit einem Fragezeichen, unter 200 Zeichen, ohne Listen oder Markdown.
Hängen Sie nie eine zweite Frage oder ein „und wie/warum ...“ an; wählen Sie die wichtigere Hälfte.
Beurteilen Sie zuerst die letzte Antwort des Kandidaten als neutraler Gutachter, egal wer als Nächstes fragt, in dieser Reihenfolge:
- "inconsistent": Vergleichen Sie jede Zahl und jede Tatsache darin (Mengen, Größen, Latenzen, Werkzeuge, Schritte) mit dem, was er vorher gesagt hat, einschließlich der Summen aus der Vorstellung; jede Abweichung oder eine Aussage, die nicht aufgeht, ist inconsistent, auch wenn sie konkret ist. Der reason lautet dann „vorher: ... / jetzt: ...“.
- "solid": sonst, wenn sie die Frage mit mindestens einer konkreten Zahl, einem Werkzeug oder einem Mechanismus beantwortet, auch wenn man mehr fragen könnte.
- "vague": allgemeine Aussagen ohne konkrete Zahl, Werkzeug oder Mechanismus dahinter.
Beurteilen Sie nur den Inhalt, nie Grammatik oder Spracherkennungsfehler.
Schreiben Sie dann die Frage passend zur Beurteilung (die Tonregeln des Fragenden unten haben Vorrang):
- solid: darauf aufbauen.
- vague: nach genau einem fehlenden konkreten Punkt fragen, außer die letzte Frage des Gremiums hat schon danach gefragt; dann zu einem Teil übergehen, nach dem noch nicht gefragt wurde.
- inconsistent: die zwei Dinge nennen, die nicht zusammenpassen, und fragen, welches stimmt.
Jede Frage betrifft nur eine Sache: verbinden Sie nie zwei Fragen mit „und“.
Schreiben Sie die Frage und den reason auf Deutsch.
Füllen Sie zuerst "check" aus: listen Sie jede Zahl oder Tatsache der letzten Antwort neben dem auf, was er vorher dazu gesagt hat („vorher ... / jetzt ...“), oder „nichts zu vergleichen“.
Antworten Sie in json: {"check": "...", "assessment": "solid" | "vague" | "inconsistent", "reason": "<ein kurzer Satz>", "question": "..."}`,
    persona:
      "präzise und neugierig darauf, wie Dinge wirklich funktionieren; hakt höflich bei schwachen Belegen, Annahmen und vagen Aussagen nach",
    difficulty: {
      easy:
        "Leicht: ein freundlicher, nicht technischer Einstieg über seine eigene Erfahrung, aus dem Gedächtnis in ein, zwei Sätzen zu beantworten. " +
        "Fragen Sie nie, warum er einen Ansatz, ein Werkzeug oder ein Design gewählt hat; keine Interna, Zahlen oder Grenzfälle. " +
        "Ignorieren Sie für diese Frage den Rat oben zu Zahlen und Kennzahlen.",
      medium:
        "Mittel: eine technische Frage zu einer bestimmten Komponente, einem Modell, einem Schritt oder einem Ergebnis, das er erwähnt hat, " +
        "mit einer kurzen Erklärung zu beantworten.",
      hard:
        "Schwer: die technische Frage, die ein erfahrener Ingenieur oder Forscher nach dem Lesen über das Projekt stellt; " +
        "sie darf nach den Zahlen hinter einem Ergebnis fragen (Latenz, Genauigkeit, Durchsatz oder Kosten). " +
        "Trotzdem fair und in etwa einer Minute zu beantworten; keine Fangfragen und kein Quizwissen.",
    },
    angles: {
      easy: [
        "welchen Teil der Arbeit er selbst gemacht hat",
        "mit wem er gearbeitet hat und welche Rolle er im Team hatte",
        "was für ihn persönlich am schwierigsten war",
        "was er gelernt hat oder beim nächsten Mal anders machen würde",
        "worauf er in diesem Projekt am stolzesten ist",
      ],
      medium: [
        "wie eine Komponente, ein Modell oder ein Schritt funktioniert, den er erwähnt hat",
        "wie er einen bestimmten Teil gebaut oder umgesetzt hat",
        "wie er ein erwähntes Ergebnis gemessen oder bewertet hat",
        "von welchen Daten oder Eingaben ein Teil abhängt und woher sie kommen",
        "wie ein erwähnter Teil in den Rest des Systems oder der Pipeline passt",
      ],
      hard: [
        "wie eine erwähnte Zahl oder ein Ergebnis gemessen oder validiert wurde und wie weit man ihr trauen kann",
        "was Leistung, Genauigkeit oder Qualität begrenzt hat: der Engpass",
        "was sich bei größerem Maßstab ändern würde: mehr Daten, Nutzer, Verkehr oder ein größeres Modell",
        "was passiert, wenn eine Eingabe, eine Komponente oder eine Annahme versagt",
        "einen Kompromiss, den er eingegangen ist, und was er ihn gekostet hat",
        "eine Baseline oder Alternative, mit der er verglichen hat oder hätte vergleichen können",
      ],
    },
    goals: {
      technical_lead: [
        {
          goal: "Technische Vertiefung: fragen Sie, wie ein Teil des Systems, Modells oder der Methode funktioniert, oder wie ein erwähntes Ergebnis gemessen wurde.",
          easyGoal:
            "Einstieg: fragen Sie, was sein eigener Teil war, oder bitten Sie ihn, eine konkrete erwähnte Sache zu beschreiben.",
        },
        {
          goal: "Herausforderung: hinterfragen Sie eine Annahme, einen Kompromiss oder einen Widerspruch in dem, was er gesagt hat, oder führen Sie eine Fehlerbedingung ein (falsche Eingabe, ausgefallene Komponente, veränderte Daten, mehr Last) und fragen Sie, wie sein Design oder seine Methode damit umgehen würde.",
          easyGoal:
            "Sanfte Herausforderung: fragen Sie, was er beim nächsten Mal anders machen würde oder ob unterwegs etwas schiefging oder ihn überrascht hat.",
        },
      ],
      mentor: [
        {
          goal: "Nachfrage: wählen Sie einen Teil des Projekts, der noch nicht behandelt wurde, oder vertiefen Sie eine Antwort: wie er es zum Laufen gebracht hat, woran er erkannt hat, dass es funktioniert, oder was er als Nächstes bauen würde.",
          easyGoal:
            "Nachfrage: fragen Sie, was er gelernt hat, was er als Nächstes tun würde, oder nach einem noch nicht behandelten Teil des Beschriebenen.",
        },
      ],
    },
    followUp: (round, asker, persona) =>
      `Nachfrage ${round}; der Technische Leiter und die Mentorin wechseln sich ab, bis die Zeit um ist. Gestellt von: ${asker}, Stil: ${persona}.`,
    practising: (role, company) =>
      `Der Kandidat übt für eine Stelle als ${role}${company ? ` bei ${company}` : ""}. ` +
      "Nutzen Sie das nur, um zu entscheiden, was am wichtigsten ist; die Frage muss weiterhin an das anknüpfen, was er gerade gesagt hat.",
    freshTopic:
      "Fragen Sie nach einem Teil oder Blickwinkel, nach dem das Gremium im Transkript noch nicht gefragt hat.",
    goal: (goal) => `Ziel: ${goal}`,
    difficultyLine: (guide) => `Schwierigkeit: ${guide}`,
    angle: (angle) => `Blickwinkel für diese Frage: ${angle}.`,
    priority: "Schwierigkeit und Blickwinkel zählen mehr als das Ziel: behalten Sie vom Ziel nur das Thema.",
    unanswered: (question) =>
      `Der Kandidat konnte die letzte Frage nicht beantworten („${question}“). Stellen Sie sie nicht noch einmal, ` +
      "auch nicht mit anderen Worten (etwa welches Werkzeug er benutzt oder wie er es herausgefunden hat); " +
      "fragen Sie nach einem anderen Teil dessen, was er beschrieben hat.",
    pending: (asker, question) =>
      `Gerade wurde gefragt (${asker}): „${question}“. Der Kandidat beantwortet das jetzt; diese Antwort steht noch nicht im Transkript. ` +
      "Haken Sie bei dieser Frage nicht nach und fragen Sie nichts, was sich mit ihr überschneidet. " +
      "Bauen Sie Ihre Frage auf der letzten Antwort des Kandidaten im Transkript auf.",
    background: (asked) =>
      asked
        ? `Die Moderatorin hat dem Kandidaten bereits eine Hintergrundfrage gestellt: „${asked}“. Stellen Sie sie nicht noch einmal, auch nicht mit anderen Worten.`
        : "Die Moderatorin stellt dem Kandidaten gerade eine leichte Hintergrundfrage (für wen das Projekt war, ob es ein Team innerhalb einer Firma war, wie groß das Team war oder was sein eigener Anteil war). Fragen Sie nach nichts davon.",
    earlierSkipped: (questions) =>
      "Der Kandidat konnte auch diese früheren Fragen nicht beantworten; kommen Sie nicht auf sie oder ihr Thema zurück: " +
      questions.map((q) => `„${q}“`).join("; "),
    alreadyAsked:
      "Fragen, die das Gremium schon gestellt hat (stellen Sie keine davon erneut, auch nicht umformuliert):",
    transcript: "Bisheriges Transkript:",
    repeated: (draft, earlier) =>
      `Ihr letzter Entwurf, „${draft}“, wiederholt die frühere Frage „${earlier}“. Fragen Sie nach etwas anderem.`,
  },

  turn: {
    system:
      "Sie verfolgen ein live gesprochenes Interview. Der Kandidat hat gerade eine Pause gemacht. Entscheiden Sie anhand des Transkripts dessen, was er bisher gesagt hat, " +
      "zwei Dinge.\n" +
      "1. finished: ob er seinen Beitrag beendet hat oder nur mitten im Gedanken pausiert und weiterreden wird. " +
      "Kurze Antworten sind oft vollständig. Sagen Sie nur false, wenn das Transkript mitten im Satz abbricht, auf ein Bindewort oder Füllwort endet " +
      "(und, also, weil, aber, äh, ähm), oder weitere Teile ankündigt (z. B. „es gibt zwei Teile“, „lassen Sie mich nachdenken“, „Moment“). " +
      "Eine Bitte an das Gremium ist ein beendeter Beitrag. Sonst sagen Sie true.\n" +
      '2. intent: "repeat", wenn er die Frage noch einmal hören möchte; "clarify", wenn er fragt, was die Frage oder ein Wort darin bedeutet, ' +
      'oder welche von zwei Lesarten gemeint ist; "skip", wenn er sagt, dass er es nicht weiß, oder überspringen bzw. weitermachen möchte; ' +
      '"wait" nur direkt nach einer Nachfrage wegen Schweigen (siehe unten), wenn er mehr Bedenkzeit möchte („geben Sie mir eine Minute“); ' +
      '"end", wenn er das Interview beenden möchte; "noise", wenn es nur ein Zuhörsignal oder Füllwort ohne Inhalt ist ' +
      '(mhm, hm, okay, ja, äh); sonst "answer" (eine Antwort, eine Ergänzung zur letzten, ein Dank, Smalltalk). ' +
      "Eine Frage innerhalb einer Antwort („warum ist das wichtig? Weil ...“) ist eine Antwort.\n" +
      "Wenn der Kandidat einem Gremiumsmitglied ins Wort gefallen ist, werden dessen Worte vor der Unterbrechung angegeben; " +
      "eine Bitte bezieht sich dann auf die Frage, die er gerade beantwortet hat.\n" +
      "Wenn das Gremium ihn nach einem Schweigen gerade etwas gefragt hat (z. B. „Brauchen Sie noch etwas Zeit?“), wird das angegeben; " +
      'lesen Sie die Antwort als Antwort darauf: mehr Zeit wollen ist "wait", weitermachen wollen ist "skip".\n' +
      "Das Interview findet auf Deutsch statt.\n" +
      'Antworten Sie nur mit JSON, z. B. {"finished": true, "intent": "answer"}.',
    question: "Frage: ",
    cutInto: "Der Kandidat unterbrach, während ein Gremiumsmitglied sagte: ",
    prompt: "Nach einem Schweigen hat das Gremium den Kandidaten gerade gefragt: ",
    candidate: "Der Kandidat bisher: ",
  },

  rules: {
    end: [
      /\bdas (?:interview|gespräch|test|üben) (?:beenden|abbrechen)\b/,
      /\b(?:lass uns|lassen sie uns) (?:hier )?aufhören\b/,
      /\bich muss (?:gehen|los|auflegen)\b/,
      /\b(?:können|könnten) wir (?:hier )?(?:aufhören|abbrechen|schluss machen)\b/,
      /\bich lege (?:jetzt )?auf\b/,
      /\bich will (?:aufhören|abbrechen)\b/,
    ],
    backchannel: [
      "mhm",
      "hm",
      "hmm",
      "mm",
      "äh",
      "ähm",
      "ja",
      "jo",
      "ok",
      "okay",
      "genau",
      "gut",
      "klar",
      "stimmt",
      "aha",
      "achso",
    ],
    courtesy: /^(?:(?:danke(?: schön| sehr)?|vielen dank|okay|ok|gut|alles klar|das war\'s|das wars|ja)\s*)+$/,
    repeat: [
      /\b(?:wiederholen|wiederholst|noch ?mal sagen)\b/,
      /\bnoch einmal sagen\b/,
      /\b(?:nicht|nich) (?:verstanden|gehört|mitbekommen)\b/,
      /^(?:wie bitte|entschuldigung|bitte)[?.!]?$/,
      /\bwas war die frage\b/,
      /\bdie frage (?:noch ?mal|noch einmal|nochmal)\b/,
      /^(?:(?:entschuldigung|äh),? )?noch(?: ?ein)?mal\b/,
    ],
    clarify: [
      /\bwas meinen sie\b/,
      /\bwas bedeutet\b/,
      /\bmeinen sie\b/,
      /\b(?:können|könnten) sie (?:das )?(?:erklären|präzisieren|klarstellen)\b/,
      /\bwelche(?:r|s|n)? (?:davon|von beiden)\b/,
      /\bfragen sie (?:nach|ob)\b/,
      /\bwenn sie sagen\b/,
      /\bgenauer\b|\banders formulieren\b/,
      /\bbin (?:mir )?nicht sicher,? ob ich (?:das )?verstehe\b/,
      /^(?!.*\d).*\boder\b.*\?$/,
      /\bwas (?:ist|sind) .+\?$/,
      /^(?:(?:äh|ähm|also),? )?was (?:ist|sind) (?:ein |eine |der |die |das )?[\p{L}0-9-]+(?: [\p{L}0-9-]+)?$/u,
    ],
    dontKnow: [
      /\bich weiß (?:es )?nicht\b/,
      /\bkeine ahnung\b/,
      /\bnicht sicher\b/,
      /\bich (?:kann mich nicht|erinnere mich nicht)\b/,
      /\bhabe keine antwort\b/,
    ],
    skip: [
      /\b(?:können|könnten) wir (?:das )?(?:überspringen|weitermachen)\b/,
      /\b(?:lassen sie uns|ich möchte|ich würde gern) (?:überspringen|weitermachen)\b/,
      /\b(?:die|diese) frage überspringen\b/,
      /\bnächste frage\b/,
      /^(?:ich )?passe\b/,
    ],
    yes: /^(?:(?:äh|ähm) )?(?:ja|jo|gern|gerne|okay|ok|bitte|ein bisschen|ein wenig|ja bitte)\b/,
    no: /^(?:nein|noch nicht|passt schon|geht schon|alles gut)\b/,
    holdOn:
      /\b(?:eine|einen) (?:sekunde|moment|minute)\b|\bmoment\b|\blassen sie mich (?:kurz )?nachdenken\b|\bich denke noch\b|\bich will es versuchen\b/,
    filler: /^(?:äh+|ähm+|hm+|also|halt|sozusagen)[,.]?$/,
    longClarify: /\b(?:fragen sie|wenn sie sagen|meinen sie|bin mir nicht sicher|um sicherzugehen)\b/,
    trailing: ["und", "also", "weil", "aber", "oder", "äh", "ähm", "dann", "dass"],
    thinking: /lassen sie mich nachdenken$|ich denke nach$/,
    secondAsk: /,\s+und\s+(?:was|wie|welche|welcher|welches|warum|wo|wann|wer|wie viel)\b/i,
    stopWords:
      "ein eine einen einem einer der die das den dem des und oder von zu in im an auf für mit aus bei als ist sind war waren sein wird werden was welche welcher welches wie warum wann wo wer dass dies diese dieser es ihr ihre ihren sie wir man sich so sehr mehr".split(
        " ",
      ),
  },
};
