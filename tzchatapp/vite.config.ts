import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const appVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version

export default defineConfig({
    // 🔒 dev/build 동일 경로 기준
    base: '/',

    plugins: [
      vue({
        // ✅ SFC 템플릿 컴파일 단계에서 커스텀 엘리먼트로 인식
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'emoji-picker',
          },
        },
      }),
    ],

    // package.json을 출시 버전의 단일 소스로 사용한다.
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },

    // 경로 별칭: @ -> src (tsconfig.paths와 일치)
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    // API/Socket 목적지는 src/shared/config/runtimeEnvironment.ts에서 자동 판별한다.
    server: {
      host: true,
      port: 11017,
      strictPort: true,
    },

    // 🔒 빌드 산출물: 서버 nginx root와 일치
    build: {
      outDir: 'dist',
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', '@ionic/vue', 'axios'],
          },
        },
      },
      target: 'es2019',
    },

    // 🔎 레이아웃/스타일 디버깅 편의(DEV)
    css: {
      devSourcemap: true,
    },

})
