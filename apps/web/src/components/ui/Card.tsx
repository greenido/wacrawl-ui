import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return <h2 className={cn('text-base font-semibold text-slate-950', className)}>{children}</h2>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200', className)} />;
}
