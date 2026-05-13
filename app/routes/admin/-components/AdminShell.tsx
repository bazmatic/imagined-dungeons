import type { ReactNode } from 'react';
import { SideNav } from './SideNav';
import { TopBar, type TopBarProps } from './TopBar';
import type { Category } from './category-helpers';

export interface AdminShellProps {
  readonly route: 'index' | 'detail';
  readonly topBar: TopBarProps;
  readonly sideNav?: {
    readonly active: Category;
    readonly onSelect: (c: Category) => void;
    readonly onCreateNew?: () => void;
    readonly onOpenBuilderAssistant?: () => void;
  };
  readonly children: ReactNode;
}

export function AdminShell({ route, topBar, sideNav, children }: AdminShellProps) {
  const showSide = route === 'detail' && sideNav !== undefined;
  return (
    <div className={`shell${showSide ? '' : ' shell--no-sidenav'}`}>
      <TopBar {...topBar} />
      {showSide && sideNav ? <SideNav {...sideNav} /> : null}
      <main className="shell__content">{children}</main>
    </div>
  );
}
