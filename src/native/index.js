import { hasInternals, listen, useApi } from "@dashou/api";
import { open as openDialog, save as saveDialog } from "@dashou/api/dialog";
import { openUrl } from "@dashou/api/opener";

/**
 * 宿主能力出口：窗口里所有碰系统选择框 / 打开链接 / 插件 API 的调用都从这里走。
 *
 * 选择框放在窗口侧，是因为 core 与宿主之间的单次请求有 30 秒上限，
 * 而用户在对话框里停留多久都不该让一次打开 / 保存失败。
 * 选中后的真实读写仍在 core（src-dashou）；core 的 Node 不受能力网关限制。
 */

const api = useApi();

const MARKDOWN_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
];

export function isHostAvailable() {
  return hasInternals();
}

/** 系统选择框；取消返回 null */
export async function pickMarkdownFile() {
  const paths = await openDialog({
    title: "打开 Markdown 稿件",
    filters: MARKDOWN_FILTERS,
    multiple: false,
  });
  return paths[0] ?? null;
}

/** 保存位置；取消返回 null。文件名由这里给默认值，用户只改目录即可 */
export async function pickSavePath(defaultPath) {
  const target = await saveDialog({
    title: "保存 Markdown 稿件",
    defaultPath: defaultPath || `MarkCard-${timestamp()}.md`,
    filters: MARKDOWN_FILTERS,
  });
  return target ?? null;
}

export async function pickFontFile() {
  const paths = await openDialog({
    title: "导入字体",
    filters: [{ name: "字体", extensions: ["woff2", "woff", "ttf", "otf"] }],
    multiple: false,
  });
  return paths[0] ?? null;
}

export function readMarkdownFile(path) {
  return api.readMarkdownFile({ path });
}

export function writeMarkdownFile({ path, content }) {
  return api.writeMarkdownFile({ path, content });
}

export function takePendingDocument() {
  return api.takePendingDocument();
}

/** 订阅「从搜索条送来一份稿件」的通知，返回取消函数 */
export async function onPendingDocument(handler) {
  if (!isHostAvailable()) return () => {};
  return listen("document:pending", () => {
    handler();
  });
}

/** 选择导出目录；取消返回 null */
export async function pickExportFolder(defaultPath) {
  const paths = await openDialog({
    title: "选择导出位置",
    directory: true,
    multiple: false,
    defaultPath: defaultPath || undefined,
  });
  return paths[0] ?? null;
}

export function saveExportFile({ folderPath, subfolderName, fileName, base64Data }) {
  return api.saveExportFile({ folderPath, subfolderName, fileName, base64Data });
}

export function openExportFolder(path) {
  return api.openExportFolder({ path: path || "" });
}

export function resolveLocalImage({ path, basePath }) {
  return api.resolveLocalImage({ path, basePath: basePath || null });
}

export function resolveRemoteImage(url) {
  return api.resolveRemoteImage({ url });
}

export function listCustomFonts() {
  return api.listCustomFonts();
}

export function importCustomFont(path) {
  return api.importCustomFont({ path });
}

export function readCustomFont(fontId) {
  return api.readCustomFont({ fontId });
}

export function deleteCustomFont(fontId) {
  return api.deleteCustomFont({ fontId });
}

/** 用系统浏览器打开链接；非 http(s)（如 mailto）交给页面默认行为 */
export async function openExternal(url) {
  const target = String(url ?? "");
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    await openUrl(target);
    return true;
  } catch {
    return false;
  }
}

function timestamp() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}`;
}
