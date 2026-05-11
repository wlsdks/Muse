/**
 * Single source of truth for the OpenAI-compatible provider presets
 * Muse ships out of the box (Groq, DeepSeek, Together, Mistral,
 * Moonshot, Cerebras). Both the runtime-provider factory
 * (autoconfigure-model-provider) and the file/env hydration helpers
 * (personal-providers, setup-status) drive their per-preset switch
 * from this table.
 *
 * Entry order is the credential-fallback priority used by
 * inferDefaultModelFromCredentials when multiple preset keys are
 * present at once. Keep groq -> deepseek -> together -> mistral ->
 * moonshot -> cerebras to match the historical behavior locked by
 * the parity tests in setup-status.test.ts.
 */

export interface OpenAICompatPreset {
  readonly baseUrl: string;
  readonly envKey: string;
  readonly defaultModel: string;
}

export const OPENAI_COMPAT_PRESETS: Readonly<Record<string, OpenAICompatPreset>> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", defaultModel: "groq/llama-3.3-70b-versatile", envKey: "GROQ_API_KEY" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek/deepseek-chat", envKey: "DEEPSEEK_API_KEY" },
  together: { baseUrl: "https://api.together.xyz/v1", defaultModel: "together/meta-llama/Llama-3.3-70B-Instruct-Turbo", envKey: "TOGETHER_API_KEY" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral/mistral-small-latest", envKey: "MISTRAL_API_KEY" },
  moonshot: { baseUrl: "https://api.moonshot.ai/v1", defaultModel: "moonshot/moonshot-v1-8k", envKey: "MOONSHOT_API_KEY" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", defaultModel: "cerebras/llama-3.3-70b", envKey: "CEREBRAS_API_KEY" }
};
