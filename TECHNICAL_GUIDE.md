# Project Technical Guide

## Purpose and architecture

Web application for capturing, analyzing, and reviewing creative briefs. It is a **single-page application (SPA)**: the interface runs in the browser and manages its stages through History API routes (`/intent`, `/scope`, `/brief`, etc.). It does not use a full-stack framework such as Next.js or a separately deployed backend.

During development, **Vite** also registers local `/api/*` endpoints through custom Node.js plugins. This keeps AI, Drive, and persistence features server-side and prevents credentials from being exposed to the browser.

## Core stack

| Area | Technology |
| --- | --- |
| Language | TypeScript 5, strict configuration, ES modules |
| Frontend | React 19 and React DOM |
| Tooling / local server | Vite 8 with `@vitejs/plugin-react` |
| Styling | Tailwind CSS 4, integrated with the Vite plugin |
| Design system | `@monksflow/monks-ui` |
| Icons | Lucide React |
| Code quality | ESLint 9, `typescript-eslint`, Prettier |

## Components and integrations

- `src/`: client interface and logic. `app.tsx` contains the main flow; `brief-*` modules separate the form, documents, library, and PDF export.
- `shared/brief-contract.ts`: shared field contract, validation rules, and types for the client and endpoints.
- `server/`: Vite plugins that implement the local API:
  - brief analysis with **Google Gemini / Vertex AI** (`@google/genai`);
  - Vertex AI connectivity health check;
  - project creation and upload to **Google Drive**, using `google-auth-library`;
  - local brief persistence in `briefs/<id>/brief.json`.
- Files: `pdfjs-dist` renders/previews PDFs in the browser; `JSZip` extracts text from Office documents on the server; the app generates a brief summary PDF.
- Browser persistence: temporary drafts and attachments are stored in `localStorage`. Saved briefs use the local API and the `briefs/` directory.

## Configuration and credentials

Variables are defined in `.env`, based on `.env.example`: Google Cloud project and region, Gemini models, Drive destination folder, and optionally a service-account credential path. The app uses **Application Default Credentials (ADC)**; credentials and sensitive variables must never use the `VITE_` prefix.

## Common commands

```bash
npm install
npm run dev      # start Vite development server
npm run lint     # static analysis
npm run build    # TypeScript + production bundle
npm run preview  # preview the production build
```

## Deployment consideration

The current endpoints rely on Node.js APIs and local file writes (`briefs/`). A production deployment needs to host these routes in a compatible server runtime and replace or persist local storage according to the target environment's needs.
