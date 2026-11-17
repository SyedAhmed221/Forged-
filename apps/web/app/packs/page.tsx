import Image from 'next/image';
import Link from 'next/link';
import {
  storefrontPacks,
  packageOptions,
  packPrice,
} from '../../lib/packs/catalog';
import { Button } from '../../components/ui/button';
import styles from './packs.module.css';

export default function PacksPage() {
  const packs = storefrontPacks();
  return (
    <>
      <header className={styles.heading}>
        <h1>Forge Quality Packs</h1>
        <p>One-time purchase. No subscription.</p>
      </header>
      {packs.length ? (
        <div className={styles.grid}>
          {packs.map((pack) => (
            <article key={pack.id} className={styles.card}>
              {pack.images[0] && (
                <Image
                  className={styles.preview}
                  src={pack.images[0].src}
                  alt={pack.images[0].alt}
                  width={640}
                  height={360}
                />
              )}
              <div className={styles.cardBody}>
                <h2>{pack.name}</h2>
                <p>{pack.description}</p>
                {packageOptions(pack).map((option) => (
                  <p key={option.id}>
                    {option.packageLabel && (
                      <span>{option.packageLabel} · </span>
                    )}
                    <strong>{packPrice(option)}</strong>
                  </p>
                ))}
                <Button asChild>
                  <Link
                    href={`/packs/${pack.slug}`}
                    aria-label={`View pack — ${pack.name}`}
                  >
                    View pack
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>Packs are coming soon</h2>
          <p>Check back when the first packs are available.</p>
        </div>
      )}
    </>
  );
}
