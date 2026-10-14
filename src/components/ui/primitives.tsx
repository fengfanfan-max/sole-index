/**
 * Vendored UI primitives.
 *
 * These are shadcn/ui-style components — the actual component source lives in
 * the repository rather than behind a package dependency, which is the whole
 * point of the shadcn approach. They are deliberately **server components**:
 * nothing here holds state, so filtering and navigation stay server-rendered
 * with zero client JavaScript.
 */
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  interactive,
  sheen,
  ...props
}: ComponentPropsWithoutRef<'div'> & { interactive?: boolean; sheen?: boolean }) {
  return (
    <div
      className={cn(
        interactive ? 'panel-interactive' : 'panel',
        sheen && 'panel-sheen',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  as: Tag = 'h3',
  ...props
}: ComponentPropsWithoutRef<'h3'> & { as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <Tag
      className={cn('text-sm font-semibold tracking-tight text-ink', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('mt-0.5 text-xs leading-relaxed text-ink-subtle', className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('border-t border-line px-5 py-3 text-xs text-ink-subtle', className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type BadgeTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info' | 'outline';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-muted border-line',
  accent: 'bg-accent/12 text-accent border-accent/30',
  up: 'bg-up/12 text-up border-up/30',
  down: 'bg-down/12 text-down border-down/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  info: 'bg-info/12 text-info border-info/30',
  outline: 'bg-transparent text-ink-muted border-line-strong',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentPropsWithoutRef<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-dim border border-transparent font-semibold',
  secondary: 'bg-raised text-ink hover:bg-line border border-line',
  outline: 'bg-transparent text-ink hover:bg-raised border border-line-strong',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-raised border border-transparent',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-control',
  md: 'h-9.5 px-4 text-sm rounded-control',
};

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

/** Renders an `<a>` when `href` is set, otherwise a `<button>`. */
export function Button({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonBaseProps &
  (
    | ({ href: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'className' | 'children'>)
    | ({ href?: undefined } & Omit<
        ComponentPropsWithoutRef<'button'>,
        'className' | 'children'
      >)
  )) {
  const classes = cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...(props as ComponentPropsWithoutRef<'a'>)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ComponentPropsWithoutRef<'button'>)}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

const CONTROL_BASE =
  'w-full rounded-control border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-line-strong focus:border-accent focus:outline-none';

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(CONTROL_BASE, 'h-9', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select
      className={cn(
        CONTROL_BASE,
        'h-9 cursor-pointer appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2398a1ac' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(CONTROL_BASE, 'min-h-24 py-2 leading-relaxed', className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="label-caps">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

export function TableWrap({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function Th({
  className,
  align = 'left',
  ...props
}: ComponentPropsWithoutRef<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  align = 'left',
  ...props
}: ComponentPropsWithoutRef<'td'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'border-b border-line/60 px-3 py-2.5 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Data display                                                                */
/* -------------------------------------------------------------------------- */

/** A signed change, coloured and arrowed. */
export function Delta({
  value,
  format,
  className,
  showIcon = true,
}: {
  value: number;
  /** Override the default percent rendering. */
  format?: (value: number) => string;
  className?: string;
  showIcon?: boolean;
}) {
  const tone = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-ink-subtle';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '■';
  const text = format
    ? format(value)
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`;

  return (
    <span className={cn('tnum inline-flex items-center gap-1 text-xs font-medium', tone, className)}>
      {showIcon ? <span aria-hidden className="text-[9px] leading-none">{arrow}</span> : null}
      {text}
    </span>
  );
}

/**
 * The headline number on a card. `value` is pre-formatted by the caller so the
 * component stays presentation-only.
 */
export function Stat({
  label,
  value,
  sub,
  delta,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="label-caps">{label}</span>
      <span
        className={cn(
          'tnum text-2xl leading-none font-semibold tracking-tight',
          tone === 'accent' ? 'text-accent' : 'text-ink',
        )}
      >
        {value}
      </span>
      <span className="flex items-center gap-2 text-xs text-ink-subtle">
        {delta !== undefined ? <Delta value={delta} /> : null}
        {sub}
      </span>
    </div>
  );
}

/** A colour swatch for a normalised colourway key. */
export function Swatch({
  hex,
  label,
  size = 14,
  className,
}: {
  hex: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-block shrink-0 rounded-[4px] border border-line-strong"
        style={{ width: size, height: size, backgroundColor: hex }}
        aria-hidden
      />
      {label ? <span className="text-xs text-ink-muted">{label}</span> : null}
    </span>
  );
}

/** A 0–100 score rendered as a labelled meter. */
export function ScoreMeter({
  score,
  max = 100,
  className,
  showValue = true,
}: {
  score: number;
  max?: number;
  className?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  // Below 40 reads as cooling, above 60 as heating — matches the copy used on
  // the trends pages so the colour never contradicts the words.
  const colour = score >= 60 ? 'var(--color-up)' : score >= 40 ? 'var(--color-accent)' : 'var(--color-down)';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-raised">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: colour }}
        />
      </span>
      {showValue ? (
        <span className="tnum w-9 text-right text-xs font-medium text-ink">
          {score.toFixed(0)}
        </span>
      ) : null}
    </span>
  );
}

/** Confidence, rendered as filled pips. */
export function ConfidenceMeter({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Confidence ${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn('h-1 w-3 rounded-full', i < value ? 'bg-accent' : 'bg-raised')}
        />
      ))}
      <span className="sr-only">
        Confidence {value} of {max}
      </span>
    </span>
  );
}

/** Section heading with an optional right-hand slot. */
export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-subtle">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-xs text-ink-subtle">{description}</p> : null}
      {action}
    </div>
  );
}

/** Small inline note used for caveats and methodology callouts. */
export function Callout({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: 'neutral' | 'warn' | 'accent';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-elevated',
    warn: 'border-warn/30 bg-warn/6',
    accent: 'border-accent/30 bg-accent/6',
  } as const;

  return (
    <div className={cn('rounded-card border px-4 py-3 text-xs leading-relaxed', tones[tone], className)}>
      {title ? <p className="mb-1 font-semibold text-ink">{title}</p> : null}
      <div className="text-ink-muted">{children}</div>
    </div>
  );
}
