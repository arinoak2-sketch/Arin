import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import Link from 'next/link'

/**
 * Design-system primitives. Colour always comes from a semantic token, so a
 * component is correct in both themes by construction.
 */

// ── Button ───────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, CSSProperties> = {
  // 44px minimum touch target on every size that appears on mobile.
  sm: { padding: '7px 12px', fontSize: 13.5, minHeight: 34 },
  md: { padding: '10px 16px', fontSize: 14.5, minHeight: 44 },
  lg: { padding: '13px 22px', fontSize: 15.5, minHeight: 48 },
}

function variantStyle(variant: Variant): CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid transparent' }
    case 'secondary':
      return { background: 'var(--surface-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }
    case 'danger':
      return { background: 'var(--urgent-wash)', color: 'var(--urgent)', border: '1px solid currentColor' }
    default:
      return { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }
  }
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
  children: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', full, style, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        borderRadius: 'var(--radius-input)',
        fontWeight: 600,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.55 : 1,
        transition: 'background 120ms ease, border-color 120ms ease, transform 120ms ease',
        ...SIZES[size],
        ...variantStyle(variant),
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  full,
  external,
  children,
}: {
  href: string
  variant?: Variant
  size?: Size
  full?: boolean
  external?: boolean
  children: ReactNode
}) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: full ? '100%' : undefined,
    borderRadius: 'var(--radius-input)',
    fontWeight: 600,
    textDecoration: 'none',
    ...SIZES[size],
    ...variantStyle(variant),
  }
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} style={style}>
      {children}
    </Link>
  )
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({
  children,
  padded = true,
  style,
  as: As = 'div',
}: {
  children: ReactNode
  padded?: boolean
  style?: CSSProperties
  as?: 'div' | 'article' | 'section' | 'li'
}) {
  return (
    <As
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-1)',
        padding: padded ? 18 : 0,
        ...style,
      }}
    >
      {children}
    </As>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 style={{ fontSize: 22, fontWeight: 650, lineHeight: 1.25 }}>{title}</h2>
        {description ? (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: '62ch' }}>{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 650,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}
    >
      {children}
    </span>
  )
}

// ── Badges and pills ─────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'urgent' | 'soon' | 'upcoming' | 'calm' | 'caution' | 'passed'
  icon?: ReactNode
}) {
  const colour = tone === 'neutral' ? 'var(--text-secondary)' : `var(--${tone === 'accent' ? 'accent' : tone})`
  const wash = tone === 'neutral' ? 'var(--surface-sunken)' : `var(--${tone === 'accent' ? 'accent' : tone}-wash)`
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${tone === 'neutral' ? 'var(--border-hairline)' : 'currentColor'}`,
        background: wash,
        color: colour,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 'var(--radius-input)',
        border: '1px solid var(--border-hairline)',
        background: 'var(--surface-sunken)',
        color: 'var(--text-secondary)',
        fontSize: 12.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── Progress ─────────────────────────────────────────────────────────────────

export function Meter({
  value,
  label,
  tone = 'accent',
  showValue = true,
}: {
  value: number
  label: string
  tone?: 'accent' | 'urgent' | 'soon'
  showValue?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {showValue ? (
          <span className="tabular" style={{ fontWeight: 650, color: 'var(--text-primary)' }}>
            {pct}%
          </span>
        ) : null}
      </div>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        style={{
          height: 7,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-hairline)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `var(--${tone})`,
            transition: 'width 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        />
      </div>
    </div>
  )
}

// ── States ───────────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
  icon = '○',
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
        padding: '32px 22px',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface-sunken)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 22, color: 'var(--text-tertiary)', lineHeight: 1 }}>
        {icon}
      </span>
      <h3 style={{ fontSize: 16, fontWeight: 650 }}>{title}</h3>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: '54ch' }}>{description}</p>
      {action}
    </div>
  )
}

/**
 * A capability that is switched off says so, with the reason. This component
 * exists so that "not configured" can never be mistaken for "nothing found".
 */
export function UnavailableNotice({
  title,
  reason,
  tone = 'caution',
}: {
  title: string
  reason: string
  tone?: 'caution' | 'soon'
}) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--border-strong)',
        borderLeft: `3px solid var(--${tone})`,
        background: `var(--${tone}-wash)`,
      }}
    >
      <span aria-hidden="true" style={{ color: `var(--${tone})`, fontWeight: 700 }}>
        !
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <strong style={{ fontSize: 14, fontWeight: 650 }}>{title}</strong>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{reason}</p>
      </div>
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', radius }: { height?: number; width?: string | number; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius ?? 'var(--radius-input)' }} aria-hidden="true" />
}

export function CardSkeleton() {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton height={20} width="70%" />
        <Skeleton height={13} width="40%" />
        <Skeleton height={13} />
        <Skeleton height={13} width="85%" />
      </div>
    </Card>
  )
}

// ── Layout helpers ───────────────────────────────────────────────────────────

export function Stack({ gap = 16, children, style }: { gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0, ...style }}>{children}</div>
}

export function Row({
  gap = 8,
  wrap = true,
  align = 'center',
  children,
  style,
}: {
  gap?: number
  wrap?: boolean
  align?: CSSProperties['alignItems']
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: align, minWidth: 0, ...style }}>
      {children}
    </div>
  )
}

/** Visually hidden but announced by screen readers. */
export function SrOnly({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {children}
    </span>
  )
}
