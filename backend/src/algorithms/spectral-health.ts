/**
 * Spectral KG Health Monitor
 *
 * NeurIPS Algorithm E — NOT yet published in @zensation/algorithms.
 * Provides post-sleep consolidation quality assessment using spectral
 * graph theory (Fiedler value of the Graph Laplacian).
 *
 * Uses algebraic connectivity (Fiedler value, lambda_2) of the Graph
 * Laplacian as a post-sleep consolidation quality metric.
 *
 * lambda_2 > 0: graph is connected
 * lambda_2 rising after sleep: consolidation strengthened connections
 * lambda_2 falling: consolidation caused fragmentation (alert!)
 *
 * Based on: Spectral graph theory applied to KG health assessment.
 * Nat. Comms. 2023 (causal hubs of memory consolidation).
 *
 * Production callsite: backend/src/services/memory/sleep-compute.ts
 */

export interface SpectralReport {
  fiedlerValue: number;
  previousFiedlerValue: number;
  isFragmented: boolean;
  consolidationSuccessful: boolean;
  nodeCount: number;
  edgeCount: number;
}

const FRAGMENTATION_THRESHOLD = 0.01;

/**
 * Compute Graph Laplacian L = D - A.
 * D = degree matrix (diagonal), A = adjacency matrix.
 */
export function computeLaplacian(adjacency: number[][]): number[][] {
  const n = adjacency.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    let degree = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        L[i][j] = -adjacency[i][j];
        degree += adjacency[i][j];
      }
    }
    L[i][i] = degree;
  }

  return L;
}

/**
 * Compute smallest non-zero eigenvalue of Laplacian (Fiedler value).
 *
 * Pipeline: Laplacian -> Householder tridiagonalization -> QL iteration.
 *
 * For small graphs (<1000 nodes), this is efficient.
 * For larger graphs, use Lanczos or ARPACK.
 */
export function computeFiedlerValue(adjacency: number[][]): number {
  const n = adjacency.length;
  if (n <= 1) return 0;

  const L = computeLaplacian(adjacency);

  // Compute all eigenvalues of the symmetric Laplacian
  const eigenvalues = symmetricEigenvalues(L);

  // Sort ascending and return second-smallest (lambda_2)
  eigenvalues.sort((a, b) => a - b);

  // lambda_1 is always ~0 for a Laplacian; lambda_2 is the Fiedler value
  if (eigenvalues.length < 2) return 0;
  return Math.max(0, eigenvalues[1]);
}

/**
 * Full spectral health report after a sleep cycle.
 */
export function computeSpectralHealth(
  adjacency: number[][],
  previousFiedlerValue: number,
): SpectralReport {
  const fiedlerValue = computeFiedlerValue(adjacency);
  let edgeCount = 0;
  for (let i = 0; i < adjacency.length; i++) {
    for (let j = i + 1; j < adjacency.length; j++) {
      if (adjacency[i][j] > 0) edgeCount++;
    }
  }

  return {
    fiedlerValue,
    previousFiedlerValue,
    isFragmented: fiedlerValue < FRAGMENTATION_THRESHOLD,
    consolidationSuccessful: fiedlerValue >= previousFiedlerValue,
    nodeCount: adjacency.length,
    edgeCount,
  };
}

// ================================================================
// Eigenvalue computation for real symmetric matrices
// Householder reduction to tridiagonal + QL implicit shifts
// Based on EISPACK / Numerical Recipes tred2 + tqli algorithms.
// ================================================================

/**
 * Compute all eigenvalues of a real symmetric matrix.
 */
function symmetricEigenvalues(A: number[][]): number[] {
  const n = A.length;
  const d = Array(n).fill(0); // diagonal
  const e = Array(n).fill(0); // off-diagonal

  // Copy A (we modify in-place during Householder)
  const a = A.map(row => [...row]);

  // Step 1: Householder reduction to tridiagonal (tred2 without eigenvectors)
  tred2(a, n, d, e);

  // Step 2: QL iteration for eigenvalues of tridiagonal matrix
  tqli(d, e, n);

  return d;
}

/**
 * Householder reduction of symmetric matrix to tridiagonal form.
 * Adapted from Numerical Recipes tred2 (eigenvalues-only variant).
 *
 * On output: d = diagonal, e = off-diagonal (e[0] = 0).
 */
function tred2(a: number[][], n: number, d: number[], e: number[]): void {
  for (let i = n - 1; i >= 1; i--) {
    let h = 0;
    let scale = 0;

    if (i > 1) {
      for (let k = 0; k < i; k++) {
        scale += Math.abs(a[i][k]);
      }
    }

    if (scale === 0) {
      e[i] = a[i][i - 1];
    } else {
      for (let k = 0; k < i; k++) {
        a[i][k] /= scale;
        h += a[i][k] * a[i][k];
      }

      let f = a[i][i - 1];
      let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
      e[i] = scale * g;
      h -= f * g;
      a[i][i - 1] = f - g;
      f = 0;

      for (let j = 0; j < i; j++) {
        // Compute a[j][i] = u/H (store in column we no longer need)
        a[j][i] = a[i][j] / h;
        g = 0;
        // Form element of A*u
        for (let k = 0; k <= j; k++) {
          g += a[j][k] * a[i][k];
        }
        for (let k = j + 1; k < i; k++) {
          g += a[k][j] * a[i][k];
        }
        // Form element of p in temporarily unused e[j]
        e[j] = g / h;
        f += e[j] * a[i][j];
      }

      const hh = f / (h + h);

      for (let j = 0; j < i; j++) {
        f = a[i][j];
        g = e[j] - hh * f;
        e[j] = g;
        for (let k = 0; k <= j; k++) {
          a[j][k] -= f * e[k] + g * a[i][k];
        }
      }
    }

    d[i] = h;
  }

  d[0] = 0;
  e[0] = 0;

  // Extract diagonal
  for (let i = 0; i < n; i++) {
    d[i] = a[i][i];
  }
}

/**
 * QL algorithm with implicit shifts for tridiagonal symmetric matrix.
 * Adapted from Numerical Recipes tqli (eigenvalues-only variant).
 *
 * On input: d = diagonal, e = off-diagonal (e[0] unused, shifted below).
 * On output: d contains eigenvalues.
 */
function tqli(d: number[], e: number[], n: number): void {
  // Shift e so that e[i] = off-diagonal between row i and i+1
  for (let i = 1; i < n; i++) {
    e[i - 1] = e[i];
  }
  e[n - 1] = 0;

  for (let l = 0; l < n; l++) {
    let iter = 0;
    let m: number;

    do {
      // Find small off-diagonal element
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) + dd === dd) break;
      }

      if (m !== l) {
        if (++iter >= 300) {
          // Failed to converge; return what we have
          return;
        }

        // Form shift
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = pythag(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1;
        let c = 1;
        let p = 0;

        // QL transformation
        for (let i = m - 1; i >= l; i--) {
          const f = s * e[i];
          const b = c * e[i];
          r = pythag(f, g);
          e[i + 1] = r;

          if (r === 0) {
            // Recover from underflow
            d[i + 1] -= p;
            e[m] = 0;
            break;
          }

          s = f / r;
          c = g / r;
          g = d[i + 1] - p;
          r = (d[i] - g) * s + 2 * c * b;
          p = s * r;
          d[i + 1] = g + p;
          g = c * r - b;
        }

        // Check if we broke out of the inner loop due to underflow recovery
        if (r === 0 && m - 1 >= l) {
          continue;
        }

        d[l] -= p;
        e[l] = g;
        e[m] = 0;
      }
    } while (m !== l);
  }
}

/**
 * Stable computation of sqrt(a^2 + b^2) without overflow.
 */
function pythag(a: number, b: number): number {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA > absB) {
    const ratio = absB / absA;
    return absA * Math.sqrt(1 + ratio * ratio);
  }
  if (absB === 0) return 0;
  const ratio = absA / absB;
  return absB * Math.sqrt(1 + ratio * ratio);
}
