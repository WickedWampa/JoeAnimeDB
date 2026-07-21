import seedData from '../data/animeSeed.json';
import catalogSeed from '../data/animeCatalogSeed.json';
import { STORAGE_KEY } from '../services/storage';

const clone = (value) => JSON.parse(JSON.stringify(value));

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
    anime: Array.isArray(database?.anime) ? database.anime : clone(seedData.anime || []),
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
      const existing = currentAnime.find((item) =>
        (malId && String(item.malId || '') === String(malId)) ||
        String(item.id) === String(updatedAnime.id)
      );

      if (existing) {
        await window.JoeAnimeDB.database.updateAnime({
          ...existing,
          ...updatedAnime,
          id: existing.id
        });
      } else {
        await window.JoeAnimeDB.database.updateAnime(updatedAnime);
      }

      return normalizeDatabase(await window.JoeAnimeDB.database.getDatabase());
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
