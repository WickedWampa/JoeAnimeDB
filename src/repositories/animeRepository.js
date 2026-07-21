import seedData from '../data/animeSeed.json';
import catalogSeed from '../data/animeCatalogSeed.json';
import { STORAGE_KEY } from '../services/storage';
import { normalizeAnimeStudioFields } from '../utils/metadataAdapters';

const clone = (value) => JSON.parse(JSON.stringify(value));

function debugIdentity(item) {
  return {
    id: item?.id ?? null,
    title: item?.title || '',
    malId: item?.malId ?? item?.mal_id ?? null,
    kitsuId: item?.kitsuId ?? item?.kitsu_id ?? null
  };
}

function findIdentityCollisions(items, target) {
  const targetIds = debugIdentity(target);
  return (items || [])
    .filter((item) => {
      if (String(item?.id ?? '') === String(targetIds.id ?? '')) return false;
      const itemMal = item?.malId ?? item?.mal_id;
      const itemKitsu = item?.kitsuId ?? item?.kitsu_id;
      return (
        (targetIds.malId != null && String(itemMal ?? '') === String(targetIds.malId)) ||
        (targetIds.kitsuId != null && String(itemKitsu ?? '') === String(targetIds.kitsuId))
      );
    })
    .map(debugIdentity);
}


function readLegacyLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('Legacy localStorage read failed.', error);
    return null;
  }
}

function hasElectronDatabase() {
  return Boolean(window.JoeAnimeDB?.database);
}

function normalizeDatabase(database) {
  return {
    ...clone(seedData),
    ...database,
    anime: (Array.isArray(database?.anime) ? database.anime : clone(seedData.anime || []))
      .map(normalizeAnimeStudioFields),
    catalog: Array.isArray(database?.catalog) ? database.catalog : []
  };
}

export const animeRepository = {
  engine: hasElectronDatabase() ? 'SQLite' : 'localStorage',

  async getDatabase() {
    if (hasElectronDatabase()) {
      // Packaged desktop installs always initialize from the clean application
      // seed. Never silently import browser/localStorage data into a new install.
      const seed = { ...seedData, catalog: catalogSeed };
      const database = await window.JoeAnimeDB.database.init(seed);
      return normalizeDatabase(database);
    }

    const legacy = readLegacyLocalStorage();
    return normalizeDatabase(legacy || { ...seedData, catalog: catalogSeed });
  },

  async saveDatabase(data) {
    if (hasElectronDatabase()) {
      return normalizeDatabase(await window.JoeAnimeDB.database.replaceAll(data.anime || []));
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return normalizeDatabase(data);
  },

  async getAll() {
    if (hasElectronDatabase()) return window.JoeAnimeDB.database.getAll();
    return (await this.getDatabase()).anime || [];
  },

  async getCatalog() {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.getCatalog) {
      return window.JoeAnimeDB.database.getCatalog();
    }

    return (await this.getDatabase()).catalog || [];
  },

  async replaceAll(anime) {
    if (hasElectronDatabase()) {
      return normalizeDatabase(await window.JoeAnimeDB.database.replaceAll(anime));
    }

    const current = await this.getDatabase();
    const next = { ...current, anime };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return normalizeDatabase(next);
  },

  async updateAnime(updatedAnime) {
    if (hasElectronDatabase()) {
      const current = await window.JoeAnimeDB.database.getDatabase();
      const currentAnime = current?.anime || [];
      const malId = updatedAnime.malId ?? updatedAnime.mal_id;
      const matchesById = currentAnime.filter((item) => String(item.id) === String(updatedAnime.id));
      const matchesByMalId = malId == null ? [] : currentAnime.filter((item) =>
        String(item.malId ?? item.mal_id ?? '') === String(malId)
      );
      const existing = currentAnime.find((item) =>
        (malId && String(item.malId || '') === String(malId)) ||
        String(item.id) === String(updatedAnime.id)
      );

      console.group(`[Metadata Repair Debug][Repository] ${updatedAnime.title || updatedAnime.id}`);
      console.log('DATABASE BEFORE UPDATE', {
        count: currentAnime.length,
        incoming: debugIdentity(updatedAnime),
        matchesById: matchesById.map(debugIdentity),
        matchesByMalId: matchesByMalId.map(debugIdentity),
        providerIdentityCollisions: findIdentityCollisions(currentAnime, updatedAnime),
        selectedExisting: existing ? debugIdentity(existing) : null
      });

      const payload = existing
        ? { ...existing, ...updatedAnime, id: existing.id }
        : updatedAnime;
      console.log('PAYLOAD SENT TO SQLITE', debugIdentity(payload), payload);

      await window.JoeAnimeDB.database.updateAnime(payload);

      const afterRaw = await window.JoeAnimeDB.database.getDatabase();
      const afterAnime = afterRaw?.anime || [];
      const beforeIds = new Set(currentAnime.map((item) => String(item.id)));
      const afterIds = new Set(afterAnime.map((item) => String(item.id)));
      const removed = currentAnime.filter((item) => !afterIds.has(String(item.id))).map(debugIdentity);
      const added = afterAnime.filter((item) => !beforeIds.has(String(item.id))).map(debugIdentity);
      console.log('DATABASE AFTER UPDATE', {
        count: afterAnime.length,
        delta: afterAnime.length - currentAnime.length,
        removed,
        added,
        savedMatchesById: afterAnime.filter((item) => String(item.id) === String(payload.id)).map(debugIdentity),
        savedMatchesByMalId: malId == null ? [] : afterAnime.filter((item) => String(item.malId ?? item.mal_id ?? '') === String(malId)).map(debugIdentity)
      });
      console.groupEnd();

      return normalizeDatabase(afterRaw);
    }

    const current = await this.getDatabase();
    const currentAnime = current.anime || [];
    const malId = updatedAnime.malId ?? updatedAnime.mal_id;
    const existing = currentAnime.find((item) =>
      (malId && String(item.malId || '') === String(malId)) ||
      String(item.id) === String(updatedAnime.id)
    );

    const anime = existing
      ? currentAnime.map((item) =>
          String(item.id) === String(existing.id)
            ? { ...item, ...updatedAnime, id: existing.id }
            : item
        )
      : [...currentAnime, updatedAnime];

    const next = { ...current, anime };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return normalizeDatabase(next);
  },


  async updateCatalogAnime(updatedAnime) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.updateCatalogAnime) {
      await window.JoeAnimeDB.database.updateCatalogAnime(updatedAnime);
      return normalizeDatabase(await window.JoeAnimeDB.database.getDatabase());
    }

    const current = await this.getDatabase();
    const key = String(updatedAnime.id || updatedAnime.malId || updatedAnime.title);
    const exists = (current.catalog || []).some((item) =>
      String(item.id || item.malId || item.title) === key
    );

    const catalog = exists
      ? (current.catalog || []).map((item) =>
          String(item.id || item.malId || item.title) === key
            ? { ...item, ...updatedAnime }
            : item
        )
      : [...(current.catalog || []), updatedAnime];

    const next = { ...current, catalog };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return normalizeDatabase(next);
  },

  async importCatalog(catalog) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.importCatalog) {
      return normalizeDatabase(await window.JoeAnimeDB.database.importCatalog(catalog || []));
    }

    const current = await this.getDatabase();
    const next = { ...current, catalog: catalog || [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return normalizeDatabase(next);
  },

  async reset() {
    if (hasElectronDatabase()) {
      return normalizeDatabase(await window.JoeAnimeDB.database.reset({ ...seedData, catalog: catalogSeed }));
    }

    localStorage.removeItem(STORAGE_KEY);
    return normalizeDatabase({ ...seedData, catalog: catalogSeed });
  }
};
