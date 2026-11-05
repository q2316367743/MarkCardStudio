import { homedir } from 'node:os'
import { basename, extname } from 'node:path'

/**
 * 后台公共工具。
 *
 * 窗口是沙箱页面，用户在选择框里选中的路径也没有默认可读权限；
 * core 的 Node 不受能力网关限制，所以文件选择、读写、图片取字节统一收在 core，
 * 窗口只拿数据与路径（与上游 Tauri 版的分层保持一致）。
 */

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd']

/** `~/xxx` 与 `~` 展开成主目录；其它路径原样返回 */
export function expandTilde(input: string): string {
  if (input === '~') return homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return `${homedir()}/${input.slice(2)}`
  }
  return input
}

export function extensionOf(path: string): string {
  return extname(path).slice(1).toLowerCase()
}

export function fileNameOf(path: string): string {
  return basename(path)
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extensionOf(path))
}

/** 只有 Markdown 才能进编辑器；不认识的扩展名给出可直接展示的文案 */
export function assertMarkdownPath(path: string): void {
  if (isMarkdownPath(path)) return
  throw new Error('只能打开 Markdown 文件（.md / .markdown / .mdown / .mkd）。')
}

export function toDataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

/** 远程图片按 Content-Type 判定，缺失时退回扩展名 */
export function imageMediaTypeFromName(path: string): string {
  switch (extensionOf(path)) {
    case 'apng':
      return 'image/apng'
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpg':
    case 'jpeg':
    case 'jfif':
    case 'pjpeg':
    case 'pjp':
      return 'image/jpeg'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'ico':
      return 'image/x-icon'
    case 'tiff':
    case 'tif':
      return 'image/tiff'
    default:
      return 'image/png'
  }
}
