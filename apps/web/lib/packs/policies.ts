export const packSeller = 'Forged Quality';
export const packSupport = 'jagofq@gmail.com';
export const packLicence =
  'For your own use. You may use the method in your own content, including commercial content. Do not redistribute, resell or share the supplied guide or paid download links. Third-party software remains subject to its own licences.';

export const packPolicies = {
  terms: {
    title: 'Pack Terms',
    sections: [
      [
        'Seller and support',
        'Packs are sold by Forged Quality. For order questions, download problems or Premium support, email jagofq@gmail.com with your order reference.',
      ],
      [
        'Your purchase',
        'Standard costs GBP 74 and Premium costs GBP 115. Each is a one-time purchase, separate from any Forge subscription. The final amount is shown before payment in Stripe Checkout. Both packages include the same PC-only PDF method and its linked resources. Premium also includes the personal support described on its product page; email us to arrange that support.',
      ],
      [
        'Delivery and access',
        'After Stripe confirms payment, your download is available on the confirmation page and we send a receipt with a download link to your checkout email. The link allows up to 10 download requests for 30 days. Save your downloaded PDF. If you cannot access your purchase, contact support.',
      ],
      ['Using the pack', packLicence],
      [
        'Compatibility and results',
        'This method is for PC. Review the product description before buying. You may need compatible hardware and separately licensed third-party software. Results depend on your footage, settings, device and the upload platform; we cannot guarantee a particular result or prevent future platform changes.',
      ],
      [
        'Cancellation and your rights',
        'Checkout requests your consent to immediate digital delivery. The Refund Policy explains cancellation and remedies for a faulty or misdescribed product. Nothing in these terms removes your statutory rights.',
      ],
    ],
  },
  privacy: {
    title: 'Pack Privacy Policy',
    sections: [
      [
        'Who handles your data',
        'Forged Quality handles pack order and support information. Contact jagofq@gmail.com about your data or privacy questions.',
      ],
      [
        'Information we use',
        'We store the order reference, purchased product, price and currency, payment references, checkout email, delivery consent version, payment status, receipt status and download access records. Support messages contain the information you choose to provide. Card details are entered directly into Stripe Checkout; our packs application does not store your card number.',
      ],
      [
        'Why we use it',
        'We use order information to fulfil your purchase, deliver receipts and downloads, provide support and process refunds. We also use limited request information for rate limiting and preventing abuse. These uses support our contract with you, our legitimate interest in operating a secure service and applicable record-keeping duties.',
      ],
      [
        'Service providers',
        'Stripe processes payments; Supabase stores orders; Cloudflare R2 stores pack files; Resend sends receipts; and Vercel hosts the storefront. These providers process information needed for their services and may process it outside your country under their applicable safeguards and privacy terms.',
      ],
      [
        'Retention and requests',
        'We retain order information as needed for delivery, support, refunds, disputes and applicable accounting obligations. Download-link expiry does not automatically delete the order. You may ask for access, correction or deletion and raise an objection where applicable by emailing support. Some records may need to be retained to meet legal duties. You may also complain to the UK Information Commissioner\u2019s Office or your local data protection authority.',
      ],
    ],
  },
  refunds: {
    title: 'Pack Refund Policy',
    sections: [
      [
        'Digital delivery',
        'These are digital products. We ask you to agree to immediate delivery and acknowledge that the usual 14-day cancellation right for digital content is lost when you begin downloading with that consent. If you have not started downloading and wish to cancel, contact jagofq@gmail.com with your order reference.',
      ],
      [
        'Faults and delivery problems',
        'Your statutory rights remain available if the content is faulty, not as described or not supplied. Contact support with your order reference and a description of the problem so we can investigate and provide the remedy that applies. An all-sales-final notice does not remove these rights.',
      ],
      [
        'Premium support',
        'Premium includes the support described on the product page. Contact support if it has not been provided as agreed. The digital-download cancellation acknowledgement does not remove any separate statutory rights you have concerning support services.',
      ],
      [
        'Refund processing',
        'Approved refunds are returned through Stripe to the original payment method. Refunded or disputed orders cannot request further pack download links.',
      ],
    ],
  },
} as const;
