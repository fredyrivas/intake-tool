# Intake Tool

A monks-ui starter project using Vite, React 19, TypeScript, and Tailwind CSS 4.

The part worth copying carefully is `src/styles.css`. The `@source` line is what lets Tailwind
find the package's classes, and without it components render unstyled.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- monks-ui (design system)

## Get started

Copy this directory, rename `gitignore` to `.gitignore` (it ships undotted because npm strips
the dotted name from tarballs), then:

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Local Vertex AI connection

The local server uses Application Default Credentials (ADC). Credentials remain on the server
side and are never exposed through a `VITE_` environment variable or bundled into the browser.

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project scj-nacb-transfor-ai
```

The checked-in defaults are documented in `.env.example`:

```text
GOOGLE_CLOUD_PROJECT=scj-nacb-transfor-ai
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
GEMINI_EXTRACTION_MODEL=gemini-3.5-flash-lite
```

For latency testing, every analysis phase and retry uses the extraction model with `LOW` thinking.

After starting the local app, verify ADC, project access and model availability without generating
assistant content:

```bash
curl -X POST http://127.0.0.1:5173/api/vertex/health
```

The diagnostic uses `countTokens`. The intent-first brief assistant calls Gemini only after the
marketer submits their description for interpretation.

## Google Drive project delivery

The final review can create the project structure below in the configured Drive folder:

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

Enable Google Drive API in the Google Cloud project, create a dedicated service account, and add
that service account as a member of the destination Shared Drive or share the destination folder
with it. The server uses Application Default Credentials; never expose credentials through a
`VITE_` variable or commit a service-account key.

Set the parent folder ID in `.env` when it differs from the checked-in prototype destination:

```text
GOOGLE_DRIVE_PARENT_FOLDER_ID=1DoVzqRpAhJWuE1v3h3kNu26JJPdbCNrA
```

Creative Direction and Asset Matrix are uploaded only when completed files were supplied. Other
requester uploads go to `Other documents`, and the original local Deliverables & Specs workbook is
copied into every project. Repeated submissions reuse the project folders and update same-named
binary files. If Asset Matrix was provided as a URL, the `Adapt Matrix` folder contains
`Asset Matrix Source URL.txt` with that reference. After a successful publication,
`briefs/{brief-id}/drive.json` stores the fixed project and subfolder links. Publishing again
updates the same folders and refreshes the record.

## Jira sandbox Task test

The Intake Tool final review has **Preview Jira Task** and **Create in Jira** actions. The local
server reads a saved brief from `briefs/` and calls Jira; the API token never reaches the browser.
Set these values in `.env` (not in a `VITE_` variable):

```text
JIRA_BASE_URL=https://mediamonks.atlassian.net
JIRA_CLOUD_ID=2ae04dab-3d23-419c-b39d-71a96bfc258c
JIRA_PROJECT_KEY=SK1D0YZ1
JIRA_ISSUE_TYPE_ID=33921
JIRA_SERVICE_ACCOUNT_EMAIL=intake-tool-scj-6aiwu4tnji@serviceaccount.atlassian.com
JIRA_API_TOKEN=<service-account token>
INTAKE_TOOL_BASE_URL=http://localhost:5173
```

The sandbox is **SC Johnson - Intake Tool Test** (project ID `27572`). The issue type ID `33921`
is Task, although Jira may display its name in another language. The service account needs a Jira
license, Member access to this space, and classic `read:jira-work` and `write:jira-work` scopes.
Scoped service-account tokens use `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`.

Create or update the Drive project before opening the Jira preview. The server requires a current
`drive.json` record and uses its subfolder URLs. The Jira description contains only Workspace
Order, Brief, Adapt Matrix, Note from client, Deliverables & Specs, Working Files, Schedule,
Approvers, and Delivery contacts. Schedule stays blank. Missing Creative Direction or Asset Matrix
and a past due date are warnings in the preview, not extra text in the Task. No files or PDF are
attached to Jira. The Task uses the Intake Tool project name and expected delivery date.
The sandbox records confirmed country/region and ECOMM/SHOPPER equivalences as labels because
its Task type does not expose the production project's custom fields.

`INTAKE_TOOL_BASE_URL` builds the Workspace Order link (`/review?brief={id}`). Localhost is only
useful for the sandbox test; set an address reachable by the team before using this outside local
testing. The resulting issue key is stored in `briefs/{brief-id}/jira.json` so retries reuse the
Task. If Jira creation has an uncertain outcome, the endpoint does not blindly create another
issue. An already-created Task is a snapshot and is not silently updated.

## Project structure

```
src/
├── app.tsx                 ← Intent-first intake and interpretation review
├── brief-documents.tsx     ← Optional attachment handling
├── main.tsx                ← React entry point
└── styles.css              ← Tailwind + monks-ui CSS
server/
├── brief-analysis.ts       ← Local Gemini endpoint
├── drive-project.ts        ← Google Drive folder and file delivery
├── brief-instruction.ts    ← Structured interpretation instruction
└── vertex-health.ts        ← ADC and model connectivity diagnostic
shared/
└── brief-contract.ts       ← Original field catalog and runtime validation
```

## Useful commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Lint
npm run format   # Format with Prettier
```
