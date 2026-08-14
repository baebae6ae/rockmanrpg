import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 두 가지 빌드 타깃 (docs/DESIGN.md §10)
//   기본        — GitHub Pages 용 정적 번들
//   artifact    — 전 에셋을 인라인한 단일 HTML (Artifact 는 외부 요청이 차단됨)
export default defineConfig(({ mode }) => {
  const isArtifact = mode === 'artifact';

  return {
    // 프로젝트 페이지는 하위 경로로 게시된다. Artifact 는 단일 파일이라 상대 경로.
    base: isArtifact ? './' : '/rockmanrpg/',

    plugins: isArtifact ? [viteSingleFile()] : [],

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
