import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="grid gap-2">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/health" className="text-sm underline">
        Go to system health
      </Link>
    </div>
  );
}
