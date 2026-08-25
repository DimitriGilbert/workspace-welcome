import type { ReactNode } from 'react';

import { cn } from '@workspace-welcome/ui/lib/utils';

export interface FormLayoutProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function FormLayout({ children, className }: FormLayoutProps) {
  return <div className={cn('space-y-4', className)}>{children}</div>;
}
