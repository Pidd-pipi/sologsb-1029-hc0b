import { reactive, watch } from 'vue';
import { estimateLessonMinutes, normalizeEnglishKey } from './courseBuilder';
import { createInitialState } from './data';
import type { Course, Lesson, PersistedState, PracticeAttempt } from './types';

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

let idSeed = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idSeed += 1).toString(36)}`;

export interface BuiltSentenceInput {
  text: string;
  translation: string;
  note: string;
}

// 保存教师自编课节：无 lessonId 时新建课程；有 lessonId 时原地更新该课节。
// 更新时按英文句子匹配并复用原句 ID——学生答案按句子 ID 关联，
// 因此句子换位、改翻译或提示都不会让已填答案串到别的句子。
export function saveBuiltLesson(options: {
  lessonId?: string;
  courseTitle: string;
  lessonTitle: string;
  sentences: BuiltSentenceInput[];
}): Lesson | undefined {
  const courseTitle = options.courseTitle.trim();
  const lessonTitle = options.lessonTitle.trim();
  if (!courseTitle || !lessonTitle || !options.sentences.length) return undefined;

  const existing = options.lessonId ? lessonById(options.lessonId) : undefined;
  if (existing) {
    const previousCount = existing.sentences.length;
    const previousByEnglish = new Map(existing.sentences.map((sentence) => [normalizeEnglishKey(sentence.text), sentence]));
    existing.sentences = options.sentences.map((input) => {
      const reused = previousByEnglish.get(normalizeEnglishKey(input.text));
      if (reused) {
        reused.text = input.text;
        reused.translation = input.translation;
        reused.note = input.note;
        return reused;
      }
      return { id: nextId(`${existing.id}-s`), text: input.text, translation: input.translation, note: input.note };
    });
    existing.title = lessonTitle;
    if (existing.sentences.length !== previousCount) existing.estimatedMinutes = estimateLessonMinutes(existing.sentences.length);
    const course = courseForLesson(existing.id);
    if (course && course.title !== courseTitle) course.title = courseTitle;
    const progress = state.progress[existing.id];
    if (progress && !existing.sentences.some((sentence) => sentence.id === progress.activeSentenceId)) {
      progress.activeSentenceId = existing.sentences[0]?.id ?? '';
    }
    if (state.activeLessonId === existing.id && !existing.sentences.some((sentence) => sentence.id === state.activeSentenceId)) {
      state.activeSentenceId = existing.sentences[0]?.id ?? '';
    }
    return existing;
  }

  const lesson: Lesson = {
    id: nextId('lesson'),
    courseId: '',
    title: lessonTitle,
    subtitle: '教师自编',
    level: '自编',
    estimatedMinutes: estimateLessonMinutes(options.sentences.length),
    downloaded: false,
    sentences: options.sentences.map((input) => ({ id: nextId('sentence'), text: input.text, translation: input.translation, note: input.note }))
  };
  const course: Course = {
    id: nextId('course'),
    title: courseTitle,
    description: '教师自编课程',
    level: '自编',
    accent: '#0f9d8f',
    lessons: [lesson]
  };
  lesson.courseId = course.id;
  state.courses.push(course);
  return lesson;
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
