// 本地数据加密工具 - 使用 Web Crypto API (AES-GCM)
// 对敏感字段进行透明加密，保护用户隐私

const ENC_PREFIX = 'enc:' // 加密数据前缀，用于区分明文和密文
const SALT_KEY = 'network-ark-salt'
const KEY_KEY = 'network-ark-key'
const PASSPHRASE_ENABLED_KEY = 'network-ark-encryption-enabled'

// 需要加密的敏感字段
export const SENSITIVE_FIELDS = ['phone', 'email', 'address', 'wechat', 'note', 'birthday'] as const

let cachedKey: CryptoKey | null = null

// 检查 Web Crypto API 是否可用
function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

// 获取或生成盐值
function getSalt(): ArrayBuffer {
  let salt = localStorage.getItem(SALT_KEY)
  if (!salt) {
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    salt = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(SALT_KEY, salt)
  }
  const arr = new Uint8Array(
    salt.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  )
  return arr.buffer
}

// 从密码派生密钥（PBKDF2）
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: getSalt(),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// 获取设备默认密钥（无需用户输入密码）
async function getDeviceKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  let storedKey = localStorage.getItem(KEY_KEY)
  if (!storedKey) {
    // 生成随机密码作为设备密钥
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    storedKey = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(KEY_KEY, storedKey)
  }
  cachedKey = await deriveKey(storedKey)
  return cachedKey
}

// 设置用户密码（启用密码保护）
export async function setPassphrase(passphrase: string): Promise<void> {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API 不可用')
  cachedKey = await deriveKey(passphrase)
  localStorage.setItem(PASSPHRASE_ENABLED_KEY, 'true')
}

// 清除密码保护（恢复设备默认密钥）
export async function clearPassphrase(): Promise<void> {
  cachedKey = null
  localStorage.removeItem(PASSPHRASE_ENABLED_KEY)
  await getDeviceKey() // 重新生成设备密钥
}

// 检查是否启用了密码保护
export function isPassphraseEnabled(): boolean {
  return localStorage.getItem(PASSPHRASE_ENABLED_KEY) === 'true'
}

// 检查加密功能是否可用
export function isEncryptionAvailable(): boolean {
  return isCryptoAvailable()
}

// 加密单个字符串
export async function encryptString(plaintext: string): Promise<string> {
  if (!isCryptoAvailable() || !plaintext) return plaintext
  const key = cachedKey || await getDeviceKey()
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext)
  )
  // 将 IV 和密文合并为 base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return ENC_PREFIX + btoa(String.fromCharCode(...combined))
}

// 解密单个字符串
export async function decryptString(data: string): Promise<string> {
  if (!isCryptoAvailable() || !data || !data.startsWith(ENC_PREFIX)) {
    return data // 明文直接返回
  }
  try {
    const key = cachedKey || await getDeviceKey()
    const combined = Uint8Array.from(
      atob(data.slice(ENC_PREFIX.length)),
      (c) => c.charCodeAt(0)
    )
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    // 解密失败（可能是密钥不匹配），返回原数据
    return data
  }
}

// 判断字符串是否为加密数据
export function isEncrypted(data: string): boolean {
  return typeof data === 'string' && data.startsWith(ENC_PREFIX)
}

// 加密对象中的敏感字段
export async function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: readonly string[] = SENSITIVE_FIELDS
): Promise<T> {
  if (!isCryptoAvailable()) return obj
  const result = { ...obj }
  for (const field of fields) {
    const value = (result as any)[field]
    if (typeof value === 'string' && value && !isEncrypted(value)) {
      (result as any)[field] = await encryptString(value)
    }
  }
  return result
}

// 解密对象中的敏感字段
export async function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: readonly string[] = SENSITIVE_FIELDS
): Promise<T> {
  if (!isCryptoAvailable()) return obj
  const result = { ...obj }
  for (const field of fields) {
    const value = (result as any)[field]
    if (typeof value === 'string' && isEncrypted(value)) {
      (result as any)[field] = await decryptString(value)
    }
  }
  return result
}

// 批量解密对象数组
export async function decryptFieldsBatch<T extends Record<string, any>>(
  arr: T[],
  fields: readonly string[] = SENSITIVE_FIELDS
): Promise<T[]> {
  if (!isCryptoAvailable()) return arr
  return Promise.all(arr.map((obj) => decryptFields(obj, fields)))
}
