import { Navigate, createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { HealthPage } from '@/routes/health-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { RouteError } from '@/routes/route-error';

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      // The Overview screen replaces this redirect in Phase 6.
      { index: true, element: <Navigate to="/health" replace /> },
      { path: 'health', element: <HealthPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
