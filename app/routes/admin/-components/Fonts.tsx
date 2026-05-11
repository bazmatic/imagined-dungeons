import '../admin.css';

/**
 * Emits the Google Fonts <link> tags for the three Digital Grimoire
 * families. Render once near the top of each admin route component.
 * Importing this file also pulls in admin.css.
 */
export function Fonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&family=Playfair+Display:wght@500;600&display=swap"
      />
    </>
  );
}
