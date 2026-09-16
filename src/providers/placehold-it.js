import { analyseClassicCandidate } from './common.js';

export const placeholdItProvider = {
  id: 'placehold-it',
  label: 'placehold.it',
  hosts: new Set(['placehold.it', 'www.placehold.it']),
  analyse(candidate) {
    return analyseClassicCandidate(candidate, { exactHost: candidate.hostname === 'placehold.it' });
  },
};
