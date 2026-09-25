export type BriefPdfRow = {
  label: string;
  value: string;
  unresolved?: boolean;
  requirement?: 'Required' | 'Optional';
  status?: 'Complete' | 'Pending' | 'Missing' | 'Not applicable';
};

export type BriefPdfInput = {
  projectName: string;
  summary: string;
  status: string;
  rows: BriefPdfRow[];
  generatedAt?: Date;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 48;
const contentWidth = pageWidth - margin * 2;

const cp1252: Record<number, number> = {
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2026: 0x85,
};

function pdfText(value: string) {
  return Array.from(value.normalize('NFC'))
    .map((character) => {
      const code = character.codePointAt(0) || 63;
      const encoded = code <= 255 ? code : cp1252[code] || 63;
      const byte = String.fromCharCode(encoded);
      return byte === '\\' || byte === '(' || byte === ')' ? `\\${byte}` : byte;
    })
    .join('');
}

function textWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((total, character) => {
    if (character === ' ') return total + fontSize * 0.28;
    if (/[ilI.,'!:;]/.test(character)) return total + fontSize * 0.26;
    if (/[MW@%]/.test(character)) return total + fontSize * 0.82;
    return total + fontSize * 0.52;
  }, 0);
}

function wrapText(value: string, fontSize: number, maxWidth: number) {
  const paragraphs = value.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (textWidth(word, fontSize) <= maxWidth) {
        line = word;
        continue;
      }
      let fragment = '';
      for (const character of word) {
        if (fragment && textWidth(fragment + character, fontSize) > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else fragment += character;
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function textCommand(
  value: string,
  x: number,
  y: number,
  size: number,
  font: 'F1' | 'F2' = 'F1',
  color = '0.09 0.09 0.09',
) {
  return `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`;
}

function binaryLength(value: string) {
  return value.length;
}

function binaryBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index);
  return bytes;
}

export function createBriefSummaryPdf(input: BriefPdfInput) {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;

  const startPage = (continued = false) => {
    commands = [
      '0.09 0.09 0.09 rg 0 714 612 78 re f',
      '0.56 0.33 0.84 rg 48 714 6 78 re f',
      textCommand('WORKSPACE', 66, 758, 8, 'F2', '0.73 0.61 0.88'),
      textCommand(
        continued ? 'Brief summary - continued' : 'Brief summary',
        66,
        733,
        22,
        'F2',
        '1 1 1',
      ),
    ];
    pages.push(commands);
    y = 683;
  };

  const ensureSpace = (height: number) => {
    if (y - height >= 64) return;
    startPage(true);
  };

  const addWrappedText = (
    value: string,
    size: number,
    lineHeight: number,
    options: { font?: 'F1' | 'F2'; color?: string; indent?: number } = {},
  ) => {
    const indent = options.indent || 0;
    for (const line of wrapText(value, size, contentWidth - indent)) {
      ensureSpace(lineHeight);
      commands.push(textCommand(line, margin + indent, y, size, options.font, options.color));
      y -= lineHeight;
    }
  };

  startPage();
  addWrappedText(input.projectName || 'Untitled brief', 17, 21, { font: 'F2' });
  y -= 3;
  commands.push(textCommand(input.status, margin, y, 9, 'F2', '0.42 0.20 0.69'));
  const generatedAt = input.generatedAt || new Date();
  commands.push(
    textCommand(
      `Generated ${generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      pageWidth - margin - 170,
      y,
      8,
      'F1',
      '0.38 0.38 0.38',
    ),
  );
  y -= 25;
  commands.push(textCommand('OVERVIEW', margin, y, 8, 'F2', '0.42 0.20 0.69'));
  y -= 17;
  addWrappedText(input.summary || 'Review the structured information below.', 10, 15, {
    color: '0.25 0.25 0.25',
  });
  y -= 15;
  ensureSpace(30);
  commands.push(textCommand('BRIEF DETAILS', margin, y, 8, 'F2', '0.42 0.20 0.69'));
  y -= 19;

  for (const row of input.rows) {
    ensureSpace(42);
    addWrappedText(
      [row.label.toUpperCase(), row.requirement?.toUpperCase(), row.status?.toUpperCase()]
        .filter(Boolean)
        .join(' | '),
      7.5,
      11,
      {
        font: 'F2',
        color: '0.40 0.40 0.40',
      },
    );
    addWrappedText(row.value, 10, 14, {
      font: 'F2',
      color: row.unresolved ? '0.62 0.36 0.05' : '0.09 0.09 0.09',
    });
    y -= 7;
    commands.push(`0.90 0.89 0.87 RG 0.5 w ${margin} ${y} m ${pageWidth - margin} ${y} l S`);
    y -= 12;
  }

  pages.forEach((page, index) => {
    page.push(
      textCommand(
        `Workspace brief summary  |  ${index + 1} of ${pages.length}`,
        margin,
        35,
        7.5,
        'F1',
        '0.48 0.48 0.48',
      ),
    );
  });

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = `${page.join('\n')}\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${binaryLength(stream)} >>\nstream\n${stream}endstream`);
  });

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(binaryLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = binaryLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return binaryBytes(pdf);
}

export function downloadBriefSummaryPdf(input: BriefPdfInput) {
  const bytes = createBriefSummaryPdf(input);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeProjectName = (input.projectName || 'brief')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  link.href = url;
  link.download = `${safeProjectName || 'brief'}-summary.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
