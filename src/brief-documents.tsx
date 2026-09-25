import { useId, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { acceptedFileMimeType, fileLimits, type Attachment } from '../shared/brief-contract';

export function BriefDocuments({
  documents,
  setDocuments,
  disabled = false,
  onReadingChange,
  onFilesAdded,
  compact = false,
  showDocuments = true,
}: {
  documents: Attachment[];
  setDocuments: Dispatch<SetStateAction<Attachment[]>>;
  disabled?: boolean;
  onReadingChange?: (reading: boolean) => void;
  onFilesAdded?: (documents: Attachment[]) => void;
  compact?: boolean;
  showDocuments?: boolean;
}) {
  const inputId = useId();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setError('');
    setNotice('');
    setReading(true);
    onReadingChange?.(true);
    try {
      const filesWithMimeTypes = files.map((file) => ({
        file,
        mimeType: acceptedFileMimeType(file.name, file.type),
      }));
      if (
        filesWithMimeTypes.some(
          ({ file, mimeType }) => !mimeType || !file.size || file.size > fileLimits.each,
        )
      )
        throw new Error(
          'Use up to 6 PDF, PPTX, XLSX, TXT, PNG or JPEG files. Maximum 8 MB per file and 15 MB total.',
        );
      const candidates = await Promise.all(
        filesWithMimeTypes.map(async ({ file, mimeType }) => ({
          size: file.size,
          attachment: {
            id: crypto.randomUUID(),
            name: file.name.slice(0, 200),
            mimeType: mimeType!,
            data: await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1]);
              reader.onerror = () =>
                reject(new Error('Could not read this file. Please try again.'));
              reader.readAsDataURL(file);
            }),
          } satisfies Attachment,
        })),
      );

      const knownContent = new Set(documents.map((document) => document.data));
      const duplicates: string[] = [];
      const uniqueCandidates = candidates.filter(({ attachment }) => {
        if (knownContent.has(attachment.data)) {
          duplicates.push(attachment.name);
          return false;
        }
        knownContent.add(attachment.data);
        return true;
      });
      const added = uniqueCandidates.map(({ attachment }) => attachment);

      if (
        documents.length + added.length > fileLimits.count ||
        documents.reduce((total, document) => total + document.data.length * 0.75, 0) +
          uniqueCandidates.reduce((total, candidate) => total + candidate.size, 0) >
          fileLimits.total
      )
        throw new Error(
          'Use up to 6 PDF, PPTX, XLSX, TXT, PNG or JPEG files. Maximum 8 MB per file and 15 MB total.',
        );

      if (duplicates.length) {
        setNotice(
          `${duplicates.length === 1 ? 'This file is' : 'These files are'} already uploaded and ${duplicates.length === 1 ? 'was' : 'were'} not added again: ${duplicates.join(', ')}.`,
        );
      }
      if (!added.length) return;
      setDocuments((current) => [...current, ...added]);
      onFilesAdded?.(added);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add these files.');
    } finally {
      setReading(false);
      onReadingChange?.(false);
    }
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || reading) return;
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        type="file"
        className="sr-only"
        multiple
        accept="application/pdf,text/plain,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pptx,.xlsx"
        disabled={disabled || reading}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          void addFiles(files);
        }}
      />
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !reading) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={handleDrop}
        className={`flex items-center border border-dashed transition-colors ${
          compact ? 'min-h-16 gap-3 rounded-xl p-3' : 'min-h-28 gap-4 rounded-2xl p-4 sm:p-5'
        } ${
          disabled || reading
            ? 'cursor-wait border-black/10 bg-black/[0.025] opacity-65'
            : dragging
              ? 'cursor-copy border-[#7b3fc4] bg-[#f4edfc]'
              : 'cursor-pointer border-[#8e54d7]/40 bg-[#faf7ff] hover:border-[#7b3fc4] hover:bg-[#f7f1fd]'
        }`}
      >
        <span
          className={`grid shrink-0 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6] ${compact ? 'size-9' : 'size-11'}`}
        >
          {reading ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#222]">
            {reading
              ? 'Adding files…'
              : dragging
                ? 'Drop files here'
                : compact
                  ? 'Upload or drop files for this field'
                  : 'Drop files here or click to browse'}
          </span>
          {compact ? (
            <span className="mt-0.5 block text-[11px] leading-4 text-black/40">
              PDF, PPTX, XLSX, TXT, PNG or JPEG · 8 MB each
            </span>
          ) : (
            <>
              <span className="mt-1 block text-xs leading-5 text-black/45">
                Optional, now or later · PDF, PPTX, XLSX, TXT, PNG or JPEG
              </span>
              <span className="block text-[11px] leading-4 text-black/35">
                Up to 6 files · 8 MB each · 15 MB total
              </span>
            </>
          )}
        </span>
      </label>
      {reading && (
        <span role="status" className="sr-only">
          Reading files…
        </span>
      )}
      {error && (
        <p role="alert" className="text-xs leading-5 text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs leading-5 text-amber-800">
          {notice}
        </p>
      )}
      {showDocuments ? (
        <ul className="space-y-2" aria-label="Attached files">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm"
            >
              <FileText className="size-4 shrink-0 text-[#6f35b6]" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {d.name}
              </span>
              <button
                type="button"
                disabled={disabled || reading}
                aria-label={`Remove ${d.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-full text-black/40 hover:bg-black/5 hover:text-black disabled:opacity-40"
                onClick={() =>
                  setDocuments((current) => current.filter((file) => file.id !== d.id))
                }
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
