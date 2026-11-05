<script setup>
import { useI18n } from "vue-i18n";
import { APP_INFO } from "../config/appInfo.js";
import { assetUrl } from "../utils/asset.js";
import AppIcon from "./AppIcon.vue";

defineEmits(["open-settings"]);
const { t } = useI18n();
</script>

<template>
  <header
    class="flex min-h-[64px] shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/90 px-6 py-3.5 backdrop-blur-[18px] dark:border-slate-800/80 dark:bg-slate-950/90 dark:text-slate-100">
    <div class="inline-flex items-center gap-3">
      <span class="brand-logo shrink-0">
        <img :src="assetUrl('logo.png')" alt="MarkCard Studio" width="28" height="28" />
      </span>
      <div class="flex flex-col leading-tight">
        <strong class="text-[16px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          MarkCard Studio
        </strong>
        <span class="text-[10px] font-medium font-mono text-slate-400 dark:text-slate-500">
          v{{ APP_INFO.version }}
        </span>
      </div>
    </div>

    <div class="inline-flex items-center gap-2.5">
      <button
        type="button"
        class="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-98 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
        :aria-label="t('toolbar.settings')"
        :title="t('toolbar.settings')"
        @click="$emit('open-settings')"
      >
        <AppIcon name="settings" :size="15" class="text-slate-500 dark:text-slate-400" />
        <span>{{ t("toolbar.settings") }}</span>
      </button>
    </div>
  </header>
</template>
