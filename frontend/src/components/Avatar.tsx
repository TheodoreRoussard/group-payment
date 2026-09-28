import { displayName, hueOf } from '../lib/labels'

export function Avatar({ address, size = 36 }: { address: string; size?: number }) {
  const name = displayName(address)
  const hue = hueOf(address)
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `oklch(0.9 0.06 ${hue})`,
        color: `oklch(0.38 0.1 ${hue})`,
      }}
      aria-hidden
    >
      {(name ?? address.slice(1, 3)).slice(0, name ? 1 : 2).toUpperCase()}
    </span>
  )
}
