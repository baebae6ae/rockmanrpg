# 록맨 RPG — 설계 문서

> 상태: **초안 (v0.1)** — 논의를 거쳐 계속 갱신됨. 확정된 결정과 미결 사항을 구분해 표기한다.

---

## 1. 프로젝트 개요

전 록맨 시리즈를 아우르는 **크로스오버 육성 액션 RPG**.
메이플스토리식 횡스크롤 사냥·성장 구조 위에, 록맨 시리즈의 캐릭터·특수무기·약점 상성 시스템을 얹는다.

### 1.1 확정 사항

| 항목 | 결정 |
|---|---|
| 장르 | 횡스크롤 액션 육성 RPG (메이플스토리형) |
| 멀티플레이 | **없음.** 싱글플레이 전용 (구조는 열어두되 구현하지 않음) |
| 기준 화풍 | 록맨 X4 (PS1, 1997) — 내부 해상도 320×240 |
| 화풍 정책 | **전 시리즈 혼용.** NES·SNES·GBA·PS1 도트를 그대로 섞는다 (크로스오버 컨셉의 시각적 표현) |
| 플레이어블 | 원작에 플레이어블 스프라이트가 존재하는 주역 **7명 + 액셀** |
| 적 | 이레귤러·로봇마스터 200여 명 + 잡몹 전체. 원작 스프라이트 그대로 활용 |
| 엔진 | Godot 4 + GDScript |
| 에셋 관리 | 스프라이트는 저장소 **밖**에 둔다 (`.gitignore`). 코드·데이터·규격만 버전 관리 |

### 1.2 설계 원칙

1. **콘텐츠는 코드가 아니라 데이터다.** 캐릭터·스킬·적·보스 패턴 추가에 코드 수정이 필요하면 설계가 틀린 것이다.
2. **코드는 에셋 경로만 안다.** 스프라이트 교체가 경로 변경만으로 끝나야 한다.
3. **1일차부터 진짜 스프라이트를 쓴다.** 플레이스홀더로 개발하면 리핑 시트의 불규칙성(가변 프레임 크기, 프레임별 피벗)을 늦게 발견하게 된다.
4. **물량은 티어로 나눈다.** 전부를 같은 품질로 만들려 하면 아무것도 완성되지 않는다.

---

## 2. 렌더링 규격

| 항목 | 값 |
|---|---|
| 내부 렌더 해상도 | 320×240 |
| 화면 출력 | 정수배 스케일링만 (×2 = 640×480, ×3 = 960×720, ×4 = 1280×960) |
| 스프라이트 스케일 | **정수배만 허용.** 비정수 스케일 금지 (픽셀 뭉개짐) |
| 캐릭터 크기 | 원본 그대로. X4 캐릭터 ≈ 40px, NES 캐릭터 ≈ 24px — 차이를 그대로 둔다 |
| 히트박스 | **스프라이트 크기와 분리.** 데이터로 별도 정의해 밸런스를 맞춘다 |

### 2.1 혼용 화풍 대응

크기·색수·프레임 수가 캐릭터마다 다르므로, 엔진은 다음을 **가정하지 않는다**:

- 균일한 프레임 격자 (프레임마다 크기가 다름)
- 고정 프레임 수 (NES 달리기 3프레임 vs X4 달리기 11프레임+)
- 고정 팔레트 깊이
- 스프라이트 크기와 히트박스의 일치

---

## 3. 기술 스택

**Godot 4 + GDScript**

선정 근거:

- 맵이 수십~수백 개 필요한 장르 → 내장 씬/타일맵/충돌 에디터가 필수. 웹 스택은 맵 에디터를 자작해야 한다.
- 2D 픽셀 아트 1급 지원 (내부 해상도 고정 + 정수배 스케일링이 프로젝트 설정으로 해결)
- 팔레트 스왑을 2D 셰이더로 간단히 처리
- `Resource` 시스템으로 캐릭터·스킬·적 정의를 에디터 인스펙터에서 직접 편집 가능
- 무료·오픈소스, 데스크톱/웹 동시 빌드
- 성능 병목 발생 시 해당 부분만 C#/GDExtension으로 이전 가능

보조 도구:

- **Aseprite** — 스프라이트 시트 편집, 애니메이션 태그 관리, 프레임 데이터 JSON 내보내기
- 자체 임포터 스크립트 — Aseprite JSON → Godot 애니메이션 리소스

---

## 4. 폴더 구조

```
rockmanrpg/
├── project.godot
├── .gitignore                 # assets/sprites/ 제외
├── docs/
│   └── DESIGN.md              # 이 문서
├── src/                       # 코드
│   ├── core/                  # 게임 루프, 씬 전환, 세이브/로드
│   ├── anim/                  # 스프라이트 시트 로더, 프레임 피벗 처리
│   ├── actor/                 # 플레이어·적 공통 액터 기반 클래스
│   ├── player/                # 조작, 이동 능력, 스킬 발동
│   ├── enemy/                 # 적 액터, 스폰
│   ├── pattern/               # 보스 패턴 인터프리터
│   ├── combat/                # 데미지 계산, 속성 상성, 투사체
│   ├── progression/           # 레벨, 경험치, 스킬 습득, 장비
│   ├── world/                 # 맵, 포탈, 스폰 테이블
│   └── ui/                    # HUD, 인벤토리, 스킬창, 도감
├── data/                      # 게임 데이터 (버전 관리 O)
│   ├── characters/            # 플레이어블 캐릭터 정의
│   ├── skills/                # 스킬·특수무기 정의
│   ├── enemies/               # 잡몹·보스 정의
│   ├── patterns/              # 보스 행동 패턴
│   ├── items/                 # 장비, 소모품, 배틀칩
│   ├── elements.json          # 속성·약점 상성표
│   └── maps/                  # 맵 메타데이터, 스폰 테이블
├── assets/                    # 에셋 (버전 관리 X — .gitignore)
│   └── sprites/
│       ├── characters/
│       ├── enemies/
│       ├── projectiles/
│       └── effects/
└── tools/                     # 임포터, 데이터 검증 스크립트
```

---

## 5. 스프라이트 시트 규격

> **에셋 수집 시 이 절을 기준으로 삼는다.**

### 5.1 파일 배치 규칙

```
assets/sprites/characters/<character_id>/
    <character_id>.png        # 스프라이트 시트
    <character_id>.json       # Aseprite 내보내기 (프레임 크기 + 피벗 + 태그)

assets/sprites/enemies/<enemy_id>/
    <enemy_id>.png
    <enemy_id>.json
```

`character_id` / `enemy_id`는 소문자 스네이크케이스 (`x`, `zero`, `rockman`, `blues`, `forte`, `vent`, `sting_chameleon`).

### 5.2 프레임 데이터

각 프레임은 다음을 가진다:

- `x, y, w, h` — 시트 내 위치와 크기 (**프레임마다 다를 수 있음**)
- `pivot_x, pivot_y` — 정렬 기준점. **발바닥 중앙**을 기준으로 한다
- `duration` — 표시 시간 (ms)

> 피벗이 이 파이프라인의 핵심이다. 대시 프레임은 넓고 점프 프레임은 높으므로, 피벗 없이는 캐릭터가 애니메이션마다 위아래로 튄다.

### 5.3 플레이어블 캐릭터 — 애니메이션 태그

**필수 (없으면 캐릭터가 동작하지 않음)**

| 태그 | 설명 |
|---|---|
| `idle` | 대기 |
| `run` | 이동 |
| `jump_rise` | 상승 |
| `jump_fall` | 하강 |
| `hurt` | 피격 |
| `death` | 폭발·소멸 |
| `attack_main` | 기본 공격 (버스터 사격 / 세이버 1타) |

**선택 (캐릭터별 능력에 따라)**

| 태그 | 해당 캐릭터 |
|---|---|
| `jump_land` | 전체 (착지 동작) |
| `dash`, `dash_start`, `dash_end` | X 시리즈 |
| `wall_slide`, `wall_kick` | X 시리즈, 제로 시리즈 |
| `ladder_idle`, `ladder_climb` | 클래식, X 시리즈 |
| `attack_run` | 이동 중 사격 (X 시리즈) |
| `attack_air` | 공중 공격 |
| `charge_loop`, `charge_release` | 차지 버스터 보유 캐릭터 |
| `attack_melee_1/2/3` | 제로 (세이버 3단 콤보) |
| `spawn` | 워프 착지 연출 |
| `victory` | 스테이지 클리어 |

### 5.4 적·보스 — 애니메이션 태그

**잡몹 (필수 4종)**

`idle` / `move` / `hurt` / `death`

**보스 (추가)**

| 태그 | 설명 |
|---|---|
| `intro` | 등장 연출 |
| `telegraph` | 공격 예비동작 (패턴 가독성의 핵심) |
| `attack_1` ~ `attack_n` | 공격 모션 |
| `special` | 필살기 / 저체력 패턴 |
| `stun` | 그로기 (선택) |

> 보스는 이동 애니메이션이 필수가 아니다. 원작 보스 스프라이트를 거의 그대로 쓸 수 있는 이유.

---

## 6. 데이터 스키마

### 6.1 플레이어블 캐릭터

```jsonc
{
  "id": "x",
  "name": "엑스",
  "series": "x",                    // classic | x | zero | zx
  "sprite_scale": 1,                // 정수만
  "archetype": "buster",            // buster | saber | hybrid | ranged

  "hitbox": { "w": 16, "h": 32, "offset_x": 0, "offset_y": -16 },
  // 스프라이트 크기와 무관하게 캐릭터 간 균형을 맞춘 값

  "base_stats": { "hp": 100, "attack": 10, "defense": 5, "speed": 100, "jump": 220 },
  "growth":     { "hp": 8, "attack": 1.5, "defense": 0.8 },   // 레벨당 증가

  "movement": {
    "can_dash": true,
    "can_air_dash": true,
    "can_wall_kick": true,
    "can_double_jump": false,
    "can_climb_ladder": true,
    "can_slide": false
  },

  "equipment_slots": ["head", "body", "arm", "foot"],   // X 시리즈 아머 파츠
  "starting_skills": ["x_buster"],
  "skill_tree": "x_tree"
}
```

`movement` 플래그가 캐릭터 개성의 핵심이다. 클래식 록맨은 대시·벽차기가 없고 슬라이딩이 있으며, 엑스는 반대다. 이걸 코드 분기가 아니라 데이터로 두면 캐릭터 추가가 데이터 작업이 된다.

### 6.2 스킬 / 특수무기

```jsonc
{
  "id": "storm_tornado",
  "name": "스톰 토네이도",
  "element": "wind",
  "cost": 12,                       // 무기 에너지
  "cooldown": 0.8,
  "animation_tag": "attack_main",

  "unlock": { "source": "boss", "boss_id": "storm_eagleed" },
  // 록맨 원작 루프: 보스 격파 → 무기 획득

  "effects": [
    { "type": "projectile", "sprite": "tornado", "speed": 180,
      "pierce": true, "lifetime": 1.2 },
    { "type": "damage", "power": 1.4, "scaling": "attack" },
    { "type": "knockback", "force": 60 }
  ]
}
```

**효과 프리미티브**를 조합해 스킬을 만든다. 새 스킬이 새 코드를 요구하지 않도록 프리미티브 세트를 먼저 잘 설계하는 것이 중요하다.

주요 프리미티브: `projectile`, `melee_hitbox`, `damage`, `heal`, `status`(빙결/감전/화상/독), `buff`, `knockback`, `dash_move`, `summon`, `area`, `pierce`, `multi_hit`, `charge_variant`

### 6.3 적 / 보스

```jsonc
{
  "id": "sting_chameleon",
  "name": "스팅 카멜리온",
  "series": "x",
  "tier": "boss",                   // mob | miniboss | boss | signature
  "sprite_scale": 1,

  "hitbox": { "w": 28, "h": 36 },
  "stats": { "hp": 800, "attack": 25, "defense": 12, "exp": 400 },

  "element": "wood",
  "weakness": [{ "element": "electric", "multiplier": 2.0 }],

  "pattern": "boss_charger_a",      // 템플릿 참조 또는 인라인 정의
  "pattern_params": {
    "projectile": "sting_shot",
    "charge_speed": 200,
    "phase2_hp_ratio": 0.5
  },

  "drops": [
    { "item": "storm_tornado", "chance": 1.0 },
    { "item": "energy_tank", "chance": 0.1 }
  ]
}
```

### 6.4 속성 상성

```jsonc
{
  "elements": ["neutral", "fire", "ice", "electric", "water",
               "wind", "wood", "ground", "poison", "cutter"],
  "default_multiplier": 1.0,
  "chart": {
    "fire":     { "wood": 2.0, "ice": 2.0, "water": 0.5 },
    "electric": { "water": 2.0, "wood": 2.0, "ground": 0.5 },
    "ice":      { "wind": 2.0, "fire": 0.5 }
    // ...
  }
}
```

록맨의 약점 시스템은 원래 데이터 표다. 이걸 전투의 중심축으로 삼으면 원작 감각이 자연스럽게 살아난다.

---

## 7. 보스 패턴 시스템

200여 보스의 행동을 코드로 짜면 유지가 불가능하다. **패턴을 데이터로 기술**한다.

### 7.1 행동 프리미티브

**이동**

| 프리미티브 | 파라미터 |
|---|---|
| `move_to` | 목표 위치, 속도 |
| `charge` | 방향, 속도, 거리 |
| `jump` | 높이, 거리 |
| `hop` | 반복 횟수, 높이 |
| `teleport` | 목표 위치, 페이드 시간 |
| `wall_bounce` | 속도, 반사 횟수 |
| `chase` | 지속 시간, 속도 |
| `hover` | 고도, 진폭 |

**공격**

| 프리미티브 | 파라미터 |
|---|---|
| `shoot` | 투사체 ID, 개수, 확산각, 간격 |
| `shoot_aimed` | 투사체 ID, 플레이어 조준 |
| `melee` | 히트박스, 지속 시간, 위력 |
| `laser` | 방향, 폭, 지속 시간, 예열 시간 |
| `area_attack` | 반경, 지연, 위력 |
| `summon` | 잡몹 ID, 수량, 위치 |
| `drop_object` | 오브젝트 ID, 개수 |

**제어**

| 프리미티브 | 파라미터 |
|---|---|
| `telegraph` | 애니메이션 태그, 지속 시간 |
| `wait` | 시간 |
| `face_player` | — |
| `loop` | 하위 시퀀스, 반복 횟수 |
| `random` | 하위 시퀀스 목록, 가중치 |
| `if_hp_below` | 비율, 분기 시퀀스 |
| `invulnerable` | on/off |

### 7.2 패턴 기술 예시

```jsonc
{
  "id": "boss_charger_a",
  "sequence": [
    { "op": "face_player" },
    { "op": "telegraph", "anim": "telegraph", "duration": 0.5 },
    { "op": "charge", "speed": "$charge_speed", "distance": 200 },
    { "op": "wait", "duration": 0.4 },
    { "op": "shoot_aimed", "projectile": "$projectile", "count": 3, "spread": 15 },
    { "op": "if_hp_below", "ratio": "$phase2_hp_ratio", "then": [
        { "op": "invulnerable", "value": true },
        { "op": "teleport", "target": "ceiling_center" },
        { "op": "area_attack", "radius": 80, "delay": 0.6 },
        { "op": "invulnerable", "value": false }
      ]
    },
    { "op": "loop", "count": -1 }
  ]
}
```

`$파라미터`는 적 정의의 `pattern_params`에서 주입된다. 같은 템플릿으로 수십 마리의 서로 다른 보스를 만들 수 있다.

### 7.3 보스 티어링

| 티어 | 규모 | 작업 방식 | 캐릭터당 비용 |
|---|---|---|---|
| **시그니처** | 20~30 | 전용 패턴 손수 설계 | 수 시간 |
| **일반 보스** | ~170 | 템플릿 8~10종 + 파라미터 교체 | 30분~1시간 |
| **잡몹** | 수백 | 템플릿 3~4종 + 스탯 표 | 수 분 |

이 구조에서 200명은 **아트 노동이 아니라 데이터 입력 작업**이 된다. 도트 실력이 필요 없고, 중단해도 손해가 없으며, 언제든 조금씩 늘릴 수 있다.

### 7.4 패턴 템플릿 목록 (초안)

`charger` / `artillery` / `flyer` / `summoner` / `teleporter` / `wall_crawler` / `melee_rusher` / `laser_platform` / `multi_part`(대형 보스) / `stationary_turret`

---

## 8. 육성 시스템

록맨 원작 요소를 메이플식 구조에 대응시킨다.

| 시스템 | 록맨 대응 |
|---|---|
| 레벨 / 경험치 | 메카니로이드 소탕 |
| 스킬 트리 | **특수무기 습득** — 보스 격파로 해금 (원작 루프 그대로) |
| 장비 4슬롯 | **X 시리즈 아머 파츠** (헤드 / 보디 / 암 / 풋) |
| 소모품 | 에너지 탱크, **배틀넷 배틀칩** |
| 맵 / 포탈 | 시리즈별 스테이지를 지역으로 연결 |
| 도감 | 전 캐릭터·적 수집 요소 |

---

## 9. 개발 순서

### 1차 — 수직 슬라이스

**목표: 캐릭터를 찍어내는 파이프라인이 작동하는지 증명한다.**

- 캐릭터 **2명** — 엑스(버스터), 제로(세이버). 둘 다 X4 원본 스프라이트
- 맵 2개, 잡몹 3종, 보스 1
- 아머 파츠 1세트, 레벨업, 스킬 습득 1회
- 스프라이트 임포터 + 데이터 검증 스크립트

> **성공 기준: 3번째 캐릭터를 데이터 파일 1개 + 스프라이트 시트 1장으로 추가할 수 있는가.**
> 코드를 한 줄이라도 고쳐야 한다면 구조가 틀린 것이며, 로스터를 늘리기 전에 고쳐야 한다.

엑스·제로 2명으로 먼저 규격을 확정하는 이유: 프레임 피벗 규격이 굳기 전에 7명을 넣으면 규격이 바뀔 때마다 7명분 데이터를 다시 만져야 한다. 2명으로 확정한 뒤 나머지를 일괄 투입하는 편이 **7명 전원에 더 빨리 도달한다.**

### 2차 — 로스터 완성

- 나머지 플레이어블 일괄 투입: 록맨, 블루스, 포르테, 벤트/아일, 제로(제로 시리즈)
- 액셀은 스프라이트 에딧이 필요하므로 후순위
- 캐릭터별 `movement` 플래그와 스킬 트리 차별화

### 3차 — 콘텐츠 확장

- 보스 패턴 템플릿 8~10종 구축
- 시그니처 보스 20~30명 전용 패턴
- 일반 보스·잡몹 데이터 대량 입력 (지속 작업)
- 맵·지역 확장

---

## 10. 미결 사항

- [ ] 액셀 스프라이트 조달 방법 (커뮤니티 커스텀 활용 / 직접 에딧)
- [ ] 세이브 데이터 포맷
- [ ] 맵 제작 워크플로 (Godot 타일맵 직접 편집 vs 외부 툴)
- [ ] 배틀칩 시스템을 어느 깊이까지 구현할지
- [ ] 스킬 트리 구조 (선형 / 분기 / 자유 습득)
- [ ] 도감의 범위 — 어디까지를 "전부 구현"으로 볼지

---

## 11. 에셋 관련 메모

원작 스프라이트는 캡콤의 저작물이다. 팬 제작물로서 실무적 위험은 낮지만, 다음을 지킨다:

- **비상업 유지** — 판매·후원·광고 없음 (위험의 대부분이 여기서 발생)
- 공식 제작물이라 주장하지 않음, 팬 제작 표기
- **에셋과 코드 분리** — `assets/sprites/`는 `.gitignore`. 저작권 문제와 무관하게, 나중에 자체 도트로 교체할 때 경로만 바꾸면 되므로 설계상으로도 이득
