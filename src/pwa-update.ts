/**
 * registerType: 'autoUpdate' 는 workbox 를 skipWaiting+clientsClaim 으로 띄울
 * 뿐, 이미 열려 있는 탭을 다시 로드해 주지는 않는다 — 새 서비스워커가
 * 백그라운드에서 조용히 컨트롤을 넘겨받아도 그 탭은 이미 실행 중인 옛
 * 코드/에셋을 계속 쓴다. 그래서 "새로고침했는데도 그대로다" 라는 오해가
 * 생긴다: 첫 새로고침은 업데이트를 감지·설치할 뿐이고, 실제로 새 콘텐츠가
 * 뜨는 건 그다음 새로고침부터다. 컨트롤러가 바뀌는 순간 한 번 자동으로
 * 다시 로드해서 사용자가 두 번 새로고침할 필요를 없앤다.
 *
 * PWA 로 설치해 두고 탭을 안 닫은 채 오래 켜 두면 새 배포를 아예 못
 * 감지하므로, 화면이 다시 보일 때마다 업데이트 여부를 확인한다.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
