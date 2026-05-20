# L1521 Inventory 정적 웹사이트 패키지

이 패키지는 `Inventory_Master_CategoryTabs_V4.xlsx` 파일을 기반으로 제작한 GitHub Pages용 정적 웹사이트입니다.

## 1. 포함 파일

```text
inventory-web-github-pages/
├─ index.html
├─ styles.css
├─ app.js
├─ .nojekyll
├─ data/
│  ├─ inventory.json
│  └─ schema.json
├─ source/
│  └─ Inventory_Master_CategoryTabs_V4.xlsx
└─ scripts/
   └─ convert_excel_to_json.py
```

## 2. 데이터 요약

| Category | Count |
|---|---:|
| Chemical | 353 |
| Antibody | 323 |
| Product | 205 |
| Total | 881 |

## 3. 웹사이트 핵심 기능

- Chemical / Antibody / Product 통합 검색
- Category 및 Storage 필터
- 정렬 기능
- 신규 항목 추가
- 기존 항목 수정 및 삭제
- JSON / CSV 다운로드
- JSON / CSV / Excel 업로드 병합
- 브라우저 임시 저장
- GitHub Pages 배포용 정적 구조

## 4. 중요한 운영 원칙

GitHub Pages는 정적 웹사이트 호스팅입니다. 따라서 웹 화면에서 수정한 내용이 GitHub 저장소에 자동으로 저장되지는 않습니다.

권장 운영 흐름은 다음과 같습니다.

```text
웹에서 항목 수정 또는 추가
→ 변경 JSON 다운로드
→ data/inventory.json 파일 교체
→ GitHub commit/push
→ GitHub Pages 자동 갱신
```

실시간 공동 편집이 필요해지는 다음 단계에서는 Google Sheets 연동 또는 Supabase/Firebase 같은 DB 연동으로 확장하는 것이 좋습니다.

## 5. 로컬에서 실행하기

PowerShell에서 압축 해제 폴더로 이동한 뒤 실행합니다.

```powershell
cd inventory-web-github-pages
python -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```

`index.html`을 직접 더블클릭하면 브라우저 보안 정책 때문에 `data/inventory.json`을 읽지 못할 수 있습니다. 반드시 로컬 서버 또는 GitHub Pages에서 실행하세요.

## 6. GitHub 저장소에 업로드하기

Git과 GitHub 저장소가 준비되어 있다고 가정합니다.

```powershell
cd inventory-web-github-pages
git init
git add .
git commit -m "Initial inventory website"
git branch -M main
git remote add origin https://github.com/<GitHub아이디>/<저장소명>.git
git push -u origin main
```

GitHub에서 다음 메뉴로 이동합니다.

```text
Repository → Settings → Pages → Build and deployment
```

다음과 같이 설정합니다.

```text
Source: Deploy from a branch
Branch: main
Folder: / root
Save
```

공식 GitHub Pages 문서:
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 7. 팀원이 데이터를 수정하는 방법

### 방법 A. 웹에서 수정 후 JSON 다운로드

1. 웹사이트 접속
2. 검색 또는 필터로 항목 찾기
3. `수정` 버튼 클릭
4. 값 수정 후 저장
5. `변경 JSON 다운로드` 클릭
6. 다운로드된 `inventory.json` 파일을 저장소의 `data/inventory.json`에 덮어쓰기
7. GitHub에 commit/push

```powershell
git add data/inventory.json
git commit -m "Update inventory data"
git push
```

### 방법 B. Excel을 수정한 뒤 JSON으로 변환

Excel을 기준으로 관리하고 싶다면 `source/Inventory_Master_CategoryTabs_V4.xlsx`를 수정한 뒤 아래 스크립트를 실행합니다.

```powershell
pip install openpyxl
python scripts/convert_excel_to_json.py source/Inventory_Master_CategoryTabs_V4.xlsx data/inventory.json
```

그 다음 GitHub에 반영합니다.

```powershell
git add source/Inventory_Master_CategoryTabs_V4.xlsx data/inventory.json
git commit -m "Update inventory from Excel"
git push
```

## 8. Codex CLI로 수정하는 방법

Codex CLI는 터미널에서 코드 파일을 읽고 수정할 수 있는 OpenAI의 코딩 에이전트입니다.

공식 문서:
https://developers.openai.com/codex/cli

PowerShell에서 설치합니다.

```powershell
npm install -g @openai/codex@latest
codex --version
```

프로젝트 폴더에서 실행합니다.

```powershell
cd inventory-web-github-pages
codex
```

예시 요청:

```text
검색 결과 표에서 Product 항목은 Location, Opened_Date, MW_kDa 컬럼을 숨기도록 수정해줘.
```

```text
Antibody 탭 데이터만 볼 수 있는 빠른 버튼을 추가해줘.
```

```text
Google Sheets API 연동을 준비할 수 있도록 app.js의 데이터 로딩 부분을 별도 함수로 분리해줘.
```

## 9. 향후 Google Sheets 연동 방향

현재 데이터 구조는 다음 원칙을 따릅니다.

- `Category`로 Chemical / Antibody / Product 구분
- `Item_ID`를 고유 식별자로 사용
- 웹 표시 데이터는 `data/inventory.json`에 통합 저장
- 원본 Excel은 `source/`에 보존

Google Sheets로 확장할 때는 다음 구조를 권장합니다.

```text
Google Spreadsheet
├─ Chemical
├─ Antibody
└─ Product
```

웹사이트는 Google Sheets API 또는 Apps Script Web App을 통해 세 탭을 읽어 `items` 배열로 합치면 됩니다. 현재 `app.js`의 데이터 구조와 거의 동일하게 연결할 수 있습니다.

## 10. 민감 정보 주의

GitHub Pages 사이트는 공개 인터넷에 게시될 수 있습니다. 외부 공개가 곤란한 위치 정보, 구매 기록, 내부 담당자 정보가 포함되어 있다면 private repository, 접근 제한 방식, 또는 Google Sheets 권한 기반 연동을 검토하세요.
