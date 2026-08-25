import type { ComponentProps } from 'react';

import { cn } from '@workspace-welcome/ui/lib/utils';

export type FormProps = ComponentProps<'form'>;

export function Form({ className, ...props }: FormProps) {
  return <form className={cn(className)} {...props} />;
}
