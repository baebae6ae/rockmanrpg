import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// 두 가지 빌드 타깃 (docs/DESIGN.md §10)
//   기본        — GitHub Pages 용 정적 번들
//   artifact    — 전 에셋을 인라인한 단일 HTML (Artifact 는 외부 요청이 차단됨)
export default defineConfig(({ mode }) => {
  const isArtifact = mode === 'artifact';

  return {
    // 프로젝트 페이지는 하위 경로로 게시된다. Artifact 는 단일 파일이라 상대 경로.
    base: isArtifact ? './' : '/rockmanrpg/',

    plugins: isArtifact
      ? [viteSingleFile()]
      : [
          // 오프라인 지원 — 한 번 접속해서 캐시된 뒤에는 인터넷 없이도 열린다.
          // Artifact 빌드는 서비스 워커를 등록할 수 없는 샌드박스라 여기서만 켠다.
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-192.png', 'icon-512.png'],
            manifest: {
              name: '록맨 RPG',
              short_name: '록맨 RPG',
              description: '메이플식 사냥터를 도는 록맨 액션 RPG — 몰이사냥 생존 모드 포함',
              // 아이콘을 누르면 가장 최근에 만든 몰이사냥 모드로 바로 들어간다
              start_url: '/rockmanrpg/?horde',
              scope: '/rockmanrpg/',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#0a0a12',
              theme_color: '#0a0a12',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // 빌드된 파일 전부(코드·데이터·스프라이트) 를 미리 캐시한다.
              // 용량 상한을 넉넉히 잡는다 — 스프라이트 시트가 꽤 크다.
              globPatterns: ['**/*.{js,css,html,png,json,svg,ico,webmanifest}'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              // index.html 하나로 여러 경로(본편/『?mook』/『?horde』)를 다 띄우므로
              // 오프라인 상태에서 어떤 경로로 들어와도 캐시된 index.html 로 받는다.
              navigateFallback: '/rockmanrpg/index.html',
            },
          }),
        ],

    build: {
      outDir: isArtifact ? 'dist-artifact' : 'dist',
      // Artifact 빌드는 스프라이트를 전부 data URI 로 인라인해야 한다.
      assetsInlineLimit: isArtifact ? 32 * 1024 * 1024 : 4096,
      target: 'es2022',
    },

    server: {
      host: true,
    },
  };
});
