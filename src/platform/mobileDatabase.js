import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DATABASE_NAME = 'joeanime_mobile';
const DATABASE_VERSION = 1;
const STATE_ROW_ID = 1;
const MAX_JOEAI_FEEDBACK = 500;

let openPromise = null;
let writeQueue = Promise.resolve();
const sqlite = new SQLiteConnection(CapacitorSQLite);
let databaseConnection = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

function emptyConversation() {
  return {
    lastRecommendations: [],
    lastReferencedTitle: '',
    lastPrompt: ''
  };
}

function normalizeSnapshot(snapshot = {}) {
  return {
    ...snapshot,
    version: snapshot.version || '5.0-android-beta',
    engine: 'SQLite/Capacitor',
    path: 'Private Android app storage',
    anime: Array.isArray(snapshot.anime) ? snapshot.anime : [],
    catalog: Array.isArray(snapshot.catalog) ? snapshot.catalog : [],
    joeAI: {
      feedback: Array.isArray(snapshot?.joeAI?.feedback) ? snapshot.joeAI.feedback : [],
      preferences: Array.isArray(snapshot?.joeAI?.preferences) ? snapshot.joeAI.preferences : [],
      conversation: {
        ...emptyConversation(),
        ...(snapshot?.joeAI?.conversation || {})
      }
    }
  };
}

function titleKey(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameIdentity(left = {}, right = {}) {
  const leftKitsu = left.kitsuId ?? left.kitsu_id;
  const rightKitsu = right.kitsuId ?? right.kitsu_id;
  if (leftKitsu && rightKitsu && String(leftKitsu) === String(rightKitsu)) return true;

  const leftMal = left.malId ?? left.mal_id;
  const rightMal = right.malId ?? right.mal_id;
  if (leftMal && rightMal && String(leftMal) === String(rightMal)) return true;

  if (left.id != null && right.id != null && String(left.id) === String(right.id)) return true;
  return Boolean(titleKey(left.officialTitle || left.title) &&
    titleKey(left.officialTitle || left.title) === titleKey(right.officialTitle || right.title));
}

async function ensureOpen() {
  if (openPromise) return openPromise;

  openPromise = (async () => {
    // Native connections can outlive the WebView that created them. Reconcile
    // the JavaScript connection map before opening so a resume, renderer reload,
    // or Android process restoration does not fail with "connection exists".
    const consistency = await sqlite.checkConnectionsConsistency();
    const hasConnection = consistency.result &&
      (await sqlite.isConnection(DATABASE_NAME, false)).result;

    databaseConnection = hasConnection
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(
          DATABASE_NAME,
          false,
          'no-encryption',
          DATABASE_VERSION,
          false
        );

    const isOpen = await databaseConnection.isDBOpen();
    if (!isOpen.result) await databaseConnection.open();

    await databaseConnection.execute(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY NOT NULL,
          schema_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `, true);

    return databaseConnection;
  })().catch((error) => {
    openPromise = null;
    databaseConnection = null;
    throw error;
  });

  return openPromise;
}

async function readStoredSnapshot() {
  const connection = await ensureOpen();
  const result = await connection.query(
    'SELECT payload FROM app_state WHERE id = ? LIMIT 1',
    [STATE_ROW_ID]
  );
  const payload = result?.values?.[0]?.payload;
  if (!payload) return null;

  try {
    return normalizeSnapshot(JSON.parse(payload));
  } catch (error) {
    throw new Error(`The Android database contains invalid app state: ${error.message}`);
  }
}

async function writeStoredSnapshot(snapshot) {
  const connection = await ensureOpen();
  const normalized = normalizeSnapshot(snapshot);
  await connection.run(
    `
      INSERT INTO app_state (id, schema_version, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `,
    [
      STATE_ROW_ID,
      DATABASE_VERSION,
      JSON.stringify(normalized),
      new Date().toISOString()
    ],
    true
  );
  return clone(normalized);
}

function mutate(mutator) {
  const operation = writeQueue.then(async () => {
    const current = normalizeSnapshot((await readStoredSnapshot()) || {});
    const next = await mutator(clone(current));
    return writeStoredSnapshot(next || current);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

function findExisting(items, incoming) {
  return (items || []).find((item) => sameIdentity(item, incoming));
}

function mergeCatalogItem(existing = {}, incoming = {}) {
  const hasListUpdate = Boolean(incoming.listUpdatedAt);
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    kitsuId: incoming.kitsuId || incoming.kitsu_id || existing.kitsuId || '',
    followed: hasListUpdate
      ? Boolean(incoming.followed)
      : Boolean(existing.followed || incoming.followed),
    ignored: hasListUpdate
      ? Boolean(incoming.ignored)
      : Boolean(existing.ignored || incoming.ignored),
    followedAt: hasListUpdate
      ? (incoming.followedAt || '')
      : (existing.followedAt || incoming.followedAt || ''),
    listUpdatedAt: hasListUpdate
      ? incoming.listUpdatedAt
      : (existing.listUpdatedAt || ''),
    followingSnapshot: incoming.followingSnapshot || existing.followingSnapshot,
    followingEvents: incoming.followingEvents || existing.followingEvents || [],
    followingLastCheckedAt: incoming.followingLastCheckedAt || existing.followingLastCheckedAt || '',
    followingCheckError: incoming.followingCheckError ?? existing.followingCheckError ?? ''
  };
}

export function createMobileDatabaseAdapter() {
  return {
    async init(seedDatabase = {}) {
      const existing = await readStoredSnapshot();
      if (existing) return existing;
      return writeStoredSnapshot(normalizeSnapshot(seedDatabase));
    },

    async getDatabase() {
      return normalizeSnapshot((await readStoredSnapshot()) || {});
    },

    async getAll() {
      return (await this.getDatabase()).anime;
    },

    async getCatalog() {
      return (await this.getDatabase()).catalog;
    },

    async getJoeAIState() {
      return (await this.getDatabase()).joeAI;
    },

    async replaceAll(anime = []) {
      return mutate((current) => ({ ...current, anime: clone(anime) }));
    },

    async restoreBackup(snapshot = {}) {
      return writeStoredSnapshot(normalizeSnapshot(snapshot));
    },

    async updateAnime(incoming = {}) {
      return mutate((current) => {
        const existing = findExisting(current.anime, incoming);
        const nextItem = existing
          ? { ...existing, ...incoming, id: existing.id }
          : incoming;
        const anime = existing
          ? current.anime.map((item) => String(item.id) === String(existing.id) ? nextItem : item)
          : [...current.anime, nextItem];
        return { ...current, anime };
      }).then((database) => findExisting(database.anime, incoming));
    },

    async updateAnimeIdentityLinkage(patch = {}) {
      const id = String(patch.id || '').trim();
      if (!id) return { ok: false, reason: 'missing-id' };

      let outcome = { ok: false, reason: 'missing-record', id };
      const database = await mutate((current) => {
        const index = current.anime.findIndex((item) => String(item.id) === id);
        if (index < 0) return current;

        const existing = current.anime[index];
        const proposedKitsuId = String(
          patch.kitsuId ?? patch.kitsu_id ?? existing.kitsuId ?? ''
        ).trim();
        const proposedMalId = String(
          patch.malId ?? patch.mal_id ?? existing.malId ?? existing.mal_id ?? ''
        ).trim();
        const collision = proposedKitsuId
          ? current.anime.find((item, itemIndex) =>
              itemIndex !== index &&
              String(item.kitsuId || item.kitsu_id || '').trim() === proposedKitsuId
            )
          : null;
        if (collision) {
          outcome = {
            ok: false,
            reason: 'kitsu-collision',
            id,
            collision: { id: collision.id, title: collision.title, kitsuId: proposedKitsuId }
          };
          return current;
        }

        const malCollision = proposedMalId
          ? current.anime.find((item, itemIndex) =>
              itemIndex !== index &&
              String(item.malId ?? item.mal_id ?? '').trim() === proposedMalId
            )
          : null;
        if (malCollision) {
          outcome = {
            ok: false,
            reason: 'mal-collision',
            id,
            collision: { id: malCollision.id, title: malCollision.title, malId: proposedMalId }
          };
          return current;
        }

        const identityFields = [
          'identityNeedsReview', 'metadataNeedsReview', 'metadataReviewReason',
          'identityResolutionStatus', 'identityLinkageSource',
          'identityLinkageConfidence', 'identityLinkageUpdatedAt',
          'malIdentityLinkageSource', 'malIdentityLinkageUpdatedAt'
        ];
        const nextItem = {
          ...existing,
          kitsuId: proposedKitsuId,
          malId: proposedMalId ? Number(proposedMalId) : existing.malId
        };
        identityFields.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(patch, field)) nextItem[field] = patch[field];
        });
        const anime = [...current.anime];
        anime[index] = nextItem;
        outcome = { ok: true, item: nextItem };
        return { ...current, anime };
      });

      return {
        ...outcome,
        countBefore: database.anime.length,
        countAfter: database.anime.length
      };
    },

    async importCatalog(catalog = []) {
      return mutate((current) => {
        const nextCatalog = [...current.catalog];
        for (const incoming of catalog) {
          if (findExisting(current.anime, incoming)) continue;
          const existing = findExisting(nextCatalog, incoming);
          if (existing) {
            const merged = mergeCatalogItem(existing, incoming);
            const index = nextCatalog.indexOf(existing);
            nextCatalog[index] = merged;
          } else {
            nextCatalog.push(mergeCatalogItem({}, incoming));
          }
        }
        return { ...current, catalog: nextCatalog };
      });
    },

    async updateCatalogAnime(incoming = {}) {
      return mutate((current) => {
        const existing = findExisting(current.catalog, incoming);
        const merged = mergeCatalogItem(existing || {}, incoming);
        const catalog = existing
          ? current.catalog.map((item) => String(item.id) === String(existing.id) ? merged : item)
          : [...current.catalog, merged];
        return { ...current, catalog };
      }).then((database) => findExisting(database.catalog, incoming));
    },

    async recordJoeAIFeedback(entry = {}) {
      return mutate((current) => {
        const feedback = [{
          ...entry,
          id: entry.id || `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          createdAt: entry.createdAt || new Date().toISOString()
        }, ...current.joeAI.feedback.filter((item) => String(item.id) !== String(entry.id))]
          .slice(0, MAX_JOEAI_FEEDBACK);
        return { ...current, joeAI: { ...current.joeAI, feedback } };
      }).then((database) => database.joeAI);
    },

    async setJoeAIPreference(preference = {}) {
      if (!String(preference.key || '').trim()) return this.getJoeAIState();
      return mutate((current) => {
        const nextPreference = {
          ...preference,
          updatedAt: preference.updatedAt || new Date().toISOString()
        };
        const preferences = [
          nextPreference,
          ...current.joeAI.preferences.filter((item) => item.key !== nextPreference.key)
        ];
        return { ...current, joeAI: { ...current.joeAI, preferences } };
      }).then((database) => database.joeAI);
    },

    async deleteJoeAIFeedback(id) {
      return mutate((current) => ({
        ...current,
        joeAI: {
          ...current.joeAI,
          feedback: current.joeAI.feedback.filter((entry) => String(entry.id) !== String(id))
        }
      })).then((database) => database.joeAI);
    },

    async deleteJoeAIPreference(key) {
      return mutate((current) => ({
        ...current,
        joeAI: {
          ...current.joeAI,
          preferences: current.joeAI.preferences.filter((entry) => entry.key !== key)
        }
      })).then((database) => database.joeAI);
    },

    async resetJoeAILearning() {
      return mutate((current) => ({
        ...current,
        joeAI: { ...current.joeAI, feedback: [], preferences: [] }
      })).then((database) => database.joeAI);
    },

    async setJoeAIConversationContext(context = {}) {
      return mutate((current) => ({
        ...current,
        joeAI: {
          ...current.joeAI,
          conversation: {
            ...emptyConversation(),
            ...context,
            lastRecommendations: Array.isArray(context.lastRecommendations)
              ? context.lastRecommendations.slice(0, 10)
              : [],
            updatedAt: new Date().toISOString()
          }
        }
      })).then((database) => database.joeAI);
    },

    async clearJoeAIConversationContext() {
      return mutate((current) => ({
        ...current,
        joeAI: { ...current.joeAI, conversation: emptyConversation() }
      })).then((database) => database.joeAI);
    },

    async reset(seedDatabase = {}) {
      return writeStoredSnapshot(normalizeSnapshot(seedDatabase));
    }
  };
}
