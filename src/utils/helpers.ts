// src/utils/helpers.ts

export function transliterateSlug(slug: string): string {
  const cyrillicMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return slug.toLowerCase().split('').map(char => cyrillicMap[char] || char).join('');
}

export function extractTitleFromId(id: string): string {
  const nameWithoutExtension = id.replace(/\.md$/, '');
  const parts = nameWithoutExtension.split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ') : nameWithoutExtension;
}

export function createCleanSlug(id: string): string {
  const title = extractTitleFromId(id);
  const transliterated = transliterateSlug(title);
  return transliterated
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function getReadingTime(body: string = ''): string {
  const words = body.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} minute${minutes > 1 ? 's' : ''} read`;
}
