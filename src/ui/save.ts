// One save slot in IndexedDB (a fortress is a few MB of JSON: too big for localStorage).
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('strike-the-earth', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
export async function writeSave(json: string): Promise<void> {
  const d = await db();
  return new Promise((ok, fail) => {
    const tx = d.transaction('saves', 'readwrite');
    tx.objectStore('saves').put(json, 'slot1');
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
  });
}
export async function loadSave(): Promise<string | null> {
  const d = await db();
  return new Promise((ok, fail) => {
    const r = d.transaction('saves').objectStore('saves').get('slot1');
    r.onsuccess = () => ok((r.result as string) || null);
    r.onerror = () => fail(r.error);
  });
}
