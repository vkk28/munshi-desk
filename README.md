# Munshi Desk

Munshi Desk is a voice-first desk for Indian civic forms. A citizen says their details in Hindi, Bhojpuri or Hinglish. The operator sees fields update, resolves flagged details, handles the security step manually, and submits after the citizen confirms the read-back.

Built for **Scaler × Wispr Flow · Build for Bharat**, public infrastructure and civic services.

## Run the prototype

```sh
docker compose up --build
```

Open [localhost:8080](http://localhost:8080). Docker Compose serves the Munshi Desk main screen without an `.env` file or any API keys. The guided flow also works without an account, model download, or microphone.

## Dictate with Wispr Flow

1. Run Wispr Flow on your desktop. For mixed Hindi and English written in Latin script, choose **Hinglish** in Flow’s language settings. Choose **Hindi** for Devanagari. [Wispr Flow language settings](https://docs.wisprflow.ai/articles/3191899797-use-flow-with-multiple-languages)
2. Open a practice portal and click **Dictate with Wispr Flow** or press **Alt+M** in the web app to focus the input. Use your configured Flow dictation shortcut and release it after a short turn. [Desktop dictation setup](https://docs.wisprflow.ai/articles/3152211871)
3. Flow pastes the resulting text into the focused box. The enabled box applies a paste as one turn and stays focused. Ordinary typing, dictation that appears as editable text, and pastes into a box with an existing draft can be applied with **Enter** or **Send**. [Flow insertion and recovery](https://docs.wisprflow.ai/articles/7971211038-fix-text-not-pasting-after-dictation)
4. To enter pension details one at a time, use **Ask next question**. The desk asks for a missing required detail or a flagged entry in the selected language. A reply such as “Meera Devi” fills the requested name. You can also dictate multiple labelled details in one turn.
5. Once the required details are complete, enter the practice verification code by hand. Dictate “Aage badho” and “Read it back” as separate turns. **Open citizen view** gives the applicant large text in the selected language. After reading or hearing the values, the citizen can ask for a correction or say “Haan.” Only the operator submits.

In this mode, the app receives the text inserted into its own input. It does not read the system clipboard in the background or request a Wispr Flow key. Wispr Flow handles speech recognition and its own settings. Browser speech is a separate fallback.

### Keyless guided demo

1. On **Old Age Pension**, choose **Pension from start to finish** and click **Play walkthrough**. The sample feeds timed utterances through the real mapper, including a correction across two speech events.
2. The sample operator enters a synthetic OTP directly in the practice form. The desk reads the application back, hears the citizen correct the PIN from 800002 to 800001, and reads back the new PIN. On a device without working speech output, the walkthrough simulates reviewing the values on screen.
3. After **Haan**, click **Submit practice form**. The practice data clears and a receipt appears.
4. Try the **Bhojpuri at a busy desk** and **Catch a conflicting application** samples. The service tabs also offer domicile, grievance and residence walkthroughs. Each runs against its own form.

For the browser microphone fallback, use desktop Chrome and choose a language and select **Browser mic**. Bhojpuri uses local language rules and prompts with the browser’s Hindi speech locale. Recognition quality depends on the speech provider. Typed Hindi, Romanized Hindi, Bhojpuri and Hinglish use the same engine. Examples include `नाम रामधारी यादव, उम्र चौंसठ`, `Pincode kya hai?` followed by `800001`, and `undo`. Choose **View read-back** to review the spoken lines on screen.

## Development

Use Node 22 LTS (22.12+) or a newer supported LTS.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

- `engine/` contains DOM scanning, normalization, mapping, validation, speech adapters and submission state.
- `web/` contains four synthetic portals, the operator desk, a citizen-facing review and six timed walkthroughs.
- `extension/` builds a Manifest V3 side panel that runs the same engine against the active form.
- `tests/` covers engine behavior and scenarios on the React portal components.

## Chrome extension

Run `npm run build -w extension`, then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`. Open a form, click the extension’s toolbar icon or use its assigned shortcut, then connect the side panel to the tab. Use **Ask next question** to interview the applicant on the attached form, or dictate multiple details in the **Dictate with Wispr Flow** input. **Mic permissions** is available when you choose the browser-mic fallback.

The extension uses temporary access to the activated tab. It chooses the main form on pages with multiple forms, can scan same-origin frame documents, and releases the form when the panel disconnects. Tested behavior is limited to normal HTML controls, accessible labels and synthetic fixtures. Cross-origin frames, opaque widgets, and portals that submit outside the browser’s standard form event require site-specific integration.

## Data and verification

- The app stores session data in memory. The practice portals use synthetic data and submit locally. No transcript or ID is written to disk, browser storage, or logs by the app.
- Wispr Flow processes dictation audio in its cloud and has its own history and privacy controls. The browser recognizer may also send its audio to the browser’s speech service. Typed input and samples use the local deterministic engine. Open the app on localhost or HTTPS for microphone access. [Wispr Flow privacy controls](https://docs.wisprflow.ai/articles/3467817258-security-and-compliance-faq)
- The copilot and read-back mask ID values. OTP/CAPTCHA input is manual and excluded from transcript and read-back. The local check verifies a 12-digit checksum in the prototype and does not contact an identity provider.
- Invalid and low-confidence suggestions stay in the amber review queue. Cross-field checks flag valid-looking values that conflict. The postal lookup covers representative demo prefixes and is not an official national directory. [India Post’s Patna GPO listing](https://www.indiapost.gov.in/post-office-details-name?officename=Patna+GPO)
- **Mapping settings** offers optional label synonyms on Chrome devices with the on-device model already installed. The adapter receives public form labels and types. It does not receive utterances, entered values or keys. Rules stay active if the model is unavailable. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

The [service-counter illustration](web/src/assets/service-counter.jpg) depicts a fictional appointment. It was created with the built-in ImageGen tool.

<details>
<summary>Illustration prompt</summary>

Wide, hand-printed two-ink editorial illustration on uncoated warm ivory paper for the header of an Indian civic service workspace. A dignified older Indian woman in a sari speaks across a simple counter to an attentive female Common Service Centre operator seated at a desktop monitor. Both in profile or three-quarter view, relaxed, respectful, everyday interaction. Beautiful fine dark forest-teal engraved lines, subtle muted terracotta spot ink on the sari, sparse hatching and generous blank creamy space around silhouettes. Restrained Indian book-cover illustration, slightly imperfect ink. Medium shot with both faces and computer clustered in middle, landscape 3:2, isolated compact scene, edges fade into plain ivory paper. No letters, captions, signage, icons, frames or government emblems.

</details>

See [the revised build plan](plan.md) for the design decisions, verification criteria and submission deliverables.
