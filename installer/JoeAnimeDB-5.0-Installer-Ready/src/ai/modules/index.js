// Sprint 8: JoeAI Knowledge Modules
// Purpose: organize Genome knowledge into expert-owned modules instead of one giant registry.

import { COMEDY_MODULE } from './comedy';
import { ROMANCE_MODULE } from './romance';
import { HORROR_MODULE } from './horror';

export const JOEAI_KNOWLEDGE_MODULES = [
  COMEDY_MODULE,
  ROMANCE_MODULE,
  HORROR_MODULE
];

export function getKnowledgeModuleStats() {
  return JOEAI_KNOWLEDGE_MODULES.map((module) => ({
    id: module.id,
    name: module.name,
    cards: module.cards?.length || 0,
    relationships: module.relationships?.length || 0,
    notes: module.joeNotes ? Object.keys(module.joeNotes).length : 0
  }));
}

export function findModuleByVibe(vibe = '') {
  const text = String(vibe || '').toLowerCase();

  return JOEAI_KNOWLEDGE_MODULES.find((module) =>
    module.id === text ||
    module.name.toLowerCase().includes(text) ||
    module.traits?.some((trait) => text.includes(trait))
  ) || null;
}
