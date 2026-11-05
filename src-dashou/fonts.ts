import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PluginContext } from '@dashou/core'
import { fileNameOf, toDataUrl } from './shared'

/**
 * 自定义字体库：导入时把字体文件复制到插件私有数据目录，
 * 旁边存一份同 id 的 json 元数据；窗口只拿到 data URL 与字族名。
 */

export interface CustomFont {
  id: string
  displayName: string
  family: string
  fileName: string
  /** CSS `@font-face` 的 format 值：woff2 / woff / opentype / truetype */
  format: string
  mediaType: string
  size: number
  createdAt: number
}

export interface CustomFontData {
  font: CustomFont
  dataUrl: string
}

const MAX_FONT_BYTES = 20 * 1024 * 1024
const FONT_DIR_NAME = 'custom-fonts'

interface FontFormat {
  extension: string
  cssFormat: string
  mediaType: string
}

function fontsDir(ctx: PluginContext): string {
  return join(ctx.paths.data, FONT_DIR_NAME)
}

/** 按文件头判定格式，不信扩展名 */
function detectFontFormat(bytes: Uint8Array): FontFormat | null {
  const [a, b, c, d] = Array.from(bytes.slice(0, 4))
  if (a === 0x77 && b === 0x4f && c === 0x46 && d === 0x32) {
    return { extension: 'woff2', cssFormat: 'woff2', mediaType: 'font/woff2' }
  }
  if (a === 0x77 && b === 0x4f && c === 0x46 && d === 0x46) {
    return { extension: 'woff', cssFormat: 'woff', mediaType: 'font/woff' }
  }
  if (a === 0x4f && b === 0x54 && c === 0x54 && d === 0x4f) {
    return { extension: 'otf', cssFormat: 'opentype', mediaType: 'font/otf' }
  }
  // TrueType：0x00010000 或 'true'
  if ((a === 0x00 && b === 0x01 && c === 0x00 && d === 0x00) || (a === 0x74 && b === 0x72 && c === 0x75 && d === 0x65)) {
    return { extension: 'ttf', cssFormat: 'truetype', mediaType: 'font/ttf' }
  }
  return null
}

function extensionOfFormat(format: string): string {
  if (format === 'woff2') return 'woff2'
  if (format === 'woff') return 'woff'
  if (format === 'opentype') return 'otf'
  return 'ttf'
}

function isValidFontId(id: string): boolean {
  return id.length > 0 && id.length <= 80 && /^[A-Za-z0-9_-]+$/.test(id)
}

function assertFontId(id: string): void {
  if (!isValidFontId(id)) throw new Error('字体标识不合法。')
}

function storedFontPath(dir: string, font: CustomFont): string {
  return join(dir, `${font.id}.${extensionOfFormat(font.format)}`)
}

function metadataPath(dir: string, id: string): string {
  return join(dir, `${id}.json`)
}

async function readMetadata(dir: string, id: string): Promise<CustomFont> {
  let raw: string
  try {
    raw = await readFile(metadataPath(dir, id), 'utf8')
  } catch {
    throw new Error('找不到这个字体，可能已被删除。')
  }
  let font: CustomFont
  try {
    font = JSON.parse(raw) as CustomFont
  } catch {
    throw new Error('字体信息已损坏，请重新导入。')
  }
  if (font.id !== id) throw new Error('字体信息与文件不匹配。')
  return font
}

async function listMetadata(dir: string): Promise<CustomFont[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const fonts: CustomFont[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const raw = await readFile(join(dir, entry.name), 'utf8').catch(() => null)
    if (raw === null) continue
    let font: CustomFont
    try {
      font = JSON.parse(raw) as CustomFont
    } catch {
      continue
    }
    if (!isValidFontId(font.id)) continue
    const present = await stat(storedFontPath(dir, font)).catch(() => null)
    if (!present?.isFile()) continue
    fonts.push(font)
  }
  return fonts.sort((left, right) => right.createdAt - left.createdAt)
}

export async function listCustomFonts(ctx: PluginContext): Promise<CustomFont[]> {
  return listMetadata(fontsDir(ctx))
}

export async function importCustomFont(
  ctx: PluginContext,
  args: { path: unknown },
): Promise<CustomFont> {
  const source = String(args?.path ?? '').trim()
  if (source === '') throw new Error('没有选择字体文件。')

  const info = await stat(source).catch(() => null)
  if (!info?.isFile()) throw new Error('选择的字体文件不可用。')
  if (info.size === 0 || info.size > MAX_FONT_BYTES) {
    throw new Error('字体文件需要大于 0 字节且不超过 20 MB。')
  }

  const bytes = await readFile(source).catch(() => {
    throw new Error('无法读取这个字体文件。')
  })
  const format = detectFontFormat(bytes)
  if (!format) throw new Error('这个字体文件无法识别，请换用 woff2 / woff / ttf / otf。')

  const dir = fontsDir(ctx)
  await mkdir(dir, { recursive: true })

  // 同一个字体重复导入时直接复用已有条目，避免堆积同名副本
  for (const existing of await listMetadata(dir)) {
    if (existing.size !== bytes.length) continue
    const stored = await readFile(storedFontPath(dir, existing)).catch(() => null)
    if (stored && Buffer.compare(stored, bytes) === 0) return existing
  }

  const createdAt = Date.now()
  const id = await nextFontId(dir, createdAt)
  const font: CustomFont = {
    id,
    displayName: fileNameOf(source).replace(/\.[^.]+$/, '').trim() || '自定义字体',
    family: `MarkCardUser_${id}`,
    fileName: fileNameOf(source),
    format: format.cssFormat,
    mediaType: format.mediaType,
    size: bytes.length,
    createdAt,
  }

  const fontFile = storedFontPath(dir, font)
  try {
    await writeFile(fontFile, bytes)
    await writeFile(metadataPath(dir, id), JSON.stringify(font, null, 2), 'utf8')
  } catch {
    await rm(fontFile, { force: true }).catch(() => undefined)
    throw new Error('保存字体失败，请确认插件数据目录可写。')
  }

  return font
}

export async function readCustomFont(
  ctx: PluginContext,
  args: { fontId: string },
): Promise<CustomFontData> {
  const id = typeof args?.fontId === 'string' ? args.fontId : ''
  assertFontId(id)

  const dir = fontsDir(ctx)
  const font = await readMetadata(dir, id)
  const path = storedFontPath(dir, font)

  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error('字体文件已丢失，请重新导入。')
  if (info.size === 0 || info.size > MAX_FONT_BYTES) throw new Error('字体文件已损坏，请重新导入。')

  const bytes = await readFile(path).catch(() => {
    throw new Error('无法读取这个字体文件。')
  })
  if (!detectFontFormat(bytes)) throw new Error('字体文件已损坏，请重新导入。')

  return { font, dataUrl: toDataUrl(font.mediaType, bytes) }
}

export async function deleteCustomFont(
  ctx: PluginContext,
  args: { fontId: string },
): Promise<void> {
  const id = typeof args?.fontId === 'string' ? args.fontId : ''
  assertFontId(id)

  const dir = fontsDir(ctx)
  const font = await readMetadata(dir, id)
  await rm(storedFontPath(dir, font), { force: true })
  await rm(metadataPath(dir, id), { force: true })
}

async function nextFontId(dir: string, createdAt: number): Promise<string> {
  const base = `font_${createdAt.toString(16)}`
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const id = suffix === 0 ? base : `${base}_${suffix}`
    const taken = await stat(metadataPath(dir, id)).catch(() => null)
    if (!taken) return id
  }
  return `${base}_${process.pid}`
}
