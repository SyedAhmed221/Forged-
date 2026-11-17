-- Keep previously issued PayPal download links and receipts intact.
alter table forge_packs.orders add column stripe_checkout_id text unique;
alter table forge_packs.orders add constraint one_packs_payment_provider
  check (paypal_order_id is null or stripe_checkout_id is null);
