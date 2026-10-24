# HotSeat

An AI panel interview you can practise with. Three AI interviewers question you about your own project by voice, then give you a written report.

## Features

- **Three-person panel**: a moderator (Higgs Realtime) runs the call; a Technical Lead and a Mentor (Higgs TTS 3) take turns asking follow-up questions.
- **Follow-ups from your answers**: an LLM reads the transcript and writes the next question, at the difficulty you pick for each interviewer.
- **Natural turn-taking**: the panel waits until you finish answering; you can also ask it to repeat, explain or skip a question, or cut in while it is speaking.
- **Prep room**: upload a résumé, choose the role, company, language (8 languages), voices, difficulty and interview length.
- **Talking heads** (optional): the two panelists appear as Higgs Avatar videos.
- **Report**: after the interview, a scored report with quotes from your answers, exportable as PDF.

## Setup

Needs Node.js, PostgreSQL and macOS with Homebrew (for whisper.cpp).

```bash
createdb hotseat
cp .env.example .env        # fill in BOSON_API_KEY and DEEPSEEK_API_KEY
npm install
brew install whisper-cpp
mkdir -p .cache/whisper && curl -L -o .cache/whisper/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
npm run dev
```

Open http://localhost:5180. Set `AVATAR=true` in `.env` for the talking heads; other options are explained in `.env.example`.

## Usage

1. Wear headphones, so the microphone does not pick up the panel.
2. Open the prep room, add your résumé, set up the panel, and click **Join interview**.
3. Introduce a project you worked on, then answer the panel's questions.
4. When time is up, the moderator closes the interview and your report appears.

## License

Copyright (c) 2026 Yifei Zhang, Junwei Quan, Peize Zhang and Jingwen Zhong. All rights reserved. `src/audio/` is adapted from [higgs-realtime-tutorial](https://github.com/boson-ai/higgs-realtime-tutorial) and keeps its Apache-2.0 license (`src/audio/LICENSE`).
