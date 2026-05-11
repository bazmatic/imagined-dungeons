import type { ReactNode } from 'react';

export function MetadataColumn({ children }: { readonly children: ReactNode }) {
  return <aside className="form-grid__meta">{children}</aside>;
}
