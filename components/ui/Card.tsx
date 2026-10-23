import Link from "next/link";
import { Icon } from "./Icon";

/** A card: one lightness step above the ground, no border, no shadow. */
export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "li" }) {
  return (
    <Tag className={`card p-5 ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** A card's title row: the title on the left, at most one quiet action on the right. */
export function CardHeader({
  title,
  subtitle,
  action,
  href,
  hrefLabel = "View all",
  className = "",
  level = 2,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <Heading className="text-[16px] leading-6 font-semibold">{title}</Heading>
        {subtitle && <p className="mt-0.5 text-[13px] leading-5 text-muted">{subtitle}</p>}
      </div>
      {action}
      {!action && href && (
        <Link
          href={href}
          className="-my-1 inline-flex shrink-0 items-center gap-0.5 rounded-full py-1 pr-1 pl-2 text-[13px] text-muted hover:text-ink"
        >
          {hrefLabel}
          <Icon name="chevronRight" size={16} />
        </Link>
      )}
    </div>
  );
}

/** A label over a value. Values use tabular figures; units are a smaller grey suffix. */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone = "ink",
  size = "md",
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  tone?: "ink" | "accent" | "positive" | "negative" | "muted";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tones = {
    ink: "text-ink",
    accent: "text-accent",
    positive: "text-positive",
    negative: "text-negative",
    muted: "text-faint",
  };
  const sizes = { sm: "text-[18px] leading-6", md: "text-[24px] leading-8", lg: "text-[34px] leading-10" };
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[13px] leading-5 text-muted">{label}</p>
      <p className={`tabular font-semibold tracking-[-0.01em] ${sizes[size]} ${tones[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal tracking-normal text-faint">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[13px] leading-5 text-muted">{sub}</p>}
    </div>
  );
}

/** A small status label beside a value or inside a row. Pale tint, dark text of the same hue. */
export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "bg-well text-ink",
    accent: "bg-accent-soft text-accent",
    positive: "bg-positive-soft text-positive",
    negative: "bg-negative-soft text-negative",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[12px] leading-none font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
