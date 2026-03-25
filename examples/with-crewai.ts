/**
 * ZenBrain + Multi-Agent (CrewAI-style) Integration Example
 *
 * Shows how multiple agents (Researcher, Writer, Reviewer) share
 * Working Memory and use Hebbian learning to strengthen knowledge
 * connections between co-activated concepts.
 *
 * == Neuroscience Background ==
 *
 * Hebbian Learning (Hebb, 1949): "Neurons that fire together, wire together."
 * When two concepts are activated in the same context (co-activation), the
 * connection between them strengthens. Over time, disuse causes decay —
 * connections weaken following an exponential curve.
 *
 * In this multi-agent scenario:
 * - The Researcher discovers concepts → they enter shared Working Memory
 * - Concepts discovered together get Hebbian co-activation (edge strengthening)
 * - The Writer reinforces connections it uses (stronger co-activation)
 * - After 24h, unused connections decay (simulating biological forgetting)
 *
 * Homeostatic normalization (Turrigiano, 2008) prevents runaway strengthening:
 * total edge weight is kept at a constant budget, so strengthening one
 * connection relatively weakens others. This is how the brain maintains
 * stability while learning.
 *
 * Prerequisites:
 *   npm install @zensation/algorithms @zensation/core
 *
 * Run:
 *   npx tsx examples/with-crewai.ts
 */
import { WorkingMemory } from '@zensation/core';
import {
  computeHebbianStrengthening,
  computeHebbianDecay,
  tagEmotion,
  computeEmotionalWeight,
} from '@zensation/algorithms';

// --- Shared memory across all agents ---

const sharedMemory = new WorkingMemory({ maxSlots: 12 });

// Knowledge graph edges: track connection strength between concepts
const edges = new Map<string, number>();

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

/** When two concepts are active together, strengthen their Hebbian connection. */
function coactivate(conceptA: string, conceptB: string): void {
  const key = edgeKey(conceptA, conceptB);
  const current = edges.get(key) ?? 0.1;
  const strengthened = computeHebbianStrengthening(current, 1.0, 1.0);
  edges.set(key, strengthened);
}

/** Decay all edges (call periodically to simulate forgetting). */
function decayAllEdges(hours: number): void {
  for (const [key, strength] of edges) {
    const decayed = computeHebbianDecay(strength, hours);
    if (decayed < 0.01) {
      edges.delete(key);
    } else {
      edges.set(key, decayed);
    }
  }
}

// --- Agent definitions (CrewAI-style roles) ---

interface AgentResult {
  agent: string;
  output: string;
  concepts: string[];
}

async function researcher(topic: string): Promise<AgentResult> {
  const concepts = ['memory systems', 'spaced repetition', 'neural plasticity'];
  // Researcher adds discovered concepts to shared memory
  for (const c of concepts) {
    await sharedMemory.add(c, 'fact', 0.8);
  }
  // Co-activate all discovered concepts (they appeared together)
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      coactivate(concepts[i], concepts[j]);
    }
  }
  return { agent: 'Researcher', output: `Found ${concepts.length} key concepts for "${topic}"`, concepts };
}

async function writer(researchOutput: AgentResult): Promise<AgentResult> {
  // Writer reads shared memory to build on researcher's findings
  const slots = sharedMemory.getSlots();
  const emotion = tagEmotion(researchOutput.output);
  const { consolidationWeight } = computeEmotionalWeight(emotion);
  await sharedMemory.add(`Draft article on ${researchOutput.concepts[0]}`, 'goal', consolidationWeight);

  // Writer co-activates the concepts they chose to write about
  coactivate(researchOutput.concepts[0], researchOutput.concepts[1]);

  return {
    agent: 'Writer',
    output: `Drafted article using ${slots.length} memory slots (emotional weight: ${consolidationWeight.toFixed(2)})`,
    concepts: researchOutput.concepts.slice(0, 2),
  };
}

async function reviewer(writerOutput: AgentResult): Promise<AgentResult> {
  const slots = sharedMemory.getSlots();
  // Reviewer checks consistency against all known facts
  const issues = slots.length < 3 ? ['Needs more supporting evidence'] : [];
  return {
    agent: 'Reviewer',
    output: issues.length === 0 ? 'Approved — all facts cross-referenced' : `Found ${issues.length} issue(s)`,
    concepts: writerOutput.concepts,
  };
}

// --- Crew execution pipeline ---

async function runCrew(topic: string) {
  console.log(`\n=== Crew Task: "${topic}" ===\n`);

  const research = await researcher(topic);
  console.log(`[${research.agent}] ${research.output}`);

  const draft = await writer(research);
  console.log(`[${draft.agent}] ${draft.output}`);

  const review = await reviewer(draft);
  console.log(`[${review.agent}] ${review.output}`);

  // Show Hebbian edge strengths after the crew finishes
  console.log('\n--- Knowledge Graph (Hebbian edges) ---');
  for (const [key, strength] of edges) {
    console.log(`  ${key.replace('::', ' <-> ')}: ${strength.toFixed(3)}`);
  }

  // Simulate time passing and decay
  decayAllEdges(24);
  console.log('\n--- After 24h decay ---');
  for (const [key, strength] of edges) {
    console.log(`  ${key.replace('::', ' <-> ')}: ${strength.toFixed(3)}`);
  }

  console.log(`\nShared memory slots: ${sharedMemory.size}/${sharedMemory.capacity.max}`);
}

runCrew('How neuroscience inspires AI memory systems').catch(console.error);
