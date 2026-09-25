# Workspace - Context Control

## Document status

- **Purpose:** preserve the product context supplied on 2026-09-01 and the visible form schema from the attached Workspace capture.
- **Current phase:** document-assisted conversational brief intake with a local Gemini integration and demo requester session.
- **Implementation status:** foundation choices, optional documents/notes, approver/reviewers, real Vertex analysis, source-backed proposals, guided conditional fields and review are implemented. Real authentication, durable persistence and ticket submission remain unimplemented. See `BRIEF_ASSISTANT.md` for the current flow and contract; earlier phase entries below are historical.
- **Requirement status:** the content below is working context, not an approved specification or final source of truth.
- **Last updated:** 2026-09-03.

### Conversational prototype update — 2026-09-03

Subsequent approved change on the same day: replaced required work description with optional documents/details; hid the composer until this step; connected Gemini after responsibilities are captured and Analyze request is chosen. Added the versioned system instruction and complete known conditional field catalog, validated proposals, confirmed-only updates and a pending-aware review. Verified a real synthetic PDF analysis with page evidence. Fixed root viewport anchoring and confined automatic scroll to the conversation. The structured draft now saves continuously in browser localStorage; uploaded attachment bytes are intentionally excluded and must be reattached after refresh. The optional attachment step accepts PDF, PPTX, XLSX, TXT, PNG and JPEG files.

- The active intake now uses a scrollable conversation above a persistent message composer, with existing multiple-choice branches preserved using monks-ui.
- Confirmed answers remain in chronological history with edit actions. Historical answers are not the canonical brief; the final summary uses current state and only active conditional branches.
- A clearly labeled development-only session supplies Alex Morgan / alex.morgan@example.com. This fixture is not authentication or an authorization mechanism.
- After the work description, the requester explicitly chooses self or another final approver. Self reuses the session email; another approver requires a valid email. Reviewers are optional, with free-form comma/semicolon/whitespace-separated email entry and validation.
- Vendor, media-agency and other delivery destinations expose separate optional free-text contact/instruction fields. Missing contact details are shown as pending. No additional SCJ marketer contact requirement is invented.
- At the description question, the composer captures the work description. Elsewhere it records an uninterpreted conversation note and explicitly explains that no selections were changed.
- Gemini, authentication, backend draft persistence and submission remain disconnected. State is in memory and clears on refresh. No personal data or messages are sent to a model.
- Validation: TypeScript/Vite build, ESLint and Node tests for demo identity, email parsing/validation and contact destinations. Browser interaction/visual QA has not been performed.

## Sources and provenance

### Context supplied directly by the user

- The company uses an internal tool called **Workspace**.
- Workspace contains a **Brief form / Order a brief** flow where a client or marketer requests work.
- The form is long and contains conditional sub-fields.
- After the form is completed, Workspace creates a ticket with its own ID.
- The submitted information can be consolidated into an exportable PDF.
- An order has general comments and comments associated with individual form fields.
- Most checkboxes in the supplied capture were intentionally selected only to expose as many conditional sub-fields as possible.

### Brief-form reference reviewed

- File: `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-my-order-create-2026-09-01-11_44_45.pdf`
- Format: 8-page, letter-size visual capture exported with jsPDF; it does not contain an interactive AcroForm field tree or extractable text layer.
- Coverage: the visible empty-state briefing form, with many parent checkboxes enabled to reveal their dependent fields.
- Important interpretation: checked values in this capture are **schema-discovery aids**, not submitted order data, recommended defaults or business rules.
- Any instructional copy inside the capture is treated as UI content for the requester, not as an instruction to modify this project.

### Storefront and guidance references reviewed

The following additional visual captures were reviewed on 2026-09-01:

- `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-2026-09-01-12_05_40.pdf` - two-page Storefront overview and National Campaigns catalog guidance.
- `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-folder-a5b72822-5769-4124-9bfb-311d7aa73e4d-2026-09-01-12_06_03.pdf` - `01. PILLARS 4 CONTENT`.
- `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-folder-47862a0b-8bdd-423c-935e-db2293d357ce-2026-09-01-12_06_14.pdf` - `02. THE TEAM`.
- `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-folder-a277e9c3-0b1c-4c4a-9f4e-7d88556e8d90-2026-09-01-12_06_21.pdf` - `03. WORKFLOW`.
- `screencapture-workspace-monks-tools-client-b99cce0e-9469-43be-87ce-8b44658850ec-storefront-folder-aa46ac06-c8a7-48b3-830b-0493a0331f6d-2026-09-01-12_06_30.pdf` - `04. TOOLS`.

All five files are jsPDF visual captures without interactive form fields or extractable text layers. Their guide text is recorded as product documentation visible inside Workspace; it is not treated as an instruction to implement or operate anything in this repository.

## Current product understanding

The Workspace intake flow has four numbered form sections:

1. **General information**
2. **Content brief**
3. **Delivery type**
4. **Additional notes and attachments**

The form supports saving a draft, cancelling and submitting. Based on the user-supplied context, submission later produces a canonical ticket ID and a PDF representation of the order. Those two post-submission behaviors are not shown in the attached empty-form capture and should be validated against a submitted-order example before implementation.

## New product direction: AI-assisted Workspace replica

### Confirmed objective

The product will be a functional replica of Workspace with a fundamentally different brief-creation experience. Instead of asking a client or marketer to complete a long conditional form field by field, the application will use a Gemini-powered assistant to guide the requester through the information-gathering process.

The assistant's objective is not merely to chat or summarize the request. It must produce a complete, structured brief containing the information Monks needs so that a human Monks reviewer can evaluate the ticket without discovering avoidable omissions.

Implementation is proceeding incrementally. The current slice begins with a natural-language request, optional supporting documents and a Gemini interpretation that the marketer must adjust or confirm.

### Intended starting experience

- The creation flow begins by asking the marketer to describe what they need briefly and in their own words.
- Rotating examples remain visible while the marketer types. They are inspiration, not selectable answers or values inserted into the request.
- Supporting documents are available in the same first step and remain optional.
- The user may describe a need without understanding Workspace terminology, its four pillars or the underlying form schema.
- Gemini translates the description and document evidence into proposed values from the existing Workspace field catalog.
- The marketer sees the interpretation and the source for every proposal, and can adjust individual values, retry the interpretation or confirm it.
- No proposal becomes confirmed brief data until the marketer approves the interpretation.
- From the confirmed interpretation, the assistant follows the most efficient route through a decision tree informed by the existing Workspace form, conditional fields, content pillars, deliverable types and delivery requirements.
- The assistant progressively gathers the information required for the applicable request type and avoids asking irrelevant questions.
- The original long form is hidden at the beginning of the experience.
- Fields unrelated to the active request remain hidden.

### Intent interpretation currently implemented

- Natural-language intent composer with persistent rotating examples.
- Optional PDF, PPTX, XLSX, TXT, PNG and JPEG attachments.
- Gemini structured interpretation using only the known field catalog and exact option values.
- Source attribution for explicit request text, document evidence and route interpretations.
- Editable proposal values, retry and explicit confirmation.
- Re-analysis after confirmation so suggested missing questions reflect any marketer adjustments.

The deconstructed master diagram supplies the option catalogs for `Asset subtype` and translation `Market/language`; both are exposed as constrained choices in the current implementation. Free-text or file-dependent details remain for the guided phase when the diagram does not enumerate options.

### Conversation and input principles

- Begin with one high-information natural-language description, then prefer choices and suggested answers for focused follow-ups.
- Minimize how much the requester must type.
- Ask only questions that are relevant to the work already identified.
- Use intelligent ordering so that high-information answers eliminate unnecessary branches and shorten the flow.
- Present user-friendly language while mapping responses to the structured Workspace-compatible schema behind the scenes.
- Use conditional follow-ups when a selection activates required child fields.
- Group a small number of closely related questions when doing so is faster than presenting every question on a separate screen.
- Preserve completeness: speed must come from better routing and interaction design, not from omitting information Monks needs.
- Allow the requester to supply files, links, references, specifications and other supporting material when required by the selected path.
- Use English only in the first version of the interface and assistant.
- Gemini must not invent or silently confirm brief facts. It may extract explicit facts and recommend a route, with visible sources and human confirmation.

### Assistant responsibilities as currently understood

The Gemini assistant will need to:

1. Interpret the user's initial description of the requested work.
2. Recommend the relevant content pillar and request/deliverable path from the user's description, then require the user to confirm or change that recommendation.
3. Determine which fields and conditional sub-fields apply.
4. Ask the smallest useful set of questions in an efficient order.
5. Prefer explicit selectable answers and only request free-form input when the information cannot be captured reliably through options.
6. Detect missing, inconsistent or ambiguous information during the conversation.
7. Ask targeted clarification questions and, when the user cannot answer, preserve the gap as an explicit pending item.
8. Organize answers into the structured brief schema expected by Monks.
9. Track which required data is complete, missing, deferred or not applicable.
10. Prepare a final structured summary for requester review before the brief is submitted.

### Storefront role in the new application

The new application must also include a Storefront-like entry point. A requester can begin from an existing work template, approved asset or prior-style example that serves as a reference for the new request.

The intended product still supports two entry routes, although only the deterministic new-brief route is visible in the current implementation:

1. **Start a new brief:** describe the work first, optionally attach supporting material, then review Gemini's proposed starting point.
2. **Start from Storefront:** choose a reference/template first, then let the assistant use that context to reduce the remaining questions and gather the adaptations or new requirements.

Storefront selection should contribute context to the same structured brief-creation process rather than becoming a separate disconnected form.

For the first version, Storefront will reuse the examples visible in the supplied Workspace captures. Selecting an example should carry its known campaign/reference context into brief creation, including the applicable brand, source assets, formats, specifications and channel information when those values exist. The requester then supplies the new adaptation requirements and any remaining information. Inherited values originate from an explicit Storefront selection and are not Gemini inferences.

### Progress persistence and resumability

- Brief creation is a resumable process, not a single uninterrupted session.
- Progress must be saved continuously or at safe checkpoints.
- A requester can leave when they need to gather missing information and resume later.
- Resuming should restore the brief state, conversation context, collected answers, attachments/references and the next unresolved question.
- The product should clearly distinguish completed information from information still required before submission.
- `I don't know yet` saves the unanswered question as a pending item that can be completed later.
- The requester is allowed to submit a brief with unresolved items, provided every missing answer is clearly marked as pending.
- The system must distinguish a complete brief, an in-progress draft and a submitted brief with pending information.
- Drafts can be shared so other collaborators can help complete them before submission.

### Working conceptual flow

`Choose Storefront reference or start a new brief -> describe the intent and optionally attach documents -> review and confirm Gemini's field interpretation -> assistant asks only the remaining applicable questions -> relevant form fields fill progressively -> missing information can be deferred while progress is saved -> user or collaborator resumes -> assistant reports completeness and pending items -> user reviews the structured summary -> brief is submitted as complete or explicitly with pending information`

### Confirmed scope and behavior decisions

The following decisions were confirmed on 2026-09-01:

- The first stage covers Storefront references, AI-assisted brief creation, the progressively revealed structured form, collaborative saved drafts, submission and a final structured summary.
- Asset review, approval, delivery and other asset-management functionality are deferred to a second stage.
- General and field-specific communication between the Monks reviewer and the client is also deferred to the second stage.
- Submission is permitted with missing answers when they are explicitly marked as pending.
- Selecting `I don't know yet` preserves the corresponding question for later completion.
- Gemini never invents or silently confirms brief data. Extracted values and route recommendations remain proposals until the marketer confirms them.
- Gemini may recommend a likely pillar or route from the user's own description, but the recommendation must be explicitly confirmed or changed by the user before it controls the brief path.
- The requester always receives a final structured summary.
- Multiple work scopes can remain in one brief when they belong to the same campaign or brand.
- Storefront starts with the same examples visible in the supplied Workspace captures and transfers their known reference context into the brief.
- The first version is English-only.
- Related questions may be grouped to accelerate the flow.
- Other collaborators can help complete a saved draft.

### Recommendation versus inference rule

Gemini may extract facts explicitly present in the marketer's description or supporting documents and may recommend a decision-tree route. It may not create business facts that the user did not provide or inherit through an explicit reference. Every proposal shows its source, and a proposed value or route is not accepted brief data until the marketer confirms it.

## Collaboration and comments model

- A persistent right-side **Collaboration** panel is visible beside the form.
- The panel includes an **All comments** control and two tabs: **General** and **Field comments**.
- The general-comment composer supports formatted text, an attachment action and a visible maximum of 2,048 characters.
- A comment icon appears beside the form and beside most visible fields, parent options, uploads and link controls.
- The UI therefore distinguishes order-level discussion from discussion attached to a particular form element.
- The capture does not reveal comment IDs, threading behavior, mentions, resolution state, permissions, timestamps or the relationship between comments and an exported PDF.

## Workspace navigation and operating model

### Global navigation observed

The captured Workspace header exposes two primary areas:

- `Order & brief`
- `Review & approve`

Within `Order & brief`, the visible secondary navigation is:

- `Storefront`
- `All orders`
- `My orders`
- `My mentions`

Other persistent controls include search, the signed-in user area, a purple `Start a brief` action and a purple shopping-cart icon.

The captures do not yet show the contents of `All orders`, `My orders`, `My mentions` or the `Review & approve` area. Their exact screens, filters, states and permissions remain unknown.

### Storefront structure

Storefront presents information and asset libraries as folders/cards. A visible top-level section is `01. QUICK CARDS: PILLARS, THE TEAM, WORKFLOW, TOOLING`, containing:

- `01. PILLARS 4 CONTENT` - definitions of the four content-request approaches.
- `02. THE TEAM` - Monks points of contact and role definitions.
- `03. WORKFLOW` - a concise overview of the order-to-delivery process and where requester input is needed.
- `04. TOOLS` - the Workspace and Sitecore DAM/BOS ecosystem.

Each card has a `View contents` action and an overflow menu. Folder pages preserve breadcrumbs, `Start a brief`, the cart and global navigation.

Some folder pages show the empty state `This Folder Awaits Your Content` and direct the user to `Review & Approve` to enable assets to appear in Storefront. This suggests Storefront content availability may be controlled by an approval or publishing step, but the exact enablement mechanism is not visible.

### Four content pillars

The Storefront guidance corroborates the four request types found in the brief form:

1. `CREATE`
   - Net-new production and agentic end-to-end production.
   - Examples include evergreen platform-supported content, KV outside an NPD request and assets not supported in National Campaign Masters.
2. `EVOLVE`
   - Fast, tactical ATL adaptations based on an existing annual campaign.
   - Examples include social static/video, static digital assets, promotional assets, HTVs and asset refreshes.
3. `ACCELERATE`
   - Adaptation of existing e-commerce and Shopper BTL assets for partner and retail channels.
   - Examples include digital-retailer-page assets and Shopper assets for retail media, digital or print.
   - Guidance emphasizes attaching creative references, examples, marketing-copy guidance and supporting material.
4. `INNOVATE`
   - Net-new assets supporting NPD content at scale.
   - Examples include KVs, PDP assets, brand-page content, in-store displays, HTVs/promotional videos and social posts.

The guidance says each pillar represents a distinct approach aligned with particular scenarios, helps marketers choose an approach, tone and output, and contains example asset types. It does not establish whether one order can formally use more than one pillar.

### Team responsibilities and points of contact

The `THE TEAM` guide assigns the Monks team these responsibilities:

- Ingest and validate the creative brief and provided inputs, including source files, artwork and technical specifications.
- Flag missing or inconsistent inputs.
- Provide the debriefing and timeline.

Visible Producer coverage:

- Ivette Rodriguez - Home Cleaning.
- Martina Kammerath - Pest Control.
- Francisco Gutierrez - Home Storage.
- Clara Crusizio - Air Care.
- Terri Molsen - Ecomm & Shopper.

Visible Account coverage:

- Avani Gade - Home Cleaning.
- Sharyu Chute - Pest Control.
- Sumbul Vallani - Glade + Ziploc.

Email addresses are visible in the source capture but are intentionally not duplicated here because the current goal is to preserve the operating model, not create a contact directory.

### End-to-end workflow shown in Workspace

The quick guide presents five stages numbered 0 through 4:

0. `Storefront`
   - Select and order an adaptation of an approved asset or asset group.
   - If an asset is unavailable in Storefront, use the DAM/BOS to reference existing files.
1. `Order & Brief` - marked as a stage requiring requester input.
   - Create the brief collaboratively while preserving user roles.
   - Discuss the brief directly with project stakeholders inside the platform.
2. `Dashboard`
   - Check project status, timeline and links to assets requiring review.
   - Described as an optional central hub for tracking orders.
3. `Review & Feedback` - marked as a stage requiring requester input.
   - Review, annotate, comment on and compare multiple assets in list or grid views.
   - Use version history and side-by-side comparison to track changes and compare amended assets.
4. `Approval & Delivery` - marked as a stage requiring requester input.
   - Use multi-collaborator approval workflows and threaded conversations.
   - Review, discuss and approve assets together while preserving decisions and feedback in one place.

### Storefront shopping and National Campaigns

The Storefront capture contains a `02. NATIONAL CAMPAIGNS` section with a step-by-step ordering guide:

1. Navigate to the needed asset category, with examples such as animated, social, digital banners and videos.
2. Select one or more assets and add them to the cart.
3. Use `Add selected assets`, then open the purple cart in the upper-right corner.
4. Review selected assets in the cart dialog and choose `Proceed to order form`.
5. Complete the order form while referencing those selected assets.
6. For each asset or asset group, specify adaptation requirements, required specifications, and attach the media plan and technical documentation. Example adaptations include changing a headline, swapping a background and replacing or removing products.

Visible National Campaign library examples include Glade Falliday, OFF! Deep Woods, Raid Bugs Hate Raid, a SC Johnson/Ziploc North America Home Storage entry, STEM Masterbrand Platform and ZIPLOC FTLOF. Cards show asset-category summaries and a `View contents` action.

One status ambiguity must remain open: the workflow diagram labels the Storefront shopping-cart feature as `Coming soon`, while the Storefront UI already displays a cart and detailed cart instructions. The captures alone do not establish whether the flow is live, partially enabled, documented in advance or restricted by account/content.

### Tool ecosystem

The guidance identifies two core tools:

- `Workspace` - the centralized platform for content-brief intake, collaboration between brand and Monks teams, and asset review.
- `Sitecore DAM (BOS)` - the centralized DAM where final approved assets are stored.

The `TOOLS` folder also exposes a Workspace 3 video-tutorial/user-guide card and a Sitecore DAM/BOS guide card.

## Visible form inventory

The inventory below records labels and conditional relationships visible in the capture. It does not define backend keys, validation rules, option lists or final normalized names.

### 01 - General information

- `Project name` - required text field.
- `Brand` - required select.
- `Region` - required select.
- `Main approver (email)` - required email field. Helper copy says this person gives final approval for produced assets and that the requester should enter their own address if they are the approver.
- `Reviewers / project contributors (email)` - optional email entry for secondary contributors participating in asset review.
- `Expected delivery date` - required date field.
- `Asset type` - required select.
- `Media placement / retailer` - required text field. Visible examples: Meta, Amazon and Walmart.
- `Total number of assets` - required field.
- `Creative Direction (template)` - required file upload. Helper copy says every project needs image-placement and guidance material.

### 02 - Content brief

#### Request type: CREATE

The checked parent option is `CREATE`. Its descriptive copy includes net-new asset production, agentic end-to-end production, evergreen platform-supported content, KV outside an NPD request and other assets not supported in National Campaign Masters.

Visible deliverable groups under CREATE:

- `National campaign films`
  - `TVC`
  - `CTV`
  - `OLV`
  - `Social`
- `Evergreen platform supported content`
  - `Sponsored videos`
  - `OLV`
  - `Social`
  - `Statics`
- `Big idea production`

Business situation fields:

- `Business context / objective`
- `Consumer insights driving the work`
- `Audience`

Project assignment fields:

- `The ask & goal`
- `Communication objective`
- `Consumers takeaway (emotional / functional)`

Creative scope fields:

- `Mandatories`
- `Out of scope`
- `Research and insights`
- `Additional notes or context`
- `Attachments or any visual references to take into consideration` - file upload.

#### Request type: EVOLVE

The checked parent option is `EVOLVE`. Its visible description says this brief focuses on ATL-adapted assets created to support quick-turn, brand-tactical executions.

Visible deliverable checkboxes:

- `Social`
- `Static`
- `Promotional`
- `HTVs`
- `Adapts/refreshes`

Visible supporting inputs:

- Annual campaign/reference deck to leverage - add-link control and file upload.
- Content matrix - add-link control and file upload.
- Completed asset matrix - file upload.
- `Please describe the work we need to do`
- Creative references, examples or additional supporting materials - add-link control and file upload.
- `Partnership context (if applicable)`

Conditional production needs:

- `I need specific music`
  - `Please add music details`
  - Reference-files upload.
- `I need to use stock material(s)`
  - `I have stock material(s)`
  - `I don't have stock material(s), please help me find`
  - Visible policy copy limits stock to royalty-free material and says editorial stock cannot be used across SCJ communications.
- `I need a VO recording`
  - `Market / language`
  - `Casting brief (number of talents / gender / tone / age)`
  - `Buyout details (country, media and usage information)`
  - Helper copy references duration, geography, media and usage, for example one-year global online and TVC.
- `I require translation`
  - `Market / language`
  - `Instructions`
  - Copy-document upload, if applicable.
- `Other notes`
- `Other attachments` - file upload.

#### Request type: ACCELERATE

The checked parent option is `ACCELERATE`. Its visible description says this brief focuses on creation and/or adaptation of existing e-commerce and Shopper BTL assets for partner and retail channels.

Visible deliverable groups and dependencies:

- `eComm (digital retailer pages assets)`
  - `Asset subtype` - required select: `Base+ tiles`, `Beauty Shots`, `Brand store assets`, `Collection video`.
  - BOS Vizit folder link, if applicable.
  - Helper copy says digital e-commerce retailer assets must be tested in Vizit with appropriate benchmarks and audiences for each brand.
- `eComm Video (Adaptation for retail platforms)`
  - `Please describe the work we need to do and provide specs`
- `Shopper (digital or print)`
  - `Media, and printed non-displays`
  - `3D display`

Visible supporting inputs:

- Completed asset matrix - file upload.
- `Please describe the work we need to do`
- Creative references, examples or additional supporting materials - add-link control and file upload.
- `Partnership context (if applicable)`
- `I need to use stock material(s)` with the same two stock-availability choices and royalty-free policy shown in EVOLVE.
- `I require translation`
  - `Market / language`
  - `Instructions`
  - Copy-document upload, if applicable.
- `Other notes`
- `Adapt instructions` - file upload.
- `Complete Marketing Copy Instructions if applicable and upload below` - file upload.

#### Request type: INNOVATE

The checked parent option is `INNOVATE`. Its visible description says this brief focuses on net-new assets to support NPD content at scale.

Visible asset-type checkboxes:

- `KV`
- `PDP assets`
- `B+ tiles`
- `Brand page content`
- `In store display`
- `HTVs/sponsored brand videos`
- `Social post`

Visible supporting inputs:

- Completed asset matrix - file upload.
- `Please describe the work we need to do`
- Creative references, examples or additional supporting materials - add-link control and file upload.

#### Request type: .com Copy Optimization

The checked parent option is `.com Copy Optimization`. Its visible description says the brief focuses on copy-optimization requests for `.Com`.

Visible deliverables and services:

- `Knowledge Base Documentation`
  - File upload for tone-of-voice guidelines, product information and legal considerations.
- `Service Needed`
  - `Copy Optimization` - add links to online articles to update.
  - `FAQ creation` - add links to online articles for which FAQs should be created.
  - `New Article Review` - upload a document with new articles to review and check for LLM friendliness.

#### Other request types

- `QR Generation Request`
  - Upload the completed `QR Template form`.
- `Delivery only`
  - No dependent field is visible in the supplied capture.

### 03 - Delivery type

The section asks the requester to select all delivery methods that apply.

#### Direct delivery destinations

- `Directly to vendor / 3rd party`
  - `Delivery instructions & contact details`
  - Instructions upload.
- `Directly to media agency`
  - `Delivery instructions & contact details`
  - Instructions upload.
- `Directly to SCJ marketer (master files only)`
  - No dependent field is visible in the supplied capture.

#### Extreme Reach (TVC)

- `First air date`
- `End air date`
- Media plan: file upload and add-link control.
- `Pre-clearance requirement`
- `Clearance requirement`
- Local-clearance information upload.

#### Social posting (4C / Organic / YouTube)

- `YouTube`
  - Copy instructions per asset, with examples including title, description and posting dates.
  - File upload.
- `Social`
  - Post instructions per asset, with examples including post copy and posting dates.
  - File upload.
- `Other`
  - `Please provide all the required information for each asset`

#### Digital Shopper

- `Please provide copy instructions per each asset`

#### Ecomm (Example: Salsify)

- Delivery-details template upload.
- `Should assets append or replace existing assets?`
  - `Should assets appear in a specific order?`
- Property selections:
  - `Base (Front, Back, Left, Right Packshots, Hero, Hero Mobile)`
  - `Base+ (Base+, Base+ Target, Base+ Walmart, etc.)`
  - `Enhanced content (Preview, Enhanced Content)`
  - `eRetailer specific (Hero Amazon, Hero Walmart)`
- `Delivery instructions (if applicable)`
- File upload.

#### Other Delivery need

- `Delivery instructions & contact details`
- Instructions upload.

#### Editable-file requirement

- `Will you require open (editable) files?`
  - `Yes, I need open files`
  - `No, I don't need open files`
- Visible note: final assets will be uploaded to BOS as they are approved.

### 04 - Additional notes and attachments

- `Notes` - optional free-text field.
- `Attachment(s)` - file upload.
- Add-link control.

### Form actions

- `Cancel`
- `Save as draft`
- `Submit`

## Conditional-field rules captured so far

- Parent checkboxes reveal nested deliverables, supporting questions, uploads or link inputs.
- Multiple request types or asset groups may remain in one brief when they belong to the same campaign or brand.
- Delivery methods are explicitly multi-select (`Please select all that apply`).
- Nested checkbox groups can have more than one selected child.
- Stock availability and editable-file requirements use mutually exclusive radio choices.
- The deconstructed master diagram defines the `Asset subtype` catalog and the translation market/language catalog (`US_EN`, `US_ES`, `CA_EN`, `CA_FR`, `PR_ES`, `PR_EN`, `DO_ES`, `Other`).
- Required status should only be assumed where an asterisk is visible; conditional requiredness is not fully established by this capture.

## Current clarification status

- The initial product concept, first-stage boundary and assistant decision policy have no unresolved questions at the current level of definition.

## Deferred technical information not required for the current first-stage definition

The user confirmed that the following integration details are not necessary for the work currently being defined. They remain recorded only for a possible future production integration:

- A submitted ticket example showing the ticket ID and final order state.
- A real exported order PDF to compare its structure with the editable form.
- Canonical backend field IDs, API names, option values and data types.
- Exact rules for which parent selections reveal or require each child.
- Whether request types are single-select or multi-select in normal use.
- Validation behavior for emails, dates, asset counts, links, uploads and required conditional fields.
- File limits, accepted formats, storage locations and attachment metadata.
- Comment data model, including field references, threading, authorship, mentions, timestamps, resolution and export behavior.
- Draft, submit, edit, approval and resubmission lifecycle states.
- Permissions by role: client/marketer, approver, reviewer, PM/Producer and administrator.
- Whether the export preserves hidden fields, unanswered fields, comments and attachment links.
- Integration mechanism: API, webhook, polling, export ingestion or another Workspace capability.

## Decisions and assumptions log

### 2026-09-01

- Created this context-control document after reviewing all eight pages of the supplied capture.
- Recorded the visible schema and parent-child relationships without changing the application.
- Treated checked boxes as a way to expose the complete form, not as real customer selections.
- Separated user-reported post-submission behavior from behavior directly visible in the capture.
- Reviewed five additional Storefront and guidance captures totaling six pages.
- Added the observed navigation, Storefront structure, four-pillar taxonomy, Monks team responsibilities, five-stage workflow, National Campaign cart flow and Workspace/BOS tool boundary.
- Kept the cart's operational status unresolved because the guidance simultaneously shows a cart workflow and labels the feature `Coming soon`.
- Omitted visible employee email addresses from this context document while retaining role and business-area coverage.
- Recorded the new product direction: a Workspace replica whose brief intake is driven by a Gemini assistant instead of the long field-by-field form.
- Captured the dual entry routes from free intent or a Storefront reference, the option-first interaction principle, dynamic completeness checking and resumable draft requirement.
- Documented inferred design implications separately from confirmed requirements and added the unresolved product decisions that need user clarification.
- Confirmed the first-stage boundary and deferred asset review, approval, delivery and client-reviewer communication to a second stage.
- Confirmed progressive form disclosure, submission with explicit pending items, no Gemini-invented data, final structured review, same-campaign-or-brand grouping, inheritance from the captured Storefront examples, English-only UX, grouped related questions and collaborative drafts.
- Confirmed that Gemini may recommend a likely pillar or route from the user's description, provided the user explicitly confirms or changes it; this does not permit Gemini to invent brief facts.
- Implemented the first visible brief-entry screen with an English work-description prompt, selectable starter examples, three-stage orientation and a disabled-until-input `Continue` action.
- Kept the previous long-form prototype in the codebase as an unmounted legacy component so it is not visible in the current application.
- Did not connect Gemini, create a Gemini prompt, route to later questions or expose other Workspace surfaces.
- Deferred all implementation, architecture and UI decisions until more direction is provided.

### 2026-09-02

- Replaced the visible work-description entry point with a deterministic, option-first brief-foundation wizard.
- Gave each field or related option group a dedicated screen and exposed choices as visible cards instead of dropdown selectors.
- Added automatic advance for single-select answers, explicit continuation for multi-select answers and back navigation with retained selections.
- Replaced the initial CSS-only entrance with an alpha-only GSAP stagger across the panel's internal elements while keeping the panel fixed and preventing repeat clicks during motion.
- Implemented the documented conditional choice branches for request routes, deliverable families, production needs, delivery methods, delivery destinations/properties, editable files and relevant dates.
- Kept `Asset subtype` and `Market/language` out of the current choice flow because the supplied documentation does not reveal their option catalogs.

### 2026-09-22

- Corrected the earlier interpretation above after auditing `SCJ NACB - Workspace Brief Intake Form - Deconstructed.pdf`: the master diagram does enumerate both catalogs.
- Replaced the open `Asset subtype` and translation `Market/language` fields with constrained option controls using the diagram's values.
- Preserved the previous entry screen and long-form prototype as exported but unmounted components.
- Kept Gemini, its system instruction, authentication, persistence and ticket submission disconnected.
- Confirmed Google Cloud project `scj-nacb-transfor-ai`, `global` location, local-only execution and `LOW` thinking level.
- Selected `gemini-3.5-flash-lite` instead of the near-retirement `gemini-2.5-flash` model for the initial integration.
- Installed the official `@google/genai` SDK and added a server-only local diagnostic endpoint using Application Default Credentials.
- Verified that the Vertex AI API is enabled and that ADC can access `gemini-3.5-flash-lite` in the configured project through a non-generative `countTokens` request.
- Kept the assistant prompt and browser-to-Gemini conversation disconnected pending the next implementation step.
