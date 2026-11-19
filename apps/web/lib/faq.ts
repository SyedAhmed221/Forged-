/**
 * FAQ content shared by the /faq page and its FAQPage structured data.
 * Answers are short paragraphs. Inline links use `[label](/href)` syntax so
 * the same copy can be rendered as links on the page and as plain text for
 * search engines.
 */
export type FaqItem = { question: string; answer: string[] };

export const faqs: FaqItem[] = [
  {
    question: 'What does Forge Quality actually do?',
    answer: [
      'Forge Quality prepares your finished MP4 or MOV export for TikTok. It optimises the file so TikTok applies less compression when you upload it, helping your video keep the detail you exported.',
      'By default your frames are not re-encoded, so the picture you made is the picture you upload. Re-encoding only happens if you turn it on.',
    ],
  },
  {
    question: 'TikTok still compressed my video. Why?',
    answer: [
      'After optimising, upload the file exactly as downloaded. Adding TikTok sounds, trimming, filters, text or stickers in the TikTok editor can make TikTok re-encode the video.',
      'Post it as Everyone or Friends Only, rather than Only Me. You can check what TikTok actually delivers by pasting your published link into [Analytics](/analytics).',
    ],
  },
  {
    question: 'What formats work best?',
    answer: [
      'Upload an MP4 or MOV encoded with H.264 or H.265 (HEVC). For the best result, export at 1080p or above, at a constant 30 or 60 FPS, with a high bitrate to preserve detail.',
    ],
  },
  {
    question: 'What is the recommended bitrate?',
    answer: [
      'Around 10–40 Mbps, depending on resolution, gives a strong balance between quality and file size, and plays smoothly on most devices.',
      'Keep your plan’s file size limit in mind: at 20 Mbps, a 25-second clip is roughly 63 MB.',
    ],
  },
  {
    question: 'What is the difference between Orion and Luna?',
    answer: [
      'Start with Orion. It works for most videos and keeps your original resolution.',
      'If Orion cannot optimise your video, select Luna and try again. Luna is an experimental fallback that outputs 720p and needs a 30 or 60 FPS source.',
    ],
  },
  {
    question: 'Should I turn on re-encoding?',
    answer: [
      'Usually not. Re-encoding is optional and off by default, because the best results come from your original export.',
      'Turn it on if your file is too large or will not optimise as-is. Premium files above 300 MB need re-encoding, which accepts files up to 1.5 GB.',
    ],
  },
  {
    question: 'What do the Free and Premium plans include?',
    answer: [
      'Free includes 1 upload per day, with videos up to 70 MB at 1080p and 60 FPS.',
      'Premium gives you unlimited uploads, videos up to 300 MB (larger with re-encoding), and up to 4K at 120 FPS. Compare plans on the [Subscription](/subscription) page.',
    ],
  },
  {
    question: 'Do I need to connect my TikTok account?',
    answer: [
      'No. Forge Quality never asks for your TikTok login. You download the optimised file and upload it to TikTok yourself.',
    ],
  },
  {
    question: 'How long are my videos stored?',
    answer: [
      'Uploads and optimised files are kept in private storage with short-lived download links, and are deleted automatically after 24 hours.',
      'You can delete them sooner from [Video history](/history). Read more in [Privacy & storage](/settings).',
    ],
  },
  {
    question: 'How do I cancel Premium?',
    answer: [
      'Open the [Subscription](/subscription) page and select Manage billing or cancel. Payments, invoices and cancellation are handled securely by Stripe.',
    ],
  },
];

const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export type FaqSegment = string | { label: string; href: string };

/** Splits an answer paragraph into plain text and link segments. */
export function faqSegments(paragraph: string): FaqSegment[] {
  const segments: FaqSegment[] = [];
  let last = 0;
  for (const match of paragraph.matchAll(linkPattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push(paragraph.slice(last, start));
    segments.push({ label: match[1], href: match[2] });
    last = start + match[0].length;
  }
  if (last < paragraph.length) segments.push(paragraph.slice(last));
  return segments;
}

/** schema.org FAQPage data, with link markup reduced to its label. */
export function faqStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
          .map((paragraph) => paragraph.replace(linkPattern, '$1'))
          .join(' '),
      },
    })),
  };
}
