import type { SVGProps } from 'react';

/** Pato de goma con el mismo trazo que los íconos de lucide (24×24, color del texto). */
export function DuckIcon({
  size = 24,
  strokeWidth = 2,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12.5 10.6C10 11.3 7.3 10.8 5.3 9.2 4.4 8.5 3 9 3 10.3 3 15.4 6.6 19.5 12 19.5c5.1 0 8.5-2.4 8.5-5.6 0-1.9-1-3.2-2.5-3.8" />
      <circle cx="15" cy="7.5" r="3.5" />
      <path d="M18.3 6.9 21.5 7.9 18.2 9.2" />
      <path d="M8.5 14c1.7 1.6 5 1.7 7 0" />
      <circle cx="15.6" cy="6.9" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
