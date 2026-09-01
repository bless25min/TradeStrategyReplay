const snippet = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 100);

export const fetchDataText = async (url: string, label = '資料'): Promise<string> => {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${label}讀取失敗：${url} (${response.status})`);
  }

  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new Error(`${label}路徑回傳了網站 HTML，而不是資料檔：${url}`);
  }

  return text;
};

export const fetchDataJson = async <T>(url: string, label = 'JSON 資料'): Promise<T> => {
  const text = await fetchDataText(url, label);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}不是有效 JSON：${url}；收到：${snippet(text)}`);
  }
};
