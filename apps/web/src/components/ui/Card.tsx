import type { HTMLAttributes, KeyboardEvent, PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends PropsWithChildren<HTMLAttributes<HTMLElement>> {}

interface CardTitleProps extends PropsWithChildren<HTMLAttributes<HTMLHeadingElement>> {}

interface ClickableCardProps extends CardProps {
  onActivate: () => void;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <section {...props} className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </section>
  );
}

export function ClickableCard({ children, className, onActivate, onClick, onKeyDown, ...props }: ClickableCardProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  }

  return (
    <Card
      {...props}
      role={props.role ?? 'link'}
      tabIndex={props.tabIndex ?? 0}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onActivate();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/15 dark:hover:border-brand-600',
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function CardTitle({ children, className, ...props }: CardTitleProps) {
  return <h2 {...props} className={cn('text-base font-semibold text-slate-950', className)}>{children}</h2>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200', className)} />;
}
