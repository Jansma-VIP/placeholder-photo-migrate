import { manual } from './common.js';

export const fakeimgPlProvider = {
  id: 'fakeimg-pl',
  label: 'fakeimg.pl',
  hosts: new Set(['fakeimg.pl', 'www.fakeimg.pl']),
  analyse() {
    return manual('Fakeimg.pl was detected, but automatic migration is disabled because its live response semantics could not be verified.');
  },
};
