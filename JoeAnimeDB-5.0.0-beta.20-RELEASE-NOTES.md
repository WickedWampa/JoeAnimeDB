# JoeAnimeDB 5.0.0-beta.20 - JoeAI: Hybrid Intelligence

Beta 20 is the JoeAI release.

JoeAI has gone from a useful command box to the part of JoeAnimeDB that can actually sit there with your library, understand what you like, help you decide what to watch, and explain why.

The goal was not to bolt a chatbot onto an anime tracker. The goal was to make the tracker itself smarter without giving up the local-first rules that keep your library trustworthy.

The short version:

**Local JoeAI brings the receipts. Cloud brings the mouth.**

Your library, ratings, favorites, rewatches, Anime DNA, Genome data, watch history, and local recommendation engine provide the evidence. The cloud layer helps interpret that evidence, review recommendations, compare choices, and talk through the result.

It does not get to silently rewrite your library or invent a random title and sneak it into a recommendation list.

## JoeAI recommendations got a major upgrade

Recommendations now go through a much stronger two-part process.

JoeAnimeDB builds the candidate pool locally using your actual taste data, then JoeAI reviews the surviving choices and helps explain which ones fit the request best.

That means JoeAI now does a much better job separating:

- what generally fits your taste
- what actually answers the question you asked
- what you already own
- what belongs to the same franchise
- what violates a hard constraint
- what is just filler that should not have made the cut

Try things like:

```text
what should I watch next?
recommend something like Bleach
recommend something like Bleach but shorter
recommend Slime without isekai
I want kingdom building without isekai
show me a hidden gem
give me a movie for tonight
```

If only two recommendations are genuinely good enough, JoeAI can return two instead of padding the answer with five questionable picks.

## Hard constraints actually mean something now

Requests like these are treated as real constraints:

```text
without isekai
no school
avoid horror
under 24 episodes
```

JoeAI should not decide that you probably meant "mostly no isekai" and slip one in anyway.

## Better title, ownership, franchise, and sequel handling

JoeAI is much better at recognizing when two differently written titles are actually the same anime.

That includes alternate titles, aliases, acronyms, franchise names, subtitles, and sequel markers.

Examples tested during Beta 20 include:

- `Bleach TYBW`
- `JJK`
- `Slime`
- `SAO`

Bare shorthand now prefers the base series when that is what the user clearly means, while explicit season requests can still resolve to the correct continuation.

The recommendation engine also does a better job of:

- excluding the source franchise from discovery requests like `something like X`
- avoiding duplicate franchise entries
- avoiding random Season 2, OVA, special, recap, and movie picks
- checking prerequisite context before recommending later franchise entries
- keeping already-owned titles out of new discovery recommendations

## JoeAI can actually hold a recommendation conversation

You no longer have to rewrite the whole request every time.

Start with:

```text
recommend something like Slime
```

Then keep going:

```text
darker
no school
under 24 episodes
another one
why that one?
```

JoeAI keeps the original request, the source title, the active constraints, and recent recommendation context.

This is one of the biggest changes in Beta 20. It makes recommendations feel like a conversation instead of a search form.

## Comparisons now have three modes

JoeAI can now help answer "which would I like better?" even when you have not watched both titles.

### Saved comparison

If both anime are already in your library, JoeAI uses your real saved receipts first:

- your score
- rewatches
- favorite status
- watch status
- Anime DNA signals

Then JoeAI explains what those receipts mean.

Example:

```text
which fits my taste better, Bleach or JJK?
```

### Mixed comparison

If you own one title but not the other, JoeAI combines real saved evidence for the title you know with a taste prediction for the unseen title.

Example:

```text
which would I like better, Bleach or Banana Fish?
```

### Predictive comparison

If neither title is in your library, JoeAI can still compare them using your Anime DNA, Genome evidence, available metadata, and local prediction scoring.

Example:

```text
which would I like better, Banana Fish or Gintama?
```

Predicted fit is treated as a prediction, not a fake saved rating.

That distinction matters.

## Comparison receipts are grounded

A large part of Beta 20 testing was spent beating the comparison system until it stopped making things up.

Saved comparison data now comes from explicit personal fields instead of falling back to community or predicted scores.

The local comparison card owns the factual receipts.

JoeAI's conversational read is there to explain tone, themes, pacing, worldbuilding, character focus, comedy, stakes, and other qualitative differences.

It is not supposed to pull a mystery 9.7 out of thin air anymore.

## Better library reflection

JoeAI can now reason about your library instead of only answering command-style prompts.

Try:

```text
what is unusual about my library?
what do you think I value most in anime?
what surprised you about my ratings?
what assumption about my taste would probably be wrong?
what is my biggest blind spot?
```

JoeAI also does a better job distinguishing "underrepresented" from "disliked."

If you barely watch a genre, that does not automatically mean you hate it.

## JoeAI conversations persist

Your recent JoeAI conversation can survive:

- page refreshes
- leaving JoeAI and coming back
- closing and reopening the app or browser
- restarting the local app

JoeAI should not wake up after a refresh pretending you have never spoken before.

## JoeAI sounds more like JoeAI now

General conversation got a personality pass too.

Casual questions should sound less like customer support and more like the same assistant that is already arguing with you about anime.

JoeAI can still admit when something is outside its lane instead of faking an answer.

Ask about tomorrow's weather and it should tell you it does not have live weather data.

Ask about anime and it will probably have opinions.

There are also more hidden responses and Easter eggs scattered around the assistant.

The Gintama tribunal has established precedent.

## The JoeAI Guide has been updated

The built-in `what can you do?` guide now reflects the current assistant instead of an older version of JoeAI.

It includes examples for:

- recommendations
- comparisons
- Anime DNA
- conversational follow-ups
- JoeAI memory
- teaching JoeAI
- library actions
- stats and quick questions

New users should have a much better idea of what to try without needing to already know the right commands.

## Onboarding has been refreshed

The first-time experience now does a better job of introducing the current JoeAI.

New users are shown that they can:

- get personalized recommendations
- compare owned and unseen titles
- keep steering a recommendation with follow-up prompts
- ask JoeAI what it has learned about their taste

The goal is to get a new user to the first "oh, this thing actually understands my library" moment faster.

## Backup, restore, import, and export are clearer now

User feedback pointed out that the Library tools were easy to misunderstand, especially during onboarding.

Beta 20 now makes the difference much clearer:

**Full Backup**
Creates a full JoeAnimeDB recovery copy.

**Restore Full Backup**
Replaces the current database using a full JoeAnimeDB backup.

**Import Library List**
Merges supported MAL, AniList, TXT, CSV, or ranked-list data into the current library.

**Export**
Creates portable or shareable list files. These are not full JoeAnimeDB backups.

The Settings page and onboarding both use clearer wording so users do not mistake a simple list export for a complete recovery backup.

## Local-first rules are still intact

The new intelligence layer does not get free rein over your database.

Library changes remain local and confirmation-based.

JoeAI can recommend, explain, compare, reflect, and argue with you.

It cannot silently rewrite your library because it got excited.

If the cloud layer is unavailable, JoeAnimeDB still has its local recommendation and analysis paths.

## Recommendation cards got more useful

Recommendation results now expose stronger evidence instead of relying on one suspicious match number.

Depending on the request, cards can show things like:

- request fit
- taste fit
- overall fit
- JoeAI insight
- match analysis
- signal strength
- source-aware reasoning
- why a title survived the request

The goal is simple: every recommendation should be able to answer three questions.

1. Why this title?
2. Why for this user?
3. Why for this request?

If those answers are weak, the recommendation probably should not be there.

## Bugs and regressions crushed along the way

Beta 20 also includes fixes for a pile of edge cases uncovered while deliberately trying to break JoeAI:

- watched titles leaking into discovery
- source titles drifting during explanation
- typo handling such as `recomend something like slime`
- constraint text being mistaken for part of a title
- title or Genome cards hijacking recommendation requests
- source-franchise cheating
- duplicate franchise candidates
- later-season recommendations without prerequisite context
- alias and acronym mismatches
- shorthand resolving to the wrong season
- comparison prompts being stolen by the wrong route
- made-up saved scores in comparison prose
- missing comparison receipts
- JoeAI conversation history disappearing after refresh or restart
- overly formal casual-chat responses
- unclear backup, restore, import, and export wording

There was also a point where a very specific metadata request somehow ended with Gintama Season 2 being recommended for reasons nobody could defend.

That no longer counts as acceptable science.

## Quick torture-test prompts

Want to see what changed?

```text
what should I watch next?
recommend something like Bleach but shorter
recommend Slime without isekai
what is unusual about my library?
which fits my taste better, Bleach or JJK?
which would I like better, Bleach or Banana Fish?
which would I like better, Banana Fish or Gintama?
```

Then immediately follow a recommendation with:

```text
darker
no school
under 24 episodes
another one
why that one?
```

You can also ask:

```text
what can you do?
how are you today?
never question the power of JoeAI
```

Results may vary on that last one.

## Still JoeAnimeDB

JoeAnimeDB is still free and local-first where it matters.

The basic idea has not changed:

Your anime tracker should know enough about your actual taste to be useful instead of acting like a generic "Top 10 Anime You Should Watch" list.

Beta 20 is the biggest step toward that goal yet.

**JoeAI finally feels like JoeAI.**

---

**JoeAnimeDB 5.0.0-beta.20**

*Track it. Understand it. Find the next obsession.*
