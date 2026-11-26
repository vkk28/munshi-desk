# Munshi Desk — Build Plan

> A voice-first form-filling copilot for Common Service Centre (CSC), cyber café, and tehsil desk operators in India.
> Hackathon: Scaler × Wispr Flow, "Build for Bharat" (Round 2). Theme: **Public infrastructure and civic services**.

> **Note for AI Coding Agent:** Execute this plan strictly in milestone order (**M0 → M5**). Focus exclusively on building, testing, and verifying the working software (`engine/`, `web/`, `extension/`, Vitest tests, and Docker build). **The demo video (§12), pitch deck PDF (§13), and final submission packaging are explicitly the Final Phase (M6)**—do not spend cycles on video/demo prep or deck assets until M0–M5 are fully built and passing all checks.

## 0. Deliverables and Hard Gates

**Deliverables**

1. Public GitHub repo with `docker-compose.yml`
2. YouTube demo (public or unlisted), **3 minutes or less** *(Final Phase — M6)*
3. Pitch deck as PDF (evaluators read the text, not the images) *(Final Phase — M6)*
4. Live link (optional, small bonus, HTTPS for microphone access) *(Final Phase — M6)*

**Hard gates (every single item must pass)**

- [ ] Repo is **public**
- [ ] `docker compose up` starts the app with **one command** (`http://localhost:8080`)
- [ ] Main screen loads and the full core flow works with **zero secret keys** (anything optional needing a key shows `"key not set"`)
- [ ] **300+ lines of original code** written during the hackathon (steady commit history, not a starter template)
- [ ] Clean-clone test passes on a separate machine (`git clone` → `docker compose up` → main screen loads and runs)
- [ ] Pitch deck PDF has selectable text covering all four required sections (§13)

## 1. Product in One Paragraph

Two people sit at a desk: the operator (controls the browser) and the citizen (knows the facts, cannot type or verify formal English). The operator opens a web government form and starts Munshi Desk. The two talk naturally in Hindi, Bhojpuri, or Hinglish. The engine scans the live DOM, transliterates Devanagari STT output into a canonical format, strips fillers, ignores side-chatter, resolves self-corrections, validates values deterministically, and fills the fields live. The operator edits or undoes by voice. It pauses automatically at OTP/CAPTCHA fields. Before submission, it **dynamically reads back critical fields in the citizen's own language** and unlocks Submit only after a spoken `"Haan"` once all amber flags are cleared.

**Core flow:**

```text
IDLE → scan page → LISTENING (fill live, edit/undo by voice)
     → PAUSED_MANUAL (OTP/CAPTCHA, operator types) → resume ("Aage badho" or click)
     → VERIFYING (dynamic read-back, citizen confirms or corrects)
     → READY (Submit unlocked) → submit → wipe session
```

## 2. Scope and Priority Tiers

### Core (must work end to end)

- **Languages:** Hindi, Bhojpuri (Hindi recognizer + transliteration + Bhojpuri lexicon), Hinglish; language selector structured so Kannada and Tamil plug into the same pipeline
- **Field types:** `text`, `textarea`, `select`, `radio`, `checkbox`, `date`
- **Voice operations:** live multi-field fill, cross-utterance self-corrections, operator Q&A binding (`"Pincode kya hai?"` → `"800001"`), single-field voice edit, `"same as current"` address copy/toggle, voice `"undo"`
- **Deterministic validators:** single-field (pincode, mobile, date, Verhoeff 12-digit ID with UI masking) + cross-field (Age ↔ DOB consistency, Pincode prefix ↔ State/District check)
- **Human-in-the-loop & trust:** OTP/CAPTCHA pause + resume, capture-phase form-submit lock, dynamic read-back with per-field re-read on correction, hard lock on amber fields
- **Keyless & no-mic modes:** deterministic rule engine as default, 3-scenario paced sample-conversation player, typed-utterance input, Wispr-style rich transcript diff UI

### Extensions (layered on top of the same `engine/` package)

- Hidden 4th portal (mixed Hindi/English labels + `aria-label`-only inputs) for zero-setup switch proof
- Manifest V3 Chrome extension shell (`extension/`) for the ~20-second real-portal clip in the final demo video
- Optional LLM mapper (`engine/mapper/llm.ts`) unlocked only when a runtime API key is entered in UI memory

### Non-goals

- Replacing the operator, bypassing OTP/Aadhaar authentication, or auto-submitting forms
- Persisting audio, transcripts, or Aadhaar numbers to disk, `localStorage`, or logs
- Native desktop apps, mobile apps, or non-web legacy software

## 3. Architecture

### Repo layout

```text
munshi-desk/
├── package.json              # npm workspaces: ["engine", "web"]
├── docker-compose.yml        # docker compose up → http://localhost:8080
├── Dockerfile                # multi-stage: node:20-alpine build → nginx:alpine serve
├── nginx.conf                # SPA fallback (try_files) + static caching
├── README.md                 # run instructions, architecture, browser/privacy notes
├── plan.md                   # this file
├── engine/                   # shared TypeScript package consumed by web & extension
│   ├── package.json
│   └── src/
│       ├── index.ts          # public barrel exports
│       ├── types.ts          # schema, patch, diff token, FSM, session types
│       ├── scanner.ts        # live DOM → JSON schema + WeakMap element registry
│       ├── filler.ts         # native value setters, event dispatch, submit interceptor
│       ├── session.ts        # recentFields stack, pendingQuestionField, undo history
│       ├── pipeline.ts       # stateful utterance → normalized diff → patches
│       ├── mapper/
│       │   ├── rules.ts      # keyless rule-based mapper + fuzzy select matcher
│       │   └── llm.ts        # optional runtime-key LLM mapper
│       ├── normalize/
│       │   ├── transliterate.ts  # Devanagari digits, loanwords, Romanizer
│       │   ├── corrections.ts    # nahi / matlab / galat / make it (runs before fillers)
│       │   ├── fillers.ts        # um, uh, like, basically, standalone matlab
│       │   ├── lexicon.bho.ts    # Bhojpuri → Hindi rewrite map
│       │   ├── numbers.ts        # Hindi/Hinglish 1–99, sau/hazaar/dedh/dhai/paune, digit strings
│       │   └── dates.ts          # spoken dates → portal date format (default DD/MM/YYYY)
│       ├── data/
│       │   └── pincodePrefixes.json  # ~3KB static 3-digit prefix → State/District lookup
│       ├── validators.ts     # pincode, mobile, date, Verhoeff, Age↔DOB, Pin↔District
│       ├── fsm.ts            # 5-state machine with transition guards
│       ├── speech/
│       │   ├── stt.ts        # SttAdapter interface + WebSpeechSttAdapter
│       │   ├── tts.ts        # queued per-field speechSynthesis + watchdog + cooldown
│       │   └── audioMeter.ts # optional AnalyserNode RMS meter for UI mic level
│       └── prompts.ts        # dynamic read-back generator + localized spoken prompts
├── web/                      # graded Docker shell (Vite + React + Tailwind)
│   ├── package.json
│   ├── vite.config.ts        # aliases @munshi/engine → ../engine/src/index.ts
│   └── src/
│       ├── panel/            # 320px docked panel (4 zones + rich diff transcript)
│       ├── portals/          # Pension, Domicile, Grievance, Hidden 4th portal
│       └── samples/          # 3 paced multi-step scripted scenarios
├── extension/                # MV3 Chrome extension using the same engine/src
└── tests/                    # Vitest unit tests + end-to-end scripted scenarios
```

### Data flow

```text
mic ──► SttAdapter (Web Speech) ──► transliterate.ts (Devanagari → canonical Roman + ASCII digits)
                                           │
                                    corrections.ts (runs BEFORE fillers so "matlab" works contextually)
                                           │
                                    fillers.ts ──► lexicon.bho.ts ──► numbers.ts / dates.ts
                                           │
page DOM ──► scanner.ts ──► JSON schema ───┴──► Schema Relevance Gate + Session State
                                                  (commands | pendingQuestion | recentFields)
                                           │
                                    mapper (rules | optional LLM)
                                           │
                                    validators.ts (single-field + cross-field) ──► patches + undo stack
                                           │
                          filler.ts ◄──────┴──────► panel (badges, Wispr diff transcript, lock state)
                                           │
                                    fsm.ts + tts.ts (queued per-field TTS + mic mute + 300ms cooldown)
```

### Stack decisions

- **TypeScript everywhere**, with one shared `engine` package imported cleanly via Vite alias so `npm run build --workspace web` succeeds in Docker with zero workspace symlink failures
- **Vite + React + Tailwind** for the web shell and panel; **Vitest** for unit and scenario tests
- **Static build served by `nginx:alpine`** with `nginx.conf`, ensuring zero backend secrets exist
- **Web Speech API** (`webkitSpeechRecognition` + `speechSynthesis`) behind swappable adapters; Chrome is the target browser

## 4. Engine Specification

### 4.1 Scanner (`scanner.ts`)

Zero hardcoded selectors. Reads `<label for>`, wrapping `<label>`, `placeholder`, `aria-label`, `aria-labelledby`, `name`/`id`, nearest preceding heading/text, `<select>` options, and radio/checkbox groups. Uses `MutationObserver` to re-scan on dynamic DOM updates and inspects same-origin iframes.

Runtime DOM element references live in a private `Map<string, HTMLElement>` (never serialized). Output schema:

```json
{
  "formId": "pension-v1",
  "fields": [
    {
      "id": "f3",
      "kind": "text | textarea | select | radio | checkbox | date",
      "label": "Father's Name",
      "hints": ["father", "pita", "baap", "babuji"],
      "semantic": "name | father_name | age | dob | pincode | mobile | aadhaar | address | permanent_address | same_address | district | state | village | gender | free | otp | captcha",
      "options": ["Male", "Female", "Other"],
      "required": true,
      "maxLength": 40,
      "dateFormat": "DD/MM/YYYY"
    }
  ]
}
```

Any field matching `otp|captcha|verification code|security code` (or adjacent to a CAPTCHA image/canvas) is tagged `semantic: "otp"` or `"captcha"` and is **never writable by voice**.

### 4.2 Transliteration & Script Canonicalization (`normalize/transliterate.ts`)

Because Chrome `hi-IN` returns Devanagari—and frequently transliterates English portal words into Devanagari (`पिनकोड`, `परमानेंट एड्रेस`, `रीड बैक`)—this stage runs **first** on every STT event:

1. Convert Devanagari numerals (`०–९`) to ASCII digits (`0–9`) and normalize danda (`।`) to sentence breaks.
2. Replace known Devanagari-transliterated English portal/command words with canonical English (`पिनकोड` → `pincode`, `एड्रेस` → `address`, `परमानेंट` → `permanent`, `करंट` → `current`, `सेम ऐज करंट` → `same as current`, `रीड बैक` → `read back`, `सबमिट` → `submit`, `ओटीपी` → `otp`, `मोबाइल` → `mobile`, `आधार` → `aadhaar`, `अनडू` → `undo`, `मेक इट` → `make it`, `डबल` → `double`, `ट्रिपल` → `triple`, `जीरो` → `zero`, English month names).
3. Deterministically transliterate remaining Devanagari tokens into practical Roman Hindi (with terminal schwa handling so `रामधारी यादव` → `ramdhari yadav`, `चौंसठ` → `chaunsath`, `उम्र` → `umar`, `नहीं` → `nahi`, `हमार` → `hamaar`, `बा` → `ba`, `हाँ` → `haan`, `आगे बढ़ो` → `aage badho`).
4. Title-case extracted proper nouns (`Ramdhari Yadav`, `Patna`) before writing into English text inputs.

### 4.3 Stateful Utterance Pipeline (`pipeline.ts` & `session.ts`)

Chrome's `continuous: true` mode splits natural conversation across multiple finalized events. The pipeline maintains session state across utterances:

1. **Confidence handling (never drop unreported confidence):**
   - If `confidence === 0` or `undefined` (normal Chrome behavior on some final chunks), treat as unreported and process normally.
   - If `0 < confidence < 0.75`, do **not** silently drop; process the update and tag resulting patches `lowConfidence: true` so the field renders **amber (`needs_review`)** and stays locked until verified.
2. **Command check:** Detect `"read back"`, `"haan"`, `"nahi"`, `"aage badho"` / `"resume"`, `"undo"` / `"pichla hatao"`.
3. **Corrections BEFORE fillers (`corrections.ts` → `fillers.ts`):**
   - Run `corrections.ts` first so `"matlab"` acts as a correction cue when introducing a replacement value (`"62 matlab 64"`), and is only stripped by `fillers.ts` when used as a standalone pause filler.
   - Correction cues: `nahi`, `galat`, `galat hai`, `make it`, `I mean`, contextual `matlab`.
   - Record rich diff tokens (`{ type: "kept" | "filler" | "replaced" | "replacement" | "ignored", text }`) for the UI.
4. **Lexicon & Normalizers:** Apply `lexicon.bho.ts`, then `numbers.ts` and `dates.ts`.
5. **Cross-utterance binding (`session.ts`):**
   - **Bare correction across utterances:** If an utterance contains a correction cue + value with no field name (e.g., chunk 1: `"umar 62"`, chunk 2: `"um nahi 64"`), resolve against the most recent compatible entry in `recentFields` (within 20s).
   - **Operator Q&A slot (`pendingQuestionField`):** If an utterance mentions a field keyword with no value (`"Pincode kya hai?"`, `"Pita ka naam?"`), set `pendingQuestionField` for 10 seconds so the citizen's bare reply (`"800001"`, `"Suresh Yadav"`) maps directly to that field.
   - **Schema Relevance Gate:** Any utterance that is neither a command, nor bound to `pendingQuestionField`/`recentFields`, nor matching any field keyword in the active page schema is discarded and shown as `[ignored: side-chatter]` in the diff view.
6. **Map → Validate → Patch → Undo Stack:** Push every applied batch onto `patchHistory` so `"undo"` / `"pichla hatao"` restores exact prior DOM values.

### 4.4 Rule-Based Mapper (`mapper/rules.ts`)

- Synonym map per semantic type covering English, Roman Hindi, and Bhojpuri variants (`name`: `naam`, `name`; `father_name`: `pita ka naam`, `father's name`, `father name`, `babuji ka naam`; `age`: `umar`, `umr`, `age`, `saal`; `dob`: `janm tithi`, `date of birth`, `dob`, `paidaish`; `pincode`: `pincode`, `pin code`, `pin`; `mobile`: `mobile`, `phone`, `number`; `village`: `gaon`, `gaam`, `village`; `district`: `zila`, `jila`, `district`).
- Segments compound utterances into `<keyword> <value>` spans until the next keyword or clause boundary.
- Fuzzy-matches `<select>` and `<radio>` options (normalized Levenshtein / token-set similarity). If best match is below threshold, mark amber with top 2 candidate options.
- `"same as current"` / `"permanent address same as current"` toggles the `same_address` checkbox if present, or copies current-address fields to permanent-address fields (`op: "copy"`).
- Patch contract:

```json
{
  "fieldId": "f3",
  "value": "Ramdhari Yadav",
  "previousValue": "",
  "op": "set | append | clear | copy",
  "confidence": 0.92,
  "lowConfidence": false,
  "span": "Naam Ramdhari Yadav"
}
```

### 4.5 Normalizers (`normalize/`)

- **Numbers (`numbers.ts`):** Full 1–99 Hindi word table (including common transliteration variants like `chausath`/`chaunsath`, `baasath`/`basath`, `unnis`/`unees`, `pandrah`/`pandra`), multipliers (`sau`, `hazaar`/`hajar`, `lakh`), fractional idioms (`dedh` = 1.5, `dhai` = 2.5, `sawa` = +0.25, `paune` = −0.25), repetition cues (`double zero` → `00`, `triple` → 3× digit), and digit-by-digit concatenation for pincodes/mobiles/IDs.
- **Dates (`dates.ts`):** Parses spoken Hindi/English months and years (`pandrah August unnis sau baasath` → `15/08/1962`), formatting output to match the field's detected `dateFormat` (or `YYYY-MM-DD` for native `<input type="date">`, default `DD/MM/YYYY` for text inputs).
- **Bhojpuri (`lexicon.bho.ts`):** Rewrites Bhojpuri tokens to canonical Hindi after transliteration (Appendix A).

### 4.6 Deterministic Validators (`validators.ts`, run BEFORE every write)

**Single-field checks:**

| Check | Rule |
| --- | --- |
| Pincode | Exactly 6 digits, first digit `1–9` |
| Mobile | Exactly 10 digits, first digit `6–9` |
| Date | Valid calendar date (handles leap years/month lengths), not in the future, implied age `0–120` |
| Age | Integer `0–120` |
| 12-digit ID | Verhoeff checksum verified in memory; masked in panel as `XXXX-XXXX-1234`; never logged or stored |

**Cross-field sanity checks (run whenever related fields are populated):**

| Check | Rule |
| --- | --- |
| Age ↔ DOB | If both Age and DOB exist on the form, verify `abs(computedAgeFromDob - age) <= 1`. On mismatch: flag both amber and speak `"Umar aur janm tithi match nahi kar rahe, kripya check karein."` |
| Pincode ↔ State/District | Look up first 3 digits of pincode in `pincodePrefixes.json`. If a State or District field is filled and conflicts with the prefix region: flag amber and prompt operator to check |

Any validation failure marks the field **amber**, keeps Submit locked, and triggers one short spoken prompt.

### 4.7 Filler & Submit Interception (`filler.ts`)

- Writes via native prototype setters (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`) and dispatches bubbling `input` and `change` events so React/Angular controlled inputs update reliably.
- Flashes voice-edited fields blue for ~1 second (`outline` / `box-shadow` transition).
- If a custom widget (e.g., third-party date picker without a settable input) cannot be updated cleanly, marks the field amber with `"Fill manually"`.
- **Hard submit lock:** While `fsm.state !== "READY"` (or any field is amber), disables the submit button **and** attaches a capture-phase `submit` event listener (`e.preventDefault(); e.stopPropagation()`) so pressing `Enter` in an input cannot bypass read-back verification.

### 4.8 State Machine (`fsm.ts`)

| From | Event | Guard | To | Side effects |
| --- | --- | --- | --- | --- |
| `IDLE` | `START` (icon or `Alt+M`) | — | `LISTENING` | scan DOM, start mic |
| `LISTENING` | `OTP_OR_CAPTCHA_NEXT` | — | `PAUSED_MANUAL` | blue status bar `"Paused for OTP/CAPTCHA"`, speak prompt, pause all field writes, listen **only** for `"Aage badho"` / `"Resume"` (or Resume click) |
| `PAUSED_MANUAL` | `RESUME` | — | `LISTENING` | resume normal field filling |
| `LISTENING` | `READ_BACK` | no unaddressed amber errors (if amber exists, speak amber warning and stay in `LISTENING`) | `VERIFYING` | lock Submit, start queued dynamic read-back |
| `VERIFYING` | `CONFIRM` (`"Haan"`) | `readBackCompleted === true` AND zero amber fields | `READY` | unlock Submit, speak confirmation |
| `VERIFYING` | `CONFIRM` (`"Haan"`) | `readBackCompleted === false` | `VERIFYING` | ignore premature `"Haan"` (deference guard), show subtle UI hint `"Wait for read-back to finish"` |
| `VERIFYING` | `CORRECTION` (`"Nahi, umar 65 hai"`) | — | `LISTENING` → `VERIFYING` | update target field, validate, re-read **only** that changed field, await `"Haan"` |
| `VERIFYING` | `BARE_NO` (`"Nahi"`) | — | `VERIFYING` | speak `"Kaun sa?"`, await field name + value |
| `READY` | `VOICE_EDIT` | — | `LISTENING` | apply edit, re-lock Submit until re-verified |
| `READY` | `SUBMITTED` | — | `IDLE` | wipe audio buffer, transcript, session state, and in-memory IDs |

### 4.9 Speech & TTS Safeguards (`speech/stt.ts`, `speech/tts.ts`, `prompts.ts`)

- **STT (`stt.ts`):** `webkitSpeechRecognition` with `lang = "hi-IN"` (Hindi/Bhojpuri) or `"en-IN"` (Hinglish toggle), `continuous: true`, `interimResults: true`, automatic backoff restart on `onend` while active. Wrapped behind `SttAdapter` so Sarvam/Bhashini/local Whisper can swap in cleanly.
- **Mic level meter (`audioMeter.ts`):** Lightweight `AudioContext` + `AnalyserNode` RMS bar in the panel top bar (visual feedback only; degrades gracefully if unavailable).
- **TTS (`tts.ts`):**
  - Strictly mutes STT intake while speaking.
  - Splits dynamic read-back into **short per-field utterances** queued sequentially (prevents Chrome's long-utterance TTS hang bug).
  - Enforces a **watchdog timer** (`maxDurationMs` per chunk) that forces mic unmute if Chrome fails to fire `onend`.
  - Adds a **300ms post-TTS cooldown** before accepting new STT events so speaker tail-echo is never transcribed.
  - Speaks digits individually for pincode, mobile, and last 4 digits of masked IDs.
- **Speech policy:** Silent during normal form filling. Speaks only for OTP/CAPTCHA pause, validation/cross-field errors, and dynamic read-back.
- **Dynamic read-back (`prompts.ts`):** Builds the read-back list from the active portal's scanned schema (all filled `required` / critical fields, never hardcoded to one form). For masked 12-digit IDs, speaks only the last 4 digits (`"ID aakhiri chaar ank 1 2 3 4"`).

## 5. UI Spec (320px Right-Docked Panel, Four Fixed Zones)

1. **Top bar:** language selector (Hindi / Bhojpuri / Hinglish + disabled Kannada/Tamil plug-in placeholders), state pill (`IDLE` / `LISTENING` / `PAUSED_MANUAL` / `VERIFYING` / `READY`), mic toggle + live RMS level bar, optional LLM key drawer (shows `"key not set — deterministic mode"` by default)
2. **Field list (scrollable):** field label, current value (12-digit IDs masked `XXXX-XXXX-1234`), status badge (`green` = validated, `amber` = needs check / low confidence / fill manually), per-field quick edit or undo indicator
3. **Rich transcript diff footer (2–3 lines):** Wispr-style live cleanup visualization:
   - Stripped fillers rendered with muted strikethrough (`~~um,~~ ~~matlab~~`)
   - Self-corrections shown inline (`~~62~~ → **64**`)
   - Side-chatter shown faintly (`[ignored: side-chatter]`)
4. **Verification & action footer:** Submit lock status (`Locked` / `Awaiting "Haan"` / `Unlocked`), `"Read back"` button, `"Resume"` button (visible in `PAUSED_MANUAL`), `"Play sample"` scenario picker, and typed-utterance input box

## 6. Mock Portals (`web/src/portals/`)

Four structurally distinct web forms to prove zero hardcoded selectors:

| Portal | Purpose | DOM & Validation Quirks |
| --- | --- | --- |
| **1. Old Age Pension** | Primary demo | Standard `<label for>`, text inputs, native `<select>`, Age + DOB (triggers Age↔DOB cross-check), Pincode + District, OTP/CAPTCHA box |
| **2. Domicile Certificate** | React-controlled form | Controlled inputs requiring native value setters, custom dropdown, `"Permanent address same as current"` checkbox, 12-digit ID field (Verhoeff + masking), OTP step |
| **3. Municipal Grievance** | Free text + custom widget | Long `<textarea>`, custom un-settable date widget (proves amber `"Fill manually"` fallback), ward/pincode fields, CAPTCHA step |
| **4. Hidden 4th Portal** | Zero-setup generality proof | Mixed Hindi/English labels (`"आवेदक का नाम / Applicant"`), `aria-label`-only inputs, different field order and required set (proves dynamic read-back) |

Portal switching uses React state / hash routing so browser refresh never 404s.

## 7. Keyless & No-Mic Operation

Evaluators running `docker compose up` with no API keys and no microphone must experience the entire product immediately:

- **Zero keys required:** Rule mapper, transliterator, normalizers, validators, FSM, and Web Speech run 100% locally.
- **3 Paced Sample Conversations** (streamed line-by-line with realistic ~1.5s pauses through the real `pipeline.ts` so evaluators watch live DOM writes, filler strikethroughs, blue edit flashes, and TTS read-back):
  1. **Messy Hinglish + Correction + OTP + Read-Back Fix:** fills Pension form with fillers, cross-utterance correction (`62` → `64`), `"same as current"`, OTP pause, read-back, `"Nahi, umar 65 hai"`, per-field re-read, `"Haan"`, Submit unlocks.
  2. **Bhojpuri Rural Citizen + Noise Filtering:** Bhojpuri utterance (`"Hamaar naam Ramdhari Yadav ba, umar chausath saal ba"`) + ignored desk chatter (`"chai le aao bhaiya"`, `"fees kitna lagega"`).
  3. **Deterministic Safety Catch:** triggers a 5-digit pincode error + Age/DOB mismatch, proves Submit stays hard-locked even on `"Haan"` until fixed, then resolves cleanly.
- **Typed-utterance box:** Sends typed Hindi (Devanagari or Roman), Bhojpuri, or Hinglish straight through `pipeline.ts`.
- **Graceful mic fallback:** If mic permission is denied or browser lacks Web Speech, show a clean info banner and keep the sample player + typed box fully interactive.

## 8. Docker & Deployment

**`Dockerfile`** (multi-stage, pinned Node & Nginx versions):

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY engine/package.json ./engine/
COPY web/package.json ./web/
RUN npm ci
COPY engine ./engine
COPY web ./web
RUN npm run build --workspace web

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
```

**`nginx.conf`:**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**`docker-compose.yml`:**

```yaml
services:
  web:
    build: .
    ports:
      - "8080:80"
```

- Zero required env vars. Optional LLM key is entered at runtime in UI memory only.
- **Live link (Final Phase — M6):** Deploy `web/dist` to Netlify / Vercel / GitHub Pages (HTTPS, required by Chrome mic access).

## 9. Extension Shell (`extension/`, Used in Final Demo Video)

- Manifest V3 using Chrome `sidePanel` API and `commands` (`Alt+M`), bundling the exact same `engine/src`.
- Panel responsive between 320px and 400px.
- Uses a one-time extension options/permission tab to grant microphone access cleanly in Chrome side panels.
- Shown for ~20 seconds in the Final Phase YouTube video filling a real public Indian portal; the graded Docker submission never depends on installing it.

## 10. Automated Testing (Vitest)

### Unit tests (`tests/unit/`)

| Test Case | Input | Expected |
| --- | --- | --- |
| Devanagari digits & terms | `पिनकोड गलत है ८००००१ करो` | `pincode = "800001"`, blue flash |
| Devanagari name & age | `नाम रामधारी यादव उम्र चौंसठ` | `name = "Ramdhari Yadav"`, `age = "64"` |
| Hindi numbers | `chausath`, `dedh sau`, `dhai hazaar`, `paune teen hazaar` | `64`, `150`, `2500`, `2750` |
| Spoken date | `pandrah August unnis sau baasath` | `15/08/1962` |
| Digit string | `aath zero zero zero zero ek` / `double zero` | `800001` / `00` |
| Same-utterance correction | `Naam Ramdhari Yadav, umar 62... um, nahi, 64` | `name = "Ramdhari Yadav"`, `age = "64"`, diff marks `um` filler & `62→64` |
| Cross-utterance correction | Chunk 1: `umar 62` → Chunk 2: `um nahi 64` | `age = "64"` via `recentFields` |
| Operator Q&A binding | Chunk 1: `Pincode kya hai?` → Chunk 2: `800001` | `pincode = "800001"` via `pendingQuestionField` |
| Contextual `matlab` | `umar 62 matlab 64` vs `matlab naam Ramdhari` | Correction (`64`) vs Filler stripped (`Ramdhari`) |
| Bhojpuri rewrite | `Hamaar naam Ramdhari Yadav ba, umar chausath saal ba` | `name = "Ramdhari Yadav"`, `age = "64"` |
| Undo stack | Edit pincode `800001` → `800002` → `"undo"` | Reverts to `800001` |
| Invalid pincodes | `80001`, `012345` | Amber, Submit locked, spoken prompt |
| Invalid mobile | `5123456789` | Amber (must start 6–9) |
| Age ↔ DOB mismatch | `age = 64`, `dob = 15/08/1980` | Both amber, cross-field prompt |
| Pincode ↔ State conflict | `pincode = 800001`, `state = Tamil Nadu` | Amber mismatch flag |
| Verhoeff 12-digit ID | Valid generated 12-digit ID vs 1-digit flip | Valid (masked `XXXX-XXXX-####`) vs invalid |

*(Never commit real Aadhaar numbers; generate synthetic Verhoeff-valid 12-digit IDs programmatically inside tests.)*

### End-to-end scripted scenarios (`tests/scenarios/`)

Run across Portals 1, 2, and 3:

- [ ] **S1 (Happy path):** Fill → OTP pause → `"Aage badho"` → `"Read back"` → `"Haan"` → Submit unlocked → wipe session
- [ ] **S2 (Mid-read-back fix):** `"Nahi, umar 65 hai"` updates age and re-reads **only** age
- [ ] **S3 (Deference & amber lock):** Premature `"Haan"` before read-back finishes is ignored; `"Haan"` while an amber field exists keeps Submit locked
- [ ] **S4 (Side-chatter gate):** Background utterances (`"chai le aao"`, `"fees 50 rupaye"`) produce zero DOM mutations
- [ ] **S5 (Unsettable widget):** Custom date picker on Grievance portal turns amber `"Fill manually"`
- [ ] **S6 (Keyless + no-mic):** Sample player completes S1 with zero keys and no mic

## 11. Engineering Milestones (Execution Order)

Commit small, clean increments from M0 onward so the Git history clearly documents original work.

### Software Build Phases (AI Coding Agent Scope: M0–M5)

- **M0 — Workspace & Docker Skeleton:** Root npm workspaces, `engine/`, `web/`, `Dockerfile`, `nginx.conf`, `docker-compose.yml` booting cleanly on `http://localhost:8080`.
- **M1 — Pure Engine Core + Unit Tests:** `transliterate.ts`, `corrections.ts`, `fillers.ts`, `lexicon.bho.ts`, `numbers.ts`, `dates.ts`, `validators.ts` (including Age↔DOB & Pincode↔State), `fsm.ts`, `session.ts` — all covered by Vitest.
- **M2 — Scanner, Filler, Panel & Portals 1–3:** Live DOM scanner, native-setter filler, capture-phase submit interceptor, 320px 4-zone panel with Wispr diff footer, Portals 1–3 fillable end to end via typed utterances (including Devanagari).
- **M3 — Speech, Read-Back & Safety Loop:** `WebSpeechSttAdapter`, queued per-field `tts.ts` with watchdog + 300ms cooldown, `audioMeter.ts`, OTP/CAPTCHA pause/resume, dynamic schema-driven read-back + per-field re-read, S1–S6 passing.
- **M4 — Sample Player, Portal 4 & Optional Adapters:** 3 paced sample scenarios, Hidden 4th portal, optional runtime-key `llm.ts` mapper.
- **M5 — Extension Shell & Build Verification:** Manifest V3 `extension/` reusing `engine/src`, README completion, full Vitest suite green, clean `docker compose up` check, repo secret/ID audit.

### Final Phase (Post-Build — Human + Submission: M6)

- **M6 — Demo Video, Pitch Deck & Final Packaging (ONLY after M0–M5 are complete):** Record the ≤3:00 YouTube demo video (§12), export the text-selectable PDF pitch deck (§13), publish the optional HTTPS live link, run a clean-clone test on a second machine, and submit on the hackathon portal.

## 12. Demo Video Script (Final Phase — Post-Build, 3:00 Max)

> **Final Phase Only:** Execute this only after M0–M5 are fully built, tested, and verified.

| Time | Beat |
| --- | --- |
| **0:00–0:20** | Problem: citizen narrates, operator translates/types formal English, citizen cannot verify; one typo causes rejection weeks later |
| **0:20–1:15** | Live messy Hinglish & Bhojpuri fill on Portal 1: show Wispr-style filler strikethroughs (`~~um,~~`), cross-utterance correction (`~~62~~ → 64`), side-chatter ignored, `"same as current"`, spoken pincode fix (blue flash) |
| **1:15–1:40** | Deterministic catch (5-digit pincode or Age↔DOB mismatch keeps Submit locked) + OTP/CAPTCHA pause and `"Aage badho"` resume |
| **1:40–2:20** | **Climax (Voice as Trust Layer):** Dynamic read-back in the citizen's language → citizen says `"Nahi, umar 65 hai"` → only age re-reads → `"Haan"` → Submit unlocks |
| **2:20–2:45** | Switch to Hidden 4th Portal with zero setup (proves semantic DOM scanner), plus ~15–20s MV3 extension clip on a real public Indian portal |
| **2:45–3:00** | Scale (5.7 lakh CSCs), operator payer model, keyless fallback & privacy stance, close |

## 13. Pitch Deck Outline (Final Phase — PDF, Key Points as Selectable Text)

1. **Problem and solution:** Citizens cannot type or verify English government forms; CSC/tehsil typists lose time to manual keying and typos cause rejections weeks later. Munshi Desk listens to the desk conversation, fills any web portal via semantic DOM mapping, validates deterministically, and reads key fields back in the citizen's language as the trust layer.
2. **Who it is for:** Two users—citizens (elderly, first-generation literate, migrants speaking Hindi/Bhojpuri/regional mixes) and operators. Official CSC portal lists ~5.7 lakh functional CSCs delivering 800+ assisted services. *(Explicitly label scale projections—e.g., 10% adoption × 10 forms/day = ~5 lakh daily interactions—as an assumption, not measured data.)*
3. **What it depends on (and failure/cost fallback):** Keyless prototype uses Chrome Web Speech API behind `SttAdapter` and deterministic local normalization/validation (zero API cost). Optional LLM mapper degrades cleanly to local rules if costly or down. **Privacy & production swap:** Clearly note that browser Web Speech routes audio through Google; production swaps `SttAdapter` to zero-retention India-hosted STT (e.g., Sarvam/Bhashini) or on-device Whisper so citizen audio never persists or leaves India.
4. **Launch plan:** 4-week pilot across ~20 CSCs in 2 districts via district CSC coordinators and operator WhatsApp groups (comparing each operator's week-1 baseline against weeks 2–4). Free during pilot, then a small per-form fee. Success metrics: ≥40% faster form entry, ≥50% drop in data-error rejections, ≥90% audited field accuracy against source documents (catches deference rubber-stamping), and ≥50% voluntary usage in week 4.

## 14. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Chrome `hi-IN` returns Devanagari while rules expect Roman | Deterministic `transliterate.ts` stage runs immediately after STT (digits, loanwords, Romanizer) |
| Chrome `confidence === 0` or low-confidence mishears | Never drop `0`; stage `< 0.75` as amber (`needs_review`) instead of guessing silently |
| Chrome `speechSynthesis` hangs or triggers echo loop | Queued short per-field utterances + watchdog unmute timer + 300ms post-TTS cooldown |
| Natural speech splits across multiple STT events | Stateful `recentFields` stack + 10s `pendingQuestionField` Q&A slot |
| Citizen says `"Haan"` out of deference | Hard lock on amber fields, ignore premature `"Haan"` before read-back completes, audit accuracy in pilot |
| React/Angular forms ignore `.value =` or `Enter` submits early | Native prototype value setters + bubbling events + capture-phase `submit` interceptor |
| Evaluator has no mic or noisy room | 3 paced sample-conversation scenarios + typed box driving the real pipeline |
| Docker clean-clone failure | Pinned images, explicit `nginx.conf`, Vite workspace alias, clean-clone test before submit |

## 15. Final Submission Checklist (Final Phase — M6)

- [ ] Clean-clone test passed on a separate machine (`git clone` → `docker compose up`)
- [ ] Main screen loads at `http://localhost:8080` and completes S1 with zero secret keys and no mic
- [ ] Repo is public; README covers setup, architecture, Chrome requirement, and Web Speech privacy disclosure
- [ ] Zero API keys or real IDs in Git history (`git log -p | grep -iE "sk-|AIza|api_key"`)
- [ ] YouTube demo ≤ 3:00, public or unlisted, verified in an incognito window
- [ ] Deck PDF has selectable text covering all four required points
- [ ] Optional live link loads over HTTPS with working mic prompt and sample player
- [ ] Final single submission completed on the hackathon portal

## Appendix A: Bhojpuri Seed Lexicon (Post-Transliteration)

| Bhojpuri | Canonical Hindi / English |
| --- | --- |
| `hamaar` / `hamar` / `hamra` | `mera` |
| `ba` / `baa` / `bate` / `baani` | `hai` |
| `rauwa` / `raura` | `aap` |
| `kaa` | `kya` |
| `babuji` / `baap` | `pita` |
| `maai` | `mata` |
| `gaam` | `gaon` |
| `baris` / `baras` | `saal` |
| `theek ba` | `haan` |

## Appendix B: Sample Conversations (Paced Player)

1. **Scenario 1 — Hinglish Full Flow + Read-Back Correction:**
   - `"Naam Ramdhari Yadav, umar 62"` → *(1.5s)* `"um, nahi, 64, permanent address same as current kar do."` → *(1.5s)* `"Janm tithi pandrah August unnis sau baasath, pincode 800001."` → *(OTP pause → `"Aage badho"`)* → `"Read back"` → `"Nahi, umar 65 hai"` → *(re-reads age only)* → `"Haan"`
2. **Scenario 2 — Bhojpuri + Side-Chatter Gate:**
   - `"Hamaar naam Ramdhari Yadav ba, umar chausath saal ba."` → `"Bhaiya do cup chai bol dena"` *(ignored)* → `"Pincode kya hai?"` → `"800001"`
3. **Scenario 3 — Deterministic Safety Catch:**
   - `"Pincode 80001"` *(amber + spoken prompt)* → `"Janm tithi pandrah August unnis sau assi, umar 64"` *(Age↔DOB mismatch amber)* → `"Haan"` *(blocked)* → `"Pincode galat hai, 800001 karo"` → fixes mismatch → `"Read back"` → `"Haan"`