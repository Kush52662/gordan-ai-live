import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import 'server-only';
import { developmentAccessEnabled } from './development-access';
import { firestore } from './firebase-admin';
import type { Owner } from './identity';
import { type Kitchen, type Recipe, emptyKitchen, transition } from './model';

// Development-only durable storage. Production stays closed until authenticated
// Firestore access is configured; never silently fall back to a public test user.
export function assertLocalDevelopment() {
  if (!developmentAccessEnabled())
    throw new Error('Kitchen is unavailable until production authentication is configured.');
}
const file = path.join(process.cwd(), '.gordon-data', 'development-kitchen.json');
let pending: Promise<unknown> = Promise.resolve();
export async function readKitchen(owner: Owner): Promise<Kitchen> {
  if (!owner.development) {
    const db = firestore();
    const root = db.collection('cooks').doc(owner.uid);
    return db.runTransaction(async (tx) => {
      const [saved, recipes] = await Promise.all([
        tx.get(root.collection('state').doc('kitchen')),
        tx.get(root.collection('recipes')),
      ]);
      return {
        ...emptyKitchen(),
        ...saved.data(),
        recipes: recipes.docs.map((doc) => doc.data() as Recipe),
      };
    });
  }
  assertLocalDevelopment();
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Kitchen;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyKitchen();
    throw e;
  }
}
export function changeKitchen(owner: Owner, command: unknown): Promise<Kitchen> {
  if (!owner.development) {
    const db = firestore();
    const root = db.collection('cooks').doc(owner.uid);
    const stateRef = root.collection('state').doc('kitchen');
    return db.runTransaction(async (tx) => {
      const [saved, recipes] = await Promise.all([
        tx.get(stateRef),
        tx.get(root.collection('recipes')),
      ]);
      const before: Kitchen = {
        ...emptyKitchen(),
        ...saved.data(),
        recipes: recipes.docs.map((doc) => doc.data() as Recipe),
      };
      const after = transition(before, command);
      if (after === before) return before;
      const { recipes: updated, ...state } = after;
      tx.set(stateRef, state);
      for (const recipe of updated)
        if (before.recipes.find((r) => r.id === recipe.id)?.version !== recipe.version)
          tx.set(root.collection('recipes').doc(recipe.id), recipe);
      return after;
    });
  }
  assertLocalDevelopment();
  const work = pending.then(async () => {
    const before = await readKitchen(owner);
    const after = transition(before, command);
    if (after === before) return after;
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(after), { mode: 0o600 });
    await rename(temp, file);
    return after;
  });
  pending = work.catch(() => undefined);
  return work;
}

// One revision notification triggers one consistent transactional snapshot.
export async function watchKitchen(
  owner: Owner,
  changed: () => void,
  failed: (error: unknown) => void
) {
  if (!owner.development) {
    return firestore()
      .collection('cooks')
      .doc(owner.uid)
      .collection('state')
      .doc('kitchen')
      .onSnapshot(changed, failed);
  }
  assertLocalDevelopment();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const { watch } = await import('node:fs');
  const watcher = watch(path.dirname(file), () => changed());
  watcher.on('error', failed);
  queueMicrotask(changed);
  return () => watcher.close();
}
