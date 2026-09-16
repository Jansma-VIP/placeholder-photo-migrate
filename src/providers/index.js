import { placeholdItProvider } from './placehold-it.js';
import { placeholderComProvider } from './placeholder-com.js';
import { viaPlaceholderProvider } from './via-placeholder.js';

export const providers = [viaPlaceholderProvider, placeholdItProvider, placeholderComProvider];

export const providerAliases = new Map([
  ['via-placeholder', 'via-placeholder'],
  ['via.placeholder.com', 'via-placeholder'],
  ['placehold-it', 'placehold-it'],
  ['placehold.it', 'placehold-it'],
  ['placeholder-com', 'placeholder-com'],
  ['placeholder.com', 'placeholder-com'],
]);

export function normalizeProviderIds(values) {
  if (values.length === 0) return new Set(providers.map((provider) => provider.id));

  const selected = new Set();
  for (const value of values.flatMap((item) => item.split(','))) {
    const normalized = providerAliases.get(value.trim().toLowerCase());
    if (!normalized) {
      throw new Error(`Unknown provider: ${value}. Use via-placeholder, placehold-it, or placeholder-com.`);
    }
    selected.add(normalized);
  }
  return selected;
}

export function providerForHostname(hostname) {
  return providers.find((provider) => provider.hosts.has(hostname.toLowerCase())) ?? null;
}
