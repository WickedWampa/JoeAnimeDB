import { findGenomeCard } from './genomeCards';
import { relationshipFor } from './genomeRelationshipGraph';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function arr(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function softOverlap(a = [], b = []) {
  const aa = arr(a).map(norm);
  const bb = arr(b).map(norm);
  return aa.filter((x) => bb.some((y) => x.includes(y) || y.includes(x)));
}

function domainPenalty(sourceCard, candidateCard) {
  if (!sourceCard || !candidateCard) return 0;

  const candidateDomainText = norm([
    candidateCard.domain,
    candidateCard.subdomain,
    ...arr(candidateCard.setting),
    ...arr(candidateCard.themes)
  ].join(' '));

  if (sourceCard.avoidDomains?.some((bad) => candidateDomainText.includes(norm(bad)))) return -0.45;

  if (sourceCard.mustMatchDomains?.length) {
    const ok = sourceCard.mustMatchDomains.some((domain) => candidateDomainText.includes(norm(domain)));
    if (!ok && sourceCard.domain !== candidateCard.domain) return -0.25;
  }

  return 0;
}

export function compareGenome(sourceCard, candidateCard) {
  if (!sourceCard || !candidateCard) return null;

  let score = 0;
  const reasons = [];

  if (sourceCard.domain === candidateCard.domain) {
    score += 0.35;
    reasons.push(`same domain: ${sourceCard.domain}`);
  }

  if (sourceCard.subdomain === candidateCard.subdomain) {
    score += 0.25;
    reasons.push(`same subdomain: ${sourceCard.subdomain}`);
  }

  const sharedMood = softOverlap(sourceCard.mood, candidateCard.mood);
  if (sharedMood.length) {
    score += Math.min(0.18, sharedMood.length * 0.06);
    reasons.push(`shared mood: ${sharedMood.slice(0, 3).join(', ')}`);
  }

  const sharedThemes = softOverlap(sourceCard.themes, candidateCard.themes);
  if (sharedThemes.length) {
    score += Math.min(0.22, sharedThemes.length * 0.055);
    reasons.push(`shared themes: ${sharedThemes.slice(0, 3).join(', ')}`);
  }

  const sharedAtmosphere = softOverlap(sourceCard.atmosphere, candidateCard.atmosphere);
  if (sharedAtmosphere.length) {
    score += Math.min(0.16, sharedAtmosphere.length * 0.055);
    reasons.push(`shared atmosphere: ${sharedAtmosphere.slice(0, 3).join(', ')}`);
  }

  const sharedMusic = softOverlap(sourceCard.musicIdentity, candidateCard.musicIdentity);
  if (sharedMusic.length) {
    score += 0.12;
    reasons.push(`shared music identity: ${sharedMusic.slice(0, 2).join(', ')}`);
  }

  // SPRINT5_RELATIONSHIP_GRAPH_SCORING
  const relationship = relationshipFor(sourceCard.id, candidateCard.id);

  if (relationship?.type === 'direct') {
    score = Math.max(score, relationship.weight);
    reasons.unshift(relationship.reason || 'direct curated relationship');
  } else if (relationship?.type === 'thematic') {
    score = Math.max(score, relationship.weight);
    reasons.unshift(relationship.reason || 'thematic curated relationship');
  } else if (relationship?.type === 'avoid') {
    score -= relationship.penalty || 0.5;
    reasons.unshift(relationship.reason || 'curated avoid relationship');
  } else if (sourceCard.successors?.includes(candidateCard.id)) {
    score += 0.4;
    reasons.unshift('curated successor');
  }

  score += domainPenalty(sourceCard, candidateCard);

  return { score: Math.max(0, Math.min(0.99, score)), reasons };
}

export function explainGenomeCard(animeOrTitle) {
  const card = findGenomeCard(animeOrTitle);
  if (!card) return null;

  return [
    `🧬 Anime Genome: ${card.titles[0]}`,
    '',
    card.note,
    '',
    `Domain: ${card.domain}`,
    `Subdomain: ${card.subdomain}`,
    `Mood: ${card.mood.join(', ')}`,
    `Atmosphere: ${card.atmosphere.join(', ')}`,
    `Themes: ${card.themes.join(', ')}`,
    `Music Identity: ${card.musicIdentity.join(', ')}`
  ].join('\n');
}
