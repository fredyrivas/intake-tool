import JSZip from 'jszip';
import { posix } from 'node:path';
import {
  presentationMimeType,
  spreadsheetMimeType,
  type Attachment,
} from '../shared/brief-contract.ts';

const MAX_EXTRACTED_CHARACTERS = 120_000;
const MAX_PRESENTATION_IMAGES = 24;
const MAX_PRESENTATION_IMAGE_BYTES = 8 * 1024 * 1024;

export type PresentationImage = { slides: number[]; mimeType: string; data: string };

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<(?:a:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a:)?t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('')
    .trim();
}

function bounded(value: string) {
  if (value.length <= MAX_EXTRACTED_CHARACTERS) return value;
  return `${value.slice(0, MAX_EXTRACTED_CHARACTERS)}\n[Content truncated after ${MAX_EXTRACTED_CHARACTERS.toLocaleString()} characters]`;
}

async function extractPowerPoint(zip: JSZip) {
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, match: path.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((entry): entry is { path: string; match: RegExpMatchArray } => Boolean(entry.match))
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

  const output: string[] = [];
  for (const slide of slides) {
    const xml = await zip.file(slide.path)!.async('string');
    const runs = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXml(match[1]).trim())
      .filter(Boolean);
    if (runs.length) output.push(`[Slide ${slide.match[1]}]\n${runs.join(' | ')}`);
  }
  return bounded(output.join('\n\n'));
}

export async function extractPowerPointImages(document: Attachment): Promise<PresentationImage[]> {
  if (document.mimeType !== presentationMimeType) return [];
  const zip = await JSZip.loadAsync(Buffer.from(document.data, 'base64'));
  const images = new Map<string, PresentationImage>();
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, number: Number(path.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((slide) => Number.isInteger(slide.number) && slide.number > 0)
    .sort((a, b) => a.number - b.number);
  let totalBytes = 0;

  for (const slide of slides) {
    const xml = await zip.file(slide.path)!.async('string');
    const ids = new Set(
      [...xml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)].map((match) => match[1]),
    );
    if (!ids.size) continue;
    const relationships = await zip
      .file(`ppt/slides/_rels/slide${slide.number}.xml.rels`)
      ?.async('string');
    for (const match of relationships?.matchAll(/<Relationship\b([^>]*)\/?\s*>/g) || []) {
      const id = match[1].match(/\bId="([^"]+)"/)?.[1];
      const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
      if (!id || !ids.has(id) || !target) continue;
      const path = posix.normalize(
        target.startsWith('/') ? target.slice(1) : posix.join('ppt/slides', target),
      );
      if (!path.startsWith('ppt/media/')) continue;
      const mimeType = /\.png$/i.test(path)
        ? 'image/png'
        : /\.jpe?g$/i.test(path)
          ? 'image/jpeg'
          : null;
      if (!mimeType) continue;
      const existing = images.get(path);
      if (existing) {
        if (!existing.slides.includes(slide.number)) existing.slides.push(slide.number);
        continue;
      }
      if (images.size >= MAX_PRESENTATION_IMAGES) continue;
      const file = zip.file(path);
      if (!file) continue;
      const bytes = await file.async('nodebuffer');
      if (
        (mimeType === 'image/png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') ||
        (mimeType === 'image/jpeg' && bytes.subarray(0, 3).toString('hex') !== 'ffd8ff')
      )
        continue;
      if (totalBytes + bytes.length > MAX_PRESENTATION_IMAGE_BYTES) continue;
      totalBytes += bytes.length;
      images.set(path, { slides: [slide.number], mimeType, data: bytes.toString('base64') });
    }
  }
  return [...images.values()];
}

async function workbookSheetNames(zip: JSZip) {
  const workbook = await zip.file('xl/workbook.xml')?.async('string');
  const relationships = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const targets = new Map<string, string>();

  for (const match of relationships?.matchAll(/<Relationship\b([^>]*)\/?\s*>/g) || []) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) {
      const normalized = target.replace(/^\//, '');
      targets.set(id, normalized.startsWith('xl/') ? normalized : `xl/${normalized}`);
    }
  }

  const names = new Map<string, string>();
  for (const match of workbook?.matchAll(/<sheet\b([^>]*)\/?\s*>/g) || []) {
    const name = match[1].match(/\bname="([^"]+)"/)?.[1];
    const id = match[1].match(/\br:id="([^"]+)"/)?.[1];
    const target = id ? targets.get(id) : undefined;
    if (name && target) names.set(target, decodeXml(name));
  }
  return names;
}

async function extractExcel(zip: JSZip) {
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedXml
    ? [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
        textNodes(match[1]),
      )
    : [];
  const names = await workbookSheetNames(zip);
  const sheets = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const output: string[] = [];

  for (const path of sheets) {
    const xml = await zip.file(path)!.async('string');
    const cells: string[] = [];
    for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = match[1];
      const body = match[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1];
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      const inline = textNodes(body);
      let value = inline;
      if (raw !== undefined) {
        const decoded = decodeXml(raw).trim();
        value = type === 's' ? sharedStrings[Number(decoded)] || decoded : decoded;
      }
      if (reference && value) cells.push(`${reference}: ${value}`);
    }
    if (cells.length)
      output.push(`[Sheet: ${names.get(path) || path.split('/').pop()}]\n${cells.join('\n')}`);
  }
  return bounded(output.join('\n\n'));
}

export async function extractOfficeText(document: Attachment) {
  if (![presentationMimeType, spreadsheetMimeType].includes(document.mimeType)) return null;
  const zip = await JSZip.loadAsync(Buffer.from(document.data, 'base64'));
  const content =
    document.mimeType === presentationMimeType
      ? await extractPowerPoint(zip)
      : await extractExcel(zip);
  if (!content.trim() && document.mimeType !== presentationMimeType)
    throw new Error(`No readable text was found in ${document.name}.`);
  return content;
}
