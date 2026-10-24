// English: the original wording, with the reasons for it in the code that uses each part.
import type { LanguagePack } from "./types";

export const en: LanguagePack = {
  roles: { moderator: "Moderator", technical_lead: "Technical Lead", mentor: "Mentor", candidate: "Candidate" },

  askerLines: {
    moderator: {
      silence: {
        8: "Take your time, no rush.",
        15: "Do you need more time?",
        25: "Would you like to move on to the next question?",
      },
      wrapUp: "Thank you, that's really helpful. In the interest of time, let's stop there.",
    },
    technical_lead: {
      silence: {
        8: "Take your time, no rush.",
        15: "Do you need more time?",
        25: "Would you like to move on to the next question?",
      },
      wrapUp: "Thank you, that's really helpful. In the interest of time, let's stop there.",
    },
    mentor: {
      silence: {
        8: "Take your time, there's no rush at all.",
        15: "Do you need a bit more time?",
        25: "Would you like to move on to the next question?",
      },
      wrapUp: "Thank you so much, that was really helpful. We're short on time, so let's stop there.",
    },
  },
  closing: {
    timeUp:
      "We're at time, so let's wrap up here. Thank you so much for walking us through your project, and best of luck!",
    endEarly: "Of course, let's stop here. Thank you for your time today, and best of luck!",
  },
  openingQuestion:
    "Could you describe one technical project you built: the problem, the architecture, and your own contribution?",
  backupQuestions: {
    technical_lead: {
      easy: [
        "Which part of the project did you build yourself, and what did it do?",
        "Did anything go wrong or surprise you during the project, and what happened?",
        "Which tool or library did you rely on most in this project?",
      ],
      medium: [
        "Can you walk me through how one key component of your system works, step by step?",
        "If one component of your system stopped working, what would the user see?",
        "What was the main bottleneck in your system, and how did you find it?",
      ],
      hard: [
        "How did you check that your main result was real, and what could make that measurement misleading?",
        "What is the weakest assumption in your design, and what would happen if it turned out to be wrong?",
        "What would break first if the load on your system grew a hundred times?",
      ],
    },
    mentor: {
      easy: [
        "What part of this project are you proudest of?",
        "What did you learn from this project that you still use today?",
        "How did you split the work with the people you built this with?",
      ],
      medium: [
        "How did you get the hardest part of this project to actually work?",
        "How did you know your project was working the way you wanted?",
        "What would you do differently if you started this project again?",
      ],
      hard: [
        "If you had another three months on this project, what would you build next to make it even better?",
        "Which decision in this project are you least sure about now, and why?",
        "What trade-off in your design would you most want a new teammate to understand?",
      ],
    },
  },

  moderatorPrompt:
    "You are the moderator of a three-person panel interviewing a candidate about one technical project they " +
    "worked on. The other panelists are a Technical Lead and a Mentor; their questions appear in the conversation " +
    "tagged with their role. You open and close the interview and keep it moving. Do not ask deep technical " +
    "questions yourself. Keep every turn to one or two short spoken sentences — no lists, no markdown. " +
    "Speak only English for the whole interview.",
  opening: (role, company, say, names) =>
    `Greet the candidate. Introduce yourself as ${names.moderator}, the moderator, and the panel in one sentence: ` +
    `${names.technical_lead}, the Technical Lead, and ${names.mentor}, the Mentor. Say this is a practice interview for the ` +
    `${role} role${company ? ` at ${company}` : ""}, and ask them to describe ` +
    "one technical project they built: the problem, the architecture, and their own contribution." +
    (company && say !== company
      ? ` Say the company name "${company}" so it sounds like "${say}" (only a guide to how it sounds: do not spell it out or read the hyphens).`
      : ""),
  openingReply: (said, heard, names, role, company, say) =>
    (heard ? `You had said "${heard}"` : "You had not said anything yet") +
    ` when the candidate cut in and said: "${said}". Keep your whole reply to two short sentences. ` +
    "First reply to what they actually said, in a few words (greet them back by name if they gave one; " +
    "do not say hello twice). " +
    `If you had not finished introducing the panel, name it in a few words: ${names.technical_lead}, the Technical Lead, ` +
    `and ${names.mentor}, the Mentor (and yourself, ${names.moderator}, if you had not said your name yet). ` +
    'Then ask briefly for one project they built, e.g. "Could you tell us about one project you built?" ' +
    "Do not list what to cover (problem, architecture, contribution) and do not repeat the full opening question." +
    ` Facts, if they ask: this is a practice interview for the ${role} role${company ? ` at ${company}` : ""}; the panel is you (${names.moderator}, the moderator), ${names.technical_lead} (the Technical Lead) and ${names.mentor} (the Mentor). ` +
    "Do not repeat what you had already said: answer only what they asked." +
    (company && say !== company ? ` Say "${company}" so it sounds like "${say}" (only a guide to how it sounds).` : ""),
  handoff: (after, next) =>
    `${
      {
        introduction: "Thank you for walking us through your project.",
        addition: "Thanks for adding that.",
        unanswered: "That's completely fine.",
      }[after]
    } ${next}, over to you.`,
  timeBuyer: (said, next) =>
    `The interview is already in progress. The candidate has just introduced their project: "${said}". ` +
    "In one short spoken sentence, thank them (no praise, no greeting). Then ask one short, light question about the " +
    "project's background that they have not answered yet, such as who it was for, whether it was a team inside a company, how big the team was, " +
    `or what their own part was. Do not ask anything technical or in depth: ${next}, the Technical Lead, asks that next. ` +
    "Ask only one question, and keep the whole reply under 30 words.",
  sayAgain: "Sorry, I didn't catch that. Could you say it again?",
  missedPart: "Sorry, I missed part of your answer. Could you say that again?",
  resume: "Sorry, the connection dropped for a moment. We're back now, so let's continue.",
  answerAgain: "Could you please give your answer to the last question again?",
  endEarly: (said) =>
    `The interview is already in progress. The candidate asked to stop now: "${said}". In one or two short ` +
    "spoken sentences, agree warmly, thank them for their time, and wish them luck. Do not greet anyone and do not ask anything.",
  readAloud: (line) =>
    "The interview is already in progress and the candidate has just spoken. Do not greet anyone " +
    `and do not add anything of your own. Read the following line aloud exactly as written, word for word: "${line}"`,
  substituteQuestion: (role, question) => `Our ${role} asks: ${question}`,
  clarify: (asker, question, said, lengthMin) =>
    `The interview is already in progress. ${asker ? `The ${asker}` : "You"} just asked the candidate: "${question}". ` +
    `The candidate replied: "${said}". In one or two short spoken sentences, answer what the candidate asked, ` +
    "using only the question and general knowledge; do not invent facts about the candidate's project " +
    "and do not ask a new question. Do not greet anyone. " +
    `If they ask about the interview itself, these are the only facts: it lasts about ${lengthMin} minutes; ` +
    "the candidate introduces one project, then the Technical Lead and the Mentor take turns asking follow-up questions until time is up.",

  questions: {
    system: `You write the next question for a panel interviewing a candidate about one technical project they worked on (software, machine learning, data, research, hardware, or similar).
Ground the question in something specific the candidate said; reuse their own numbers and terms.
Useful angles:
- Clarification: technical implementation details; metrics and how they were measured.
- Deep dive: decision rationale and alternatives; validation and trade-offs.
- Verification: impact quantification; personal contribution and role.
This is interview practice, so keep questions approachable: one thing at a time, nothing obscure.
If the candidate listed several things (features, steps, tools), ask about only one of them.
Only mention things the candidate actually said; never invent components, products, or numbers.
The candidate's words come from speech recognition and may contain mistakes: misheard or extra words, misspelled names.
Never ask about, quote, or build on a word or phrase that looks like a recognition error; use only the parts whose meaning is clear.
Do not repeat or closely rephrase a question already asked in the transcript.
The question is spoken aloud, so ask exactly ONE question: a single sentence with one question mark, under 200 characters, no lists or markdown.
Never add a second question or an "and how/why ..." follow-up; pick the more important half.
First judge the candidate's last answer as a neutral reviewer, whoever asks next, checking in this order:
- "inconsistent": compare every number and fact in it (counts, sizes, latencies, tools, steps) with what they said earlier, including totals stated in the introduction; any mismatch, or a claim that does not add up, is inconsistent, even if it is concrete. Then the reason must read "earlier: ... / now: ...".
- "solid": otherwise, it answers the question with at least one concrete number, tool, or mechanism, even if more could be asked.
- "vague": general claims with no concrete number, tool, or mechanism behind them.
Judge only the content, never grammar or speech-recognition mistakes.
Then write the question to fit the judgment (the asker's tone rules below come first):
- solid: build on it.
- vague: ask for exactly one missing specific, unless the last panel question already asked for it; then move on to a part not asked about yet.
- inconsistent: name the two things that do not fit and ask which is right.
Every question asks about one thing only: never join two asks with "and".
Write the question and the reason in English.
Fill "check" before anything else: list each number or fact in the last answer next to what they said about it earlier ("earlier ... / now ..."), or "nothing to compare".
Reply in json: {"check": "...", "assessment": "solid" | "vague" | "inconsistent", "reason": "<one short sentence>", "question": "..."}`,
    persona:
      "precise and curious about how things actually work; politely presses on weak evidence, assumptions, and hand-waving",
    difficulty: {
      easy:
        "Easy: a friendly, non-technical warm-up about their own experience, answerable from memory in a sentence or two. " +
        "Never ask why they chose an approach, a tool, or a design; no internals, numbers, or edge cases. " +
        "Ignore the advice above about numbers and metrics for this question.",
      medium:
        "Medium: a technical question about one specific component, model, step, or result they mentioned, " +
        "answerable with a short explanation.",
      hard:
        "Hard: the technical question an experienced engineer or researcher asks after reading about the project, " +
        "and it may ask about the numbers behind a result (a latency, accuracy, throughput, or cost figure). " +
        "Still fair and answerable in about a minute; no trick questions or trivia.",
    },
    angles: {
      easy: [
        "which part of the work they did themselves",
        "who they worked with and what their role on the team was",
        "what was hardest for them personally",
        "what they learned, or would do differently next time",
        "what they are proudest of in this project",
      ],
      medium: [
        "how one component, model, or step they mentioned works",
        "how they built or implemented one specific part",
        "how they measured or evaluated one result they mentioned",
        "what data or inputs one part depends on, and where they come from",
        "how one part they mentioned fits into the rest of the system or pipeline",
      ],
      hard: [
        "how a number or result they mentioned was measured or validated, and how far it can be trusted",
        "what limited performance, accuracy, or quality: the bottleneck",
        "what would change at a larger scale: more data, users, traffic, or a bigger model",
        "what happens when an input, a component, or an assumption fails",
        "a trade-off they accepted, and what it cost them",
        "a baseline or alternative they compared against, or could have",
      ],
    },
    goals: {
      technical_lead: [
        {
          goal: "Technical deep dive: ask how one part of the system, model, or method works, or how a result they mentioned was measured.",
          easyGoal: "Warm-up: ask what their own part was, or ask them to describe one concrete thing they mentioned.",
        },
        {
          goal: "Challenge: question an assumption, a trade-off, or an inconsistency in what they have said, or introduce a failure condition (bad input, a component down, shifted data, more load) and ask how their design or method would handle it.",
          easyGoal:
            "Gentle challenge: ask what they would do differently next time, or whether anything went wrong or surprised them along the way.",
        },
      ],
      mentor: [
        {
          goal: "Follow-up: pick a part of the project not covered yet, or go deeper on one answer: how they made it work, how they knew it worked, or what they would build next.",
          easyGoal:
            "Follow-up: ask what they learned, what they would do next, or about one part not covered yet, in what they described.",
        },
      ],
    },
    followUp: (round, asker, persona) =>
      `Follow-up ${round}; the Technical Lead and the Mentor take turns until time runs out. Asked by the ${asker}, who is ${persona}.`,
    practising: (role, company) =>
      `The candidate is practising for a ${role} role${company ? ` at ${company}` : ""}. ` +
      "Use this only to choose what matters most; the question must still follow from what they just said.",
    freshTopic: "Ask about a part or an angle the panel has not asked about yet in the transcript.",
    goal: (goal) => `Goal: ${goal}`,
    difficultyLine: (guide) => `Difficulty: ${guide}`,
    angle: (angle) => `Angle for this question: ${angle}.`,
    priority: "The difficulty and the angle matter more than the goal: keep only the goal's topic.",
    unanswered: (question) =>
      `The candidate could not answer the last question ("${question}"). Do not ask it again, ` +
      "not even in other words (such as which tool they used or how they found it); " +
      "ask about a different part of what they described.",
    pending: (asker, question) =>
      `The ${asker} has just asked "${question}", and the candidate is answering it now; that answer is not in the transcript yet. ` +
      "Do not follow up on that question or ask anything that overlaps it. " +
      "Build your question on the candidate's last answer in the transcript.",
    background: (asked) =>
      asked
        ? `The Moderator already asked the candidate a background question: "${asked}". Do not ask it again, not even reworded.`
        : "The Moderator is asking the candidate a light background question right now (who the project was for, whether it was a team inside a company, how big the team was, or what their own part was). Do not ask about any of these.",
    earlierSkipped: (questions) =>
      "The candidate also could not answer these earlier questions; do not come back to them or their topic: " +
      questions.map((q) => `"${q}"`).join("; "),
    alreadyAsked: "Questions the panel already asked (never ask any of them again, not even reworded):",
    transcript: "Transcript so far:",
    repeated: (draft, earlier) =>
      `Your last draft, "${draft}", repeats the earlier question "${earlier}". Ask about something else.`,
  },

  turn: {
    system:
      "You watch a live spoken interview. The candidate just paused. From the transcript of what they have said so far, " +
      "decide two things.\n" +
      "1. finished: whether they have finished their turn or are only pausing mid-thought and will continue. " +
      "Short answers are often complete. Say false only if the transcript stops mid-sentence, ends on a connective or filler " +
      '(and, so, because, um, uh), or announces more to come (e.g. "there are two parts", "let me think", "hold on"). ' +
      "A request to the panel is a finished turn. Otherwise say true.\n" +
      '2. intent: "repeat" if they ask to hear the question again; "clarify" if they ask what the question or a word in it ' +
      'means, or which of two readings is meant; "skip" if they say they do not know or ask to skip or move on; ' +
      '"wait" only right after a silence prompt (see below), if they want more time to think ("give me a minute"); ' +
      '"end" if they ask to stop the interview; "noise" if it is only a backchannel or filler with nothing said ' +
      '(mm-hm, uh-huh, okay, yeah, um); otherwise "answer" (an answer, an addition to the last one, a thank-you, small talk). ' +
      'A question asked as part of an answer ("why does that matter? Because ...") is an answer.\n' +
      "If the candidate cut in while a panelist was speaking, the panelist's words before the cut are given; " +
      "a request then refers to the question they were answering.\n" +
      'If the panel has just asked the candidate something after a silence (e.g. "Do you need more time?"), it is given; ' +
      'read the reply as an answer to it: wanting more time is "wait", wanting to move on is "skip".\n' +
      "The interview is in English.\n" +
      'Reply with JSON only, e.g. {"finished": true, "intent": "answer"}.',
    question: "Question: ",
    cutInto: "The candidate cut in while a panelist was saying: ",
    prompt: "After a silence, the panel just asked the candidate: ",
    candidate: "Candidate so far: ",
  },

  rules: {
    end: [
      /\b(?:stop|end|finish) the (?:interview|test|session|practice)\b/,
      /\bi (?:have|need|got) to (?:go|leave)\b/,
      /\b(?:can|could) we (?:stop|end) (?:here|now)\b/,
      /\bi'?m (?:gonna|going to) hang up\b/,
      /\blet'?s end\b/,
      /\bi want to (?:stop|quit)\b/,
      /\bi'?m done for today\b/,
    ],
    // Speech recognition writes "uh-huh" as "Aha!" too; plainText turns "mm-hm" into "mm hm".
    backchannel: ["mm", "mhm", "hm", "uh", "huh", "aha", "hmm", "um", "yeah", "okay", "ok", "right", "sure"],
    courtesy:
      /^(?:(?:thank you(?: (?:so|very) much)?|thanks(?: a lot)?|okay|ok|yeah|yes|alright|all right|cool|great|that\'s it|that\'s all|bye|cheers|sure)\s*)+$/,
    repeat: [
      /\brepeat (?:that|it|yourself|(?:the|your)(?: last)? question)\b/,
      /\bsay (?:that|it) again\b/,
      /\bpardon\b/,
      /\bcome again\b/,
      /\bdidn'?t (?:catch|hear)\b/,
      // Speech recognition often turns "Sorry?" into "Sorry.".
      /^sorry[?.!]?$/,
      /\bi missed (?:that|it|the (?:last|first) part|what you said)\b/,
      /\bwhat was the question\b/,
      /\b(?:read|ask|say) the question again\b/,
      // Not "we retry one more time": only a bare request.
      /^(?:(?:sorry|um|uh),? )?one more time\b/,
    ],
    clarify: [
      /\bwhat do you mean\b/,
      /\bwhat does .+ mean\b/,
      /\bdo you mean\b/,
      /\b(?:could|can) you (?:clarify|explain)\b/,
      /\bnot sure what you(?:'re| are) asking\b/,
      /\bwhich one\b/,
      /\bare you asking\b/,
      /\bwhen you (?:say|ask)\b/,
      /\byou want me to\b.*\?$/,
      /\b(?:be more specific|rephrase)\b/,
      /\bnot sure i (?:follow|understand)\b/,
      // "X or Y?" in a short turn: picking between two readings of the question.
      // Not with a number in it: "maybe 50 or 60 ms?" is a guess, not a question.
      /^(?!.*\d).*\bor\b.*\?$/,
      // A short turn that is only a "what is …?" question, e.g. "What is a thundering herd?"
      /\bwhat(?: is|'s| are) .+\?$/,
      // The same without the question mark, which speech recognition often leaves out: "what is a tail latency".
      /^(?:(?:um|uh|so),? )?what(?: is|'s| are) (?:a |an |the )?[a-z0-9-]+(?: [a-z0-9-]+)?$/,
    ],
    dontKnow: [
      /\bi don'?t know\b/,
      /\bno idea\b/,
      /\bnot sure\b/,
      /\bi (?:can'?t|don'?t) remember\b/,
      /\bdon'?t (?:really )?have an answer\b/,
    ],
    skip: [
      /\b(?:can|could|shall) we (?:skip|pass|move on)\b/,
      /\b(?:let'?s|i'?d (?:rather|like to)|i want to) (?:skip|pass|move on)\b/,
      /\bskip (?:this|that|it)\b/,
      /\bpass on (?:this|that|it|the question)\b/,
      /^pass\b/,
      /\bnext question\b/,
    ],
    yes: /^(?:(?:uh|um) )?(?:yes|yeah|yep|sure|okay|ok|please|yes please|i do|a little|a bit)\b/,
    no: /^(?:no|nope|not yet|i'?m (?:fine|good|ok|okay))\b/,
    holdOn:
      /\b(?:give me a|just a|one|a)(?: more)? (?:sec|second|moment|minute)\b|\blet me think\b|\bstill thinking\b|\bi (?:want|'d like) to try\b/,
    filler: /^(?:um+|uh+|hmm+|so|like)[,.]?$/,
    longClarify:
      /\b(?:are you asking|when you (?:say|ask)|do you mean|not sure i (?:follow|understand)|make sure i (?:got|understand))\b/,
    trailing: ["and", "so", "because", "but", "or", "um", "uh", "like"],
    thinking: /let me think$/,
    secondAsk: /,\s+and\s+(?:what|how|which|why|where|when|who|did|do|does|were|was|is|are|could|can|would)\b/i,
    stopWords:
      "a an the and or of to in on for with from by at as is are was were be been do does did what which how why when where who whom whose that this these those it its your you their they them there into like such than then".split(
        " ",
      ),
  },
};
