export type Pack = {
  id: string;
  slug: string;
  name: string;
  description: string;
  details: string;
  priceMinor: number;
  currency: 'GBP' | 'USD' | 'EUR';
  images: { src: string; alt: string }[];
  contents: string[];
  sizeLabel: string;
  licence: string;
  fileKey: string;
  downloadName: string;
  active: boolean;
};

// TODO: Add the supplied packs, approved prices, previews, licence terms and private file keys.
const catalog: Pack[] = [];

export const activePacks = () => catalog.filter((pack) => pack.active);
export const packById = (id: string) =>
  activePacks().find((pack) => pack.id === id);
export const packBySlug = (slug: string) =>
  activePacks().find((pack) => pack.slug === slug);

export function packPrice(pack: Pick<Pack, 'priceMinor' | 'currency'>) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: pack.currency,
  }).format(pack.priceMinor / 100);
}
