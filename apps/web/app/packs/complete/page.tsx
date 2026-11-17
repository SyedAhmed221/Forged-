import { PackComplete } from '../pack-client';
export const metadata = {
  title: 'Confirming your pack purchase',
  robots: { index: false, follow: false },
};
export default function CompletePage() {
  return (
    <>
      <h1>Your pack purchase</h1>
      <PackComplete />
    </>
  );
}
