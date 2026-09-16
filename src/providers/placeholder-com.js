import { analyseClassicCandidate } from './common.js';

export const placeholderComProvider = {
  id: 'placeholder-com',
  label: 'legacy placeholder.com',
  hosts: new Set(['placeholder.com', 'www.placeholder.com']),
  analyse(candidate) {
    return analyseClassicCandidate(candidate, { exactHost: candidate.hostname === 'placeholder.com' });
  },
};
