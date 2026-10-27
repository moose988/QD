// tests/helpers/fake-firestore.mjs
// Just enough of the Firestore admin API for api/chat.js: collection/doc/add/set/where/limit/get/batch.
// FieldValue sentinels from firebase-admin are stored as-is (tests only inspect plain fields).

export function createFakeFirestore() {
  const store = new Map(); // path -> data
  let auto = 0;
  const writes = [];

  const docRef = (path) => ({
    id: path.split('/').pop(),
    path,
    collection: (name) => collectionRef(`${path}/${name}`),
    async set(data, opts) {
      writes.push({ op: 'set', path, data });
      store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : { ...data });
    },
    async update(data) {
      if (!store.has(path)) throw new Error(`No document to update: ${path}`);
      writes.push({ op: 'update', path, data });
      store.set(path, { ...store.get(path), ...data });
    },
    async get() {
      return { exists: store.has(path), data: () => store.get(path) };
    },
  });

  const collectionRef = (path) => {
    const query = (filters = [], max = Infinity) => ({
      where: (field, op, value) => query([...filters, [field, op, value]], max),
      limit: (n) => query(filters, n),
      async get() {
        const docs = [];
        for (const [p, data] of store) {
          if (!p.startsWith(`${path}/`) || p.slice(path.length + 1).includes('/')) continue;
          if (filters.every(([f, , v]) => data[f] === v)) docs.push({ id: p.split('/').pop(), data: () => data, ref: docRef(p) });
          if (docs.length >= max) break;
        }
        return { docs, size: docs.length, empty: !docs.length };
      },
    });
    return {
      ...query(),
      doc: (id) => docRef(`${path}/${id || `auto${(auto += 1)}`}`),
      async add(data) {
        const ref = docRef(`${path}/auto${(auto += 1)}`);
        await ref.set(data);
        return ref;
      },
    };
  };

  return {
    store,
    writes,
    collection: collectionRef,
    batch() {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
        async commit() {
          for (const op of ops) await op();
        },
      };
    },
    docsIn(path) {
      return [...store.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')).map(([, d]) => d);
    },
  };
}
