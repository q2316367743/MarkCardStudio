import { computed, ref } from "vue";
import {
  deleteCustomFont as deleteFontFromHost,
  importCustomFont as importFontFromHost,
  isHostAvailable,
  listCustomFonts,
  pickFontFile,
  readCustomFont,
} from "../native/index.js";

const customFonts = ref([]);
const isLoadingCustomFonts = ref(false);
const customFontError = ref("");
const loadedFonts = new Map();

function upsertFont(font) {
  if (!font?.id) return;
  customFonts.value = [
    font,
    ...customFonts.value.filter((item) => item.id !== font.id),
  ];
}

function createFontEmbedCss(font, dataUrl) {
  return `@font-face {
  font-family: "${font.family}";
  src: url("${dataUrl}") format("${font.format}");
  font-style: normal;
  font-weight: 100 1000;
  font-display: swap;
}`;
}

async function refreshCustomFonts() {
  if (!isHostAvailable()) {
    customFonts.value = [];
    return [];
  }

  isLoadingCustomFonts.value = true;
  customFontError.value = "";
  try {
    const fonts = await listCustomFonts();
    customFonts.value = Array.isArray(fonts) ? fonts : [];
    return customFonts.value;
  } catch (error) {
    customFontError.value = error?.message || String(error);
    return [];
  } finally {
    isLoadingCustomFonts.value = false;
  }
}

async function importCustomFont() {
  if (!isHostAvailable()) return null;
  isLoadingCustomFonts.value = true;
  customFontError.value = "";
  try {
    const path = await pickFontFile();
    if (!path) return null;

    const font = await importFontFromHost(path);
    if (!font) return null;
    upsertFont(font);
    await ensureCustomFontLoaded(font.id);
    return font;
  } catch (error) {
    customFontError.value = error?.message || String(error);
    throw error;
  } finally {
    isLoadingCustomFonts.value = false;
  }
}

async function ensureCustomFontLoaded(fontId) {
  if (!fontId || fontId === "theme-default" || !isHostAvailable()) return null;
  if (loadedFonts.has(fontId)) return loadedFonts.get(fontId);

  const result = await readCustomFont(fontId);
  const font = result?.font;
  const dataUrl = result?.dataUrl;
  if (!font?.id || !dataUrl) {
    throw new Error("字体数据不完整，请重新导入。");
  }

  const source = `url("${dataUrl}") format("${font.format}")`;
  const face = new FontFace(font.family, source, {
    style: "normal",
    weight: "400",
  });
  await face.load();
  document.fonts.add(face);

  const loaded = {
    font,
    faces: [face],
    dataUrl,
    family: font.family,
    fingerprint: `${font.id}:${font.size}:${font.createdAt}`,
    embedCss: createFontEmbedCss(font, dataUrl),
  };
  loadedFonts.set(fontId, loaded);
  upsertFont(font);
  return loaded;
}

async function deleteCustomFont(fontId) {
  if (!fontId || fontId === "theme-default" || !isHostAvailable()) return;
  isLoadingCustomFonts.value = true;
  customFontError.value = "";
  try {
    await deleteFontFromHost(fontId);
    const loaded = loadedFonts.get(fontId);
    loaded?.faces?.forEach((face) => document.fonts.delete(face));
    loadedFonts.delete(fontId);
    customFonts.value = customFonts.value.filter((font) => font.id !== fontId);
  } catch (error) {
    customFontError.value = error?.message || String(error);
    throw error;
  } finally {
    isLoadingCustomFonts.value = false;
  }
}

export function useCustomFonts() {
  return {
    customFonts,
    isLoadingCustomFonts,
    customFontError,
    isCustomFontRuntimeAvailable: computed(() => isHostAvailable()),
    refreshCustomFonts,
    importCustomFont,
    ensureCustomFontLoaded,
    deleteCustomFont,
  };
}
