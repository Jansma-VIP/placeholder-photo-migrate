import { dummyimageComProvider } from './dummyimage-com.js';
import { fakeimgPlProvider } from './fakeimg-pl.js';
import { imageplaceholderNetProvider } from './imageplaceholder-net.js';
import { placeholdItProvider } from './placehold-it.js';
import { placeholdCoProvider } from './placehold-co.js';
import { placeholdJpProvider } from './placehold-jp.js';
import { placeholderComProvider } from './placeholder-com.js';
import { photoServiceProviders } from './photo-services.js';
import { viaPlaceholderProvider } from './via-placeholder.js';

export const providers = [
  viaPlaceholderProvider,
  placeholdItProvider,
  placeholderComProvider,
  placeholdCoProvider,
  dummyimageComProvider,
  placeholdJpProvider,
  fakeimgPlProvider,
  imageplaceholderNetProvider,
  ...photoServiceProviders,
];

export const providerAliases = new Map([
  ['via-placeholder', 'via-placeholder'],
  ['via.placeholder.com', 'via-placeholder'],
  ['placehold-it', 'placehold-it'],
  ['placehold.it', 'placehold-it'],
  ['placeholder-com', 'placeholder-com'],
  ['placeholder.com', 'placeholder-com'],
  ['placehold-co', 'placehold-co'],
  ['placehold.co', 'placehold-co'],
  ['dummyimage-com', 'dummyimage-com'],
  ['dummyimage.com', 'dummyimage-com'],
  ['placehold-jp', 'placehold-jp'],
  ['placehold.jp', 'placehold-jp'],
  ['fakeimg-pl', 'fakeimg-pl'],
  ['fakeimg.pl', 'fakeimg-pl'],
  ['imageplaceholder-net', 'imageplaceholder-net'],
  ['imageplaceholder.net', 'imageplaceholder-net'],
  ...photoServiceProviders.flatMap((provider) => [
    [provider.id, provider.id],
    ...[...provider.hosts].map((host) => [host, provider.id]),
  ]),
]);

export const providerHostPattern = [...new Set(providers.flatMap((provider) => [...provider.hosts]))]
  .sort((left, right) => right.length - left.length)
  .map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

export function normalizeProviderIds(values) {
  if (values.length === 0) return new Set(providers.map((provider) => provider.id));

  const selected = new Set();
  for (const value of values.flatMap((item) => item.split(','))) {
    const normalized = providerAliases.get(value.trim().toLowerCase());
    if (!normalized) {
      throw new Error(`Unknown provider: ${value}. Use one of: ${providers.map((provider) => provider.id).join(', ')}.`);
    }
    selected.add(normalized);
  }
  return selected;
}

export function providerForHostname(hostname) {
  return providers.find((provider) => provider.hosts.has(hostname.toLowerCase())) ?? null;
}
