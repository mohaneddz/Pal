import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const rawEnv = loadEnv(mode, "src", "");

  return {
    envDir: "src",
    plugins: [react()],
    define: {
      __LOCAL_LLM__: JSON.stringify(rawEnv.LOCAL_LLM ?? rawEnv.VITE_LOCAL_LLM ?? "false"),
      __TTS_LOCAL__: JSON.stringify(rawEnv.TTS_LOCAL ?? rawEnv.VITE_TTS_LOCAL ?? "false"),
      __STT_LOCAL__: JSON.stringify(rawEnv.STT_LOCAL ?? rawEnv.VITE_STT_LOCAL ?? "false"),
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**", "**/backend/**"],
      },
    },
  };
});
