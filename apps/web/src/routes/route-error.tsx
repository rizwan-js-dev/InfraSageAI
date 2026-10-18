import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Last-resort boundary; shows no stack traces or internal details. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Something went wrong while rendering this page.';
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold">Unexpected error</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
