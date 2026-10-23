import { Button, ButtonLink } from "./Button";
import { Icon, type IconName } from "./Icon";

/**
 * The four honest states every block has besides "here's the data":
 * - loading: the final layout with grey bars where values will go (see Skeleton)
 * - empty: there's simply nothing yet, and the next step
 * - error: what failed, and Retry
 * - offline / unavailable: why it can't load right now
 * Each one keeps the block's frame, so nothing jumps when the data lands.
 */

export function EmptyState({
  title,
  children,
  action,
  icon,
  className = "",
}: {
  title: string;
  children?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 rounded-[var(--radius-inner)] bg-raised p-5 ${className}`}>
      {icon && <Icon name={icon} className="text-faint" />}
      <div>
        <p className="text-[15px] leading-6 font-medium">{title}</p>
        {children && <div className="mt-1 text-[14px] leading-5 text-muted">{children}</div>}
      </div>
      {action &&
        (action.href ? (
          <ButtonLink href={action.href} variant="primary" size="md">
            {action.label}
          </ButtonLink>
        ) : (
          <Button variant="primary" size="md" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

export function ErrorState({
  what,
  lastGood,
  onRetry,
  offline = false,
  className = "",
}: {
  /** What failed, in a few words: "Couldn't load this week's projections." */
  what: string;
  /** When the data was last good, if we have older data on screen. */
  lastGood?: string | null;
  onRetry?: () => void;
  offline?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-[var(--radius-inner)] bg-raised p-4 ${className}`}
    >
      <Icon name={offline ? "wifiOff" : "alert"} className={offline ? "text-muted" : "text-negative"} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5">{offline ? "You're offline. This needs a connection." : what}</p>
        {lastGood && <p className="mt-0.5 text-[13px] text-muted">Last updated {lastGood}.</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} icon="refresh">
          Retry
        </Button>
      )}
    </div>
  );
}

/** A grey bar the size of the thing it stands in for. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

/** Placeholder rows for a list: same pitch as the real rows, so nothing shifts. */
export function SkeletonRows({ rows = 4, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3" style={{ height }}>
          <div className="skeleton size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="skeleton h-3.5 w-2/5 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
          <div className="skeleton h-4 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}
