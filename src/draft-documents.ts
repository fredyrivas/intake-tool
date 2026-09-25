import type { Attachment } from '../shared/brief-contract';

const databaseName = 'monks.workspace-brief';
const storeName = 'draft';
const documentsKey = 'documents.v3';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let value: T;
    transaction.oncomplete = () => {
      database.close();
      resolve(value);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
    action(store, (result) => {
      value = result;
    });
  });
}

export function readDraftDocuments(): Promise<Attachment[] | null> {
  return transact('readonly', (store, resolve) => {
    const request = store.get(documentsKey);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

let pendingWrite = Promise.resolve();

export function writeDraftDocuments(documents: Attachment[]): Promise<void> {
  const write = pendingWrite.then(() =>
    transact<void>('readwrite', (store) => {
      if (documents.length) store.put(documents, documentsKey);
      else store.delete(documentsKey);
    }),
  );
  pendingWrite = write.catch(() => {});
  return write;
}

export function clearDraftDocuments(): Promise<void> {
  return writeDraftDocuments([]);
}
