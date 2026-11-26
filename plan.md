# Munshi Desk build and verification plan

**Hackathon theme:** Public infrastructure and civic services. The primary user is a Common Service Centre, cyber café or tehsil desk operator assisting a citizen who can speak their details more easily than they can verify a written form.

## Core flow

The operator opens a form and listens to the citizen in Hindi, Bhojpuri or Hinglish. Munshi Desk scans the DOM, transcribes and normalizes the speech, maps phrases to visible fields, and fills validated entries. The copilot shows what changed, including fillers, corrections and discarded chatter. The desk pauses for manual verification, reads back the populated critical fields, and unlocks the operator’s Submit button when the citizen confirms. The practice app clears the form and session after submission.

## Design decisions

| Issue in the source plan | Implementation |
| --- | --- |
| Browser speech is keyless but can use remote recognition | The deterministic text engine and sample player run locally. Use browser speech only when the microphone is explicitly started. |
| Speech confidence can produce plausible but wrong values | Confidence zero is treated as unreported. Nonzero values below 0.75 and invalid values are staged rather than written. Operators can review or replace them. |
| Age and birth date are related but either field can be entered first | Check the pair after each meaningful change. Keep Submit locked until the discrepancy is resolved. Generate the sample’s expected age from the date so it keeps working in future years. |
| A read-back correction can arrive before the first read-back finishes | Re-read only corrected fields after a completed first read-back. An edit before that point requires a fresh full read-back. Any change after confirmation invalidates it. |
| A 12-digit ID or verification code must not leak through the copilot | Mask IDs in the panel and speak only the last four digits. Exclude OTP/CAPTCHA from voice writes and read-back. Keep session history in memory. |
| A local UI lock alone can be bypassed by pressing Enter | Disable native submit controls and intercept standard submit events during the session, including changes made after read-back. On an external site, the site's security and submission rules remain in effect. |
| Model keys in the client would enlarge the privacy and deployment footprint | Use an optional on-device Chrome model for extra form-label synonyms. The model sees labels, not citizen values or utterances. All validation and write decisions stay in the deterministic engine. |
| Geographical coverage can overpromise accuracy | Use a representative postal lookup for the prototype and leave unknown prefixes unchecked. Use official, preferably exact-code data in a district pilot. |
| The judge may have no mic or a browser without speech synthesis | Preserve the typed path and three paced samples. Provide a visible copy of the dynamic read-back. |

## Software milestones

1. **M0** · npm workspaces, Nginx build and one-command Docker Compose startup.
2. **M1** · deterministic Hindi/Hinglish/Bhojpuri normalization, numbers and dates, token diffs, corrections, question binding, undo and validators.
3. **M2** · DOM scanning, native control filling, field review and three distinct practice portals.
4. **M3** · browser speech adapters and mic activity, manual challenge pause, read-back and confirmation guards.
5. **M4** · three keyless sample conversations, a fourth mixed-label portal, optional local label suggestions.
6. **M5** · Manifest V3 side panel, privacy audit, tests, fresh Docker build and public GitHub source.

The public repo must start with one Compose command at port 8080, show the main screen without secrets, and contain original implementation code. Verify the complete sample in a fresh clone. A separate machine smoke test is the final portability check.

## Submission deliverables

- Public GitHub repository with `docker-compose.yml`.
- Public or unlisted YouTube demo of at most 3 minutes. Show the full voice flow, then a deterministic conflict or a second portal.
- Text-selectable PDF deck covering the problem and solution, target users and plausible reach, dependencies and cost or failure fallback, and pilot and launch plan.
- Optional HTTPS preview with working speaker controls and microphone permission.
- The final hackathon portal submission is a separate, single-use step.

The product at this stage is a prototype. The proposed pilot would measure entry time, data error and rejection rates, spot-audited field accuracy and voluntary repeat usage with operators in two districts. It would also evaluate a local or appropriately hosted Hindi/Bhojpuri speech provider before handling real citizen data.
