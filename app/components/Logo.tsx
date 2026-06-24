/** Logo ET Brands (recreado en SVG: E negra + T gris + pixeles naranjos + BRANDS). */
export default function Logo({ className }: { className?: string }) {
  const BLACK = "#111111";
  const GRAY  = "#8a8a8a";
  const ORANGE = "#e8431f";
  return (
    <svg viewBox="0 0 210 150" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ET Brands">
      {/* E (negra) */}
      <rect x="10" y="10" width="22" height="92" fill={BLACK} />
      <rect x="10" y="10" width="58" height="18" fill={BLACK} />
      <rect x="10" y="47" width="48" height="16" fill={BLACK} />
      <rect x="10" y="84" width="58" height="18" fill={BLACK} />

      {/* Cuadro gris superior + T gris */}
      <rect x="76" y="10" width="24" height="24" fill={GRAY} />
      <rect x="76" y="46" width="60" height="18" fill={GRAY} />
      <rect x="96" y="46" width="20" height="56" fill={GRAY} />

      {/* Pixeles naranjos (motivo tech) */}
      <rect x="108" y="10" width="30" height="30" fill={ORANGE} />
      <rect x="146" y="30" width="14" height="14" fill={ORANGE} />
      <rect x="130" y="46" width="20" height="20" fill={ORANGE} />
      <rect x="134" y="72" width="16" height="16" fill={ORANGE} />
      <rect x="118" y="88" width="16" height="16" fill={ORANGE} />

      {/* BRANDS */}
      <text x="10" y="138" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="29" letterSpacing="1" fill={BLACK}>BRANDS</text>
    </svg>
  );
}
