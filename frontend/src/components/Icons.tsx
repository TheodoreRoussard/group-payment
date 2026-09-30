import type { SVGProps } from 'react'

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

type P = SVGProps<SVGSVGElement>

export const Check = (p: P) => (
  <svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>
)
export const Lock = (p: P) => (
  <svg {...base} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)
export const ThumbUp = (p: P) => (
  <svg {...base} {...p}><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" /></svg>
)
export const Send = (p: P) => (
  <svg {...base} {...p}><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></svg>
)
export const Undo = (p: P) => (
  <svg {...base} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
)
export const Clock = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const External = (p: P) => (
  <svg {...base} {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
)
export const Copy = (p: P) => (
  <svg {...base} {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
)
export const Wallet = (p: P) => (
  <svg {...base} {...p}><path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" /><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" /></svg>
)
export const Alert = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
)
export const Spinner = (p: P) => (
  <svg {...base} {...p} className="spin"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
)
export const Bell = (p: P) => (
  <svg {...base} {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
)
export const Plus = (p: P) => (
  <svg {...base} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
)
export const Menu = (p: P) => (
  <svg {...base} {...p}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
)
export const Close = (p: P) => (
  <svg {...base} {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
)
export const Mail = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
)
export const Crown = (p: P) => (
  <svg {...base} {...p}><path d="m3 8 4 4 5-7 5 7 4-4-2 11H5L3 8Z" /></svg>
)
