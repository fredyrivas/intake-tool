// Opt-in integration check. Sends only synthetic fixture data to configured Vertex AI.
import assert from 'node:assert/strict';
const port = process.argv[2] || '5173';
const contents =
  'Synthetic test brief. Project name: Glade Retail Adaptation Test. Retailer: Amazon. Total number of assets: 6. Adapt the existing annual campaign for Amazon product pages. No new production. Required delivery: 2026-10-15.';
// A minimal one-page PDF fixture with explicit, non-personal test content.
const text = contents.replace(/[()\\]/g, '\\$&');
const stream = `BT /F1 10 Tf 36 740 Td (${text}) Tj ET`;
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
  .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const documents = [{ id: 'synthetic-pdf', name: 'synthetic-brief.pdf', mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') }];
const intent = 'Adapt the existing annual campaign for Amazon product pages. Extract the supported title, retailer and count.';
async function analyze(phase, context = null) {
  const response = await fetch(`http://127.0.0.1:${port}/api/brief/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, context, intent, values: {}, documents: documents.map((document) => ({ ...document, data: phase === 'document-reading' ? document.data : '' })), notes: '', message: intent, dispositions: {}, rejected: [] }),
    signal: AbortSignal.timeout(5 * 60_000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
const reading = await analyze('document-reading');
assert.ok(reading.context.latestInteractionId);
const result = await analyze('scope', reading.context);
assert.ok(result.analysis.summary);
assert.ok(
  result.analysis.proposals.some(
    (p) =>
      p.fieldId === 'totalAssets' &&
      p.values[0] === '6' &&
      p.source.documentId === 'synthetic-pdf' &&
      p.source.page === 1,
  ),
  JSON.stringify(result),
);
console.log(
  JSON.stringify(
    {
      status: 200,
      version: result.instructionVersion,
      proposedFields: result.analysis.proposals.map((p) => p.fieldId),
      questions: result.analysis.questions.map((q) => q.fieldId),
      pdfEvidenceVerified: true,
    },
    null,
    2,
  ),
);
