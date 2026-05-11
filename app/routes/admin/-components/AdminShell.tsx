import type { ReactNode } from 'react';
import { SideNav, type SideNavCategory } from './SideNav';
import { TopBar, type TopBarProps } from './TopBar';

export interface AdminShellProps {
  readonly route: 'index' | 'detail';
  readonly topBar: TopBarProps;
  readonly sideNav?: {
    readonly active: SideNavCategory;
    readonly onSelect: (c: SideNavCategory) => void;
    readonly onCreateNew?: () => void;
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
