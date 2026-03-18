'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/venues', label: 'Venues', exact: false },
  { href: '/admin/discovery', label: 'Discovery', exact: false },
  { href: '/admin/merge-review', label: 'Merge Review', exact: false },
  { href: '/admin/submissions', label: 'Submissions', exact: false },
  { href: '/admin/rejected', label: 'Rejected', exact: false },
  { href: '/admin/archived', label: 'Archived', exact: false },
  { href: '/admin/settings', label: 'Settings', exact: false },
];

interface NavLinksProps {
  pendingMergeCount: number;
}

export default function NavLinks({ pendingMergeCount }: NavLinksProps) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <>
      <div className="flex items-center gap-6">
        {NAV_LINKS.map(({ href, label, exact }) => (
          <Link
            key={href}
            href={href}
            className={`text-sm transition-colors flex items-center ${
              isActive(href, exact)
                ? 'font-semibold text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
            {href === '/admin/merge-review' && pendingMergeCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                {pendingMergeCount}
              </span>
            )}
          </Link>
        ))}
      </div>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Logout
        </button>
      </form>
    </>
  );
}
