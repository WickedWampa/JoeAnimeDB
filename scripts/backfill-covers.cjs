const fs = require("fs");
const path = require("path");

const seedPath = path.join(__dirname, "..", "src", "data", "animeSeed.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const titleFixes = {
  "Bleach TYBW": "Bleach: Sennen Kessen-hen",
  "Slime S2": "Tensei shitara Slime Datta Ken 2nd Season",
  "Slime S3": "Tensei shitara Slime Datta Ken 3rd Season",
  "SAO II": "Sword Art Online II",
  "SAO Alicization": "Sword Art Online: Alicization",
  "Fullmetal Alchemist Brotherhood": "Fullmetal Alchemist: Brotherhood"
};

async function lookup(anime) {
  const searchTitle = titleFixes[anime.title] || anime.title;
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchTitle)}&limit=1&sfw=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const result = json.data?.[0];
  if (!result) return anime;

  return {
    ...anime,
    cover:
      result.images?.webp?.large_image_url ||
      result.images?.jpg?.large_image_url ||
      result.images?.jpg?.image_url ||
      anime.cover,
    synopsis: result.synopsis || anime.synopsis,
    type: result.type || anime.type,
    year: result.year || anime.year,
    episodeCount: result.episodes || anime.episodeCount,
    malScore: result.score || anime.malScore,
    studio: result.studios?.length
      ? result.studios.map((s) => s.name).join(" / ")
      : anime.studio
  };
}

(async () => {
  for (let i = 0; i < seed.anime.length; i++) {
    const anime = seed.anime[i];

    console.log(`[${i + 1}/${seed.anime.length}] ${anime.title}`);

    try {
      seed.anime[i] = await lookup(anime);
    } catch (err) {
      console.log(`  failed: ${err.message}`);
    }

    await sleep(1500);
  }

  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  console.log("Done. animeSeed.json updated.");
})();