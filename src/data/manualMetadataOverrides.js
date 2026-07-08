export const MANUAL_METADATA_OVERRIDES = {
  castlevania: {
    title: "Castlevania",
    officialTitle: "Castlevania",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Powerhouse Animation Studios",
    sourceMaterial: "Konami video game",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Dark Fantasy", "Horror"],
    themes: ["Vampires", "Revenge", "Magic", "Monsters", "Gothic Horror"],
    synopsis:
      "A dark fantasy animated series inspired by Konami’s Castlevania games, following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula, vampires, demons, corrupt religion, and supernatural war.",
    description:
      "A dark fantasy animated series inspired by Konami’s Castlevania games, following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula, vampires, demons, corrupt religion, and supernatural war.",
    allowInRecommendations: true
  },

  "castlevania nocturne": {
    title: "Castlevania: Nocturne",
    officialTitle: "Castlevania: Nocturne",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Powerhouse Animation Studios",
    sourceMaterial: "Konami video game",
    type: "TV",
    genres: ["Action", "Dark Fantasy", "Horror"],
    themes: ["Vampires", "Revolution", "Magic", "Legacy"],
    synopsis: "Richter Belmont faces a rising vampire empire during the French Revolution.",
    description: "Richter Belmont faces a rising vampire empire during the French Revolution.",
    allowInRecommendations: true
  },

  arcane: {
    title: "Arcane",
    officialTitle: "Arcane",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Fortiche",
    sourceMaterial: "League of Legends",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Drama", "Fantasy", "Sci-Fi"],
    themes: ["Class Conflict", "Sisters", "Technology", "Trauma", "Politics"],
    synopsis:
      "A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.",
    description:
      "A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.",
    allowInRecommendations: true
  },

  "blue eye samurai": {
    title: "Blue Eye Samurai",
    officialTitle: "Blue Eye Samurai",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Blue Spirit",
    sourceMaterial: "Original",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Drama"],
    themes: ["Revenge", "Identity", "Samurai", "Outsider", "Violence"],
    synopsis:
      "A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.",
    description:
      "A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.",
    allowInRecommendations: true
  }
};

export function normalizeManualMetadataKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[:'"’“.!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getManualMetadata(title = "") {
  const key = normalizeManualMetadataKey(title);
  return MANUAL_METADATA_OVERRIDES[key] || null;
}
