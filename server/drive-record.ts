import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Attachment, Values } from '../shared/brief-contract.ts';

export type DriveFolder = { id: string; url: string };

export type DriveRecord = {
  fingerprint: string;
  root: DriveFolder;
  folders: {
    brief: DriveFolder;
    adaptMatrix: DriveFolder;
    deliverablesAndSpecs: DriveFolder;
    workingFiles: DriveFolder;
  };
  warnings: string[];
};

export function driveFingerprint(brief: {
  name?: string;
  draft?: { values?: Values };
  documents?: Attachment[];
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: brief.name,
        values: brief.draft?.values || {},
        documents: brief.documents || [],
      }),
    )
    .digest('hex');
}

export function driveRecordFile(rootDirectory: string, briefId: string) {
  return path.join(rootDirectory, 'briefs', briefId, 'drive.json');
}

export async function readDriveRecord(rootDirectory: string, briefId: string) {
  try {
    return JSON.parse(
      await readFile(driveRecordFile(rootDirectory, briefId), 'utf8'),
    ) as DriveRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
