import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PluginContext } from '@dashou/core'
import { expandTilde } from './shared'

/**
 * 导出落盘：窗口负责像素（Canvas 只能在页面里跑），
 * 建子目录、写文件、在文件夹中显示都在 core。目录由窗口的选择框给出。
 */

/**
 * 把窗口传来的 base64 数据写进「导出根目录/文档名/文件」。
 * 文件名与子目录名只允许单段，避免拼出 root 之外的路径。
 */
export async function saveExportFile(
  _ctx: PluginContext,
  args: {
    folderPath: string
    subfolderName: string
    fileName: string
    base64Data: string
  },
): Promise<string> {
  const rawRoot = typeof args?.folderPath === 'string' ? args.folderPath.trim() : ''
  if (rawRoot === '') throw new Error('请先选择一个导出文件夹。')

  const rootDir = expandTilde(rawRoot)
  await mkdir(rootDir, { recursive: true })

  const subfolder = sanitizeSegment(args?.subfolderName)
  if (subfolder === '') throw new Error('导出文件夹名不合法，请换一个文档名。')

  const fileName = sanitizeSegment(args?.fileName)
  if (fileName === '') throw new Error('导出文件名不合法。')

  const targetDir = join(rootDir, subfolder)
  await mkdir(targetDir, { recursive: true })

  const base64 = typeof args?.base64Data === 'string' ? args.base64Data : ''
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) throw new Error('导出的图片数据为空，请重试。')

  const targetFile = join(targetDir, fileName)
  try {
    await writeFile(targetFile, bytes)
  } catch {
    throw new Error('写入失败，请确认导出文件夹可写、磁盘还有空间。')
  }
  return targetFile
}

/** 在系统文件管理器里打开导出目录（传文件时打开它所在目录） */
export async function openExportFolder(_ctx: PluginContext, path: string): Promise<void> {
  const raw = typeof path === 'string' ? path.trim() : ''
  if (raw === '') throw new Error('还没有可打开的导出文件夹。')

  const target = expandTilde(raw)
  let directory = target
  try {
    const info = await stat(target)
    if (info.isFile()) directory = dirname(target)
  } catch {
    throw new Error('这个文件夹还不存在，请先导出一次。')
  }

  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  spawn(command, [directory], { detached: true, stdio: 'ignore' }).unref()
}

/** 只保留单段名字：去掉分隔符、控制字符与首尾的点 */
function sanitizeSegment(value: unknown): string {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim()
    .slice(0, 120)
}
