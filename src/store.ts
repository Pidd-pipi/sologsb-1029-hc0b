import { reactive, watch } from 'vue';
import { createInitialState } from './data';
import { normalizeSentenceKey } from './courseImport';
import type { Course, Lesson, PersistedState, PracticeAttempt, Sentence } from './types';

const STORAGE_KEY = 'sologsb-1029-dictation-state-v1';

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.schemaVersion === 1) return parsed;
    }
  } catch {
    // Falls back to the sample course when the local draft is malformed.
  }
  return createInitialState();
}

export const state = reactive<PersistedState>(loadState());

export const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

watch(state, persist, { deep: true });

export const lessons = (): Lesson[] => state.courses.flatMap((course) => course.lessons);
export const lessonById = (id: string): Lesson | undefined => lessons().find((lesson) => lesson.id === id);
export const courseForLesson = (lessonId: string) => state.courses.find((course) => course.id === lessonById(lessonId)?.courseId);

export function setDownloaded(lessonId: string, value: boolean) {
  const lesson = lessonById(lessonId);
  if (lesson) lesson.downloaded = value;
}

export function saveAttempt(attempt: PracticeAttempt) {
  state.attempts.unshift(attempt);
}

export function updateTokenClassification(attemptId: string, sentenceId: string, tokenIndex: number, patch: { category?: PracticeAttempt['sentenceAttempts'][number]['tokens'][number]['category']; reason?: string }) {
  const attempt = state.attempts.find((item) => item.id === attemptId);
  const token = attempt?.sentenceAttempts.find((item) => item.sentenceId === sentenceId)?.tokens.find((item) => item.index === tokenIndex);
  if (token) Object.assign(token, patch);
}

export function exportRecords(): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    application: 'EchoStep 移动听写',
    attempts: state.attempts,
    progress: state.progress
  }, null, 2);
}

export function resetDemo() {
  const fresh = createInitialState();
  Object.assign(state, fresh);
}

let uidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uidCounter += 1).toString(36)}`;

export interface LessonImportRow {
  text: string;
  translation: string;
  note: string;
}

export interface LessonUpsertResult {
  courseId: string;
  lessonId: string;
  isNewCourse: boolean;
  isNewLesson: boolean;
  kept: number;
  added: number;
  removed: number;
}

/**
 * 保存教师自编课节：按课程名/课节名找到（或创建）自建课程与课节，然后写入句子。
 * 与已有句子英文相同（忽略大小写与多余空白）的句子复用原 id，仅更新文本、翻译和提示，
 * 因此学生的未提交答案（按句子 id 记录）会跟随原句，不受句子换位影响。
 */
export function upsertCustomLesson(courseTitle: string, lessonTitle: string, rows: LessonImportRow[]): LessonUpsertResult {
  const title = courseTitle.trim();
  const name = lessonTitle.trim();

  const existingCourse = state.courses.find((item) => item.custom && item.title === title);
  const course: Course = existingCourse ?? {
    id: uid('custom-course'),
    title,
    description: '教师自编教材',
    level: '自编',
    accent: '#1769e0',
    custom: true,
    lessons: []
  };
  if (!existingCourse) state.courses.push(course);

  const existingLesson = course.lessons.find((item) => item.title === name);
  const lesson: Lesson = existingLesson ?? {
    id: uid('custom-lesson'),
    courseId: course.id,
    title: name,
    subtitle: '自编教材',
    level: '自编',
    estimatedMinutes: 0,
    downloaded: false,
    sentences: []
  };
  if (!existingLesson) course.lessons.push(lesson);

  // 防御性去重：同一课节相同英文只保留第一条，其余按输入顺序进入。
  const uniqueRows: LessonImportRow[] = [];
  const rowKeys = new Set<string>();
  for (const row of rows) {
    const key = normalizeSentenceKey(row.text);
    if (!key || rowKeys.has(key)) continue;
    rowKeys.add(key);
    uniqueRows.push(row);
  }

  const existingByKey = new Map<string, Sentence>();
  for (const sentence of lesson.sentences) {
    const key = normalizeSentenceKey(sentence.text);
    if (!existingByKey.has(key)) existingByKey.set(key, sentence);
  }

  let kept = 0;
  let added = 0;
  const nextSentences = uniqueRows.map((row) => {
    const existing = existingByKey.get(normalizeSentenceKey(row.text));
    if (existing) {
      kept += 1;
      existing.text = row.text;
      existing.translation = row.translation;
      existing.note = row.note;
      return existing;
    }
    added += 1;
    return { id: uid('s'), text: row.text, translation: row.translation, note: row.note };
  });
  const removed = lesson.sentences.length - kept;
  lesson.sentences = nextSentences;
  lesson.estimatedMinutes = Math.max(1, Math.round(nextSentences.length * 1.5));

  return {
    courseId: course.id,
    lessonId: lesson.id,
    isNewCourse: !existingCourse,
    isNewLesson: !existingLesson,
    kept,
    added,
    removed
  };
}
