import * as z from 'zod/v4';

/** Where a value came from. Only `mock` is selectable before Phase 8. */
export const ProviderMode = z.enum(['mock', 'prometheus', 'cloudwatch']);
export type ProviderMode = z.infer<typeof ProviderMode>;

export const LlmMode = z.enum(['mock', 'openai']);
export type LlmMode = z.infer<typeof LlmMode>;

export const NodeEnv = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof NodeEnv>;

export const Role = z.enum(['viewer', 'operator']);
export type Role = z.infer<typeof Role>;
