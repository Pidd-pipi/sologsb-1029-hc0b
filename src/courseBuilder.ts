import type { LessonParseResult, ParseIssue, ParsedSentence } from './types';

// 判重与再保存时的“同一句”口径：忽略首尾空白、合并连续空白、不区分大小写。
export const normalizeEnglishKey = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export const estimateLessonMinutes = (sentenceCount: number): number =>
  Math.max(2, Math.round(sentenceCount * 1.5));

// 解析教师粘贴的课节内容，每行格式为「英文|翻译|提示」。
// 空行跳过；空英文、格式错误、重复句记入 issues；同课节相同英文只保留第一条，其余按输入顺序排列。
export function parseLessonInput(raw: string): LessonParseResult {
  const sentences: ParsedSentence[] = [];
  const issues: ParseIssue[] = [];
  const firstLineByEnglish = new Map<string, number>();
  let totalLines = 0;

  raw.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim()) return;
    totalLines += 1;

    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 3) {
      issues.push({ line: lineNumber, kind: 'bad-format', raw: line, message: '应为「英文|翻译|提示」三段，已跳过' });
      return;
    }

    const [english, translation, note] = parts;
    if (!english) {
      issues.push({ line: lineNumber, kind: 'empty-english', raw: line, message: '英文为空，已跳过' });
      return;
    }

    const key = normalizeEnglishKey(english);
    const firstLine = firstLineByEnglish.get(key);
    if (firstLine !== undefined) {
      issues.push({ line: lineNumber, kind: 'duplicate', raw: line, message: `与第 ${firstLine} 行重复，仅保留第一条` });
      return;
    }

    firstLineByEnglish.set(key, lineNumber);
    sentences.push({ line: lineNumber, english, translation, note });
  });

  return { sentences, issues, totalLines };
}
