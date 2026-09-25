# Project Status Changelog

Registro continuo de conversaciones, decisiones, cambios de alcance, riesgos y siguientes pasos para **Intake Tool**.

Este archivo documenta el estado del proyecto; no sustituye la arquitectura funcional ni convierte comentarios de una reunión en requisitos aprobados.

---

## 2026-09-02 — Deterministic brief foundation wizard

### Local Vertex AI connectivity

- Confirmed `scj-nacb-transfor-ai` as the Google Cloud project and `global` as the initial location.
- Selected the GA `gemini-3.5-flash-lite` model with `LOW` thinking for the local integration.
- Installed the official `@google/genai` SDK.
- Added a server-side `/api/vertex/health` diagnostic that relies on Application Default Credentials and uses `countTokens` rather than generating assistant content.
- Verified that `aiplatform.googleapis.com` is enabled and that the local ADC identity can reach the selected model successfully.
- Kept the system instruction and conversational UI integration out of scope for this connectivity step.

### Implemented

- Replaced the visible free-form starting screen with a focused multi-screen foundation flow.
- Added one dedicated screen per field or related option group, with all known options presented as visible cards instead of dropdowns.
- Added Brand, Region, Asset type, Workspace request routes and the documented conditional deliverable choices for CREATE, EVOLVE, ACCELERATE, INNOVATE, Copy Optimization and delivery-only work.
- Added conditional production needs, stock availability, delivery methods and destinations/properties, editable-file requirement, applicable air dates and expected delivery date.
- Added automatic advance for single-choice questions, explicit continuation for multi-select questions and retained answers on Back.
- Replaced the CSS-only step animation with an alpha-only GSAP stagger across the question, heading, options and navigation. The fades overlap within a bounded total stagger window, the panel itself stays fixed and input is temporarily blocked during the transition. Reduced-motion preferences are respected.
- Softened option hover feedback with persistent one-pixel borders, color/background/shadow interpolation and no translation, scaling or geometry change.
- Added a continuously updated brief-foundation summary and a final work-description/review step.
- Expanded the right-side summary to include every applicable conditional answer, including the question-five deliverable branch, production needs, stock status, delivery destinations/properties, air dates, open files and work description. The summary scrolls internally when its content exceeds the viewport.
- Made answered summary rows directly navigable back to their originating question, preserving the current selection for editing. The active row is highlighted, while unanswered future rows remain non-interactive to prevent skipping ahead.

### Boundaries

- Gemini is not connected and no Gemini request or system instruction has been added.
- Progress is local to the current UI session; persistence and collaboration are still pending.
- The original omission of `Asset subtype` and translation `Market/language` options was corrected after the deconstructed master diagram was audited; both catalogs are now enforced by the form contract.
- The prior entry screen and long form remain in the codebase as unmounted components.

### Verification

- Production build passes. Vite reports five non-blocking CSS optimizer warnings originating from existing Recharts selectors in the UI library.
- ESLint passes.
- Fresh-browser checks confirmed staggered intermediate opacity values, no transforms during or after the sequence, restored interaction after settling, zero console errors and no horizontal overflow at desktop width.
- The complete simple path, conditional request/delivery branches and a 390 px mobile viewport were also exercised successfully.

---

## 2026-09-01 — Initial AI-assisted brief entry screen

### Implemented

- Replaced the visible long-form intake with a focused first-step experience asking `What do you need to make?`.
- Added selectable starter examples that populate the work-description field while preserving free-form entry.
- Added a lightweight three-stage orientation: describe the need, answer focused questions and review the brief.
- Kept `Continue` unavailable until the requester provides an initial description.
- Added responsive behavior for desktop and mobile layouts.

### Preserved and deferred

- Preserved the previous briefing-form implementation as an exported but unmounted legacy component; it remains in the codebase but is no longer visible in the application.
- Gemini is not connected.
- No Gemini prompt or decision-tree behavior has been created.
- Continue does not advance into later brief questions yet.
- Storefront, review, approval, delivery and other existing prototype surfaces remain outside the visible application for now.

### Verification

- Production build passes.
- ESLint passes.
- Browser validation confirmed the starter-option behavior, disabled/enabled Continue state, absence of console errors and no horizontal overflow at a 390 px mobile viewport.

---

## 2026-08-27 — Real Workspace brief fixture implemented

### Source of truth

- `SNA-774.pdf` is now the official read fixture for the prototype.
- The editable Workspace order capture was used only to understand the complete form schema and identify fields left blank; it is not treated as a second source of submitted values.

### Replaced fictitious data

- Removed the Raid, Glade Walmart and Mr Muscle demonstration records.
- Added the real Workspace brief identifier `SNA-774` and the submitted project name `DG Glade Falliday 9.13 Banners`.
- Added the submitted brand, region, submitter, main approver, delivery date, asset type, retailer and total asset count.
- Added the real Workspace taxonomy: `ACCELERATE`, `Shopper (digital or print)` and `Media, and printed non-displays`.
- Added delivery instructions, open-file requirement and the four source attachment filenames.

### Readiness and interpretation

- The record remains `Needs review` because the official PDF does not contain a completed asset matrix, a description of the work or per-asset specifications for the 11 requested assets.
- `Adapt` is retained only as a low-confidence internal proposal. It is inferred from the supplied template/plugin files and must be confirmed by a PM because Workspace's `ACCELERATE` category is not equivalent to the internal `Adapt / Create / Mixed` classification.
- The UI explicitly states that the record is read from a PDF fixture. Workspace API discovery, polling and write-back remain unconnected and unconfirmed.

### Asset type clarification

- Added `assetType` as its own normalized field with the allowed Workspace values `Ecomm`, `ATL` and `Shopper`.
- `SNA-774` is explicitly displayed as `Shopper` in both extracted project information and the brief summary.
- Shopper is no longer mixed into the retailer/channel list; Dollar General remains the media placement / retailer.

### Consolidated source-of-truth view

- Replaced the duplicated extracted-data, brief-summary and activity tabs with one consolidated brief record.
- The visible brief data now follows the four sections in the official PDF: general information, content brief, delivery type and attachments.
- Removed the inferred `Adapt / Create / Mixed` classification, confidence score, generated summary, fictitious deliverable records and repeated channel/date/asset blocks.
- `Needs review` and the review-gap list are retained as derived system analysis and are visually separated from submitted PDF values.

---

## 2026-08-26 — Work classification implemented

### Added

- System-proposed classification for each processed brief: `Adapt`, `Create` or `Mixed`.
- Confidence score and plain-language rationale for the proposal.
- PM controls to change and confirm the classification.
- Confirmation status stored for the current demo session.
- Activity entry when the PM confirms a classification.
- The **Review intake** action now opens and scrolls to the classification review.

### Product rule

The intake status (`Ready` or `Needs review`) and work classification are separate decisions. Intake status describes whether required brief information is complete; work classification describes whether the requested production work is an adaptation, new creation or a combination of both.

---

## 2026-08-26 — Scope update and first interface

### Confirmed direction

- Workspace integration is not available, so automatic detection of new briefs is excluded from the first version.
- A new-brief inbox is also excluded because there is no source integration to populate it.
- The first version begins with a minimum intake from a manually supplied brief.
- The product will maintain an organizer of briefs that have already been read.
- Opening a processed brief will show the data extracted from the file and identify missing information requiring PM review.

### First interface implemented

- Brief organizer with search and readiness filters.
- Selection between processed briefs.
- Extracted project data, summary, channels and requested deliverables.
- Intake completeness indicator and missing-information callout.
- Brief summary and activity views.
- Fictitious demo records for Raid, Glade and Mr Muscle; these do not represent real client jobs.

### Current boundary

This interface uses local demonstration data. It does not yet upload or parse a real brief, persist records, create Google Drive folders, generate a timeline or connect to Workspace.

---

## 2026-08-26 — Daily status (mañana)

### Conversación

Reunión con Tyler sobre el alcance de la primera etapa del proyecto.

### Dirección mencionada por Tyler

La primera etapa podría concentrarse en crear infraestructura vacía para que el Producer o PM la complete manualmente:

- Crear los contenedores y la estructura inicial de carpetas en Google Drive.
- Crear un documento de timeline vacío.
- Dejar el documento preparado para que el PM capture posteriormente fechas, etapas y responsables.

### Diferencia detectada frente al documento de arquitectura

La arquitectura describe un flujo que comienza con la recepción y normalización del brief. A partir de ese registro normalizado, el sistema clasifica el trabajo, determina entregables y prepara timeline, recursos, estructura de trabajo y QA.

La dirección comentada en el daily parece reducir la primera entrega a **provisioning de plantillas vacías**, sin automatizar todavía la interpretación del brief.

Esto no necesariamente representa una contradicción. Puede significar que Tyler propone una fase inicial más pequeña y de menor riesgo. Sin embargo, crear carpetas o documentos antes de contar con datos mínimos normalizados puede producir nombres incompletos, estructuras incorrectas, duplicados o contenedores que después deban corregirse manualmente.

### Hipótesis de alcance para aclarar

Hay dos interpretaciones posibles:

1. **Provisioning básico:** el PM inicia el proceso y proporciona manualmente los campos mínimos; el sistema solamente crea carpetas y documentos vacíos desde plantillas.
2. **Intake mínimo seguido de provisioning:** el sistema recibe el brief, extrae o solicita los campos indispensables y después crea los contenedores vacíos con nombres y referencias correctas.

La segunda alternativa conserva el alcance reducido sugerido por Tyler, pero mantiene un orden operacional seguro: validar primero lo mínimo necesario y provisionar después.

### Decisiones pendientes

- Confirmar si la primera entrega incluye extracción de datos del brief o únicamente captura manual de campos.
- Definir los datos mínimos necesarios antes de crear una carpeta: cliente, marca, producto/SKU, job ID, tipo de trabajo y fecha objetivo.
- Confirmar la plantilla y convención de nombres para Google Drive.
- Confirmar dónde debe vivir el timeline y en qué formato: Google Sheet, Google Doc, documento de Workspace u otro sistema.
- Determinar si los contenedores se crean inmediatamente o solamente después de la confirmación del PM.
- Aclarar cómo se previenen duplicados y cómo se identifica un job ya provisionado.

### Riesgos

- Crear carpetas sin un identificador canónico del job.
- Duplicar estructuras cuando un brief se vuelve a enviar o corregir.
- Usar nombres de cliente, marca o producto no normalizados.
- Crear un timeline que no corresponda con los entregables o la fecha solicitada.
- Convertir el supuesto ahorro de tiempo en trabajo posterior de limpieza para el PM.

### Siguiente propuesta

Construir un primer recorrido estrecho:

`Inicio del PM → captura o extracción de datos mínimos → revisión rápida → creación de carpetas → creación del timeline vacío → confirmación con enlaces`

Este recorrido deja fuera, por ahora, la clasificación inteligente, la generación de especificaciones, la estimación automática, el booking y el QA completo, pero prepara la estructura para incorporarlos posteriormente.

---

## Inventario inicial — Trabajo manual del PM que Intake Tool busca reducir o reemplazar

### 1. Detectar e iniciar el trabajo

- Revisar Workspace para identificar briefs nuevos.
- Abrir el brief y decidir si está listo para comenzar.
- Crear o asignar manualmente un identificador para el proyecto.

### 2. Revisar y normalizar el brief

- Leer el brief y sus archivos adjuntos.
- Identificar cliente, marca, producto o SKU.
- Identificar requester, prioridad y fecha de entrega.
- Interpretar canales, retailers y entregables solicitados.
- Detectar información faltante, contradictoria o ambigua.
- Contactar al requester para pedir aclaraciones.
- Convertir información no estructurada en datos utilizables para producción.

### 3. Clasificar el tipo de trabajo

- Determinar si el proyecto es `adapt`, `create` o `mixed`.
- Aplicar criterios aprendidos por experiencia o memoria.
- Buscar proyectos anteriores similares.
- Explicar o justificar la clasificación cuando afecta tiempos y recursos.

### 4. Definir entregables y especificaciones

- Traducir el brief a una lista concreta de assets.
- Consultar requisitos por canal o retailer.
- Definir dimensiones, formatos y variantes requeridas.
- Identificar elementos obligatorios de producto, packaging o marca.
- Verificar que no falte una pieza necesaria para completar el pedido.

### 5. Crear la estructura operativa del proyecto

- Crear carpetas en Google Drive.
- Aplicar convenciones de nombres.
- Crear subcarpetas para brief, fuentes, trabajo, revisión y entregables.
- Copiar o crear archivos de plantilla.
- Crear y poblar el registro o página del proyecto en Workspace/Workflow Management.
- Pegar enlaces cruzados entre los diferentes sistemas.
- Revisar que no exista previamente una carpeta o registro para el mismo job.

### 6. Preparar el timeline

- Estimar las etapas necesarias para el proyecto.
- Calcular duraciones con base en el tipo y volumen de entregables.
- Colocar fechas de trabajo, revisiones, aprobación y entrega.
- Comparar el tiempo disponible con la fecha solicitada.
- Detectar cuando el deadline no es viable.
- Ajustar el timeline después de cambios de alcance.

### 7. Planear capacidad y recursos

- Determinar qué perfiles se necesitan: diseño, copy, video u otros.
- Estimar horas o esfuerzo por rol.
- Revisar calendarios y disponibilidad.
- Crear holds, bookings o asignaciones.
- Resolver conflictos cuando no hay capacidad suficiente.
- Escalar al Producer o liderazgo cuando el plan no es viable.

### 8. Preparar el checklist de QA

- Copiar o crear un checklist para el proyecto.
- Adaptarlo a los entregables, canales y retailers involucrados.
- Incorporar requisitos de marca, producto, legal y claims.
- Identificar casos regulados que requieren una validación adicional.

### 9. Consolidar y revisar el setup

- Comprobar que brief, specs, carpetas, timeline, recursos y QA coincidan.
- Corregir inconsistencias entre documentos o sistemas.
- Confirmar que todos los enlaces y permisos funcionen.
- Preparar un resumen para el equipo creativo.
- Decidir si el proyecto está listo para pasar a creación.

### 10. Comunicar el handoff

- Notificar a los participantes que el proyecto está preparado.
- Compartir enlaces y contexto.
- Comunicar riesgos, faltantes y decisiones pendientes.
- Activar la siguiente etapa creativa.

### 11. Gestionar excepciones y trazabilidad

- Dar seguimiento a briefs incompletos.
- Resolver clasificaciones dudosas.
- Renegociar alcance o fechas inviables.
- Atender fallos de Drive, Workspace o del sistema de booking.
- Registrar decisiones y correcciones realizadas durante el setup.

---

## Criterio de alcance actual

La visión completa busca reducir o automatizar las once áreas anteriores. La conversación del 26 de agosto apunta a que el primer incremento podría cubrir solamente una parte de **crear la estructura operativa** y **preparar el timeline**, manteniendo al PM como responsable de llenar y validar el contenido.

El alcance definitivo de ese incremento permanece pendiente de confirmación.
