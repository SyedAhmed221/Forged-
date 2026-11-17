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
  family?: string;
  packageLabel?: string;
};

const images = [
  { src: '/packs/forge-quality.png', alt: 'Forge Quality silver logo' },
];
const maxContents = [
  '18-page TikTok Max Quality Method PDF guide',
  'OBS and Nvidia Highlights recording settings',
  'DaVinci Resolve colour correction, Fusion and export settings',
  'First-pass and final Topaz Video AI settings',
  'RSMB motion blur settings',
  'Step-by-step editing and upload checklist',
];
const maxDetails =
  'Follow the full workflow from recording through DaVinci Resolve, Topaz Video AI, motion blur and final export. The guide covers capture, setup, enhancement and uploading your finished video.';
const pendingLicence = 'Licence terms will be available before checkout opens.';

// TODO: Upload the supplied PDF and final archives to private storage, then set
// the file keys and approved licence terms. Keep checkout closed until ready.
const catalog: Pack[] = [
  {
    id: 'max-quality-standard',
    slug: 'max-quality-pack',
    name: 'Max Quality Pack',
    family: 'max-quality',
    packageLabel: 'Standard Package',
    description:
      'A complete guide to the Forge Quality recording, editing and upload workflow.',
    details: maxDetails,
    priceMinor: 7400,
    currency: 'GBP',
    images,
    contents: maxContents,
    sizeLabel:
      'PDF guide · 18 pages · 1.23 MB. Additional pack files to be confirmed.',
    licence: pendingLicence,
    fileKey: '',
    downloadName: 'forge-quality-standard.zip',
    active: true,
  },
  {
    id: 'max-quality-premium',
    slug: 'max-quality-pack-premium',
    name: 'Max Quality Pack',
    family: 'max-quality',
    packageLabel: 'Premium Package',
    description:
      'The full method with one-to-one support throughout the process.',
    details:
      maxDetails + ' Premium includes full one-to-one support for the method.',
    priceMinor: 11500,
    currency: 'GBP',
    images,
    contents: [
      ...maxContents,
      'One-to-one help with recording settings and software setup',
      'Guided walkthrough of the edit, enhancement and upload process',
      'Quality troubleshooting support',
    ],
    sizeLabel:
      'PDF guide · 18 pages · 1.23 MB. Additional pack files to be confirmed.',
    licence: pendingLicence,
    fileKey: '',
    downloadName: 'forge-quality-premium.zip',
    active: true,
  },
  {
    id: 'jago-full-quality-lifetime',
    slug: 'jago-full-quality-pack',
    name: 'JAGO FULL QUALITY PACK (LIFETIME)',
    description:
      'Get JAGO’s full quality method from start to finish, with regular updates.',
    details:
      'We’ll arrange a call with you to discuss everything in detail and help you get the best quality possible.',
    priceMinor: 50000,
    currency: 'GBP',
    images,
    contents: [
      'JAGO’s full quality method from start to finish',
      'Regular method updates',
      'A detailed call to discuss the process and your quality setup',
    ],
    sizeLabel:
      'Delivery files and formats will be confirmed before checkout opens.',
    licence: pendingLicence,
    fileKey: '',
    downloadName: 'jago-full-quality-pack.zip',
    active: true,
  },
];

export const activePacks = () => catalog.filter((pack) => pack.active);
export const storefrontPacks = () =>
  activePacks().filter(
    (pack, index, packs) =>
      !pack.family ||
      packs.findIndex((other) => other.family === pack.family) === index,
  );
export const packageOptions = (pack: Pack) =>
  pack.family
    ? activePacks().filter((other) => other.family === pack.family)
    : [pack];
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
