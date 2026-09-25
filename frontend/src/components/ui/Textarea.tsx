import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { FIELD_BASE, FIELD_INVALID, FIELD_VALID } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        invalid ? FIELD_INVALID : FIELD_VALID,
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
