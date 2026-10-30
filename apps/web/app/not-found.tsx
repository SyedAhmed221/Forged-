import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page empty-state">
      <h1>This frame is missing.</h1>
      <p>The page you’re looking for isn’t here.</p>
      <Link href="/optimize" className="button button-primary">
        Back to the studio
      </Link>
    </div>
  );
}
