# JoeAnimeDB 5.0.0-beta.20 — **JoeAI: Hybrid Intelligence**

> **This is the JoeAI release.**  
> JoeAI no longer just searches your library and throws a recommendation at you. It now reasons over your actual taste data, challenges its own picks, remembers the conversation, handles follow-ups, respects hard constraints, and has just enough personality to occasionally be a smartass about it.

---

## 🚀 The headline

JoeAI has been rebuilt around a new **hybrid recommendation and reasoning system**:

**Local JoeAI brings the receipts. Cloud reasoning reviews the receipts. JoeAnimeDB keeps control.**

Your library, ratings, Anime DNA, Genome data, watch history, rewatches, favorites, and local recommendation engine still provide the evidence. The cloud layer does **not** get to invent titles or directly change your library — it reviews a closed candidate set, explains the fit, reranks the options, and can reject weak recommendations.

The result is a JoeAI that feels dramatically more conversational without giving up the deterministic, local-first behavior that makes JoeAnimeDB trustworthy.

---

# 🧠 JoeAI got a serious brain upgrade

## Two-pass taste review

Recommendations now go through a much stronger pipeline:

1. JoeAnimeDB builds a real candidate pool from your catalog, Anime DNA, Genome evidence, ratings, history, and taste profile.
2. Hard constraints and ownership checks remove titles that should never have made the cut.
3. JoeAI reviews the remaining candidates and can **rerank, challenge, or reject** them.
4. The final results are rendered as full JoeAnimeDB recommendation cards with the evidence attached.

The cloud reviewer cannot just hallucinate a cool anime and sneak it into the list.

If it was not in the local candidate pool, it does not get recommended.

---

## 🎯 Recommendations now understand the actual request

JoeAI is much better at separating **“this fits Joe’s general taste”** from **“this actually answers what Joe asked for.”**

Examples:

- `recommend something like Slime`
- `recommend something like Bleach but shorter`
- `recommend Slime without isekai`
- `I want kingdom building without isekai`
- `give me a movie for tonight`
- `show me a hidden gem`

For source-anchored requests such as **“something like Bleach”**, similarity to Bleach matters most.

For open-ended requests such as **“what should I watch next?”**, your personal taste profile matters most.

And if only two recommendations genuinely survive the request?

**JoeAI returns two good answers instead of padding the screen with five bullshit ones.**

---

## 🚫 Hard constraints are actually hard now

Negative constraints no longer get treated like polite suggestions.

JoeAI can now correctly handle requests such as:

- `without isekai`
- `no school`
- `avoid horror`
- `under 24 episodes`

If you say **no isekai**, an isekai title should not sneak through because JoeAI thinks you would probably like it anyway.

---

## 🔎 Better ownership, alias, franchise, and sequel handling

JoeAI is now much harder to trick with title formatting.

The recommendation system checks ownership using more than an exact displayed title, including IDs, alternate titles, normalized identities, aliases, and subtitle/acronym matching.

That means a title such as:

**BLEACH: Thousand-Year Blood War**

can correctly match a library entry stored as:

**Bleach TYBW**

Already owned means already owned.

JoeAI also does a better job of:

- excluding the source franchise from `something like X` discovery requests;
- collapsing duplicate franchise entries;
- avoiding random Season 2 / OVA / special / recap recommendations;
- requiring prerequisite context before recommending later entries in a franchise.

---

# 💬 JoeAI can hold the conversation now

One of the biggest changes in this beta is **follow-up context**.

You can ask for recommendations and then continue naturally:

- `darker`
- `make it fantasy`
- `no school`
- `under 24 episodes`
- `another one`
- `why that one?`

JoeAI keeps the original request, source title, constraints, and recent recommendation context instead of treating every message like a completely new conversation.

---

## 💾 JoeAI conversation persistence

JoeAI conversations now survive:

- page refreshes;
- leaving JoeAI and returning;
- closing and reopening the app/browser;
- restarting the local development session.

JoeAI no longer wakes up after a refresh pretending you two have never met.

The recent conversation is saved locally and restored when you return.

---

# 🧬 Better library reflection and comparisons

JoeAI can now reason over your library instead of only answering command-style questions.

Try things like:

- `what is unusual about my library?`
- `what do you think I value most in anime?`
- `what is my biggest blind spot?`
- `what surprised you about my ratings?`
- `what assumption about my taste would probably be wrong?`
- `why do I like Bleach more than JJK?`
- `compare Hunter x Hunter and Bleach`
- `which fits my taste better, Bleach or JJK?`

Comparison answers use a structured evidence receipt first, then JoeAI gives its read of the evidence.

And importantly:

**A genre being absent from your library no longer automatically means you dislike it.**

JoeAI distinguishes **underrepresented** from **disliked** unless your actual data supports the stronger claim.

---

# 🃏 Hidden JoeAI Easter eggs

JoeAI may also be developing a personality problem.

There are now hidden reactions buried throughout the assistant for ridiculous questions, insults, anime arguments, existential crises, suspiciously scientific waifu research, Truck-kun encounters, and several things that probably should not have survived QA.

We are not listing all of them here.

Finding them is half the fun.

> **JoeAI has detected a highly scientific research request.**

Somewhere along the way, this also became an official development philosophy:

> *Local JoeAI brings the receipts. Cloud brings the mouth.*

We regret nothing.

---

# 🛡️ Local-first rules are still intact

The new intelligence layer does **not** get free rein over your database.

Library mutations such as adding, updating, or bulk-changing titles remain local and confirmation-based.

JoeAI can recommend, explain, compare, reflect, and argue with you.

It cannot silently rewrite your library because it got excited.

If cloud reasoning is unavailable, JoeAnimeDB still has its local recommendation and analysis path.

---

# ✨ Recommendation card polish

The hybrid recommendation output now includes richer signals such as:

- request fit;
- taste fit;
- overall fit;
- JoeAI insight;
- match analysis;
- recommendation confidence / signal strength;
- source-aware reasoning;
- rejection of weak candidates.

The cards are intended to show **why** something made the list, not just slap a suspicious `95% MATCH` badge on everything JoeAI recognizes.

Scores are now more conservative and more meaningful.

---

# 🧪 Bugs and regressions crushed during testing

This beta also includes fixes for several nasty edge cases uncovered while deliberately trying to break JoeAI:

- watched titles leaking into discovery recommendations;
- the source title drifting to another candidate during explanations;
- typo handling such as `recomend something like slime`;
- constraint text accidentally becoming part of the anime title;
- giant title/Genome cards hijacking recommendation requests;
- source-franchise cheating;
- impossible recommendation counters;
- duplicate franchise candidates;
- later-season recommendations without prerequisite context;
- alias mismatches such as `Bleach TYBW`;
- Markdown formatting inconsistencies;
- JoeAI conversation history disappearing after refresh/restart.

And yes, testing also proved that asking JoeAI for *extremely specific character attributes* can expose metadata the catalog simply does not have.

JoeAI now prefers admitting that limitation over confidently recommending **Gintama Season 2** for absolutely no defensible reason.

Progress.

---

# 🌐 Built for web testing

This release is ready for a much more serious round of live web testing.

The next phase is to hammer the production version with the same adversarial prompts used during local development and verify:

- recommendation quality;
- follow-up context;
- conversation persistence;
- ownership and franchise filtering;
- cloud fallback behavior;
- browser/mobile layouts;
- production latency;
- long-session stability.

Beta means beta.

If you find a weird prompt that breaks JoeAI, **please send it.** Those have consistently produced some of the best improvements in the project.

---

# ❤️ Still JoeAnimeDB

JoeAnimeDB remains free, local-first where it matters, and built around one basic idea:

Your anime tracker should know enough about **your actual taste** to be useful instead of acting like a generic “Top 10 Anime You Should Watch” list.

Beta 20 is the biggest step toward that goal yet.

**JoeAI finally feels like JoeAI.**

---

## Quick torture-test prompts

Want to see what changed?

```text
what should I watch next?
recommend something like Slime
recommend something like Bleach but shorter
recommend Slime without isekai
what is unusual about my library?
why do I like Bleach more than JJK?
what assumption about my taste would probably be wrong?
```

Then immediately follow a recommendation with:

```text
darker
no school
under 24 episodes
another one
why that one?
```

And if you stumble across one of the Easter eggs...

...well, JoeAI said it, not us.

---

**JoeAnimeDB 5.0.0-beta.20**  
*Track it. Understand it. Find the next obsession.*
