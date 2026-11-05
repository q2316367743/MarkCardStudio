import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  assertMarkdownPath,
  expandTilde,
  extensionOf,
  fileNameOf,
} from './shared'

/**
 * Markdown 文件的读取与写入。
 *
 * 选择框在窗口侧（用户在对话框里停留多久都不该触发 core 的 30s 超时），
 * 这里只接收已经确定的路径：校验扩展名、补后缀、检查父目录，然后读写。
 */

export interface MarkdownFile {
  path: string
  fileName: string
  content: string
}

export interface WrittenMarkdownFile {
  path: string
  fileName: string
  bytesWritten: number
}

export async function readMarkdownFile(path: unknown): Promise<MarkdownFile> {
  const target = expandTilde(String(path ?? '').trim())
  if (target === '') throw new Error('没有选择要打开的稿件。')
  assertMarkdownPath(target)

  const info = await stat(target).catch(() => null)
  if (!info) throw new Error('这个文件不存在，可能已被移动或删除。')
  if (!info.isFile()) throw new Error('这是一个文件夹，请选择 Markdown 文件。')

  const content = await readFile(target, 'utf8').catch(() => {
    throw new Error('无法读取这个文件，请确认它没有被其它程序占用。')
  })

  return { path: target, fileName: fileNameOf(target), content }
}

export async function writeMarkdownFile(args: {
  path: unknown
  content: unknown
}): Promise<WrittenMarkdownFile> {
  let target = expandTilde(String(args?.path ?? '').trim())
  if (target === '') throw new Error('没有选择保存位置。')

  // 保存框里只写了文件名时补上扩展名，避免生成一个没有后缀的文本文件
  if (extensionOf(target) === '') target = `${target}.md`
  assertMarkdownPath(target)

  const parent = dirname(target)
  const parentInfo = await stat(parent).catch(() => null)
  if (!parentInfo?.isDirectory()) throw new Error('保存位置不存在，请换一个文件夹。')

  const content = typeof args?.content === 'string' ? args.content : ''
  await writeFile(target, content, 'utf8').catch(() => {
    throw new Error('写入失败，请确认目标文件夹可写、磁盘还有空间。')
  })

  return {
    path: target,
    fileName: fileNameOf(target),
    bytesWritten: Buffer.byteLength(content),
  }
}
