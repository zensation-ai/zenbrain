#!/bin/bash
# Simulated playground output for GIF recording
cat << 'EOF'

===========================================
  ZenBrain Playground
  Neuroscience-inspired memory for AI agents
===========================================

1. FSRS Spaced Repetition
─────────────────────────
   Initial state: difficulty=5, stability=7.0
   Current retention: 100.0%
   After recall (grade 4): stability=7.0
   Next review: 2026-03-25T08:09:27.386Z

2. Emotional Memory
───────────────────
   "I just got promoted to Senior Engineer!"
   → arousal=0.35, valence=0.50, significance=0.00
   → decay multiplier: 1.7x (SIGNIFICANT — decays slower)

   "The weather is nice today."
   → arousal=0.30, valence=0.62, significance=0.00
   → decay multiplier: 1.6x

   "My grandmother passed away last week."
   → arousal=0.20, valence=0.50, significance=0.00
   → decay multiplier: 1.4x

3. Hebbian Learning
───────────────────
   Initial edge weight: 1.00
   After co-activation 1: 1.090
   After co-activation 2: 1.179
   After co-activation 3: 1.267
   After co-activation 4: 1.355
   After co-activation 5: 1.441

4. Bayesian Confidence Propagation
──────────────────────────────────
   supports: base=0.5 + source=0.9 → 0.950
   contradicts: base=0.8 + source=0.9 → 0.080
   related_to: base=0.5 + source=0.6 → 0.500

5. Working Memory (7±2 slots)
─────────────────────────────
   Slots: 5/5
   [goal] Current task: build ZenBrain demo (relevance: 1.0)
   [fact] TypeScript is the primary language (relevance: 0.8)
   [constraint] User prefers concise code (relevance: 0.6)

   After adding 6th item (eviction):
   [goal] Current task: build ZenBrain demo (relevance: 1.0)
   [fact] BREAKING: new AI model released (relevance: 0.9)
   [fact] TypeScript is the primary language (relevance: 0.8)

===========================================
  All 7 algorithms demonstrated!
  npm install @zensation/algorithms
===========================================
EOF
