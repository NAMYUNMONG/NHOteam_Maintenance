# 팀 업데이트 운영 절차

## 일반 팀원

1. 웹사이트에서 항목을 검색합니다.
2. 신규 구매 또는 수정 사항을 입력합니다.
3. `브라우저 임시 저장`을 눌러 작업 중 내용을 보존합니다.
4. 작업이 끝나면 `변경 JSON 다운로드`를 누릅니다.
5. 담당자에게 `inventory.json`을 전달하거나 Pull Request를 생성합니다.

## 담당자

1. 전달받은 `inventory.json`을 `data/inventory.json`에 덮어씁니다.
2. 로컬에서 `python -m http.server 8000`으로 확인합니다.
3. 문제가 없으면 GitHub에 반영합니다.

```powershell
git add data/inventory.json
git commit -m "Update inventory"
git push
```

## 충돌 방지

- 여러 명이 동시에 수정한 경우, 최신 `inventory.json` 기준으로 다시 병합합니다.
- 가능하면 Item_ID를 임의로 바꾸지 않습니다.
- 같은 물품이더라도 다른 위치나 다른 용량이면 별도 Item_ID로 관리합니다.
