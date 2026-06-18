import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 拆 vendor：把体积最大的 element-plus 单独成块，与其余依赖分离，
        // 避免业务代码与 UI 库混在一个巨型入口 chunk 中、改善缓存命中。
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("element-plus") || id.includes("@element-plus")) {
              return "element-plus";
            }
            if (
              id.includes("/vue/") ||
              id.includes("/@vue/") ||
              id.includes("vue-router") ||
              id.includes("/pinia/")
            ) {
              return "vue-vendor";
            }
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
