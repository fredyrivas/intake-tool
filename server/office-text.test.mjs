import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractOfficeText, extractPowerPointImages } from './office-text.ts';

const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('extracts PowerPoint text with slide locators', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Second slide</a:t></p:sld>');
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Ziploc Holiday</a:t><a:t>FY27</a:t></p:sld>');
  const data = await zip.generateAsync({ type: 'base64' });
  const result = await extractOfficeText({
    id: 'pptx',
    name: 'brief.pptx',
    mimeType: pptxMime,
    data,
  });

  assert.match(result, /^\[Slide 1\]\nZiploc Holiday \| FY27/);
  assert.match(result, /\[Slide 2\]\nSecond slide/);
});

test('sends only images embedded on PowerPoint slides with their slide locators', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:blip r:embed="rId1"/></p:sld>');
  zip.file('ppt/slides/slide2.xml', '<p:sld><a:blip r:embed="rId2"/></p:sld>');
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    '<Relationships><Relationship Id="rId1" Target="../media/logo.png"/></Relationships>',
  );
  zip.file(
    'ppt/slides/_rels/slide2.xml.rels',
    '<Relationships><Relationship Id="rId2" Target="../media/logo.png"/></Relationships>',
  );
  const logo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlTvZkAAAAASUVORK5CYII=',
    'base64',
  );
  zip.file('ppt/media/logo.png', logo);
  zip.file('ppt/media/unreferenced.jpg', Buffer.from('unused'));
  const document = {
    id: 'pptx',
    name: 'brief.pptx',
    mimeType: pptxMime,
    data: await zip.generateAsync({ type: 'base64' }),
  };

  assert.equal(await extractOfficeText(document), '');
  assert.deepEqual(await extractPowerPointImages(document), [
    { slides: [1, 2], mimeType: 'image/png', data: logo.toString('base64') },
  ]);
});

test('extracts Excel shared strings with sheet and cell locators', async () => {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook><sheets><sheet name="CTV" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Platform</t></si><si><t>YouTube</t></si></sst>');
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>',
  );
  const data = await zip.generateAsync({ type: 'base64' });
  const result = await extractOfficeText({
    id: 'xlsx',
    name: 'matrix.xlsx',
    mimeType: xlsxMime,
    data,
  });

  assert.equal(result, '[Sheet: CTV]\nA1: Platform\nA2: YouTube');
});
