import { definePluginApi } from '@dashou/core'
import type { PluginContext } from '@dashou/core'
import { readMarkdownFile, writeMarkdownFile } from './documents'
import { openExportFolder, saveExportFile } from './exports'
import { resolveLocalImage, resolveRemoteImage } from './images'
import {
  deleteCustomFont,
  importCustomFont,
  listCustomFonts,
  readCustomFont,
} from './fonts'
import { isMarkdownPath } from './shared'

/**
 * MarkCard Studio 的 core。
 *
 * 窗口负责编辑、排版、Canvas 渲染与系统选择框；
 * 凡是碰文件系统、远程下载的活儿都在这里（core 的 Node 不受能力网关限制）。
 * 窗口与 core 的通道只有两种：`api`（请求/响应）与 `ctx.event`（core → 窗口通知）。
 */

/** 「用 MarkCard 打开这些稿件」排队给窗口；窗口就绪后主动来取，避免事件抢跑丢失 */
let pendingDocument: { path: string; fileName: string; content: string } | null = null

async function queueDocument(ctx: PluginContext, path: string): Promise<void> {
  const document = await readMarkdownFile(path)
  pendingDocument = document
  ctx.event.emit('document:pending', { path: document.path, fileName: document.fileName })
}

const plugin = definePluginApi({
  async onReady(ctx) {
    ctx.log('MarkCard Studio 已启动', 'info')
  },

  async onCommand(ctx, { commandId, attachment }) {
    if (commandId !== 'open-files') return
    if (attachment?.kind !== 'files') return

    const source = attachment.files.find(
      (file) => file.isFile && isMarkdownPath(file.path),
    )
    if (!source) return

    try {
      await queueDocument(ctx, source.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.log(`打开外部稿件失败：${message}`, 'warn')
    }
  },

  api: {
    readMarkdownFile: async (_ctx, args: { path: string }) => readMarkdownFile(args?.path),

    writeMarkdownFile: async (
      _ctx,
      args: { path: string; content: string },
    ) => writeMarkdownFile(args),

    /** 取走待打开的稿件（取走即清空） */
    takePendingDocument: async () => {
      const document = pendingDocument
      pendingDocument = null
      return document
    },

    saveExportFile: async (
      ctx,
      args: { folderPath: string; subfolderName: string; fileName: string; base64Data: string },
    ): Promise<string> => saveExportFile(ctx, args),

    openExportFolder: async (ctx, args: { path: string }): Promise<void> =>
      openExportFolder(ctx, String(args?.path ?? '')),

    resolveLocalImage: async (_ctx, args: { path: string; basePath?: string | null }) =>
      resolveLocalImage(args),

    resolveRemoteImage: async (_ctx, args: { url: string }) => resolveRemoteImage(args),

    listCustomFonts: async (ctx) => listCustomFonts(ctx),

    importCustomFont: async (ctx, args: { path: string }) => importCustomFont(ctx, args),

    readCustomFont: async (ctx, args: { fontId: string }) => readCustomFont(ctx, args),

    deleteCustomFont: async (ctx, args: { fontId: string }): Promise<void> =>
      deleteCustomFont(ctx, args),
  },
})

export default plugin
export type Api = typeof plugin.api
