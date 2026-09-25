import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'

import { cn } from '@/lib/cn'

export function Table({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-surface-hover">{children}</thead>
  )
}

export function Th({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>
}

export function Tr({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { children: ReactNode }) {
  return (
    <tr className={cn('dm-row text-ink', className)} {...props}>
      {children}
    </tr>
  )
}

export function Td({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-ink', className)} {...props}>
      {children}
    </td>
  )
}
