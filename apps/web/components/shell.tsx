'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  WandSparkles,
  History,
  Settings,
  ArrowUpRight,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { authClient } from '../lib/client';
import { Button } from './ui/button';
import { BrandLogo } from './brand-logo';
const navigation = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/optimize', label: 'Optimize video', icon: WandSparkles },
  { href: '/history', label: 'Video history', icon: History },
  { href: '/subscription', label: 'Subscription', icon: ShieldCheck },
  { href: '/settings', label: 'Settings', icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [email, setEmail] = useState<string>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const auth = authClient();
    if (!auth) return;
    void auth.auth
      .getSession()
      .then(({ data }) => setEmail(data.session?.user.email));
    const { data } = auth.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user.email),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  if (path === '/') {
    return (
      <div className="marketing-shell">
        <header className="marketing-header">
          <Link href="/" className="marketing-brand" aria-label="Forge Quality home">
            <BrandLogo />
            <span>FORGE QUALITY</span>
          </Link>
          <nav aria-label="Homepage navigation">
            <Link href="/subscription">Subscription</Link>
            <Link href="#workflow">How it works</Link>
            <Link href="/optimize">Optimize</Link>
            <Link href={email ? '/dashboard' : '/login'}>
              {email ? 'My workspace' : 'Sign in'}
            </Link>
          </nav>
          <Button asChild>
            <Link href="/optimize">
              Get started <ArrowUpRight size={16} />
            </Link>
          </Button>
        </header>
        <main>{children}</main>
        <footer className="marketing-footer">
          <span className="footer-brand">
            <BrandLogo />© {new Date().getFullYear()} Forged Studio
          </span>
          <Link href="/settings">Privacy & storage</Link>
        </footer>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <BrandLogo />
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">F</span>
          <div>
            Personal workspace<small>Creator account</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={path === item.href ? 'page' : undefined}
              className={`nav-item ${path === item.href ? 'active' : ''}`}
            >
              <item.icon size={18} />
              {item.label}
              {item.href === '/optimize' && (
                <span className="nav-new">NEW</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <strong>Your work. Kept private.</strong>
            <p>
              Secure uploads. Private downloads. Automatically deleted after 24
              hours.
            </p>
            <Link href="/settings">
              Privacy & storage <ArrowUpRight size={13} />
            </Link>
          </div>
          {email ? (
            <div className="account">
              <span className="account-avatar">{email[0].toUpperCase()}</span>
              <span className="account-email">
                {email}
                <small>Personal account</small>
              </span>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await authClient()?.auth.signOut();
                  window.location.href = '/';
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          ) : (
            <Button asChild variant="secondary">
              <Link href="/login">
                Sign in to your workspace <ArrowUpRight size={15} />
              </Link>
            </Button>
          )}
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <Link href="/" className="mobile-brand" aria-label="Forged home">
            <BrandLogo />
          </Link>
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find((n) => n.href === path)?.label ||
                (path === '/login' ? 'Account' : 'Welcome')}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="status-chip">
              <span />
              PRIVATE BY DESIGN
            </span>
            <Link href="/optimize" className="top-link">
              Create something better <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <span className="footer-brand">
            <BrandLogo />© {new Date().getFullYear()} Forged Studio
          </span>
          <span>
            Made for the final export.<span className="footer-dot">·</span>
            <Link href="/settings">Privacy</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}

