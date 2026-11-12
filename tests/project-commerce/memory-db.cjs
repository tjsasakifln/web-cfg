'use strict';
const copy = value => value === undefined ? undefined : structuredClone(value);
function memoryDb() {
  const records = new Map();
  let queue = Promise.resolve();
  const snap = (ref, value) => ({ id: ref.path.split('/').at(-1), ref, exists: value !== undefined,
    data: () => copy(value), get: key => copy(value?.[key]) });
  const doc = path => ({ path, collection: kind => collection(`${path}/${kind}`),
    get: async () => snap(doc(path), records.get(path)) });
  const collection = (path, filters = [], ordering = null, max = Infinity, after = null) => ({
    path, doc: id => doc(`${path}/${id}`),
    where: (key, op, value) => collection(path, [...filters, [key, op, value]], ordering, max, after),
    orderBy: key => collection(path, filters, key, max, after),
    limit: value => collection(path, filters, ordering, value, after),
    startAfter: value => collection(path, filters, ordering, max, value),
    async get() {
      let rows = [...records.entries()].filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'));
      rows = rows.filter(([, row]) => filters.every(([key, op, value]) => op === '>=' ? row[key] >= value : op === '<' ? row[key] < value : row[key] === value));
      if (ordering) rows.sort((a, b) => a[1][ordering] - b[1][ordering] || a[0].localeCompare(b[0]));
      if (after) rows = rows.slice(rows.findIndex(([key]) => key === after.ref.path) + 1);
      const docs = rows.slice(0, max).map(([key, value]) => snap(doc(key), value));
      return { docs, size: docs.length, empty: !docs.length };
    }
  });
  return { records, collection,
    runTransaction(fn) {
      const operation = queue.then(async () => {
        const writes = [];
        const tx = { get: async ref => snap(ref, records.get(ref.path)),
          create: (ref, data) => writes.push(['create', ref.path, copy(data)]),
          set: (ref, data) => writes.push(['set', ref.path, copy(data)]),
          update: (ref, data) => writes.push(['update', ref.path, copy(data)]) };
        const value = await fn(tx);
        const next = new Map(records);
        for (const [op, key, data] of writes) {
          if (op === 'create' && next.has(key)) throw new Error('ALREADY_EXISTS');
          if (op === 'update' && !next.has(key)) throw new Error('NOT_FOUND');
          next.set(key, op === 'update' ? { ...next.get(key), ...data } : data);
        }
        records.clear(); for (const entry of next) records.set(...entry);
        return value;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
module.exports = { memoryDb };
