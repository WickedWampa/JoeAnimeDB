import seedData from '../data/animeSeed.json';
import catalogSeed from '../data/animeCatalogSeed.json';
import { STORAGE_KEY } from '../services/storage';
import { normalizeAnimeStudioFields } from '../utils/metadataAdapters';
import { sameAnimeIdentity } from '../services/titleIdentity';

const clone = (value) => JSON.parse(JSON.stringify(value));
const JOEAI_FEEDBACK_KEY = 'joeanime-joeai-feedback-v1';
const JOEAI_PREFERENCES_KEY = 'joeanime-joeai-preferences-v1';
const JOEAI_CONVERSATION_KEY = 'joeanime-joeai-conversation-v1';

function readLocalArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emptyJoeAIConversation() {
  return {
    lastRecommendations: [],
    lastReferencedTitle: '',
    lastPrompt: ''
  };
}

function readLocalObject(key, fallback = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function localJoeAIState() {
  return {
    feedback: readLocalArray(JOEAI_FEEDBACK_KEY),
    preferences: readLocalArray(JOEAI_PREFERENCES_KEY),
    conversation: {
      ...emptyJoeAIConversation(),
      ...readLocalObject(JOEAI_CONVERSATION_KEY, {})
    }
  };
}

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
  const localState = localJoeAIState();
  const electron = hasElectronDatabase();
  const databaseFeedback = Array.isArray(database?.joeAI?.feedback)
    ? database.joeAI.feedback
    : [];
  const databasePreferences = Array.isArray(database?.joeAI?.preferences)
    ? database.joeAI.preferences
    : [];
  const hasSavedLocalConversation = Boolean(localStorage.getItem(JOEAI_CONVERSATION_KEY));

  return {
    ...clone(seedData),
    ...database,
    anime: (Array.isArray(database?.anime) ? database.anime : clone(seedData.anime || []))
      .map(normalizeAnimeStudioFields),
    catalog: Array.isArray(database?.catalog) ? database.catalog : [],
    joeAI: {
      feedback: electron
        ? databaseFeedback
        : localState.feedback.length
          ? localState.feedback
          : databaseFeedback,
      preferences: electron
        ? databasePreferences
        : localState.preferences.length
          ? localState.preferences
          : databasePreferences,
      conversation: {
        ...emptyJoeAIConversation(),
        ...(
          electron || !hasSavedLocalConversation
            ? database?.joeAI?.conversation || {}
            : localState.conversation
        )
      }
    }
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

  async getJoeAIState() {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.getJoeAIState) {
      return window.JoeAnimeDB.database.getJoeAIState();
    }

    return localJoeAIState();
  },

  async recordJoeAIFeedback(entry) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.recordJoeAIFeedback) {
      return window.JoeAnimeDB.database.recordJoeAIFeedback(entry);
    }

    const current = localJoeAIState();
    const next = [{
      ...entry,
      id: entry.id || `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: entry.createdAt || new Date().toISOString()
    }, ...current.feedback].slice(0, 500);
    localStorage.setItem(JOEAI_FEEDBACK_KEY, JSON.stringify(next));
    return { ...current, feedback: next };
  },

  async setJoeAIPreference(preference) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.setJoeAIPreference) {
      return window.JoeAnimeDB.database.setJoeAIPreference(preference);
    }

    const current = localJoeAIState();
    const nextPreference = {
      ...preference,
      updatedAt: preference.updatedAt || new Date().toISOString()
    };
    const next = [
      nextPreference,
      ...current.preferences.filter((item) => item.key !== nextPreference.key)
    ];
    localStorage.setItem(JOEAI_PREFERENCES_KEY, JSON.stringify(next));
    return { ...current, preferences: next };
  },

  async deleteJoeAIFeedback(id) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.deleteJoeAIFeedback) {
      return window.JoeAnimeDB.database.deleteJoeAIFeedback(id);
    }

    const current = localJoeAIState();
    const next = current.feedback.filter((entry) => String(entry.id) !== String(id));
    localStorage.setItem(JOEAI_FEEDBACK_KEY, JSON.stringify(next));
    return { ...current, feedback: next };
  },

  async deleteJoeAIPreference(key) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.deleteJoeAIPreference) {
      return window.JoeAnimeDB.database.deleteJoeAIPreference(key);
    }

    const current = localJoeAIState();
    const next = current.preferences.filter((entry) => entry.key !== key);
    localStorage.setItem(JOEAI_PREFERENCES_KEY, JSON.stringify(next));
    return { ...current, preferences: next };
  },

  async resetJoeAILearning() {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.resetJoeAILearning) {
      return window.JoeAnimeDB.database.resetJoeAILearning();
    }

    const current = localJoeAIState();
    localStorage.removeItem(JOEAI_FEEDBACK_KEY);
    localStorage.removeItem(JOEAI_PREFERENCES_KEY);
    return { ...current, feedback: [], preferences: [] };
  },

  async setJoeAIConversationContext(context = {}) {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.setJoeAIConversationContext) {
      return window.JoeAnimeDB.database.setJoeAIConversationContext(context);
    }

    const current = localJoeAIState();
    const conversation = {
      ...emptyJoeAIConversation(),
      ...context,
      lastRecommendations: Array.isArray(context.lastRecommendations)
        ? context.lastRecommendations.slice(0, 10)
        : []
    };
    localStorage.setItem(JOEAI_CONVERSATION_KEY, JSON.stringify(conversation));
    return { ...current, conversation };
  },

  async clearJoeAIConversationContext() {
    if (hasElectronDatabase() && window.JoeAnimeDB.database.clearJoeAIConversationContext) {
      return window.JoeAnimeDB.database.clearJoeAIConversationContext();
    }

    const current = localJoeAIState();
    localStorage.removeItem(JOEAI_CONVERSATION_KEY);
    return { ...current, conversation: emptyJoeAIConversation() };
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
    const existing = currentAnime.find((item) =>
      String(item.id) === String(updatedAnime.id) ||
      sameAnimeIdentity(item, updatedAnime)
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
    const existing = (current.catalog || []).find((item) =>
      String(item.id) === String(updatedAnime.id) ||
      sameAnimeIdentity(item, updatedAnime)
    );

    const catalog = existing
      ? (current.catalog || []).map((item) =>
          String(item.id) === String(existing.id)
            ? {
                ...item,
                ...updatedAnime,
                id: existing.id,
                kitsuId: updatedAnime.kitsuId || item.kitsuId || ''
              }
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

  async restoreBackup(database = {}) {
    const snapshot = {
      ...database,
      anime: Array.isArray(database.anime) ? database.anime : [],
      catalog: Array.isArray(database.catalog) ? database.catalog : [],
      joeAI: database.joeAI && typeof database.joeAI === 'object'
        ? database.joeAI
        : localJoeAIState()
    };

    if (hasElectronDatabase() && window.JoeAnimeDB.database.restoreBackup) {
      return normalizeDatabase(
        await window.JoeAnimeDB.database.restoreBackup(snapshot)
      );
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(
      JOEAI_FEEDBACK_KEY,
      JSON.stringify(snapshot.joeAI.feedback || [])
    );
    localStorage.setItem(
      JOEAI_PREFERENCES_KEY,
      JSON.stringify(snapshot.joeAI.preferences || [])
    );
    localStorage.setItem(
      JOEAI_CONVERSATION_KEY,
      JSON.stringify(snapshot.joeAI.conversation || emptyJoeAIConversation())
    );
    return normalizeDatabase(snapshot);
  },

  async reset() {
    if (hasElectronDatabase()) {
      return normalizeDatabase(await window.JoeAnimeDB.database.reset({ ...seedData, catalog: catalogSeed }));
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JOEAI_FEEDBACK_KEY);
    localStorage.removeItem(JOEAI_PREFERENCES_KEY);
    localStorage.removeItem(JOEAI_CONVERSATION_KEY);
    return normalizeDatabase({ ...seedData, catalog: catalogSeed });
  }
};
