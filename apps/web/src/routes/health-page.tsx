import type { DependencyCheck, HealthResponse } from '@infrasage/shared';
import { ApiError } from '@/api/client';
import { useHealth } from '@/api/health';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const OVERALL: Record<
  HealthResponse['status'],
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  ok: { label: 'All systems up', variant: 'success' },
  degraded: { label: 'Degraded', variant: 'warning' },
  down: { label: 'Down', variant: 'destructive' },
};

const DEPENDENCY: Record<
  DependencyCheck['status'],
  { label: string; variant: 'success' | 'destructive' | 'secondary' }
> = {
  up: { label: 'Up', variant: 'success' },
  down: { label: 'Down', variant: 'destructive' },
  not_configured: { label: 'Not configured', variant: 'secondary' },
};

const DEPENDENCY_NAMES: Record<keyof HealthResponse['checks'], { name: string; role: string }> = {
  mysql: { name: 'MySQL', role: 'Durable store: incidents, investigations, reports, audit' },
  redis: { name: 'Redis', role: 'Ephemeral: cache, dedupe TTLs, cooldowns, locks' },
  mcp: { name: 'MCP server', role: 'Read-only diagnostic tools (added in Phase 3)' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not load system health</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span>{apiError?.message ?? 'Unexpected error.'}</span>
        {apiError?.correlationId && (
          <span className="font-mono text-xs">correlation_id: {apiError.correlationId}</span>
        )}
        <span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

function LoadingState() {
  return (
    <div aria-label="Loading system health" className="grid gap-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function HealthPage() {
  const { data, error, isPending, isError, refetch, dataUpdatedAt, errorUpdatedAt } = useHealth();

  if (isPending) return <LoadingState />;
  if (isError && !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  // Stale: the most recent refresh failed, so what is shown is the last known report.
  const stale = errorUpdatedAt > dataUpdatedAt;
  const overall = OVERALL[data.status];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">System health</h1>
        <Badge variant={overall.variant}>{overall.label}</Badge>
        <Badge variant="outline">provider_mode: {data.provider_mode}</Badge>
      </div>

      {stale && (
        <Alert variant="warning">
          <AlertTitle>Showing stale data</AlertTitle>
          <AlertDescription>
            The API could not be reached on the last refresh. This report was generated at{' '}
            {formatTime(data.generated_at)}.
          </AlertDescription>
        </Alert>
      )}

      {data.status === 'degraded' && (
        <Alert variant="warning">
          <AlertTitle>Running degraded</AlertTitle>
          <AlertDescription>
            A non-durable dependency is unavailable. Reads continue; features that need it will be
            refused rather than run unsafely.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
          <CardDescription>
            Checked by the API at {formatTime(data.generated_at)}; refreshes every 10 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Dependency</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Latency</th>
                <th className="py-2 font-medium">Error code</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(DEPENDENCY_NAMES) as (keyof HealthResponse['checks'])[]).map((key) => {
                const check = data.checks[key];
                const status = DEPENDENCY[check.status];
                return (
                  <tr key={key} className="border-t" data-testid={`dependency-${key}`}>
                    <td className="py-2">
                      <div className="font-medium">{DEPENDENCY_NAMES[key].name}</div>
                      <div className="text-xs text-muted-foreground">
                        {DEPENDENCY_NAMES[key].role}
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="py-2 tabular-nums">
                      {check.latency_ms === null ? '—' : `${check.latency_ms} ms`}
                    </td>
                    <td className="py-2 font-mono text-xs">{check.error_code ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">API version</dt>
            <dd>{data.version}</dd>
            <dt className="text-muted-foreground">Environment</dt>
            <dd>{data.environment}</dd>
            <dt className="text-muted-foreground">LLM mode</dt>
            <dd>
              {data.llm.mode}
              {!data.llm.configured && (
                <Badge variant="warning" className="ml-2">
                  not configured
                </Badge>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
