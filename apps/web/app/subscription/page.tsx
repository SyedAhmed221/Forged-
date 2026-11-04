import { Subscription } from '../../components/subscription';

export default function SubscriptionPage() {
  return (
    <div className="page subscription-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHOOSE YOUR CREATIVE WORKSPACE</div>
          <h1>Subscription</h1>
          <p>Choose the limits that fit your workflow.</p>
        </div>
      </div>
      <Subscription
        live={process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') === true}
      />
    </div>
  );
}
