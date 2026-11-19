import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  SlidersHorizontal,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { HeroComparison } from '../components/hero-comparison';
import { Button } from '../components/ui/button';
export default function Home() {
  return (
    <div className="page landing">
      <div className="eyebrow">
        <span className="tiny-line" />
        THE FINAL STEP IN YOUR WORKFLOW
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="tag">
            <span /> BUILT FOR CREATORS
          </span>
          <h1>
            You made it.
            <br />
            Now make it
            <br />
            <span>upload-ready.</span>
          </h1>
          <p>
            Your next great video deserves a strong finish. Optimize your
            exports for TikTok, without complicating your creative process.
          </p>
          <div className="hero-actions">
            <Button asChild size="lg">
              <Link href="/optimize">
                Optimize a video <ArrowUpRight size={19} />
              </Link>
            </Button>
            <span className="hero-note">
              MP4 & MOV
              <br />
              <strong>Your original stays yours.</strong>
            </span>
          </div>
          <div className="trust-row">
            <ShieldCheck size={15} /> Private storage <span>•</span> No TikTok
            login needed
          </div>
        </div>
        <HeroComparison />
      </section>
      <div className="feature-strip">
        <div>
          <span>01</span>
          <strong>One simple workflow</strong>
          <p>From your export to your next upload.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Extra prep, only if needed</strong>
          <p>Optional encoding. You’re in control.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Private from start to finish</strong>
          <p>Short-lived links. Automatic cleanup.</p>
        </div>
      </div>
      <section className="how-section" id="workflow">
        <div>
          <div className="eyebrow">LESS FRICTION. MORE CREATING.</div>
          <h2>Three steps. Then it’s yours.</h2>
        </div>
        <Link href="/optimize" className="text-link">
          Let’s get started <ArrowRight size={16} />
        </Link>
      </section>
      <div className="step-grid">
        {[
          {
            icon: Upload,
            title: 'Drop your video',
            copy: 'Start with your finished MP4 or MOV. Preview it before it leaves your device.',
          },
          {
            icon: SlidersHorizontal,
            title: 'Give it a final pass',
            copy: 'Optimize your video, with optional preprocessing for an uncompressed export.',
          },
          {
            icon: Download,
            title: 'Take it from here',
            copy: 'Download your optimized video and upload it to TikTok when you’re ready.',
          },
        ].map((s, i) => (
          <article key={s.title} className="step-card">
            <div className="step-card-top">
              <s.icon size={21} />
              <span>0{i + 1}</span>
            </div>
            <h3>{s.title}</h3>
            <p>{s.copy}</p>
          </article>
        ))}
      </div>
      <p className="fineprint">
        Optimization prepares your file for upload. Platform processing and
        final playback quality may vary.
      </p>
    </div>
  );
}
