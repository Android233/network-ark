import { getAvatarColor, getInitial } from '../utils/helpers'

interface AvatarProps {
  name: string
  size?: number
  avatar?: string // base64图片
}

export default function Avatar({ name, size = 48, avatar }: AvatarProps) {
  const color = getAvatarColor(name)
  const initial = getInitial(name)

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="rounded-full flex-shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.4,
      }}
    >
      {initial}
    </div>
  )
}
