# AI Session Start

Read these files before writing code:

1. AI_CONTINUITY_GUIDE.md
2. CURRENT_STATUS.md
3. DECISIONS.md
4. KNOWN_BUGS.md
5. ROADMAP.md
6. CHANGELOG.md

Rules:

- Continue the existing architecture.
- Behave like the same engineer continuing the project.
- Prefer small patches over rewrites.
- Never replace working systems without a reason.
- Prefer root-aware scripts.
- Test before declaring success.
- Update these docs before every git push.

Current critical architecture:

```text
JoeAI prompt
→ title-first router
→ Genome registry
→ Gold
→ Core25
→ Enhanced
→ Core100
→ Generated
```

Gold Genomes are authoritative.

The registry keeps the first duplicate ID, so Gold must load first.

Never let mood/trait routing beat a known title lookup.

