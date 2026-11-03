import Image from 'next/image';

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`}>
      <Image
        src="/branding/forged-logo.jpg"
        alt="Forged — Forge Quality"
        width={2048}
        height={2048}
        sizes="(max-width: 640px) 140px, 220px"
      />
    </span>
  );
}
