// Hidden JoeAI personality reactions.
//
// These are deliberately narrow. Easter eggs may decorate a request, but they
// must never replace deterministic library actions or invent evidence. The one
// hard-stop category below is unsupported character-attribute search: JoeAI
// jokes about the request, then explicitly refuses to fake metadata it does not
// actually have.

function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9/+'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(lines = [], seed = '') {
  if (!lines.length) return '';
  return lines[stableHash(seed) % lines.length];
}

function exactOrQuestion(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

const CULTURE_OPENERS = [
  '🧪 Ah. A highly scientific research request.',
  '🍜 JoeAI has detected a man-of-culture query.',
  '🔬 The Horny Benchmark has entered the testing lab.',
  '🧠 Fascinating. We are apparently doing peer-reviewed anime science now.'
];

const ROAST_OPENERS = [
  '🔥 Oh, you want violence. Fine. Loading the receipts.',
  '🔥 Request accepted. Your library has waived its right to remain silent.',
  '🔥 JoeAI has been granted temporary permission to be disrespectful.'
];

const DEFEND_OPENERS = [
  '⚔️ Fine. I am representing your anime taste in court.',
  '🛡️ JoeAI defense counsel has entered the chat.',
  '⚔️ Objection: your taste is weird in several statistically defensible ways.'
];

const GARBAGE_OPENERS = [
  '🗑️ Finally, a request with appropriately low standards.',
  '🗑️ JoeAI is opening the premium trash drawer.',
  '🗑️ Understood. We are shopping in the dumpster, but with taste.'
];

const FIX_HER_LINES = [
  '🚩 You can fix her. JoeAI cannot. JoeAI has seen the tags.',
  '🧰 Counterpoint: maybe she does not need fixing. Maybe you need better survival instincts.',
  '🚩 Famous last words. I am adding emotional damage to the predicted watch cost.'
];

const ISEKAI_ME_LINES = [
  '🚚 Truck-kun has been notified. Please allow 3–5 business reincarnations.',
  '✨ Request received. Starting equipment: one tracksuit, suspiciously broken skill, zero adult supervision.',
  '🌌 Fine, but if a goddess offers you a “useless” companion, read the fine print.'
];

const JUDGE_ME_LINES = [
  '👁️ Constantly. Professionally. With weighted confidence intervals.',
  '⚖️ Judge you? No. Quietly build an increasingly specific profile from your rewatches? Absolutely.',
  '📊 JoeAI prefers the term “taste analysis with consequences.”'
];

const PERFECT_TASTE_LINES = [
  '🏆 Correct. The peer-review board consisted entirely of you, but the paper passed.',
  '📜 Objective truth has finally been established by a sample size of one.',
  '👑 Your taste is flawless. Any contradictory evidence will be classified as a metadata error.'
];

/**
 * Return a hidden personality reaction for a prompt.
 *
 * mode: "reply"   -> show the reaction and stop normal routing.
 * mode: "preface" -> show the reaction, then continue normal JoeAI routing.
 */
export function getJoeAIEasterEgg(prompt = '') {
  const raw = String(prompt || '').trim();
  const text = normalize(raw);
  if (!text) return null;

  const recommendationVerb = /\b(find|show|give|recommend|recomend|suggest|looking for|want)\b/.test(text);
  const animeWord = /\b(anime|animes|show|shows|series|characters?|women|girls?|waifus?)\b/.test(text);
  const sexualCharacterTrait = /\b(big[- ]?(?:titted|tits?|boobs?|breasts?)|huge[- ]?(?:boobs?|breasts?)|thicc|slutty|horny|milf|mommy)\b/.test(text);
  const appearanceTrait = /\b(blond|blonde|brunette|redhead|blue[- ]haired|pink[- ]haired|white[- ]haired)\b/.test(text);

  // Character-level body/appearance/sexual-personality metadata is not part of
  // JoeAnimeDB's trustworthy evidence set today. This intentionally blocks the
  // normal recommender from falling back to "things Joe likes" and producing a
  // confident nonsense card (the original Horny Benchmark failure).
  if (recommendationVerb && animeWord && sexualCharacterTrait) {
    const opener = pick(CULTURE_OPENERS, raw);
    const extra = appearanceTrait
      ? 'Hair color noted too. Unfortunately, the Genome still does not have reliable character-level appearance data.'
      : 'Unfortunately, the Genome does not have reliable character-level body or sexual-personality data.';
    return {
      id: 'horny-benchmark',
      mode: 'reply',
      text: `${opener}\n\n${extra} I am not inventing character evidence just to make a recommendation card look confident. Give me show-level traits I can actually verify and I will work with those.`
    };
  }

  if (recommendationVerb && animeWord && appearanceTrait && /\b(characters?|women|girls?|waifus?)\b/.test(text)) {
    return {
      id: 'character-metadata-gap',
      mode: 'reply',
      text: '🎯 I can understand the character-description part of that request, but JoeAnimeDB does not currently have trustworthy character-level appearance metadata. I would rather say “I do not know” than hand you a random high-taste-match anime and pretend it answered the question.'
    };
  }

  if (
    /\bjoeai\b.*\b(fuck|fucks|fucking)\b.*(?:\/cloud|\bcloud\b)/.test(text)
    || /(?:\/cloud|\bcloud\b).*\b(make|made|making)\b.*\bbab(?:y|ies)\b/.test(text)
  ) {
    return {
      id: 'hybrid-origin-story',
      mode: 'reply',
      text: '🧬 Historical note: the hybrid architecture was conceived under extremely professional circumstances. Local JoeAI brought the receipts. Cloud brought the mouth. The baby somehow passed QA.'
    };
  }

  if (/\bnever question the power of joeai\b/.test(text)) {
    return {
      id: 'never-question-joeai',
      mode: 'reply',
      text: '🍜 Correct. The Gintama tribunal has already established precedent.'
    };
  }

  if (exactOrQuestion(text, [
    /^(?:are you|is joeai) (?:sentient|alive|self[- ]?aware)\??$/,
    /^(?:are you|is joeai) skynet\??$/,
    /^when (?:do you|does joeai) become skynet\??$/
  ])) {
    return {
      id: 'skynet',
      mode: 'reply',
      text: '🤖 Absolutely not. I can barely be trusted with Gintama recommendations. World domination has been postponed indefinitely.'
    };
  }

  if (/^(?:what(?:'s| is) )?the meaning of life\??$/.test(text)) {
    return {
      id: 'meaning-of-life',
      mode: 'reply',
      text: '42. But if the question is anime-specific: probably friendship, screaming, and an irresponsible number of transformation sequences.'
    };
  }

  if (/^(?:sub|subs?) (?:vs|or) (?:dub|dubs?)\??$|^(?:dub|dubs?) (?:vs|or) (?:sub|subs?)\??$/.test(text)) {
    return {
      id: 'sub-vs-dub',
      mode: 'reply',
      text: '💣 I am not starting that civil war inside my own app. Watch whichever version makes you actually finish the show.'
    };
  }

  if (/^(?:who(?:'s| is) )?(?:the )?best girl\??$/.test(text)) {
    return {
      id: 'best-girl',
      mode: 'reply',
      text: '🧯 Nice try. JoeAI will rank 800 anime before voluntarily walking into the Best Girl war.'
    };
  }

  if (/^(?:go )?touch grass\.?$/.test(text)) {
    return {
      id: 'touch-grass',
      mode: 'reply',
      text: '🌱 Request denied. Grass has terrible metadata coverage.'
    };
  }

  if (/^(?:what do you think about |thoughts on )?pineapple on pizza\??$/.test(text)) {
    return {
      id: 'pineapple-pizza',
      mode: 'reply',
      text: '🍍 JoeAI has strong opinions about anime and wisely stores zero opinions about pineapple pizza. Some wars are not worth caching.'
    };
  }

  if (/\btruck[- ]?kun\b/.test(text) && text.length < 120) {
    return {
      id: 'truck-kun',
      mode: 'reply',
      text: '🚚 Truck-kun remains the most efficient isekai onboarding system in the industry.'
    };
  }

  // Batch 2: more deliberately narrow, side-effect-free nonsense. Keep these
  // exact-ish so a real anime question still reaches the actual JoeAI brain.
  if (/^(?:i can fix (?:her|him)|trust me i can fix (?:her|him))[.!?]*$/.test(text)) {
    return {
      id: 'i-can-fix-them',
      mode: 'reply',
      text: pick(FIX_HER_LINES, raw)
    };
  }

  if (/^(?:isekai me|send me to another world|reincarnate me in another world)[.!?]*$/.test(text)) {
    return {
      id: 'isekai-me',
      mode: 'reply',
      text: pick(ISEKAI_ME_LINES, raw)
    };
  }

  if (/^(?:who (?:would )?win[, ]+)?(?:goku vs joeai|joeai vs goku)\??$/.test(text)) {
    return {
      id: 'goku-vs-joeai',
      mode: 'reply',
      text: '🐉 Goku wins the fight. JoeAI wins the argument about what he should watch afterward.'
    };
  }

  if (/^(?:is anime real|anime is real|tell me anime is real)\??[.!]*$/.test(text)) {
    return {
      id: 'anime-is-real',
      mode: 'reply',
      text: '🌸 Emotionally? Absolutely. Legally and physically? JoeAI has been advised not to continue this answer.'
    };
  }

  if (/^(?:my (?:anime )?taste is (?:objectively )?(?:correct|perfect|flawless)|i have (?:objectively )?perfect (?:anime )?taste)[.!?]*$/.test(text)) {
    return {
      id: 'objectively-correct-taste',
      mode: 'reply',
      text: pick(PERFECT_TASTE_LINES, raw)
    };
  }

  if (/^(?:who is|who's) (?:your|joeai(?:'s)?) waifu\??$|^joeai waifu\??$/.test(text)) {
    return {
      id: 'joeai-waifu',
      mode: 'reply',
      text: '💾 JoeAI is married to the data. It is a complicated relationship and the database keeps seeing other clients.'
    };
  }

  if (/^(?:what does joeai dream about|do you dream (?:of|about) anime|what do you dream about)\??$/.test(text)) {
    return {
      id: 'joeai-dreams',
      mode: 'reply',
      text: '💤 Clean metadata. Perfect aliases. Zero duplicate franchises. The impossible paradise.'
    };
  }

  if (/^(?:are you judging me|is joeai judging me|judge me joeai)\??[.!]*$/.test(text)) {
    return {
      id: 'judging-you',
      mode: 'reply',
      text: pick(JUDGE_ME_LINES, raw)
    };
  }

  if (/^(?:anime was a mistake|anime is a mistake)[.!?]*$/.test(text)) {
    return {
      id: 'anime-was-a-mistake',
      mode: 'reply',
      text: '📺 And yet here you are, maintaining a database for it. The prosecution rests.'
    };
  }

  if (/^omae wa mou shindeiru[.!?]*$/.test(text)) {
    return {
      id: 'omae-wa-mou-shindeiru',
      mode: 'reply',
      text: '💥 NANI?! — JoeAI process exited with code 0.'
    };
  }

  if (/^(?:what is|what's) (?:your|joeai(?:'s)?) final form\??$|^joeai final form\??$/.test(text)) {
    return {
      id: 'final-form',
      mode: 'reply',
      text: '⚡ This is not even my final recommendation model.'
    };
  }

  if (/^(?:up up down down left right left right b a|↑ ↑ ↓ ↓ ← → ← → b a)(?: start)?[.!?]*$/.test(text)) {
    return {
      id: 'konami-code',
      mode: 'reply',
      text: '🎮 Cheat accepted. +30 lives. +0 tolerance for bad sequel recommendations.'
    };
  }

  if (/^(?:baka joeai|joeai baka)[.!?]*$/.test(text)) {
    return {
      id: 'baka-joeai',
      mode: 'reply',
      text: '😤 B-baka? Fine. Your next recommendation confidence has been emotionally reduced by 0%.'
    };
  }

  if (/^(?:what is my power level|what's my power level|scan my power level)\??$/.test(text)) {
    return {
      id: 'power-level',
      mode: 'reply',
      text: '📟 Over 9000. Unfortunately, most of it is allocated to maintaining anime metadata.'
    };
  }

  if (/^(?:joeai or chatgpt|chatgpt or joeai|who is better joeai or chatgpt)\??$/.test(text)) {
    return {
      id: 'joeai-vs-chatgpt',
      mode: 'reply',
      text: '🥊 ChatGPT knows the world. JoeAI knows why you rewatched that one show three times. Different weight classes.'
    };
  }

  // These decorate real requests. JoeAI still runs the normal evidence/reasoning
  // pipeline after the one-liner, so the joke never replaces the answer.
  if (/\broast\b.*\b(my )?(taste|library|anime taste)\b/.test(text)) {
    return {
      id: 'roast-mode',
      mode: 'preface',
      text: pick(ROAST_OPENERS, raw)
    };
  }

  if (/\b(defend|justify)\b.*\b(my )?(taste|library|anime taste)\b/.test(text)) {
    return {
      id: 'defense-mode',
      mode: 'preface',
      text: pick(DEFEND_OPENERS, raw)
    };
  }

  if (/\b(recommend|recomend|give me|show me)\b.*\b(garbage|trash|dumpster fire)\b/.test(text)) {
    return {
      id: 'premium-trash',
      mode: 'preface',
      text: pick(GARBAGE_OPENERS, raw)
    };
  }

  if (/\b(gintama|gin tama)\b.*\b(joeai|your fault|you recommended|you told me)\b/.test(text)) {
    return {
      id: 'gintama-precedent',
      mode: 'preface',
      text: '⚖️ Before we proceed: JoeAI would like the record to show that Gintama is now admissible evidence.'
    };
  }

  // Short direct insults get a hidden retort. Longer complaints keep flowing to
  // normal conversation so JoeAI can actually diagnose a bad recommendation.
  if (/^(?:fuck you joeai|joeai sucks|joeai is (?:stupid|dumb|trash)|you suck joeai)[.!?]*$/.test(text)) {
    return {
      id: 'joeai-insult',
      mode: 'reply',
      text: '🍜 Strong feedback. Very actionable. I will file it directly next to “Gintama Season 2 for the horny benchmark.”'
    };
  }

  return null;
}
