import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { DISCORD_INVITE_URL, DiscordIcon } from '../../components/discord-icon';
import { faqs, faqSegments, faqStructuredData } from '../../lib/faq';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers to common questions about optimising videos for TikTok with Forge Quality: formats, bitrate, plans, privacy and more.',
};

export default function FaqPage() {
  return (
    <div className="page faq-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData()).replace(/</g, '\\u003c'),
        }}
      />
      <header className="faq-heading">
        <div className="eyebrow">
          <span className="tiny-line" />
          HELP
        </div>
        <h1>Frequently asked questions</h1>
        <p>
          Everything you need to know about getting your next upload ready for
          TikTok.
        </p>
      </header>
      <div className="faq-list">
        {faqs.map((item, index) => (
          <details className="faq-item" key={item.question}>
            <summary className="faq-question">
              <span className="faq-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="faq-question-text">{item.question}</span>
              <ChevronDown className="faq-caret" size={18} aria-hidden />
            </summary>
            <div className="faq-answer">
              {item.answer.map((paragraph) => (
                <p key={paragraph}>
                  {faqSegments(paragraph).map((segment, i) =>
                    typeof segment === 'string' ? (
                      segment
                    ) : (
                      <Link key={i} href={segment.href}>
                        {segment.label}
                      </Link>
                    ),
                  )}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
      <section className="faq-cta">
        <div>
          <h2>Still have questions?</h2>
          <p>
            Drop in your finished export, or ask the community in our Discord.
          </p>
        </div>
        <div className="faq-cta-actions">
          <Button asChild className="button-discord">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <DiscordIcon size={17} />
              Join Discord
              <ArrowUpRight size={16} />
            </a>
          </Button>
          <Button asChild>
            <Link href="/optimize">
              Optimize a video <ArrowUpRight size={16} />
            </Link>
          </Button>
          <Link href="/subscription" className="text-link">
            Compare plans <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
