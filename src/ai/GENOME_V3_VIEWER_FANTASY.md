# Genome v3 — Viewer Fantasy Profile

Adds richer experience-based fields to generated Genome Cards.

## New optional fields

```js
coreFantasy
fantasyPillars
emotionalJourney
rewardLoop
dopamineSources
viewerType
pacing
complexity
```

## Why

Genres describe what a show is.

Viewer Fantasy describes what the viewer is chasing.

Example:

```text
"I want to uncover forbidden secrets"
```

should match shows with:

- forbidden knowledge
- secret societies
- occult investigation
- mystery progression

not just the genre "Mystery".

## Test

```cmd
node scripts\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```

Then ask:

```text
recommend Lord of Mysteries
```
