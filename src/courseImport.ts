export type ImportLineStatus = 'ok' | 'empty-english' | 'bad-format' | 'duplicate';

export interface ImportLine {
  lineNumber: number;
  raw: string;
  status: ImportLineStatus;
  text: string;
  translation: string;
  note: string;
  /** 重复行指向首次出现同一英文的行号。 */
  duplicateOfLine: number;
}

/**
 * 句子的去重/匹配键：忽略首尾空白、压缩内部空白、不区分大小写。
 * 保存课节时用它把新输入与已有句子对应起来，保证句子 id 稳定。
 */
export const normalizeSentenceKey = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

/**
 * 解析教师粘贴的教材文本，每行格式为「英文|翻译|提示」。
 * - 完全空白的行直接忽略，不计入问题；
 * - 没有 `|` 的行记为格式错误；
 * - 英文部分为空的行记为空英文；
 * - 同一批输入中相同英文只保留第一条，其余记为重复；
 * - 翻译与提示允许为空，提示中多余的 `|` 会被保留。
 */
export function parseLessonInput(source: string): ImportLine[] {
  const seen = new Map<string, number>();
  const lines: ImportLine[] = [];
  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const raw = rawLine.trim();
    if (!raw) return;
    const base = { lineNumber, raw, text: '', translation: '', note: '', duplicateOfLine: 0 };
    if (!raw.includes('|')) {
      lines.push({ ...base, status: 'bad-format' });
      return;
    }
    const parts = raw.split('|');
    const text = (parts[0] ?? '').trim();
    const translation = (parts[1] ?? '').trim();
    const note = parts.slice(2).join('|').trim();
    if (!text) {
      lines.push({ ...base, status: 'empty-english', translation, note });
      return;
    }
    const key = normalizeSentenceKey(text);
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      lines.push({ ...base, status: 'duplicate', text, translation, note, duplicateOfLine: firstLine });
      return;
    }
    seen.set(key, lineNumber);
    lines.push({ ...base, status: 'ok', text, translation, note });
  });
  return lines;
}
