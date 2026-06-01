# L1521 Lab Inventory

GitHub Pages 정적 웹사이트 — NHOteam 시약 및 소모품 통합 관리 시스템

## 파일 구조

```
/
├─ index.html                          ← 전체 사이트 (CSS/JS 포함 단일 파일)
├─ schema.json                         ← 필드 정의 및 운영 규칙 참고 문서
├─ .nojekyll                           ← GitHub Pages Jekyll 비활성화 (삭제 금지)
├─ data/
│  └─ inventory.json                   ← 사이트가 읽는 실제 데이터
├─ source/
│  └─ Inventory_Master_V*.xlsx         ← 원본 데이터 (편집 기준)
└─ scripts/
   ├─ convert_excel_to_json.py         ← Excel → JSON 변환
   ├─ fetch_cas.py                     ← CAS 번호 자동 조회 (PubChem)
   └─ update_excel_cas.py             ← JSON CAS → Excel 역동기화
```

## 데이터 현황

| Category | Count |
|---|---:|
| Chemical | 351 |
| Cell Culture | 41 |
| Antibody/Protein | 348 |
| Kit/Assay | 44 |
| Consumable | 94 |
| Equipment | 3 |
| **Total** | **881** |

## 주요 기능

- 6개 카테고리 통합 검색 (전체 필드 대상, 카테고리 이동 시 선택 유지)
- Subcategory / Storage / Location 필터
- Low Stock 전용 뷰
- 항목 클릭 → 사이드 패널 상세 보기 / 편집
- 신규 항목 추가
- 다중 선택 (카테고리 간 유지) → 주문 텍스트 자동 생성
- CAS No. 기반 MSDS 자동 링크 (PubChem / Sigma)
- JSON / Excel / CSV 업로드 병합
- 브라우저 임시 저장 + JSON 내보내기
- EN / KR 언어 전환
- 컬럼 너비 드래그 조절

## 로컬 실행

```powershell
cd D:\lab_site\NHOteam_Maintenance
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속.

## GitHub Pages 설정

```
Repository → Settings → Pages → Source: Deploy from branch → main / root → Save
```

## 중요 원칙

- **Item_ID는 절대 변경하지 않습니다** — 모든 편집/병합의 기준 키입니다
- **Cat_No, CAS_No는 읽기 전용** — 최초 입력 후 수정하지 않습니다
- **원본은 항상 Excel** — JSON은 Excel에서 생성됩니다
- 공개 저장소 사용 시 위치 정보, 담당자 이름 등 민감 정보 노출에 주의하세요
