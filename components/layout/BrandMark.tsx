// Verian V mark — vector recreation of the leaf-stroke V from the raster
// brand lockup in public/brand/, so it renders cleanly on any background.
// Two overlapping leaf strokes: left/shorter deep-navy→cyan, right/taller
// teal→leaf-green, with a soft join at the base.

interface BrandMarkProps {
  size?: number
  className?: string
}

export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="verian-mark-left" x1="6" y1="10" x2="34" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1d3a6e" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="verian-mark-right" x1="56" y1="2" x2="30" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0d9488" />
          <stop offset="1" stopColor="#7cc77c" />
        </linearGradient>
      </defs>
      {/* right leaf — taller, sweeps from the upper right into the base */}
      <path
        d="M58 2 C60.5 23 52 45 32.5 58.5 C27.5 51 29 37 36.5 25.5 C42.5 16 49.5 8.5 58 2 Z"
        fill="url(#verian-mark-right)"
      />
      {/* left leaf — shorter, crosses in front and joins softly at the base */}
      <path
        d="M6 12 C18.5 17.5 28.5 29.5 33.5 43.5 C35.5 49.5 34.5 55.5 31.5 59.5 C18.5 50.5 8.5 32.5 6 12 Z"
        fill="url(#verian-mark-left)"
      />
    </svg>
  )
}
