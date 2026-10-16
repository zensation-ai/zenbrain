// The reader's edge store and inputs to the two-factor update.
declare let edge: import('@zensation/algorithms').TwoFactorEdge;
declare const edges: Map<string, import('@zensation/algorithms').TwoFactorEdge>;
declare const tagScore: number;
declare const activationProduct: number;
declare function myDomainScore(result: import('@zensation/core').RecallResult): number;
