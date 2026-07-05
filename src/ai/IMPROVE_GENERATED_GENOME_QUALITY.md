# Improve Generated Genome Quality

This upgrades the heuristic generator from simple genre metadata to richer pattern inference.

## Adds

- Rich profile inference from synopsis + genres + themes
- Stronger signatures
- Core Fantasy drafts
- Viewer motivations
- Atmosphere and emotional profile
- Why fans love it
- Who should watch / avoid
- Confidence score
- generationQuality

## Test

```cmd
node scripts\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```
