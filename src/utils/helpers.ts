// src/utils/helpers.ts
import fs from 'node:fs';
import path from 'node:path';

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

export function getReadingTime(id: string): string {
  try {
    const filePath = path.join(process.cwd(), 'src/content/blog', id);
    const content = fs.readFileSync(filePath, 'utf-8');
    const textContent = content.replace(/---[\s\S]*?---/, '');
    const words = textContent.split(/\s+/).filter(word => word.length > 0).length;
    const minutes = Math.ceil(words / 200);
    return `${minutes} minute${minutes > 1 ? 's' : ''} read`;
  } catch (e) {
    return '1 minute read';
  }
}