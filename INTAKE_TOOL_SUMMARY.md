# Intake Tool — Project Summary

**Project:** Intake Tool  
**Audience:** Product, design, engineering, and AI collaborators  
**Status:** Local functional prototype; not production-ready  
**Last updated:** September 18, 2026

## Executive summary

The Briefing Intake tool is an AI-assisted replacement for the long, conditional brief form currently used in Workspace. It helps a marketer describe a request in ordinary language, attach supporting material, confirm an AI interpretation, answer only the questions relevant to the selected work route, and produce a structured brief for Monks.

The product is not intended to let an AI invent or silently approve business information. Gemini may extract explicit facts and recommend a route, but the requester must confirm the initial interpretation. Missing information can remain visibly pending. A deterministic field catalog and conditional rules—not the model alone—control the resulting brief structure.

The current prototype supports the main intake journey, local draft storage, a local brief library, PDF summary generation, and creation of a project folder with documents in Google Drive. Authentication, multi-user collaboration, Workspace ticket submission, and production infrastructure are not implemented.

## Problem being solved

The existing Workspace intake asks requesters to navigate a long form with many conditional fields and internal terms. This creates several problems:

- Requesters may not know which content pillar or production route applies.
- Important information may be omitted, contradictory, or hidden in attachments.
- Producers and PMs must manually interpret the request and normalize it for production.
- Project setup, naming, folder creation, document copying, and cross-system coordination add repetitive work.

The proposed experience starts with the requester's intent and progressively converts it into a production-ready, Workspace-compatible brief.

## Users and intended outcomes

### Primary user

A marketer or client requesting creative, adaptation, e-commerce, shopper, copy, QR, or delivery work.

### Downstream users

- Monks producers and project managers who review and operationalize the request.
- Creative and production teams who need complete, structured instructions and source material.
- Future automated agents that may create timelines, project records, asset matrices, or other operational artifacts from the approved brief.

### Successful outcome

The requester can submit or hand off a clearly structured brief whose confirmed facts, source material, applicable fields, and unresolved items are easy for a human or another system to understand.

## Current user journey

1. **Describe the intent** (`/intent`)
   - The requester describes the work in natural language.
   - Example requests provide inspiration without becoming selected values.
   - Up to six supporting PDF, PPTX, XLSX, TXT, PNG, or JPEG files can be attached (8 MB each, 15 MB total).

2. **Review the proposed scope** (`/scope`)
   - Gemini proposes one primary work route and extracts explicit field values from the request and attachments.
   - Each proposal includes a source: requester text, document evidence, or an explicitly labeled interpretation.
   - The requester can adjust values, retry the analysis, and must confirm the scope before it controls the remaining path.

3. **Complete the brief with the assistant** (`/clarify`)
   - The assistant asks one unanswered question at a time in final brief order, with context before the question, answer choices, back navigation and progress.
   - Parent answers reveal related questions immediately; already answered fields stay hidden unless the requester goes back.
   - Gemini provides concise wording and context; the field catalog guarantees coverage when AI guidance is absent. Optional details can be marked for later or not applicable; required answers must be completed before review.

4. **Review and deliver** (`/review`)
   - Gemini performs a final consistency review and identifies unresolved or conflicting information.
   - Each brief detail can be edited inline without reopening the full form.
   - In the creator flow, the requester saves the brief before PDF download or starting another request.
   - Opening a saved brief from the library shows the same summary with Drive creation and Jira preview/actions.

5. **Resume saved briefs** (`/briefs`)
   - Locally saved briefs can be listed, reopened, updated, or deleted.
   - New unsaved work is also cached in browser storage.

## Work routes and conditional schema

The prototype supports exactly one primary route per brief:

- **CREATE:** net-new production or a new creative idea that is not a new-product launch.
- **EVOLVE:** adaptations or refreshes of existing ATL or annual-campaign assets.
- **ACCELERATE:** e-commerce, digital retailer page, or Shopper BTL creation/adaptation.
- **INNOVATE:** net-new assets for a new-product launch at scale.
- **.com Copy Optimization:** copy optimization, FAQ creation, or online article review.
- **QR Generation Request:** QR-code creation.
- **Delivery only:** distribution of existing assets without creation or adaptation.

Shared required data includes a project title, brand, region, asset type, expected delivery date, retailer/media placement, asset count, Creative Direction, work route, and whether editable files are needed. Each route activates its own deliverables, inputs, production needs, delivery methods, and conditional follow-ups.

The deconstructed Workspace master diagram is authoritative for the `Asset subtype` and translation market/language catalogs. Both fields use constrained options from that diagram; the product must not invent values outside those catalogs.

## AI behavior and guardrails

Gemini runs server-side through Vertex AI using Application Default Credentials. The browser never receives cloud credentials.

The AI has four explicit phases:

- `scope`: classify the request and propose one route; uses the stronger routing model.
- `follow-up`: identify the next missing or ambiguous information after the route is confirmed.
- `document-enrichment`: extract evidence for missing fields from newly supplied documents.
- `final-review`: summarize the completed brief and identify unresolved or conflicting information.

Important rules:

- The model may extract stated facts and recommend a route, but proposals remain unconfirmed until a person approves them.
- Every proposed value must have visible provenance.
- Confirmed values and the confirmed route cannot be silently changed by later document analysis.
- Model output is validated against the known field catalog, allowed values, active conditional branch, file IDs, dates, numbers, and links.
- Inactive branch data is pruned deterministically.
- Missing information is represented as missing, pending, not applicable, or not provided; it is never fabricated.
- AI calls record local diagnostic traces including phase, chosen model, reasoning level, duration, and token counts when available.

Default local model routing is currently configured as `gemini-3.8-flash` for scope decisions and `gemini-3.5-flash-lite` for focused extraction and routine guidance. These can be changed through environment variables.

## Persistence and generated outputs

### Brief persistence

- Before a brief is explicitly saved, its draft and attachments are cached in browser `localStorage` when capacity allows.
- Saved briefs are stored as JSON under `briefs/{uuid}/brief.json` by a local Vite middleware.
- A saved brief receives a UUID and is updated automatically after changes.
- This is single-machine prototype storage, not a shared or durable production data store.

### Project naming

The app uses one canonical name in Intake Tool, Jira, and Google Drive:

`SC Johnson - {Brand} - {Project title} - IT-{ID}`

Gemini suggests the descriptive title during scope review, and the requester can adjust it. The name itself is read-only. On the first save the app assigns `IT-` plus a unique prefix of the brief UUID; it lengthens the prefix only if a collision exists. Before that save, the name is visibly provisional (`IT-PENDING`).

Jira or Drive creation requires both brand and title. Once either external resource is created, those two inputs are locked so the three systems retain the same project name. Existing briefs without reliable publication metadata also retain their original names to avoid changing an external resource that cannot be verified locally.

### PDF output

The final view generates a PDF summary containing the AI summary, overall completeness status, active brief fields, values, and unresolved markers.

### Google Drive output

The final review can create or reuse this structure in a configured Drive parent folder:

```text
{PROJECT_NAME}/
├── intake tool brief/
│   └── Intake Tool Brief.pdf
├── brief/
│   └── Creative Direction.{ext}
├── Adapt Matrix/
│   └── Asset Matrix.{ext}
├── Deliverables & Specs/
│   └── Deliverables & Specs Template.xlsx
├── Working Files/
└── Other documents/
    └── Other requester attachments
```

Creative Direction and Asset Matrix folders remain empty unless completed files were uploaded. Repeated publishing reuses project folders and updates same-named binary files; it removes the legacy `Agent-provided documents` and `Client-provided documents` folders by moving them and their contents to Drive trash. The Drive integration requires API access, a service account or equivalent ADC identity, and destination-folder access.

## Technical architecture

### Client

- React 19, TypeScript, and Vite
- Tailwind CSS 4 and `@monksflow/monks-ui`
- One stateful application currently owns routing, intake state, analysis review, clarification, structured editing, final review, and local library behavior.

### Local server middleware

The Vite development/preview server exposes:

- `POST /api/brief/analyze` — validates the request, selects a Gemini model, prepares multimodal content, validates structured output, and returns analysis plus diagnostics.
- `POST /api/vertex/health` — checks Vertex credentials, project access, and model availability without generating content.
- `GET/POST/PUT/DELETE /api/briefs` — local brief persistence and listing.
- `POST /api/briefs/{brief-id}/drive` — Google Drive folder provisioning, document/template delivery, and summary PDF upload using the saved canonical project name.

### Key source files

- `src/app.tsx` — active application and end-to-end intake flow.
- `shared/brief-contract.ts` — canonical field catalog, options, conditions, validation, and project-name generation.
- `server/brief-instruction.ts` — versioned Gemini system instruction and JSON response schema.
- `server/brief-analysis.ts` — AI endpoint, attachment processing, model routing, and request traces.
- `src/brief-documents.tsx` and `server/office-text.ts` — attachment validation and Office text extraction.
- `server/brief-storage.ts` — local JSON persistence.
- `src/brief-pdf.ts` — final summary PDF generation.
- `server/drive-project.ts` — Google Drive project creation and idempotent file handling.
- `vite.config.ts` — middleware registration and environment configuration.

## What is implemented now

- Intent-first request entry and optional supporting files.
- AI route recommendation and evidence-backed structured extraction.
- Human review and adjustment before scope confirmation.
- One-question-at-a-time AI-guided clarification covering unanswered active fields in brief order, with conditional questions revealed as answers change.
- The legacy structured brief form remains in the code but is outside the normal route.
- Pending and not-applicable dispositions.
- Source-backed suggestions from added documents.
- Final AI review, PDF preview, and PDF download.
- Browser draft recovery and local JSON brief library.
- Google Drive project-folder creation and document delivery.
- Server-side Vertex credentials and model health check.
- Runtime validation and targeted contract/model/document tests.

## Known limitations and deferred scope

- The app is a local prototype; the server endpoints intentionally accept only local same-origin requests.
- There is no real authentication, authorization, user profile, or tenancy model.
- Saved briefs are local files. There is no production database, synchronization, concurrency handling, or backup policy.
- Collaboration and sharing are product requirements but are not implemented.
- Workspace is not integrated: there is no ticket creation, ticket ID, polling, API discovery, or write-back.
- Storefront is part of the intended entry model but is not implemented in the active experience.
- The product does not yet create timelines, staffing plans, project-management records, or asset matrices automatically.
- Asset review, approvals, delivery tracking, requester/reviewer comments, and downstream asset management are deferred.
- Google Drive provisioning depends on external configuration and permissions and is not a production-grade job queue.
- Uploaded files are stored as base64 inside local JSON in this prototype, which is unsuitable for production scale and sensitive data.
- There is no formal retention, privacy, audit, or compliance design yet.
- English is the only supported interface language.
- Some field catalogs and business rules still require validation against Workspace and operational stakeholders.

## Recommended way to organize the work as it grows

Use this file as the short AI handoff and maintain deeper decisions in focused documents. A practical structure is:

```text
README.md                         Setup and local run instructions
INTAKE_TOOL_SUMMARY.md            Current product/technical handoff (this file)
docs/
├── product/
│   ├── vision-and-scope.md       Approved goals, users, success criteria, boundaries
│   ├── user-flows.md             Current and target journeys
│   └── field-catalog.md          Verified Workspace schema and provenance
├── architecture/
│   ├── system-overview.md        Production target architecture and data boundaries
│   ├── ai-contract.md            Prompts, phases, schemas, guardrails, eval criteria
│   └── integrations.md           Workspace, Drive, identity, and project systems
├── decisions/
│   └── ADR-NNN-short-title.md     Durable architectural/product decisions
└── delivery/
    ├── roadmap.md                Now / next / later outcomes
    ├── risks-and-open-questions.md
    └── acceptance-criteria.md
```

Each meaningful work item should state:

- the user problem and expected outcome;
- scope and explicit non-goals;
- acceptance criteria;
- affected field routes or integrations;
- source/provenance for new business rules;
- validation performed;
- product or architecture decisions that need an ADR.

Avoid treating chat logs, screenshots, inferred behavior, or old prototype changelogs as approved requirements. Label each source as confirmed, observed, proposed, or unknown.

## Recommended next decisions

1. Confirm the first production milestone: intake-only, Workspace submission, or intake plus Drive provisioning.
2. Obtain an authoritative Workspace field catalog, API contract, submitted-order sample, and ticket lifecycle.
3. Define identity, roles, permissions, sharing, and who may confirm or submit a brief.
4. Choose production persistence and file storage, including retention and handling of sensitive attachments.
5. Define submission readiness rules: which fields truly block submission and which may remain pending.
6. Validate naming conventions, Drive templates, duplicate handling, and ownership with producers/PMs.
7. Establish an AI evaluation set covering every route, ambiguous requests, contradictory documents, invalid proposals, and missing information.
8. Split the large client application into stage-level modules only when active development makes that separation useful.

## Guidance for another AI system

When working on this project:

1. Treat `shared/brief-contract.ts` and the active implementation as the source of truth for current behavior.
2. Treat this document as a concise orientation, not as authorization to implement every future idea.
3. Check the latest changelog and relevant code before assuming an older document is current.
4. Preserve the human-confirmation and source-provenance rules.
5. Do not invent Workspace option values, validation rules, integration behavior, or production requirements.
6. Keep the deterministic schema responsible for validity and branching; use AI for interpretation, extraction, focused questioning, and review.
7. Make small changes that follow existing patterns and explicitly distinguish implemented behavior from intended or deferred behavior.

## Local setup

```bash
npm install
gcloud auth application-default login
gcloud auth application-default set-quota-project scj-nacb-transfor-ai
npm run dev
```

Relevant environment variables:

```text
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GEMINI_ROUTING_MODEL
GEMINI_EXTRACTION_MODEL
GOOGLE_DRIVE_PARENT_FOLDER_ID
GOOGLE_APPLICATION_CREDENTIALS
```

Useful targeted checks:

```bash
npm run lint
npm run build
node --test shared/brief-contract.test.mjs
node --test server/model-routing.test.mjs
node --test server/office-text.test.mjs
```

The Vertex integration check is opt-in and requires configured credentials:

```bash
node scripts/check-brief-analysis.mjs
```
