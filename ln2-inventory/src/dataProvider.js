// GitHub Pages 단계에서는 정적 JSON을 읽습니다.
// Vercel + Google Sheets 단계에서는 이 함수의 fetch URL만 `/api/inventory` 등으로 바꾸면 됩니다.
export async function loadInventoryData() {
  const response = await fetch('./data/inventory.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load inventory data: ${response.status}`);
  }
  return response.json();
}
