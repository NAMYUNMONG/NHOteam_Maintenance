# 데이터 업데이트 운영 절차

## 기본 원칙

- **원본은 Excel** (`source/Inventory_Master_V*.xlsx`)
- **JSON은 생성물** — Excel에서 스크립트로 만들며, 직접 편집하지 않습니다
- **Item_ID는 변경 금지** — 모든 편집/병합의 기준 키입니다
- **Cat_No, CAS_No는 읽기 전용** — 최초 입력 후 수정하지 않습니다

---

## 방법 A — 소량 수정 (사이트 UI)

항목 1–5개 정도의 빠른 수정에 적합합니다.

1. 사이트 접속
2. 항목 클릭 → 사이드 패널 → Edit
3. 수정 후 Save
4. 헤더의 **Export JSON** 클릭 → `inventory.json` 다운로드
5. 저장소의 `data/inventory.json` 교체 후 커밋

```powershell
git add data/inventory.json
git commit -m "Update inventory"
git push
```

---

## 방법 B — 대량 수정 (Excel → JSON 변환)

위치, 재고, 카테고리 등 여러 항목을 한꺼번에 수정할 때 적합합니다.

1. `source/Inventory_Master_V*.xlsx` 열기
2. `Inventory` 시트에서 수정 (Item_ID, Cat_No, CAS_No는 변경 금지)
3. 파일 저장 (`.xlsx` 형식 유지)
4. 스크립트 실행:

```powershell
pip install openpyxl
python scripts/convert_excel_to_json.py source/Inventory_Master_V*.xlsx data/inventory.json
```

5. 결과 확인 (스크립트가 변경 내용 요약 출력)
6. 커밋:

```powershell
git add source/Inventory_Master_V*.xlsx data/inventory.json
git commit -m "Update inventory from Excel"
git push
```

---

## 방법 C — 신규 항목 추가 (Excel)

1. Excel `Inventory` 시트 맨 아래에 행 추가
2. Item_ID는 같은 카테고리의 마지막 번호 + 1 (예: `CHM-0395`)
3. Category, Item_Name, Manufacturer, Cat_No, Storage는 필수 입력
4. 방법 B의 3–6단계 실행

---

## Excel 컬럼 규칙 요약

| 컬럼 | 규칙 |
|---|---|
| Item_ID | 변경 금지 |
| Cat_No | 변경 금지 |
| CAS_No | 변경 금지 |
| Category | 드롭다운 선택 |
| Subcategory | 드롭다운 선택 (또는 직접 입력) |
| Storage | RT / 4°C / -20°C / -80°C / LN2 |
| Location | 드롭다운 선택 |
| Sub_Location | 선반 번호 또는 박스명 (예: CST #1) |
| Application | 세미콜론 구분 (예: WB;Cell Culture) |
| Low_Stock | TRUE / FALSE |
| Current_Stock | 숫자 또는 빈칸 |

---

## 충돌 방지

- 여러 명이 동시에 수정하는 경우, 최신 `inventory.json` 기준으로 재병합합니다.
- 같은 물품이라도 위치나 용량이 다르면 별도 Item_ID로 관리합니다.
- 브라우저 임시 저장 데이터가 있을 경우 사이트 상단에 주황색 배너가 표시됩니다.

---

## 담당자 체크리스트

- [ ] Excel 원본이 `source/` 폴더에 최신 버전으로 보관되어 있는가
- [ ] `data/inventory.json`이 Excel과 동기화되어 있는가
- [ ] Item_ID 중복이 없는가 (스크립트가 경고 출력)
- [ ] 신규 항목의 Location / Sub_Location이 입력되어 있는가
