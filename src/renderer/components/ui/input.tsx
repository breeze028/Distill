import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));

Input.displayName = 'Input';
