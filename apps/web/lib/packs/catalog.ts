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
  supportDetails?: string[];
  purchaseNotice?: string;
};

const images = [
  { src: '/packs/forge-quality.png', alt: 'Forge Quality silver logo' },
];
const maxContents = [
  'Our full step-by-step method',
  'Our recommended settings for every stage',
  'Everything you need to download, all in one place',
];
const maxDetails =
  'Stop letting TikTok crush your clips!\n\nYour clips deserve better than blurry uploads. The Max Quality Method is the exact process we use on our own content. It doesn’t just protect your quality, it enhances your footage so your clips look sharper, cleaner and smoother than when you recorded them.\n\nThen you post them in max quality, without TikTok’s usual compression killing the detail.';
const maxNotice =
  'All purchases are final and products are available immediately when purchase is made. Your statutory rights apply.';
const premiumSupport = [
  'Don’t want to figure it out alone? Premium gives you a dedicated 1-2-1 guide through the entire method, from the very first setup to your final export.',
  'We’ll take you through every step and explain what each setting does and why it matters. You won’t just copy settings, you’ll understand them. If you get stuck at any point, we’re there to get you unstuck.',
  'By the end, you’ll have the method running smoothly on your own setup, and clips that look better than ever.',
];
const pendingLicence = 'Licence terms will be available before checkout opens.';

// Standard and Premium share the supplied PDF in the private
// forged-quality-packs bucket. TODO: approve licence terms before enabling checkout.
const catalog: Pack[] = [
  {
    id: 'max-quality-standard',
    slug: 'max-quality-pack',
    name: 'TikTok DLSS Quality Method (PC ONLY)',
    family: 'max-quality',
    packageLabel: 'Standard Package',
    description:
      'The Max Quality Method — our full step-by-step process, recommended settings and downloads in one place.',
    details: maxDetails,
    priceMinor: 7400,
    currency: 'GBP',
    images,
    contents: maxContents,
    sizeLabel: 'PDF guide · 18 pages · 1.23 MB · includes the download links.',
    licence: pendingLicence,
    fileKey: 'max-quality/tiktok-max-quality-method-75ee9ca42914b447.pdf',
    downloadName: 'TikTok Max Quality Method.pdf',
    purchaseNotice: maxNotice,
    active: true,
  },
  {
    id: 'max-quality-premium',
    slug: 'max-quality-pack-premium',
    name: 'TikTok DLSS Quality Method (PC ONLY)',
    family: 'max-quality',
    packageLabel: 'Premium Package',
    description:
      'The full method with dedicated 1-2-1 support, from your first setup to your final export.',
    details: maxDetails,
    supportDetails: premiumSupport,
    priceMinor: 11500,
    currency: 'GBP',
    images,
    contents: [
      ...maxContents,
      'Step-by-step guidance: we work through the whole process with you, from installing the software to your final upload-ready export',
      'Help whenever you’re stuck: if something isn’t working, we’ll sort it with you',
      'Detailed colour grading support: we’ll help you dial in a grade that makes your clips pop and fits your style',
      'DLSS plugin support: full help installing, setting up and getting the most out of the DLSS 5 plugin',
    ],
    sizeLabel: 'PDF guide · 18 pages · 1.23 MB · includes the download links.',
    licence: pendingLicence,
    fileKey: 'max-quality/tiktok-max-quality-method-75ee9ca42914b447.pdf',
    downloadName: 'TikTok Max Quality Method.pdf',
    purchaseNotice: maxNotice,
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
