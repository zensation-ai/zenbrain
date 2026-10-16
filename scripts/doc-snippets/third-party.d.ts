// Type stubs for third-party packages the documentation imports but this repository does not install.
// They describe only what the snippets use, so a snippet is checked against our own APIs; they say
// nothing about the third-party package itself.
declare module '@ai-sdk/openai' {
  export function openai(modelId: string): import('@ai-sdk/provider').LanguageModelV4;
}
