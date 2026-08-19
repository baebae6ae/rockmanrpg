# 원본 리핑 시트 보관함

여기는 임포트 전 원본 스프라이트 시트를 잠깐 두는 곳이다 (`.gitignore`에는
있지만, 이 폴더는 GitHub 웹/앱에서 파일을 직접 올리기 위해 존재한다 —
로컬 git 작업에서만 무시될 뿐 GitHub 업로드 자체는 막지 않는다).

## 쓰는 법 (PC 없이, 폰/브라우저로)

1. GitHub 저장소 페이지에서 이 폴더(`assets/raw/`)로 들어간다
2. **Add file → Upload files**
3. spriters-resource 등에서 받은 시트를 올리고 커밋

올린 뒤 `tools/detect_frames.py`로 프레임을 자동 검출·정규화해서
`assets/sprites/`로 옮기면 임시 도트를 실제 스프라이트로 교체하는
작업이 끝난다 (`docs/DESIGN.md` §5, §9 1.5차 참고).
