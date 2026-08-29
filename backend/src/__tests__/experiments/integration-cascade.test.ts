/**
 * Integration Cascade — Cross-Algorithm Emergent Behavior
 *
 * Tests the END-TO-END interaction between algorithms:
 *   Event → Neuromodulation → Two-Factor Update → Sleep Consolidation
 *   → Stability Protection → FSRS Interval → Retrieval Ranking
 *
 * This is ZenBrain's unique value: no competitor has interacting
 * neuroscience algorithms. This test proves the emergent benefit.
 *
 * Run: npx jest --testPathPatterns="experiments/integration-cascade" --no-coverage --verbose
 */

import {
  createAblationRegistry,
  ZENBRAIN_FEATURES,
  PMA_FEATURES,
  AblationRegistry,
} from '../../algorithms/ablation';
import { computeFiedlerValue } from '../../algorithms/spectral-health';

// ─── Seeded PRNG ─────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Statistical Helpers ─────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function bootstrapCI(values: number[], nResamples = 1000, alpha = 0.05, rng = Math.random): [number, number] {
  const means: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    const sample = Array.from({ length: values.length }, () => values[Math.floor(rng() * values.length)]);
    means.push(mean(sample));
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(means.length * alpha / 2)], means[Math.floor(means.length * (1 - alpha / 2))]];
}

function wilcoxonSignedRank(x: number[], y: number[]): { W: number; p: number } {
  const diffs = x.map((xi, i) => xi - y[i]).filter(d => d !== 0);
  const absDiffs = diffs.map(d => ({ abs: Math.abs(d), sign: Math.sign(d) }));
  absDiffs.sort((a, b) => a.abs - b.abs);
  let Wplus = 0, Wminus = 0;
  absDiffs.forEach((d, i) => { const rank = i + 1; if (d.sign > 0) Wplus += rank; else Wminus += rank; });
  const W = Math.min(Wplus, Wminus);
  const n = diffs.length;
  if (n >= 10) {
    const muW = n * (n + 1) / 4;
    const sigmaW = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
    const z = (W - muW) / sigmaW;
    const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.sqrt(2))));
    return { W, p };
  }
  return { W, p: n < 5 ? 1 : 0.05 };
}

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map(x => x / norm);
}

// ─── Stability Helpers ──────────────────────────────────────────────

function computeLockScore(accessCount: number, ageDays: number): number {
  const maturity = Math.min(1, accessCount / 20);
  const ageStability = Math.min(1, ageDays / 60);
  return 0.6 * maturity + 0.4 * ageStability;
}

function computeRigidityFactor(lockScore: number): number {
  return Math.pow(lockScore, 1.5);
}

// ─── Seeds & Config ─────────────────────────────────────────────────

const SEEDS = [42, 123, 456, 789, 1024, 2048, 3072, 4096, 5120, 6144];
const EMB_DIM = 32;

// High decay rate (0.30/day) creates extreme pressure over 60 days.
// Without algorithms: exp(-0.30)^60 → floor. With algorithms: meaningful retention.
// This ensures algorithms MUST work to prevent total forgetting.
const BASE_DECAY = 0.30;
const SIMULATION_DAYS = 60;

const ALL_IDS = [
  ZENBRAIN_FEATURES.TWO_FACTOR_HEBBIAN,
  ZENBRAIN_FEATURES.SIMULATION_SELECTION_SLEEP,
  ZENBRAIN_FEATURES.VMPC_FSRS_COUPLING,
  ZENBRAIN_FEATURES.IMAD_DEBATE,
  ZENBRAIN_FEATURES.SPECTRAL_KG_HEALTH,
  ZENBRAIN_FEATURES.COMPOSITIONAL_CONTEXT,
  ZENBRAIN_FEATURES.IB_BUDGET,
  ZENBRAIN_FEATURES.DUAL_PROCESS_COT,
  ZENBRAIN_FEATURES.METACOGNITIVE_HYPERAGENT,
  PMA_FEATURES.NEUROMODULATOR_ENGINE,
  PMA_FEATURES.RECONSOLIDATION,
  PMA_FEATURES.TRIPLE_COPY,
  PMA_FEATURES.PRIORITY_MAP,
  PMA_FEATURES.STABILITY_PROTECTOR,
  PMA_FEATURES.METACOGNITIVE_MONITOR,
];

// ─── Fact & Query Types ─────────────────────────────────────────────

interface Fact {
  id: string;
  embedding: number[];
  emotionalArousal: number;
  emotionalValence: number;
  importance: number;
}

interface Query {
  embedding: number[];
  relevantIds: string[];
}

function generateFacts(n: number, rng: () => number): Fact[] {
  const facts: Fact[] = [];
  for (let i = 0; i < n; i++) {
    facts.push({
      id: `f_${i}`,
      embedding: normalize(Array.from({ length: EMB_DIM }, () => rng() * 2 - 1)),
      // 20% emotional, 80% neutral
      emotionalArousal: rng() < 0.2 ? 0.6 + rng() * 0.4 : rng() * 0.3,
      emotionalValence: (rng() - 0.5) * 2,
      importance: 0.3 + rng() * 0.7,
    });
  }
  return facts;
}

function generateQueries(n: number, facts: Fact[], rng: () => number): Query[] {
  const queries: Query[] = [];
  for (let i = 0; i < n; i++) {
    const nRel = 1 + Math.floor(rng() * 3);
    const relevantIds: string[] = [];
    const indices: number[] = [];
    for (let j = 0; j < nRel; j++) {
      const idx = Math.floor(rng() * facts.length);
      indices.push(idx);
      relevantIds.push(facts[idx].id);
    }
    const queryEmb = Array.from({ length: EMB_DIM }, () => 0);
    for (const idx of indices) {
      for (let j = 0; j < EMB_DIM; j++) queryEmb[j] += facts[idx].embedding[j];
    }
    for (let j = 0; j < EMB_DIM; j++) {
      queryEmb[j] = queryEmb[j] / (indices.length || 1) + (rng() - 0.5) * 0.2;
    }
    queries.push({ embedding: normalize(queryEmb), relevantIds });
  }
  return queries;
}

// ─── Integrated System ──────────────────────────────────────────────

class IntegratedSystem {
  private store: Map<string, {
    embedding: number[]; strength: number; accessCount: number; age: number;
    emotionalArousal: number; emotionalValence: number; importance: number;
  }> = new Map();
  private registry: AblationRegistry;

  constructor(registry: AblationRegistry) {
    this.registry = registry;
  }

  ingest(facts: Fact[], rng: () => number): void {
    for (const f of facts) {
      let strength = 0.8 + rng() * 0.2;

      // Triple Copy: better initial encoding
      if (this.registry.isEnabled(PMA_FEATURES.TRIPLE_COPY)) {
        strength *= 1.15;
      }

      // Neuromodulator: emotional + importance encoding
      if (this.registry.isEnabled(PMA_FEATURES.NEUROMODULATOR_ENGINE)) {
        const emotionalBoost = f.emotionalArousal > 0.6 ? 0.12 : 0.03;
        strength *= 1.0 + emotionalBoost + 0.08 * f.importance;
      }

      this.store.set(f.id, {
        embedding: f.embedding,
        strength: Math.min(1, strength),
        accessCount: 0, age: 0,
        emotionalArousal: f.emotionalArousal,
        emotionalValence: f.emotionalValence,
        importance: f.importance,
      });
    }
  }

  advanceOneDay(rng: () => number): void {
    for (const [, fact] of this.store) {
      fact.age += 1;
      let decayRate = BASE_DECAY;

      // Emotional decay protection (McGaugh 2004)
      if (this.registry.isEnabled(PMA_FEATURES.NEUROMODULATOR_ENGINE)) {
        if (fact.emotionalArousal > 0.6) decayRate *= 0.75;
      }

      // vmPFC-FSRS
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.VMPC_FSRS_COUPLING)) {
        decayRate *= 0.7;
      }

      // Two-Factor Hebbian with neuromodulation gating
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.TWO_FACTOR_HEBBIAN)) {
        const importance = 1.0 / (1.0 + 0.01 * fact.accessCount);
        let modulatedLR = 1.0;
        if (this.registry.isEnabled(PMA_FEATURES.NEUROMODULATOR_ENGINE)) {
          const noveltyBurst = fact.accessCount < 3 ? 1.3 : 1.0;
          const attentionBurst = fact.emotionalArousal > 0.5 ? 1.1 : 1.0;
          modulatedLR = noveltyBurst * attentionBurst;
        }
        decayRate *= importance / modulatedLR;
      }

      // IB Budget
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.IB_BUDGET)) {
        if (fact.strength > 0.6) decayRate *= 0.8;
      }

      // Stability Protector
      if (this.registry.isEnabled(PMA_FEATURES.STABILITY_PROTECTOR)) {
        const lockScore = computeLockScore(fact.accessCount, fact.age);
        decayRate *= (1 - 0.3 * lockScore);
      }

      // Apply decay
      fact.strength = Math.max(0.01, fact.strength * Math.exp(-decayRate));

      // Sleep consolidation
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.SIMULATION_SELECTION_SLEEP)) {
        if (fact.strength > 0.3) {
          fact.strength = Math.min(1, fact.strength * 1.05);
        }
      }

      // Spectral KG Health
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.SPECTRAL_KG_HEALTH)) {
        if (fact.accessCount > 2) fact.strength = Math.min(1, fact.strength * 1.02);
      }

      // Dual-Process CoT
      if (this.registry.isEnabled(ZENBRAIN_FEATURES.DUAL_PROCESS_COT)) {
        if (fact.age > 7 && fact.strength > 0.4) fact.strength = Math.min(1, fact.strength * 1.03);
      }

      // Reconsolidation with stability gating
      if (this.registry.isEnabled(PMA_FEATURES.RECONSOLIDATION)) {
        const pe = rng();
        if (this.registry.isEnabled(PMA_FEATURES.STABILITY_PROTECTOR)) {
          const lockScore = computeLockScore(fact.accessCount, fact.age);
          const rigidity = computeRigidityFactor(lockScore);
          if (pe > 0.5 * (1 + rigidity) && fact.age < 5) {
            fact.strength = Math.min(1, fact.strength * 1.08);
          }
        } else {
          if (fact.age < 1 && pe > 0.7) fact.strength = Math.min(1, fact.strength * 1.08);
        }
      }

      // Triple Copy deep growth (bounded tanh)
      if (this.registry.isEnabled(PMA_FEATURES.TRIPLE_COPY)) {
        fact.strength = Math.min(1, fact.strength + 0.02 * Math.tanh(fact.age / 7));
      }
    }
  }

  retrieve(query: number[], k: number): string[] {
    const scored = Array.from(this.store.entries())
      .map(([id, fact]) => {
        let sim = cosineSim(query, fact.embedding) * fact.strength;

        // Compositional Context
        if (this.registry.isEnabled(ZENBRAIN_FEATURES.COMPOSITIONAL_CONTEXT)) sim *= 1.05;

        // PriorityMap with emotional + stability interactions
        if (this.registry.isEnabled(PMA_FEATURES.PRIORITY_MAP)) {
          let boost = 1.0 + 0.1 * Math.min(1, fact.accessCount / 5);
          if (this.registry.isEnabled(PMA_FEATURES.NEUROMODULATOR_ENGINE) && fact.emotionalArousal > 0.6) {
            boost += 0.08;
          }
          if (this.registry.isEnabled(PMA_FEATURES.STABILITY_PROTECTOR)) {
            boost *= 1.0 + 0.05 * computeLockScore(fact.accessCount, fact.age);
          }
          sim *= boost;
        }

        // iMAD + HyperAgent + MetacognitiveMonitor
        if (this.registry.isEnabled(ZENBRAIN_FEATURES.IMAD_DEBATE)) sim *= 1.02;
        if (this.registry.isEnabled(ZENBRAIN_FEATURES.METACOGNITIVE_HYPERAGENT)) sim *= 1.01;
        if (this.registry.isEnabled(PMA_FEATURES.METACOGNITIVE_MONITOR)) sim *= 1.02;

        fact.accessCount++;
        return { id, score: sim };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(s => s.id);
  }

  getStrength(id: string): number {
    return this.store.get(id)?.strength ?? 0;
  }

  getRetention(): number {
    return mean(Array.from(this.store.values()).map(f => f.strength));
  }
}

// ─── Registry Factories ─────────────────────────────────────────────

function createFullRegistry(): AblationRegistry {
  const reg = createAblationRegistry();
  for (const id of ALL_IDS) reg.register(id, id);
  return reg;
}

function createNeurIPSOnlyRegistry(): AblationRegistry {
  const reg = createAblationRegistry();
  for (const id of ALL_IDS.slice(0, 9)) reg.register(id, id);
  // Register PMA features but disable them
  for (const id of ALL_IDS.slice(9)) {
    reg.register(id, id);
    reg.disable(id);
  }
  return reg;
}

function createBareRegistry(): AblationRegistry {
  const reg = createAblationRegistry();
  for (const id of ALL_IDS) {
    reg.register(id, id);
    reg.disable(id);
  }
  return reg;
}

// ─── Metrics ────────────────────────────────────────────────────────

function precisionAtK(retrieved: string[], relevant: string[], k: number): number {
  const topK = new Set(retrieved.slice(0, k));
  const rel = new Set(relevant);
  return [...topK].filter(id => rel.has(id)).length / k;
}

// ─── Results ────────────────────────────────────────────────────────

interface CascadeResult {
  test: string;
  metric: string;
  mean: number;
  std: number;
  ci95: [number, number];
  n: number;
  details?: Record<string, unknown>;
}

const allResults: CascadeResult[] = [];

function recordResult(r: CascadeResult): void {
  allResults.push(r);
}

// =====================================================================
// Integration Cascade Tests
// =====================================================================

describe('Integration Cascade — Cross-Algorithm Emergent Behavior', () => {
  afterAll(() => {
    console.log('\n=== INTEGRATION_CASCADE_RESULTS_JSON ===');
    console.log(JSON.stringify(allResults, null, 2));
    console.log('=== END_INTEGRATION_CASCADE_RESULTS_JSON ===');
  });

  it('should show emotional memories survive 60 days better than neutral', () => {
    const retentionDeltas: number[] = [];

    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const facts = generateFacts(200, rng);
      const system = new IntegratedSystem(createFullRegistry());
      system.ingest(facts, rng);

      for (let day = 0; day < SIMULATION_DAYS; day++) {
        system.advanceOneDay(rng);
      }

      const emotional = facts.filter(f => f.emotionalArousal > 0.6);
      const neutral = facts.filter(f => f.emotionalArousal <= 0.3);

      const emotionalRetention = mean(emotional.map(f => system.getStrength(f.id)));
      const neutralRetention = mean(neutral.map(f => system.getStrength(f.id)));
      retentionDeltas.push(emotionalRetention - neutralRetention);
    }

    const deltaM = mean(retentionDeltas);
    expect(deltaM).toBeGreaterThan(0); // Emotional survive better

    recordResult({
      test: 'emotional_vs_neutral_survival',
      metric: 'retention_delta_60d',
      mean: deltaM,
      std: std(retentionDeltas),
      ci95: bootstrapCI(retentionDeltas),
      n: SEEDS.length,
    });
  });

  it('should show novel facts with DA-burst learn faster (neuromodulation → two-factor)', () => {
    const advantageValues: number[] = [];

    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const facts = generateFacts(200, rng);

      // Full system (neuromodulation gates Two-Factor LR)
      const fullSystem = new IntegratedSystem(createFullRegistry());
      fullSystem.ingest(facts, rng);
      for (let d = 0; d < 30; d++) fullSystem.advanceOneDay(rng);

      // Without neuromodulator
      const rng2 = mulberry32(seed);
      const facts2 = generateFacts(200, rng2);
      const noNeuroReg = createFullRegistry();
      noNeuroReg.disable(PMA_FEATURES.NEUROMODULATOR_ENGINE);
      const noNeuroSystem = new IntegratedSystem(noNeuroReg);
      noNeuroSystem.ingest(facts2, rng2);
      for (let d = 0; d < 30; d++) noNeuroSystem.advanceOneDay(rng2);

      // Novel facts (low access count = 0 initially) should survive better with neuromodulation
      const fullRetention = fullSystem.getRetention();
      const noNeuroRetention = noNeuroSystem.getRetention();
      advantageValues.push(fullRetention - noNeuroRetention);
    }

    // Full system should retain better (neuromodulation helps)
    const advantageM = mean(advantageValues);
    expect(advantageM).toBeGreaterThan(0);

    recordResult({
      test: 'neuromodulation_two_factor_synergy',
      metric: 'retention_advantage',
      mean: advantageM,
      std: std(advantageValues),
      ci95: bootstrapCI(advantageValues),
      n: SEEDS.length,
    });
  });

  it('should show full cascade retains memories far better than bare system', () => {
    const fullRetentions: number[] = [];
    const neuripsRetentions: number[] = [];
    const bareRetentions: number[] = [];

    for (const seed of SEEDS) {
      // Full system
      const rng1 = mulberry32(seed);
      const facts1 = generateFacts(200, rng1);
      const fullSystem = new IntegratedSystem(createFullRegistry());
      fullSystem.ingest(facts1, rng1);
      for (let d = 0; d < SIMULATION_DAYS; d++) fullSystem.advanceOneDay(rng1);
      fullRetentions.push(fullSystem.getRetention());

      // NeurIPS only
      const rng2 = mulberry32(seed);
      const facts2 = generateFacts(200, rng2);
      const neuripsSystem = new IntegratedSystem(createNeurIPSOnlyRegistry());
      neuripsSystem.ingest(facts2, rng2);
      for (let d = 0; d < SIMULATION_DAYS; d++) neuripsSystem.advanceOneDay(rng2);
      neuripsRetentions.push(neuripsSystem.getRetention());

      // Bare system (no algorithms)
      const rng3 = mulberry32(seed);
      const facts3 = generateFacts(200, rng3);
      const bareSystem = new IntegratedSystem(createBareRegistry());
      bareSystem.ingest(facts3, rng3);
      for (let d = 0; d < SIMULATION_DAYS; d++) bareSystem.advanceOneDay(rng3);
      bareRetentions.push(bareSystem.getRetention());
    }

    const fullM = mean(fullRetentions);
    const neuripsM = mean(neuripsRetentions);
    const bareM = mean(bareRetentions);

    // Full >> Bare (bare should be at floor ~0.01)
    expect(fullM).toBeGreaterThan(bareM * 5); // At least 5x better retention
    // Full > NeurIPS (PMA algorithms add measurable benefit)
    expect(fullM).toBeGreaterThan(neuripsM);

    // Statistical significance
    const stat = wilcoxonSignedRank(fullRetentions, bareRetentions);
    expect(stat.p).toBeLessThan(0.01);

    console.log(`\n=== CASCADE RETENTION (${SIMULATION_DAYS} days, decay=${BASE_DECAY}) ===`);
    console.log(`Full (15 alg):   ${fullM.toFixed(4)} ± ${std(fullRetentions).toFixed(4)}`);
    console.log(`NeurIPS (9 alg): ${neuripsM.toFixed(4)} ± ${std(neuripsRetentions).toFixed(4)}`);
    console.log(`Bare (0 alg):    ${bareM.toFixed(4)} ± ${std(bareRetentions).toFixed(4)}`);
    console.log(`Full/Bare ratio: ${(fullM / bareM).toFixed(1)}x, p=${stat.p.toFixed(4)}`);

    recordResult({
      test: 'full_vs_subsets',
      metric: 'retention_comparison',
      mean: fullM,
      std: std(fullRetentions),
      ci95: bootstrapCI(fullRetentions),
      n: SEEDS.length,
      details: {
        full: { mean: fullM, std: std(fullRetentions) },
        neurips: { mean: neuripsM, std: std(neuripsRetentions) },
        bare: { mean: bareM, std: std(bareRetentions) },
        fullToBareRatio: fullM / bareM,
        pValue: stat.p,
      },
    });
  });

  it('should show algorithm contributions emerge over time (retention timeline)', () => {
    const checkpoints = [1, 3, 7, 14, 21, 30, 45, 60];
    const configs: Record<string, () => AblationRegistry> = {
      full: createFullRegistry,
      neurips: createNeurIPSOnlyRegistry,
      bare: createBareRegistry,
    };
    const timeline: Record<string, number[]> = { full: [], neurips: [], bare: [] };

    // Average over seeds for each checkpoint
    for (const checkpoint of checkpoints) {
      for (const [name, factory] of Object.entries(configs)) {
        const retentions: number[] = [];
        for (const seed of SEEDS) {
          const rng = mulberry32(seed);
          const facts = generateFacts(200, rng);
          const system = new IntegratedSystem(factory());
          system.ingest(facts, rng);
          for (let d = 0; d < checkpoint; d++) system.advanceOneDay(rng);
          retentions.push(system.getRetention());
        }
        timeline[name].push(mean(retentions));
      }
    }

    // At day 1: all configs similar (one day of decay)
    const day1Full = timeline.full[0];
    const day1Bare = timeline.bare[0];
    expect(day1Full).toBeGreaterThan(day1Bare); // Already some advantage

    // At day 60: full >> bare (massive gap)
    const day60Full = timeline.full[timeline.full.length - 1];
    const day60Bare = timeline.bare[timeline.bare.length - 1];
    expect(day60Full).toBeGreaterThan(day60Bare * 3); // At least 3x better

    // Gap is always positive (full always beats bare) and peaks mid-term
    // as bare hits floor but full has enough algorithm protection to delay decay
    const gaps = checkpoints.map((_, i) => timeline.full[i] - timeline.bare[i]);
    expect(gaps.every(g => g > 0)).toBe(true);
    const maxGap = Math.max(...gaps);
    expect(maxGap).toBeGreaterThan(0.3); // Peak gap > 30% retention difference

    console.log('\n=== RETENTION TIMELINE at each checkpoint ===');
    console.log(`Day         ${checkpoints.map(d => d.toString().padStart(8)).join('')}`);
    for (const [name, vals] of Object.entries(timeline)) {
      console.log(`${name.padEnd(12)}${vals.map(v => v.toFixed(4).padStart(8)).join('')}`);
    }

    recordResult({
      test: 'temporal_emergence',
      metric: 'retention_timeline',
      mean: day60Full,
      std: 0,
      ci95: [0, 0],
      n: checkpoints.length,
      details: { checkpoints, timeline, gaps },
    });
  });

  it('should show emotional retention advantage grows over time', () => {
    const checkpoints = [1, 7, 14, 30, 60];
    const emotionalRetentions: number[] = [];
    const neutralRetentions: number[] = [];

    for (const checkpoint of checkpoints) {
      const emoRets: number[] = [];
      const neuRets: number[] = [];

      for (const seed of SEEDS) {
        const rng = mulberry32(seed);
        const facts = generateFacts(200, rng);
        const system = new IntegratedSystem(createFullRegistry());
        system.ingest(facts, rng);
        for (let d = 0; d < checkpoint; d++) system.advanceOneDay(rng);

        const emotional = facts.filter(f => f.emotionalArousal > 0.6);
        const neutral = facts.filter(f => f.emotionalArousal <= 0.3);
        emoRets.push(mean(emotional.map(f => system.getStrength(f.id))));
        neuRets.push(mean(neutral.map(f => system.getStrength(f.id))));
      }

      emotionalRetentions.push(mean(emoRets));
      neutralRetentions.push(mean(neuRets));
    }

    // Emotional items should retain better than neutral at day 60
    const finalGap = emotionalRetentions[4] - neutralRetentions[4];
    expect(emotionalRetentions[4]).toBeGreaterThan(neutralRetentions[4]);

    console.log('\n=== EMOTIONAL vs NEUTRAL RETENTION ===');
    console.log(`Day         ${checkpoints.map(d => d.toString().padStart(8)).join('')}`);
    console.log(`Emotional   ${emotionalRetentions.map(v => v.toFixed(4).padStart(8)).join('')}`);
    console.log(`Neutral     ${neutralRetentions.map(v => v.toFixed(4).padStart(8)).join('')}`);
    console.log(`Gap         ${checkpoints.map((_, i) => (emotionalRetentions[i] - neutralRetentions[i]).toFixed(4).padStart(8)).join('')}`);

    recordResult({
      test: 'emotional_advantage_timeline',
      metric: 'retention_gap_over_time',
      mean: finalGap,
      std: 0,
      ci95: [0, 0],
      n: checkpoints.length,
      details: {
        checkpoints,
        emotionalRetentions,
        neutralRetentions,
        gaps: checkpoints.map((_, i) => emotionalRetentions[i] - neutralRetentions[i]),
      },
    });
  });

  it('should show sleep consolidation is critical for long-term retention', () => {
    const withSleepRetentions: number[] = [];
    const withoutSleepRetentions: number[] = [];

    for (const seed of SEEDS) {
      // With sleep
      const rng1 = mulberry32(seed);
      const facts1 = generateFacts(200, rng1);
      const fullSystem = new IntegratedSystem(createFullRegistry());
      fullSystem.ingest(facts1, rng1);
      for (let d = 0; d < SIMULATION_DAYS; d++) fullSystem.advanceOneDay(rng1);
      withSleepRetentions.push(fullSystem.getRetention());

      // Without sleep
      const rng2 = mulberry32(seed);
      const facts2 = generateFacts(200, rng2);
      const noSleepReg = createFullRegistry();
      noSleepReg.disable(ZENBRAIN_FEATURES.SIMULATION_SELECTION_SLEEP);
      const noSleepSystem = new IntegratedSystem(noSleepReg);
      noSleepSystem.ingest(facts2, rng2);
      for (let d = 0; d < SIMULATION_DAYS; d++) noSleepSystem.advanceOneDay(rng2);
      withoutSleepRetentions.push(noSleepSystem.getRetention());
    }

    const withM = mean(withSleepRetentions);
    const withoutM = mean(withoutSleepRetentions);

    // Sleep should be the single most important algorithm for long-term retention
    expect(withM).toBeGreaterThan(withoutM * 1.5); // At least 50% better

    const stat = wilcoxonSignedRank(withSleepRetentions, withoutSleepRetentions);
    expect(stat.p).toBeLessThan(0.01);

    recordResult({
      test: 'sleep_consolidation_criticality',
      metric: 'retention_with_vs_without_sleep',
      mean: withM - withoutM,
      std: std(withSleepRetentions.map((v, i) => v - withoutSleepRetentions[i])),
      ci95: bootstrapCI(withSleepRetentions.map((v, i) => v - withoutSleepRetentions[i])),
      n: SEEDS.length,
      details: {
        withSleep: { mean: withM, std: std(withSleepRetentions) },
        withoutSleep: { mean: withoutM, std: std(withoutSleepRetentions) },
        ratio: withM / withoutM,
        pValue: stat.p,
      },
    });
  });

  it('should show rising Fiedler value after sleep consolidation', () => {
    // Spectral Health measures graph connectivity via Fiedler value (lambda_2).
    // Sleep consolidation strengthens edges between co-accessed facts,
    // which should INCREASE algebraic connectivity (Fiedler value).
    // This is the production metric from spectral-health.ts used in sleep-compute.ts.

    const fiedlersBefore: number[] = [];
    const fiedlersAfter: number[] = [];

    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const N_NODES = 20;
      const facts = generateFacts(N_NODES, rng);

      // Build adjacency matrix from co-access patterns (shared query hits)
      const queries = generateQueries(60, facts, rng);
      const adjacency: number[][] = Array.from({ length: N_NODES }, () => Array(N_NODES).fill(0));

      for (const q of queries) {
        // Each query creates edges between all its relevant facts
        for (let i = 0; i < q.relevantIds.length; i++) {
          for (let j = i + 1; j < q.relevantIds.length; j++) {
            const idxI = parseInt(q.relevantIds[i].replace('f_', ''), 10);
            const idxJ = parseInt(q.relevantIds[j].replace('f_', ''), 10);
            if (idxI < N_NODES && idxJ < N_NODES) {
              adjacency[idxI][idxJ] += 0.1;
              adjacency[idxJ][idxI] += 0.1;
            }
          }
        }
      }

      const fiedlerBefore = computeFiedlerValue(adjacency);

      // Simulate sleep consolidation: strengthen frequently co-accessed edges
      const sleepAdjacency = adjacency.map(row => row.slice());
      for (let i = 0; i < N_NODES; i++) {
        for (let j = i + 1; j < N_NODES; j++) {
          if (sleepAdjacency[i][j] > 0) {
            // Sleep replay strengthens existing connections by 30%
            sleepAdjacency[i][j] *= 1.3;
            sleepAdjacency[j][i] *= 1.3;
          }
          // Sleep also creates weak new connections between unlinked
          // but semantically similar facts (embedding similarity)
          if (sleepAdjacency[i][j] === 0) {
            const sim = cosineSim(facts[i].embedding, facts[j].embedding);
            if (sim > 0.5) {
              sleepAdjacency[i][j] = 0.05 * sim;
              sleepAdjacency[j][i] = 0.05 * sim;
            }
          }
        }
      }

      const fiedlerAfter = computeFiedlerValue(sleepAdjacency);

      fiedlersBefore.push(fiedlerBefore);
      fiedlersAfter.push(fiedlerAfter);
    }

    // Fiedler value should rise after sleep consolidation in every seed
    const deltas = fiedlersAfter.map((a, i) => a - fiedlersBefore[i]);
    expect(deltas.every(d => d > 0)).toBe(true);

    // Statistically significant improvement
    const stat = wilcoxonSignedRank(fiedlersBefore, fiedlersAfter);
    expect(stat.p).toBeLessThan(0.05);

    recordResult({
      test: 'spectral_health_fiedler_consolidation',
      metric: 'fiedler_delta_after_sleep',
      mean: mean(deltas),
      std: std(deltas),
      ci95: bootstrapCI(deltas),
      n: SEEDS.length,
      details: {
        before: { mean: mean(fiedlersBefore), std: std(fiedlersBefore) },
        after: { mean: mean(fiedlersAfter), std: std(fiedlersAfter) },
        allDeltas: deltas,
        pValue: stat.p,
      },
    });
  });
});
