# Contributing to ZenBrain

Thank you for your interest in contributing to ZenBrain! We welcome contributions from everyone.

## Quick Start

```bash
# Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/zenbrain.git
cd zenbrain

# Install dependencies
npm install

# Build all packages (respects dependency order)
npx turbo build

# Run all tests
npx turbo test

# Run tests for a single package
cd packages/algorithms && npm test
```

## Repository Structure

```
zenbrain/
├── packages/
│   ├── algorithms/     # Pure neuroscience algorithms (zero deps)
│   ├── core/           # 7-layer memory system + coordinator
│   └── adapters/
│       ├── postgres/   # PostgreSQL + pgvector adapter
│       └── sqlite/     # SQLite adapter (zero-config)
├── examples/           # Integration examples
├── apps/playground/    # Interactive demo
└── docs/               # Documentation
```

## Development Workflow

### 1. Pick an Issue

- Check [open issues](https://github.com/zensation-ai/zenbrain/issues) for `good first issue` or `help wanted` labels
- Comment on the issue to claim it
- If you have a new idea, open an issue first to discuss

### 2. Create a Branch

```bash
git checkout -b feat/my-feature    # for features
git checkout -b fix/my-bugfix      # for bug fixes
git checkout -b docs/my-docs       # for documentation
```

### 3. Write Code

- **TypeScript** with strict mode enabled
- **Pure functions** preferred (no side effects in algorithms)
- **JSDoc** on all public APIs with `@param` and `@returns`
- **Optional Logger** parameter for debuggable algorithms
- Follow existing code patterns — look at `hebbian.ts` or `semantic.ts` for reference

### 4. Write Tests

We use [Vitest](https://vitest.dev/) for testing. Tests are required for all new code.

```bash
# Run tests in watch mode during development
cd packages/algorithms && npm run test:watch

# Run all tests before committing
npx turbo test
```

**Test conventions:**
- Test files go in `__tests__/` next to the source
- Use descriptive test names: `it('returns 0 when stability is zero')`
- Test edge cases and boundary conditions
- Use `toBeCloseTo()` for floating-point comparisons

### 5. Build and Lint

```bash
# Type-check all packages
npx turbo lint

# Build all packages
npx turbo build
```

Both must pass before submitting a PR.

### 6. Submit a Pull Request

- One feature/fix per PR
- Include tests for all new code
- Update documentation if you change public APIs
- Reference related issues (`Fixes #123`)
- Keep PRs focused and reviewable (< 500 lines preferred)

## Code Style Guide

### Algorithms Package

Algorithms must be **pure functions** with zero side effects:

```typescript
// Good: pure function with optional logger
export function computeDecay(weight: number, rate: number, logger?: Logger): number {
  const result = weight * (1 - rate);
  logger?.debug?.('Computed decay', { weight, rate, result });
  return Math.max(0, result);
}

// Bad: side effects, mutations
export function computeDecay(state: State): void {
  state.weight *= (1 - state.rate);  // mutates input
}
```

### Core Package

Memory layers follow a consistent pattern:

```typescript
export class MyLayer {
  private readonly storage: StorageAdapter;
  private readonly log: Logger;

  constructor(config: MyLayerConfig) {
    this.storage = config.storage;
    this.log = config.logger ?? noopLogger;
  }

  async myMethod(): Promise<Result> {
    // Use parameterized queries ($1, $2) for SQL injection prevention
    const result = await this.storage.query<Row>(
      'SELECT * FROM table WHERE id = $1',
      [id]
    );
    this.log.debug('Method completed', { count: result.rows.length });
    return result.rows;
  }
}
```

### Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Functions | camelCase | `computeHebbianDecay` |
| Interfaces | PascalCase | `MemoryFact` |
| Constants | UPPER_SNAKE | `HEBBIAN_CONFIG` |
| Files | kebab-case | `sleep-consolidation.ts` |
| Test files | `*.test.ts` | `fsrs.test.ts` |

## Architecture Principles

1. **Zero dependencies in algorithms** — pure TypeScript, tree-shakeable
2. **Pluggable adapters** — storage, embeddings, LLM, cache are all interfaces
3. **Neuroscience-grounded** — every algorithm cites its scientific basis
4. **Graceful degradation** — works without embeddings (falls back to recency)

## Getting Help

- **Discord**: [Join our community](https://discord.gg/YKVTHaXK)
- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and ideas

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
