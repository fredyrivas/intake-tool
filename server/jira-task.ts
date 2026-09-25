import { createHash } from 'node:crypto';
import type { Attachment, Values } from '../shared/brief-contract.ts';
import type { DriveRecord } from './drive-record.ts';

export type JiraBrief = {
  id: string;
  name: string;
  draft: { values?: Values };
  documents: Attachment[];
};

export type JiraPreview = {
  briefId: string;
  fingerprint: string;
  summary: string;
  dueDate: string | null;
  labels: string[];
  rows: { label: string; value: string; url?: string }[];
  warnings: string[];
  description: {
    type: 'doc';
    version: 1;
    content: Array<Record<string, unknown>>;
  };
};

function slug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function paragraph(row: JiraPreview['rows'][number]) {
  const valueContent = row.value.split('\n').flatMap((line, index) => [
    ...(index ? [{ type: 'hardBreak' }] : []),
    ...(line
      ? [
          {
            type: 'text',
            text: `${index ? '' : ' '}${line}`,
            ...(row.url ? { marks: [{ type: 'link', attrs: { href: row.url } }] } : {}),
          },
        ]
      : []),
  ]);
  return {
    type: 'paragraph',
    content: [
      { type: 'text', text: `${row.label}:`, marks: [{ type: 'strong' }] },
      ...valueContent,
    ],
  };
}

export function buildJiraPreview(
  brief: JiraBrief,
  drive: DriveRecord,
  intakeToolBaseUrl: string,
  today = new Date().toISOString().slice(0, 10),
): JiraPreview {
  const values = brief.draft.values || {};
  const reviewUrl = `${intakeToolBaseUrl.replace(/\/+$/, '')}/review?brief=${encodeURIComponent(brief.id)}`;
  const rows = [
    { label: 'Workspace Order', value: reviewUrl, url: reviewUrl },
    { label: 'Brief', value: drive.folders.brief.url, url: drive.folders.brief.url },
    {
      label: 'Adapt Matrix',
      value: drive.folders.adaptMatrix.url,
      url: drive.folders.adaptMatrix.url,
    },
    { label: 'Note from client', value: (values.notes || []).join('\n') },
    {
      label: 'Deliverables & Specs',
      value: drive.folders.deliverablesAndSpecs.url,
      url: drive.folders.deliverablesAndSpecs.url,
    },
    {
      label: 'Working Files',
      value: drive.folders.workingFiles.url,
      url: drive.folders.workingFiles.url,
    },
    { label: 'Schedule', value: '' },
    { label: 'Approvers', value: (values.mainApproverEmail || []).join(', ') },
    { label: 'Delivery contacts', value: (values.deliveryTypes || []).join(', ') },
  ];
  const dueDate = values.expectedDeliveryDate?.[0] || null;
  const warnings = [...drive.warnings];
  if (dueDate && dueDate < today) warnings.push(`The delivery date ${dueDate} has passed.`);
  const countries = values.region || [];
  const geographicRegions = countries.some((country) => country === 'USA' || country === 'Canada')
    ? ['North America']
    : [];
  const assetType = values.assetType?.[0];
  const workstream =
    assetType === 'Ecomm' ? 'ECOMM' : assetType === 'Shopper' ? 'SHOPPER' : undefined;
  const labels = [
    ...(values.brand || []).map((brand) => ['brand', brand]),
    ...geographicRegions.map((region) => ['region', region]),
    ...countries.map((country) => ['country', country]),
    ['workstream', workstream],
    ['asset', assetType],
    ...(values.requestTypes || []).map((route) => ['route', route]),
  ]
    .filter((entry): entry is string[] => Boolean(entry[1]))
    .map(([prefix, value]) => `${prefix}-${slug(value)}`);
  labels.push(`intake-brief-${brief.id}`);
  const summary = (values.projectName?.[0] || brief.name || 'Untitled brief').slice(0, 255);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ summary, dueDate, labels, rows, drive: drive.fingerprint }))
    .digest('hex');

  return {
    briefId: brief.id,
    fingerprint,
    summary,
    dueDate,
    labels,
    rows,
    warnings,
    description: {
      type: 'doc',
      version: 1,
      content: rows.map(paragraph),
    },
  };
}
