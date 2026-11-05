import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

/**
 * base 必须是 './'：插件窗口用 plugin://<id>/ui/index.html 加载，
 * 以 / 开头的资源路径会指到包根，dashou-plugin build 会直接报错拦下。
 * 端口与 src-dashou/plugin.json 的 build.devUrl 对应（5177 避开工作区其它插件）。
 */
export default defineConfig({
  base: "./",
  plugins: [vue(), tailwindcss()],
  build: {
    // mermaid / echarts 体积较大，拆开可以让首屏先跑起来
    chunkSizeWarningLimit: 2600,
  },
  server: {
    port: 5177,
    strictPort: true,
    watch: { ignored: ["**/src-dashou/**"] },
  },
});
