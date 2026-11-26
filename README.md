# Munshi Desk

Munshi Desk is a voice-first desk for Indian civic forms. A citizen says their details in Hindi, Bhojpuri or Hinglish. The operator sees fields update, resolves flagged details, handles the security step manually, and submits after the citizen confirms the read-back.

Built for **Scaler × Wispr Flow · Build for Bharat**, public infrastructure and civic services.

## Run the prototype

```sh
docker compose up --build
```

Open [localhost:8080](http://localhost:8080). No account, API key, model download, or microphone is required for the guided flow.

1. On **Old Age Pension**, choose **Pension from start to finish** and click **Play**. The sample feeds timed utterances through the real mapper, including a correction across two speech events.
2. The sample operator enters a synthetic OTP directly in the practice form. The desk reads the application back, changes a detail at the citizen’s request, and reads that field again.
3. After **Haan**, click **Submit practice form**. The practice data clears and a receipt appears.
4. Try the **Bhojpuri at a busy desk** and **Catch a conflicting application** samples. **More portals** opens the mixed-script, accessibility-label-only Residence Register.

For mic input, use desktop Chrome and choose a language before clicking the microphone. Typed Hindi, Romanized Hindi, Bhojpuri and Hinglish use the same engine. Examples include `नाम रामधारी यादव, उम्र चौंसठ`, `Pincode kya hai?` followed by `800001`, and `undo`. Choose **View read-back** to review the spoken lines on screen.

## Development

Use Node 22 LTS (22.12+) or a newer supported LTS.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

- `engine/` contains DOM scanning, normalization, mapping, validation, speech adapters and submission state.
- `web/` contains four synthetic portals, the voice copilot and three timed samples.
- `extension/` builds a Manifest V3 side panel that runs the same engine against the active form.
- `tests/` covers engine behavior and scenarios on the React portal components.

## Chrome extension

Run `npm run build -w extension`, then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`. Open a form, click the extension’s toolbar icon or use its assigned shortcut, then connect the side panel to the tab. Use **Mic permissions** in the panel if Chrome needs a separate permission grant.

The extension uses temporary access to the activated tab. It chooses the main form on pages with multiple forms, can scan same-origin frame documents, and releases the form when the panel disconnects. Tested behavior is limited to normal HTML controls, accessible labels and synthetic fixtures. Cross-origin frames, opaque widgets, and portals that submit outside the browser’s standard form event require site-specific integration.

## Data and verification

- The app stores session data in memory. The practice portals use synthetic data and submit locally. No transcript or ID is written to disk, browser storage, or logs by the app.
- Chrome’s browser speech recognizer may send microphone audio to its speech service. Typed input and samples use the local deterministic engine. Open the app on localhost or HTTPS for microphone access.
- The copilot and read-back mask ID values. OTP/CAPTCHA input is manual and excluded from transcript and read-back. The local check verifies a 12-digit checksum in the prototype and does not contact an identity provider.
- Invalid and low-confidence suggestions stay in the amber review queue. Cross-field checks flag valid-looking values that conflict. The postal lookup covers representative demo prefixes and is not an official national directory. [India Post’s Patna GPO listing](https://www.indiapost.gov.in/post-office-details-name?officename=Patna+GPO)
- **Mapping · local rules** offers optional label synonyms on Chrome devices with the on-device model already installed. The adapter receives public form labels and types. It does not receive utterances, entered values or keys. Rules stay active if the model is unavailable. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

See [the revised build plan](plan.md) for the design decisions, verification criteria and submission deliverables.
