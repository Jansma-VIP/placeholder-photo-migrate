import { manual } from './common.js';

const SERVICES = [
  ['picsum-photos', 'picsum.photos', ['picsum.photos', 'www.picsum.photos', 'unsplash.it', 'www.unsplash.it']],
  ['loremflickr', 'loremflickr.com', ['loremflickr.com', 'www.loremflickr.com']],
  ['placeimg-com', 'placeimg.com', ['placeimg.com', 'www.placeimg.com']],
  ['lorempixel-com', 'lorempixel.com', ['lorempixel.com', 'www.lorempixel.com']],
  ['placekitten', 'placekitten.com', ['placekitten.com', 'www.placekitten.com']],
  ['source-unsplash', 'source.unsplash.com', ['source.unsplash.com']],
  ['placehold-net', 'placehold.net', ['placehold.net', 'www.placehold.net']],
];

export const photoServiceProviders = SERVICES.map(([id, label, hosts]) => ({
  id,
  label,
  hosts: new Set(hosts),
  analyse() {
    return manual(`${label} serves photo or category content that has no lossless one-to-one Placeholder.photo URL mapping.`);
  },
}));
