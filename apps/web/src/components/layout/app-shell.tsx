import { NavLink, Outlet } from 'react-router';
import { MockModeBanner } from '@/components/mock-mode-banner';
import { cn } from '@/lib/utils';

// Screens are added here as their phases land (PLAN §13, Phase 6).
const NAV = [{ to: '/health', label: 'System health' }];

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <MockModeBanner />
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold tracking-tight">InfraSage AI</span>
          <nav className="flex gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground',
                    isActive && 'bg-secondary text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
