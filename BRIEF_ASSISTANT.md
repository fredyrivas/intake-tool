# Intent-first brief intake

Implemented September 4, 2026. The product UI remains in English.

## Current experience

1. The marketer starts by describing the work in natural language. No brief fields are shown first.
2. A rotating, non-selectable carousel provides complete example requests and remains visible while the marketer writes.
3. PDF, PPTX, XLSX, TXT, PNG and JPEG supporting material can be attached from the same composer. Attachments are optional.
4. Gemini interprets the description and documents into the existing Workspace field catalog. It may recommend a route, but no proposed value becomes confirmed until the marketer approves it.
5. The review shows the interpretation, every proposed field and its source. The marketer can adjust individual values, retry the analysis or confirm the interpretation.
6. Confirmation sends the adjusted values through a second analysis so the next missing questions reflect the latest confirmed context.

This slice stops after the interpretation is confirmed. The complete focused-question sequence, final structured brief and automatic matrix generation remain later steps.

## Main files

- `src/app.tsx`: intent composer, inspiration carousel and interpretation review.
- `src/brief-documents.tsx`: local attachment validation and reading.
- `shared/brief-contract.ts`: known Workspace fields, conditional rules and runtime validation.
- `server/brief-instruction.ts`: Gemini instruction and structured response schema.
- `server/brief-analysis.ts`: local same-origin Vertex AI endpoint.

The removed field-first wizard, legacy long form, demo identity, draft storage and old conversational review were obsolete for this direction.

## Runtime and verification

Run `npm run dev`; the Vite server hosts the local analysis endpoint. Vertex uses server-side Application Default Credentials and the configured model. Files are kept only in browser memory and are transmitted to Gemini only after the marketer asks for interpretation. PPTX and XLSX attachments are validated and converted to structured text with slide, sheet and cell locators before analysis; supported PDFs and images remain native multimodal inputs.

Verification commands:

```bash
npm run build
npm run lint
node --test shared/brief-contract.test.mjs
```

`node scripts/check-brief-analysis.mjs` performs an opt-in Vertex integration check with synthetic data.
