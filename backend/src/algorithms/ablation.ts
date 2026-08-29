/**
 * Ablation Toggle Registry — feature flags for NeurIPS ablation studies.
 * Register features, toggle on/off, generate one-at-a-time ablation configs.
 *
 * Project-specific experiment infrastructure — will NOT be published in
 * @zensation/algorithms as it is tied to the ZenAI experiment harness.
 */

export interface AblationFeature { id: string; description: string; enabled: boolean; }
export interface AblationConfig { name: string; disabled: string[]; }

export interface AblationRegistry {
  register(id: string, description: string): void;
  enable(id: string): void;
  disable(id: string): void;
  isEnabled(id: string): boolean;
  listFeatures(): AblationFeature[];
  generateAblationConfigs(): AblationConfig[];
  toJSON(): string;
}

export function createAblationRegistry(serialized?: string): AblationRegistry {
  const features = new Map<string, AblationFeature>();
  if (serialized) {
    const parsed: AblationFeature[] = JSON.parse(serialized);
    for (const f of parsed) features.set(f.id, f);
  }
  return {
    register(id, description) { features.set(id, { id, description, enabled: true }); },
    enable(id) { const f = features.get(id); if (f) f.enabled = true; },
    disable(id) { const f = features.get(id); if (f) f.enabled = false; },
    isEnabled(id) { return features.get(id)?.enabled ?? false; },
    listFeatures() { return Array.from(features.values()); },
    generateAblationConfigs() {
      const ids = Array.from(features.keys());
      return [{ name: 'baseline', disabled: [] }, ...ids.map(id => ({ name: `ablate_${id}`, disabled: [id] }))];
    },
    toJSON() { return JSON.stringify(Array.from(features.values())); },
  };
}

export const ZENBRAIN_FEATURES = {
  TWO_FACTOR_HEBBIAN: 'two_factor_hebbian',
  SIMULATION_SELECTION_SLEEP: 'simulation_selection_sleep',
  VMPC_FSRS_COUPLING: 'vmPFC_fsrs_coupling',
  IMAD_DEBATE: 'imad_debate',
  SPECTRAL_KG_HEALTH: 'spectral_kg_health',
  COMPOSITIONAL_CONTEXT: 'compositional_context',
  IB_BUDGET: 'ib_budget',
  DUAL_PROCESS_COT: 'dual_process_cot',
  METACOGNITIVE_HYPERAGENT: 'metacognitive_hyperagent',
  GWT_IGNITION: 'gwt_ignition',
  LEARNING_PROGRESS: 'learning_progress',
  // Ablation-only: disable Ebbinghaus decay to isolate its P@5 contribution.
  // Not a production feature — used exclusively in NoDecay benchmark variant.
  DECAY_DISABLED: 'decay_disabled',
} as const;

export const PMA_FEATURES = {
  NEUROMODULATOR_ENGINE: 'pma_neuromodulator_engine',
  RECONSOLIDATION: 'pma_reconsolidation',
  TRIPLE_COPY: 'pma_triple_copy',
  STC_RESCUE: 'pma_stc_rescue',
  PRIORITY_MAP: 'pma_priority_map',
  STABILITY_PROTECTOR: 'pma_stability_protector',
  METACOGNITIVE_MONITOR: 'pma_metacognitive_monitor',
  SEMANTIC_PRE_CLUSTERER: 'pma_semantic_pre_clusterer',
} as const;
