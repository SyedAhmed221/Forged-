import Link from 'next/link';
import { Subscription } from '../../components/subscription';

export default function SubscriptionPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHOOSE YOUR CREATIVE WORKSPACE</div>
          <h1>Subscription</h1>
          <p>Choose the limits that fit your workflow.</p>
        </div>
      </div>
      <div className="stats-grid">
        <section className="stat-card">
          <h2>Free</h2>
          <strong>£0</strong>
          <p>
            100 MB per video
            <br />
            1080p maximum resolution
            <br />
            60 FPS maximum frame rate
            <br />3 uploads per day
          </p>
        </section>
        <section className="stat-card">
          <h2>Premium</h2>
          <p>
            No plan-based file-size limit
            <br />
            4K maximum resolution
            <br />
            120 FPS maximum frame rate
            <br />
            Unlimited uploads
          </p>
          <p>Storage and processing service limits still apply.</p>
        </section>
      </div>
      <section className="panel" style={{ padding: 24 }}>
        <h2>Premium plans</h2>
        <p>
          Subscriptions renew automatically until cancelled. Prices are in GBP.
        </p>
        <Subscription />
        <Link className="text-link" href="/dashboard">
          Back to workspace
        </Link>
      </section>
    </div>
  );
}
