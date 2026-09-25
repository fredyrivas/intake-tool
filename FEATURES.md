# Intake Tool: Current Feature Inventory

**As of September 24, 2026.** This document describes behavior implemented in the current application, including its local integrations. It is a product and technical inventory, not a roadmap. The source of truth for field conditions and validation is `shared/brief-contract.ts`.

## 1. Product scope and user journey

Intake Tool is a local, English-language prototype for turning a requester's plain-language creative request and supporting files into a structured SC Johnson brief. The requester reviews AI proposals before they become confirmed values. A deterministic field catalog decides which questions apply. A saved brief can be exported as a PDF, delivered into a Google Drive project, and used to preview and create a Jira Task.

| Stage | Browser path | Current behavior |
| --- | --- | --- |
| Describe | `/intent` (also `/`) | Enter a request and optionally upload evidence. Three example requests can populate the description. Analysis starts only when the user selects **Find the best path**. |
| Confirm scope | `/scope` | Read the AI interpretation, warnings, proposed values, and each value's source. Adjust individual proposals, choose a missing route, retry analysis, or confirm. At least one valid route is needed to continue. |
| Complete brief | `/clarify` | Answer one unresolved active field at a time, in six brief sections. AI supplies question wording and context when available; deterministic copy supplies a fallback. Review progress, go back, accept suggestions, and analyze newly added documents. |
| Review | `/review` | See an HTML rendering of the PDF summary, completeness state, active fields, unresolved markers, AI review, warnings, and inline field editors. The creator must explicitly save before downloading or starting another request. A brief opened from the library also exposes Drive and Jira actions. |
| Brief library | `/briefs` | List locally saved briefs, see route and last update, open the summary, create a new brief, or delete a local brief after confirmation. |

The old `/brief` path redirects into the clarification experience. A structured `BriefForm` component is still present in the source and can be mounted by an internal stage, but it is outside the normal intent-first navigation. Browser history and a valid `?brief=<UUID>` link restore available stages and saved records.

## 2. Request entry and attachments

- The request description is free text, limited to 6,000 characters, with a live counter. Empty descriptions cannot be analyzed.
- The three inspiration prompts fill the description when selected; they are examples, not preselected field answers.
- Files can be selected or dragged into the upload area, listed, and removed. Upload is optional initially and available again for individual document fields.
- Accepted formats: PDF, PPTX, XLSX, TXT, PNG, and JPEG. The limits are six files, 8 MB per file, and 15 MB total. Empty or unsupported files are rejected. A file with identical encoded content is not added twice, and the user receives a notice.
- PPTX and XLSX MIME types can be recognized from their extensions when the browser omits a type. Attachments receive UUIDs; document-field answers reference these IDs. Removing a file also removes its field references.
- PDF and image material can be sent to Gemini as native multimodal input. PPTX slide text and XLSX sheet/cell text are extracted server-side, with location references. Extraction is bounded to limit model input. TXT is handled as text. The app can classify uploaded Creative Direction, Content Matrix, and Asset Matrix documents by content rather than relying only on filenames.
- Links are supported as answers for several document alternatives. The UI links to Creative Direction, Asset Matrix, Marketing Copy Checklist, and QR Request Form templates where those fields apply.

## 3. AI interpretation and review

Gemini is called through a same-origin server endpoint backed by Vertex AI and Application Default Credentials. The browser does not receive Google credentials. Four phases exist:

| Phase | Purpose |
| --- | --- |
| `scope` | Interpret the initial text and files, recommend every clearly supported work route, and propose explicit values with evidence. Ambiguous routing becomes a focused question. |
| `follow-up` | Produce short context and question wording for missing active fields after scope confirmation; the application still controls the actual question order and coverage. |
| `document-enrichment` | Inspect newly uploaded files for missing active facts and document roles. Existing confirmed values and routes remain intact; contradictions become warnings. |
| `final-review` | Summarize the brief and flag unresolved or conflicting information without inventing answers. |

The default routing model is `gemini-3.8-flash`; the default extraction model is `gemini-3.5-flash-lite`. Scope and explicit route reinterpretation use the routing model with medium thinking. Document enrichment uses the extraction model with low thinking. Routine follow-up uses minimal thinking. Final review uses the routing model when required fields remain unresolved, otherwise the extraction model. Environment variables can override the model names.

Every proposed value has a source: an attachment with ID, excerpt, and PDF page or PPTX slide; a note/request excerpt; or a clearly labeled interpretation. Proposals are editable before confirmation. Confirming scope submits the confirmed values for a follow-up pass. Server and client validate model output against known fields, active branches, allowed options, attachment IDs, dates, positive integer counts, email syntax, HTTP(S) links, and response-size limits. Invalid or inactive-branch proposals are rejected or removed. The model cannot set the private approver and reviewer email fields; those are entered directly by the requester.

AI errors and timeouts appear in the interface. Clarification can still use deterministic questions if follow-up guidance fails. The **Advanced AI log** retains the latest 20 local traces with phase, model, thinking level, selection reason, duration, token counts when available, and timestamp. `POST /api/vertex/health` checks the configured Vertex access and model availability using `countTokens`, without generating a brief.

## 4. Work routes and branching

`Work route` is a multi-select field. A brief may include multiple explicitly requested routes; selecting a route activates the union of its relevant fields. The route catalog is:

| Route | Intended work |
| --- | --- |
| `CREATE` | New production or a new creative idea outside a new-product launch. |
| `EVOLVE` | Adaptations or refreshes of existing ATL or annual-campaign assets. |
| `ACCELERATE` | Explicit e-commerce, digital retailer page, or Shopper BTL work. |
| `INNOVATE` | New assets for a new-product launch. |
| `.com Copy Optimization` | Copy optimization, FAQ creation, or article review. |
| `QR Generation Request` | QR-code creation. |
| `Delivery only` | Delivery of existing assets without creation or adaptation. |

A mention of several channels or an asset specification file does not by itself activate several routes. Route and parent-option changes prune now-inactive values, suggestions, and dispositions. The `__none__` production-needs option is exclusive. Stock questions appear only when EVOLVE or ACCELERATE includes **Stock materials**; translation questions appear only when either includes **Translation**. Delivery-method choices independently reveal their related delivery fields.

### Clarification behavior

- Sections are **01 Project basics**, **02A Path and deliverables**, **02B Brief inputs**, **02C Production needs**, **03 Delivery**, and **04 Additional information**. Only active questions are asked, in final-brief order.
- Confirmed, valid answers are skipped until the user navigates back. The progress counter and bar reflect visited and remaining active questions. Parent answers reveal their dependent questions immediately.
- Single-select, multi-select, text, email, multiple email, positive-integer, date, document, and HTTP(S) link inputs are supported. The AI may provide up to four quick answers for suitable open-text fields; constrained option catalogs remain authoritative.
- A file-or-link pair is treated as one question and one final summary row. The pairs are annual campaign, content matrix, asset matrix, supporting references, stock materials, media plan, and additional attachments/links.
- Required fields need a valid answer before final review. Optional fields may be marked **Pending** or **Not applicable**. Final output also distinguishes **Missing** and **Not provided**. AI can identify additional conditional fields as required, but only from the contract's allowed conditional catalog.
- After adding files, the requester can explicitly analyze new documents. Evidence-backed suggestions for missing fields require acceptance, except recognized Creative Direction, Content Matrix, and Asset Matrix file assignments, which are accepted automatically. The UI can refresh follow-up guidance.

## 5. Complete field catalog

The following lists every field in the active contract. Unless stated otherwise, a field is optional; an asterisk means the contract marks it required. `Work route` is operationally required even though the original Workspace asterisk was absent. The model can also mark eligible conditional fields required during follow-up.

### 01 — Project basics

| Field | Type / options / notes |
| --- | --- |
| Project name* | Generated, read-only canonical name; see naming below. |
| Project title | Text; requester may change it until external publication. |
| Brand* | Multiple core brands or additional named brand exceptions. Core options: Glade, Drano, Scrubbing Bubbles, Ziploc, Windex, Pledge, OFF!, Raid, STEM, Thermacell, Baygon, Scale. Non-core brands receive a visible exception note. |
| Region* | Multiple: USA, Canada, Puerto Rico, Dominican Republic, Other. |
| Main approver (email)* | Email; entered directly, never sent as a model field. |
| Reviewers / project contributors (email) | Multiple emails; entered directly, never sent as a model field. |
| Asset type* | One: Ecomm, ATL, Shopper. |
| Expected delivery date* | Valid `YYYY-MM-DD` calendar date. |
| Media placement / retailer* | Text. |
| Total number of assets* | Positive whole number. |
| Creative Direction (template)* | Uploaded document; template link is available. |
| Work route | One or more of the seven routes above. |

### 02A — Route deliverables

| Applies when | Field and exact choices |
| --- | --- |
| CREATE | **CREATE deliverables:** National campaign films / TVC; National campaign films / CTV; National campaign films / OLV; National campaign films / Social; Evergreen content / Sponsored videos; Evergreen content / OLV; Evergreen content / Social; Evergreen content / Statics; Big idea production. |
| EVOLVE | **EVOLVE deliverables:** Social; Static; Promotional; HTVs; Adapts / refreshes. |
| ACCELERATE | **ACCELERATE deliverables:** eComm digital retailer pages assets; eComm Video; Shopper / Media and printed non-displays; Shopper / 3D display. |
| INNOVATE | **INNOVATE deliverables:** KV; PDP assets; B+ tiles; Brand page content; In-store display; HTVs / sponsored brand videos; Social post. |
| .com Copy Optimization | **Copy services:** Copy Optimization; FAQ creation; New Article Review. |

### 02B — Route brief inputs

| Applies when | Fields and conditional details |
| --- | --- |
| CREATE | Business context / objective; Consumer insights driving the work; Audience; The ask & goal; Communication objective; Consumers takeaway (emotional / functional); Mandatories; Out of scope; Research and insights; Additional notes or context; Attachments / visual references. |
| EVOLVE | Annual campaign / reference deck (file or link); Content matrix (file or link). |
| EVOLVE, ACCELERATE, or INNOVATE | Completed asset matrix (file or link, with template); Work instructions; Creative references / supporting files or links. |
| EVOLVE or ACCELERATE | Partnership context (if applicable). |
| ACCELERATE + eComm digital retailer pages assets | Asset subtype: Base+ tiles, Beauty Shots, Brand store assets, Collection video, Mobile hero images, Enhanced content, Marketing copy. Also BOS VIZIT folder link (if applicable). |
| ACCELERATE + eComm Video | Video work instructions and specifications. |
| ACCELERATE | Adapt instructions; Marketing copy instructions (if applicable), with checklist template. |
| .com Copy Optimization | Tone of voice, product information and legal guidelines. With **Copy Optimization**: Articles to optimize (links). With **FAQ creation**: Articles for FAQ creation (links). With **New Article Review**: New articles for review (files). |
| QR Generation Request | Completed QR Template form (file), with template link. |

### 02C — Production needs

| Applies when | Fields and conditional details |
| --- | --- |
| EVOLVE | EVOLVE production needs: Specific music, Stock materials, VO recording, Translation, or exclusive `__none__`. Other production notes and Other production attachments. |
| ACCELERATE | ACCELERATE production needs: Stock materials, Translation, or exclusive `__none__`. Other production notes. |
| EVOLVE + Specific music | Music details; Music reference files. |
| EVOLVE + VO recording | Voice-over market / language; Casting brief (talents, gender, tone, age); Buyout details (duration, countries, media, usage). |
| EVOLVE or ACCELERATE + Stock materials | Stock availability: **I have stock materials** or **Help me find stock materials**. The former reveals Stock materials (file or link); the latter reveals Stock references / direction (file). |
| EVOLVE or ACCELERATE + Translation | Translation market / language: US_EN, US_ES, CA_EN, CA_FR, PR_ES, PR_EN, DO_ES, Other. Also Translation instructions and Copy document for translation. |

### 03 — Delivery

| Applies when | Fields and conditional details |
| --- | --- |
| All routes | Delivery methods (multi-select): Directly to vendor / 3rd party; Directly to media agency; Directly to SCJ marketer; Extreme Reach (TVC); Social posting; Digital Shopper; Ecomm (Salsify); Other delivery need. Editable files: Yes or No. |
| Directly to vendor / 3rd party | Vendor delivery instructions & contact details; Vendor delivery instructions file. |
| Directly to media agency | Media agency delivery instructions & contact details; Media agency delivery instructions file. |
| Other delivery need | Other delivery instructions & contact details; Other delivery instructions file. |
| Extreme Reach (TVC) | First air date; End air date; Media plan (file or link); Pre-clearance requirement; Clearance requirement; Local-clearance information (file). |
| Social posting | Social destinations: YouTube, Social, Other. YouTube reveals titles, descriptions and posting dates per asset plus an optional instructions file. Social reveals copy and posting dates per asset plus a file. Other reveals other-destination instructions per asset. |
| Digital Shopper | Digital Shopper copy instructions per asset. |
| Ecomm (Salsify) | E-commerce delivery-details template; Append or Replace mode; specific asset order; E-commerce properties (Base, Base+, Enhanced content, eRetailer specific); delivery instructions; delivery files. |

### 04 — Additional information

Additional notes; Additional attachments (file); Additional links (HTTP(S)). The last two are presented as one file-or-link question.

## 6. Final summary and PDF

- A final Gemini review supplies concise summary text and warnings. The application computes completeness from active fields: unresolved required count, optional pending count, or Complete. It does not equate a saved or published brief with complete information.
- The HTML summary mirrors the PDF rows and supports direct editing of each active detail. Edits update conditional branches and invalidate stale Jira previews. Brand and title editors lock after publication.
- A missing required value is shown as **Missing**; a deferred one as **Pending**; an optional skipped value as **Not applicable** or **Not provided**. Brand exceptions are included with the brand value.
- The generated PDF contains project name, generation information, AI summary, completeness status, active field labels and values, and unresolved highlights. The user can download it after saving. The same PDF content is uploaded to Drive at project creation.

## 7. Drafts, saved briefs, and naming

- Unsaved progress is cached in browser `localStorage`, while attachments are cached in IndexedDB so files within the upload limits can survive a reload. A storage warning appears if neither IndexedDB nor `localStorage` can keep the attachments. Legacy version-2 local drafts can be restored into the current version-3 shape.
- Saved projects are JSON records at `briefs/{uuid}/brief.json`, containing the draft, attachments, creation and update timestamps, and publication metadata. Records are listed newest-first. Existing saved briefs autosave changed drafts after a short debounce, except the creator's final review, which requires an explicit save. Saving uses a temporary file followed by rename.
- The canonical project name is `SC Johnson - {Brand(s)} - {Project title} - IT-{ID}`. Multiple brands are joined with ` + `. Before first save the identifier is `IT-PENDING`; first save assigns a unique uppercase prefix derived from the UUID, lengthening it if necessary to avoid collision. The generated name is used in the brief, Drive, and Jira.
- Brand and project title are required before creating a Drive project or Jira Task. After either external publication, both become locked to prevent name drift. Legacy saved records without reliable publication metadata also keep their existing name.
- Deleting a brief removes its **local** brief directory after user confirmation; it does not reverse any previously created Drive folder or Jira Task.

## 8. Google Drive project delivery

From a saved library brief, **Create project in Drive** creates or reuses the project folder under a configured parent. It requires current saved data, brand, project title, Google Drive access, and server-side credentials. The structure is:

```text
{CANONICAL_PROJECT_NAME}/
├── Intake Tool Brief/
│   └── Intake Tool Brief.pdf
├── Brief/
│   └── Creative Direction.{original extension}   [only if supplied]
├── Adapt Matrix/
│   ├── Asset Matrix.{original extension}         [only if supplied]
│   └── Asset Matrix Source URL.txt                [only if a link was supplied]
├── Deliverables & Specs/
│   └── Deliverables & Specs Template.xlsx
├── Working Files/
└── Other Documents/
    └── Other requester attachments
```

Multiple Creative Direction or Asset Matrix files receive numbered names. All other uploaded files go into **Other Documents**, with unique names where needed. The workbook is copied from the repository template. Repeated publication reuses recorded folders and updates same-named files; legacy folder names are normalized, and old `Agent-provided documents` / `Client-provided documents` trees are moved to Drive trash. Missing Creative Direction or Asset Matrix produces a warning, not a hard stop. The project and subfolder URLs plus a fingerprint of saved inputs are recorded at `briefs/{uuid}/drive.json`; stale Drive status requires republication before Jira preview.

## 9. Jira Task preview and creation

Jira actions are available from the saved brief's library review after the Drive project matches the current saved brief. **Preview Jira Task** shows summary, due date, labels, description rows, warnings, and any already-created Task link. **Create in Jira** creates a Task in the configured sandbox project using a server-side API token; no token or file attachment goes to the browser or Jira description.

The Task summary is the canonical project name (capped at Jira's 255-character limit); its due date is the expected delivery date when present. The description contains exactly these rows: Workspace Order (a link back to `/review?brief={uuid}`), Brief folder, Adapt Matrix folder, Note from client, Deliverables & Specs folder, Working Files folder, blank Schedule, Approvers, and Delivery contacts. Drive missing-document warnings and a past due date are shown in the preview, not added as description rows. Labels encode brand, North America when USA or Canada is selected, country, workstream/asset type, each route, and a stable `intake-brief-{uuid}` deduplication label. The sandbox uses labels for confirmed values where production Jira custom fields are unavailable.

Before creating, the server searches Jira for the stable brief label. `briefs/{uuid}/jira.json` records a creation-in-progress or created state, fingerprint, issue key, issue ID, and URL. Retrying reuses or discovers an existing Task; an uncertain previous creation is not blindly repeated. A created Task is a snapshot: later brief changes are flagged, and the integration does not silently update or duplicate it. No PDF or source files are attached to the Jira issue.

## 10. Technical boundaries and configuration

- Client: React 19, TypeScript, Vite 8, Tailwind CSS 4, `@monksflow/monks-ui`, and Lucide icons. Routing is SPA History API state. PDF output is generated locally by `src/brief-pdf.ts`.
- Server: Vite middleware implements `POST /api/brief/analyze`, `POST /api/vertex/health`, `GET/POST /api/briefs`, `GET/PUT/DELETE /api/briefs/{uuid}`, `GET/POST /api/briefs/{uuid}/drive`, `GET /api/briefs/{uuid}/jira/preview`, and `POST /api/briefs/{uuid}/jira`. Analysis and health also register preview-server middleware; the other local endpoints register development-server middleware. Local API requests are restricted to loopback host/origin checks. AI and Drive also guard against concurrent requests; Jira guards per brief.
- Configuration: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_ROUTING_MODEL`, `GEMINI_EXTRACTION_MODEL`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`, optional `GOOGLE_APPLICATION_CREDENTIALS`, `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY`, `JIRA_ISSUE_TYPE_ID`, `JIRA_BASE_URL`, `JIRA_API_TOKEN`, and `INTAKE_TOOL_BASE_URL`. Google uses ADC or the configured credentials file. The Jira token remains server-side. The default base URL is localhost, suitable only for local links.
- Current limits: this is a single-machine prototype with local filesystem persistence. It has no user authentication, shared multi-user workspace, production database or object storage, Workspace order submission, automatic timeline/resource planning, or production deployment/runtime. The Jira integration creates a sandbox Task; it does not submit an order to Workspace. A production rollout would need hosted APIs, durable shared storage, identity, and a team-reachable Intake Tool URL.

## Implementation references

`src/app.tsx` owns the active flow; `src/brief-documents.tsx`, `src/clarification-turn.tsx`, `src/brief-sections.ts`, `src/brief-library.tsx`, and `src/brief-pdf.ts` provide focused behavior. `shared/brief-contract.ts` defines fields, options, conditions, and validation. `server/brief-analysis.ts` and `server/brief-instruction.ts` define the AI endpoint and instruction; `server/brief-storage.ts`, `server/drive-project.ts`, `server/jira-task.ts`, and `server/jira-integration.ts` implement persistence and publication. `vite.config.ts` registers the local middleware and environment defaults.
