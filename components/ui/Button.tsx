import Link from "next/link";
import { Icon, type IconName } from "./Icon";

/**
 * Buttons. One primary per screen: a white pill with black text. Secondary is an
 * outlined pill; quiet is text only. Heights: 36px in toolbars, 44px where a thumb
 * is the main pointer.
 */
type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-black hover:bg-[#e6e6e6] disabled:bg-well disabled:text-faint",
  secondary:
    "bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--color-control)] hover:bg-raised disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--color-line)]",
  quiet: "bg-transparent text-muted hover:bg-raised hover:text-ink disabled:text-faint",
  danger: "bg-transparent text-negative shadow-[inset_0_0_0_1px_var(--color-negative-soft)] hover:bg-negative-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-4 text-[14px]",
  lg: "h-11 gap-2 px-5 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className = "") {
  return `pressable inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
}) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...props}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className = "",
  children,
  prefetch,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  className?: string;
  children: React.ReactNode;
  prefetch?: boolean;
}) {
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </>
  );
  // Another site (ESPN articles): a plain link in a new tab.
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={buttonClass(variant, size, className)}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass(variant, size, className)}>
      {inner}
    </Link>
  );
}

/** A round icon-only button. Always give it a label for screen readers. */
export function IconButton({
  icon,
  label,
  size = 40,
  className = "",
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
  size?: 32 | 36 | 40 | 44;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`pressable grid shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink disabled:text-faint ${className}`}
      style={{ width: size, height: size }}
      {...props}
    >
      <Icon name={icon} size={size <= 32 ? 16 : 20} />
    </button>
  );
}
