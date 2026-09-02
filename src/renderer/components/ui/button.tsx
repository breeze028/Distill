import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border-accent bg-accent text-accent-foreground hover:bg-accent/90',
        secondary: 'border-border bg-surface hover:bg-muted',
        ghost: 'border-transparent bg-transparent hover:bg-muted',
        destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90'
      },
      size: {
        default: 'px-3',
        icon: 'h-8 w-8 p-0',
        sm: 'h-8 px-2.5 text-xs'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));

Button.displayName = 'Button';
