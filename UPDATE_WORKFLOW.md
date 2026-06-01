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
5. `data/inventory.json` 교체 후 커밋

```powershell
cd D:\lab_site\NHOteam_Maintenance
git add data/inventory.json
git commit -m "Update inventory"
git push
```

---

## 방법 B — 대량 수정 (Excel → JSON)

위치, 재고, 카테고리 등 여러 항목을 한꺼번에 수정할 때 적합합니다.

1. `source/Inventory_Master_V*.xlsx` 열기
2. `Inventory` 시트에서 수정 (Item_ID, Cat_No, CAS_No는 변경 금지)
3. 파일 저장 후 변환:

```powershell
cd D:\lab_site\NHOteam_Maintenance
python scripts/convert_excel_to_json.py source/Inventory_Master_V7.xlsx data/inventory.json
```

4. 커밋:

```powershell
git add source/Inventory_Master_V7.xlsx data/inventory.json
git commit -m "Update inventory from Excel"
git push
```

---

## CAS 번호 자동 조회

새 화학물질을 추가했거나 CAS가 비어있는 항목을 채우고 싶을 때:

```powershell
cd D:\lab_site\NHOteam_Maintenance
python scripts/fetch_cas.py data/inventory.json
```

- 이미 CAS가 있는 항목은 건드리지 않습니다
- 약 15–25분 소요 (PubChem API 속도 제한)
- 완료 후 CAS를 Excel에도 반영:

```powershell
python scripts/update_excel_cas.py data/inventory.json source/Inventory_Master_V7.xlsx
```

- 그 다음 두 파일 모두 커밋:

```powershell
git add data/inventory.json source/Inventory_Master_V7.xlsx
git commit -m "Update CAS numbers"
git push
```

---

## GitHub 업데이트 절차 (같은 브랜치)

```powershell
cd D:\lab_site\NHOteam_Maintenance

# 1. 원격 변경사항 먼저 받기 (협업자가 있을 경우 항상 먼저)
git pull

# 2. 파일 수정 후 변경된 파일 확인
git status

# 3. 변경 파일 추가
git add data/inventory.json
# 또는 전체:
git add -A

# 4. 커밋
git commit -m "설명 메시지"

# 5. 푸시
git push
```

GitHub Pages는 push 후 약 1분 내에 자동 갱신됩니다.

---

## 담당자 체크리스트

- [ ] Excel 원본이 `source/` 폴더에 최신 버전으로 보관되어 있는가
- [ ] `data/inventory.json`이 Excel과 동기화되어 있는가
- [ ] 신규 항목의 Location / Sub_Location이 입력되어 있는가
- [ ] 새 화학물질 추가 시 `fetch_cas.py` 실행했는가
