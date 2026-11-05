import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join } from 'node:path'
import { expandTilde, fileNameOf, imageMediaTypeFromName, toDataUrl } from './shared'

/**
 * 图片取字节：本地相对路径按稿件所在目录解析，远程图由 core 代下。
 * 窗口侧的原生 fetch 受 CSP 限制（connect-src 只有 plugin:），所以远程图必须走这里。
 */

export interface ResolvedImage {
  path: string
  fileName: string
  mediaType: string
  dataUrl: string
}

const MAX_REMOTE_BYTES = 25 * 1024 * 1024
const REMOTE_TIMEOUT_MS = 20_000

function isRemoteOrDataUrl(value: string): boolean {
  return /^(https?:|data:|blob:)/i.test(value)
}

export async function resolveLocalImage(args: {
  path: string
  basePath?: string | null
}): Promise<ResolvedImage> {
  const raw = typeof args?.path === 'string' ? args.path.trim() : ''
  if (raw === '') throw new Error('图片路径为空。')
  if (isRemoteOrDataUrl(raw)) {
    throw new Error('远程图片不需要由后台读取。')
  }

  const parsed = /^file:\/\//i.test(raw) ? fileURLToPath(new URL(raw)) : raw
  const candidate = expandTilde(parsed)

  const resolved = await resolvePath(candidate, args?.basePath ?? null)
  const info = await stat(resolved).catch(() => null)
  if (!info?.isFile()) throw new Error('找不到这张本地图片。')

  const bytes = await readFile(resolved).catch(() => {
    throw new Error('无法读取这张本地图片，请确认文件没有被占用。')
  })
  const mediaType = imageMediaTypeFromName(resolved)

  return {
    path: resolved,
    fileName: fileNameOf(resolved),
    mediaType,
    dataUrl: toDataUrl(mediaType, bytes),
  }
}

/**
 * 相对路径的基准目录是稿件所在目录；找不到时再试上一级
 * （稿件常放在 books/ 之类的子目录，图片却在仓库根）。
 */
async function resolvePath(target: string, basePath: string | null): Promise<string> {
  if (isAbsolute(target)) return target
  if (!basePath) throw new Error('这张图片用的是相对路径，需要先把稿件保存到本地。')

  const base = expandTilde(basePath)
  const baseInfo = await stat(base).catch(() => null)
  const baseDir = baseInfo?.isDirectory() ? base : dirname(base)

  const direct = join(baseDir, target)
  if (await exists(direct)) return direct

  const sibling = join(dirname(baseDir), target)
  if (await exists(sibling)) return sibling

  return direct
}

async function exists(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null)
  return info !== null
}

export async function resolveRemoteImage(args: { url: string }): Promise<ResolvedImage> {
  const raw = typeof args?.url === 'string' ? args.url.trim() : ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('图片地址不合法。')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http / https 的远程图片。')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/*,*/*;q=0.8' },
    })
    if (!response.ok) throw new Error(`远程图片下载失败（HTTP ${response.status}）。`)

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_REMOTE_BYTES) throw new Error('远程图片超过 25 MB，导出不支持。')

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0) throw new Error('远程图片内容为空。')
    if (bytes.length > MAX_REMOTE_BYTES) throw new Error('远程图片超过 25 MB，导出不支持。')

    const declaredType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const mediaType = declaredType.startsWith('image/')
      ? declaredType
      : imageMediaTypeFromName(url.pathname)
    if (!declaredType.startsWith('image/') && !looksLikeImage(bytes)) {
      throw new Error('这个地址返回的不是图片。')
    }

    return {
      path: url.toString(),
      fileName: fileNameOf(url.pathname) || 'remote-image',
      mediaType,
      dataUrl: toDataUrl(mediaType, bytes),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('下载远程图片超时，请检查网络后重试。')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** 没有 Content-Type 时按文件头兜底，避免把 HTML 错误页当成图片塞进卡片 */
function looksLikeImage(bytes: Uint8Array): boolean {
  const head = (offset: number, length: number): number[] =>
    Array.from(bytes.slice(offset, offset + length))
  const [a, b, c, d] = head(0, 4)
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return true // PNG
  if (a === 0xff && b === 0xd8 && c === 0xff) return true // JPEG
  if (a === 0x47 && b === 0x49 && c === 0x46) return true // GIF
  if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return true // WEBP / RIFF
  if (a === 0x42 && b === 0x4d) return true // BMP
  return false
}
