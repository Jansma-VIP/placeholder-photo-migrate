import { analyseClassicCandidate } from './common.js';

export const viaPlaceholderProvider = {
  id: 'via-placeholder',
  label: 'via.placeholder.com',
  hosts: new Set(['via.placeholder.com']),
  analyse(candidate) {
    return analyseClassicCandidate(candidate);
  },
};
