export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean | null | undefined>;

/**
 * Zero-lock-in className combiner compatible with React & TypeScript strict mode.
 */
export function cn(...inputs: ClassValue[]): string {
  const tokens: string[] = [];
  for (const item of inputs) {
    if (!item) continue;
    if (typeof item === 'string' || typeof item === 'number') {
      const trimmed = String(item).trim();
      if (trimmed) tokens.push(trimmed);
    } else if (typeof item === 'object') {
      for (const [key, enabled] of Object.entries(item)) {
        if (enabled && key.trim()) tokens.push(key.trim());
      }
    }
  }
  return tokens.join(' ');
}
