import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Imagined Dungeons' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

// Keyframe-driven dot indicator used by the in-flight loader on the play
// route. Kept as a small inline style block since the project deliberately
// avoids a global stylesheet — everything else is inline styles.
const GLOBAL_STYLE = `
@keyframes id-dot-pulse {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}
.id-dot {
  display: inline-block;
  animation: id-dot-pulse 1.2s infinite ease-in-out;
}
.id-dot-1 { animation-delay: 0s; }
.id-dot-2 { animation-delay: 0.15s; }
.id-dot-3 { animation-delay: 0.3s; }
`;

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{GLOBAL_STYLE}</style>
      </head>
      <body
        style={{
          background: '#000',
          color: '#cfcfcf',
          fontFamily: 'ui-monospace, monospace',
          margin: 0,
        }}
      >
        {children}
        <Scripts />
      </body>
    </html>
  );
}
