import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {
  Award,
  AudioLines,
  Bell,
  BellOff,
  Bookmark,
  Camera,
  Check,
  Circle,
  Clock3,
  Cog,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  FileText,
  Folder,
  FolderPlus,
  Forward,
  Grid3X3,
  Highlighter,
  Heart,
  Home,
  Image as ImageIcon,
  List,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareReply,
  Megaphone,
  Mic,
  Monitor,
  MoreHorizontal,
  Moon,
  NotebookPen,
  PenLine,
  Palette,
  Play,
  Pointer,
  Plus,
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  Trophy,
  Underline,
  Undo2,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  Waves,
  X,
  Ban,
} from 'lucide-react';
import { BibleOnLogo, BibleBookIcon as BookOpen, ChurchCrossIcon as Church, SixteenthNoteIcon } from './brandIcons';
import { bibleCatalog, getBibleVerseCount, loadBibleChapter, preloadBible, searchBibleVerses } from './data/repositories/bibleContentRepository';
import { searchOpenBibleTopicPassages } from './ragPrototype';
import {
  CHURCH_PROFILES_STORAGE_KEY,
  COMMUNITY_IDS_STORAGE_KEY,
  CURRENT_CHURCH_STORAGE_KEY,
  getRegisteredChurches,
  searchRegisteredChurches,
} from './churchData';
import OnboardingApp from './OnboardingApp';
import { readStoredValue, removeStoredValue, writeStoredValue } from './data/repositories/persistenceRepository';
import { accountRepository } from './data/repositories/accountRepository';
import { getCurrentSession, linkSocialIdentity, signOutCurrentAccount } from './data/repositories/authRepository';
import { personalDataRepository } from './data/repositories/personalDataRepository';
import { churchRepository } from './data/repositories/churchRepository';
import { friendRepository } from './data/repositories/friendRepository';
import { messageRepository } from './data/repositories/messageRepository';
import { subscriptionRepository } from './data/repositories/subscriptionRepository';
import { buildMessageViewModel } from './data/repositories/messageViewAdapter';
import {
  assignUnassignedMembersToRoot,
  flattenDepartmentNodes,
  getDepartmentAncestorIds,
  getDepartmentDepth,
  getDepartmentMemberIds,
  getDepartmentSubtreeIds,
  getMemberDepartmentNode,
  isCurrentCommunityWorkspace,
} from './data/communityHierarchy';
import {
  createEmptyChapterPopularityData,
  normalizeChapterPopularityData,
  rankChapterPopularity,
  recordUniqueChapterAccess,
} from './data/chapterPopularity';
import {
  importGuestAccountData,
  keepGuestAccountDataSeparate,
  shouldAskToImportGuestData,
} from './data/repositories/accountDataMigration';
import {
  createSignedMediaUrl,
  readImagePreview,
  uploadAvatar,
  uploadChurchMedia,
  uploadMessageAttachment,
} from './data/repositories/mediaRepository';
import { initializePersistenceScope } from './data/persistence/persistenceContext';
import './styles.css';

const readingHighlights = {
  genesis: {
    chapter: 1,
    title: '창조의 시작',
    progress: 72,
    lastRead: '오늘 오전 6:42',
    tags: ['창조', '시작', '질서'],
  },
  psalms: {
    chapter: 23,
    title: '인도하심과 안식',
    progress: 38,
    lastRead: '어제 오후 10:10',
    tags: ['위로', '평안', '회복'],
  },
  romans: {
    chapter: 8,
    title: '성령 안의 확신',
    progress: 64,
    lastRead: '6월 14일',
    tags: ['은혜', '성령', '확신'],
  },
  philippians: {
    chapter: 4,
    title: '기쁨과 평안',
    progress: 22,
    lastRead: '6월 12일',
    tags: ['염려', '평안', '기도'],
  },
};

const bibleBooks = bibleCatalog.map((book) => ({
  ...book,
  chapter: 1,
  title: `${book.testament} 성경`,
  progress: 0,
  lastRead: '아직 읽지 않음',
  tags: [],
  ...(readingHighlights[book.id] ?? {}),
}));

const defaultRecentPassages = Object.entries(readingHighlights)
  .map(([bookId, reading]) => ({ bookId, chapter: reading.chapter }))
  .reverse();
const tutorialRecentPassages = defaultRecentPassages.slice(0, 4);

const translations = [
  { id: 'KRV', label: '개역개정' },
  { id: 'RNKSV', label: '새번역' },
];

function createMemoId(prefix = 'memo') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toMemoVerseSnapshot(verse) {
  const idMatch = String(verse?.id ?? '').match(/^(.+)-(\d+)-(.+)$/);
  const bookId = verse?.bookId ?? idMatch?.[1] ?? '';
  const chapter = Number(verse?.chapter ?? idMatch?.[2] ?? 0);
  const verseNumber = Number(verse?.verse ?? verse?.label ?? idMatch?.[3] ?? 0);
  const book = bibleBooks.find(({ id }) => id === bookId);
  return {
    id: verse?.id ?? `${bookId}-${chapter}-${verseNumber}`,
    ref: verse?.ref ?? `${book?.name ?? '성경'} ${chapter}:${verseNumber}`,
    text: verse?.text ?? '',
    bookId,
    chapter,
    verse: verseNumber,
  };
}

function formatMemoPassageReference(verses) {
  const snapshots = verses.map(toMemoVerseSnapshot);
  if (snapshots.length <= 1) return snapshots[0]?.ref ?? '말씀 메모';
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const sameChapter = first.bookId === last.bookId && first.chapter === last.chapter;
  if (!sameChapter) return `${first.ref} - ${last.ref}`;
  const book = bibleBooks.find(({ id }) => id === first.bookId);
  return `${book?.name ?? first.ref.split(/\s+\d+:/)[0]} ${first.chapter}:${first.verse}-${last.verse}`;
}

function createMemoTarget(verses, options = {}) {
  const snapshots = verses.map(toMemoVerseSnapshot).filter(({ id }) => Boolean(id));
  const verseIds = snapshots.map(({ id }) => id);
  return {
    type: verseIds.length > 1 ? 'passage' : 'verse',
    threadKey: verseIds.length > 1 ? `passage:${verseIds.join('|')}` : `verse:${verseIds[0] ?? ''}`,
    reference: options.reference ?? formatMemoPassageReference(snapshots),
    verseIds,
    verses: snapshots,
    includeRelated: Boolean(options.includeRelated),
  };
}

function normalizeMemoComments(stored, legacyNotes = {}, legacyMeta = {}, hasStoredVersion = false) {
  if (hasStoredVersion && Array.isArray(stored)) {
    return stored.map((entry, index) => {
      const verses = Array.isArray(entry.verses) && entry.verses.length
        ? entry.verses.map(toMemoVerseSnapshot)
        : (entry.verseIds ?? []).map((id) => toMemoVerseSnapshot({ id }));
      const target = createMemoTarget(verses, { reference: entry.reference });
      return {
        id: entry.id ?? `memo-restored-${index}`,
        threadKey: entry.threadKey ?? target.threadKey,
        reference: entry.reference ?? target.reference,
        verseIds: target.verseIds,
        verses: target.verses,
        body: String(entry.body ?? entry.note ?? ''),
        parentId: entry.parentId ?? null,
        createdAt: Number(entry.createdAt ?? index),
        updatedAt: Number(entry.updatedAt ?? entry.createdAt ?? index),
      };
    }).filter(({ body, verseIds }) => body.trim() && verseIds.length);
  }

  return Object.entries(legacyNotes).map(([id, body], insertionIndex) => {
    const metadata = legacyMeta[id] ?? {};
    const verse = toMemoVerseSnapshot({ id, ...metadata });
    const target = createMemoTarget([verse]);
    return {
      id: `legacy-${id}`,
      ...target,
      body: String(body ?? ''),
      parentId: null,
      createdAt: Number(metadata.createdAt ?? insertionIndex),
      updatedAt: Number(metadata.updatedAt ?? insertionIndex),
    };
  }).filter(({ body }) => body.trim());
}

function buildMemoThreadEntries(memoComments) {
  const grouped = new Map();
  memoComments.forEach((comment) => {
    const current = grouped.get(comment.threadKey) ?? [];
    current.push(comment);
    grouped.set(comment.threadKey, current);
  });
  return Array.from(grouped.entries()).map(([threadKey, comments]) => {
    const ordered = [...comments].sort((left, right) => left.updatedAt - right.updatedAt);
    const latest = ordered[ordered.length - 1];
    const firstVerse = latest.verses[0] ?? toMemoVerseSnapshot({ id: latest.verseIds[0] });
    return {
      ...createMemoTarget(latest.verses, { reference: latest.reference }),
      id: threadKey,
      threadKey,
      latest,
      commentCount: ordered.length,
      createdAt: Math.min(...ordered.map(({ createdAt }) => createdAt)),
      updatedAt: Math.max(...ordered.map(({ updatedAt }) => updatedAt)),
      bookOrder: Math.max(0, bibleBooks.findIndex(({ id }) => id === firstVerse.bookId)),
      chapter: Number(firstVerse.chapter ?? 0),
      verse: Number(firstVerse.verse ?? 0),
    };
  });
}

function normalizeWorshipMemoEntries(value = {}) {
  if (Array.isArray(value.entries)) {
    return value.entries.map((entry, index) => ({
      id: entry.id ?? `worship-memo-${index}`,
      body: String(entry.body ?? entry.memo ?? ''),
      parentId: entry.parentId ?? null,
      createdAt: Number(entry.createdAt ?? index),
      updatedAt: Number(entry.updatedAt ?? entry.createdAt ?? index),
    })).filter(({ body }) => body.trim());
  }
  if (!String(value.memo ?? '').trim()) return [];
  const timestamp = Number(value.updatedAt ?? 0);
  return [{
    id: `legacy-worship-${timestamp}`,
    body: String(value.memo),
    parentId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}

function saveVerseMemo(setVerseNotes, setVerseNoteMeta, verse, value) {
  const trimmedValue = value.trim();
  const changedAt = Date.now();
  setVerseNotes((current) => {
    const next = { ...current };
    if (trimmedValue) next[verse.id] = value;
    else delete next[verse.id];
    return next;
  });
  setVerseNoteMeta((current) => {
    const next = { ...current };
    if (!trimmedValue) {
      delete next[verse.id];
      return next;
    }
    const idMatch = verse.id.match(/^(.+)-(\d+)-(.+)$/);
    next[verse.id] = {
      ...current[verse.id],
      ref: verse.ref,
      text: verse.text ?? current[verse.id]?.text ?? '',
      bookId: verse.bookId ?? idMatch?.[1] ?? '',
      chapter: Number(verse.chapter ?? idMatch?.[2] ?? 0),
      verse: verse.verse ?? idMatch?.[3] ?? '',
      createdAt: current[verse.id]?.createdAt ?? changedAt,
      updatedAt: changedAt,
    };
    return next;
  });
}

function useSlideDismiss(onClose, duration = 240) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const dismiss = (afterClose) => {
    if (isClosing) return;
    setIsClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      onClose();
      if (typeof afterClose === 'function') afterClose();
    }, duration);
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
  return { isClosing, dismiss };
}

function useSwipeBack(onBack, { enabled = true, edgeWidth = 44, threshold = 78 } = {}) {
  const gestureRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState('idle');

  const reset = () => {
    gestureRef.current = null;
    setPhase('idle');
    setOffset(0);
  };

  const onPointerDown = (event) => {
    if (!enabled || event.button !== 0 || event.clientX > edgeWidth) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      active: false,
    };
  };

  const onPointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.active) {
      if (deltaX < 7 && Math.abs(deltaY) < 7) return;
      if (deltaX <= 0 || Math.abs(deltaY) > deltaX * 0.72) {
        reset();
        return;
      }
      gesture.active = true;
      setPhase('tracking');
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    const width = event.currentTarget.getBoundingClientRect().width || window.innerWidth;
    setOffset(Math.min(width, Math.max(0, deltaX * 0.92)));
  };

  const finishGesture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = deltaX / elapsed;
    gestureRef.current = null;
    if (gesture.active && (deltaX >= threshold || (deltaX >= 42 && velocity > 0.55))) {
      setPhase('leaving');
      setOffset(event.currentTarget.getBoundingClientRect().width || window.innerWidth);
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setPhase('idle');
        setOffset(0);
        onBack();
      }, 190);
      return;
    }
    setPhase('idle');
    setOffset(0);
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  return {
    className: `swipe-back-surface ${phase === 'tracking' ? 'is-swipe-back-tracking' : ''} ${phase === 'leaving' ? 'is-swipe-back-leaving' : ''}`,
    style: { '--swipe-back-offset': `${offset}px` },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishGesture,
      onPointerCancel: reset,
    },
  };
}

function resolveBibleReference(reference) {
  const book = bibleBooks.find(({ name }) => reference?.startsWith(name));
  if (!book) return null;
  const numbers = reference.slice(book.name.length).match(/(\d+)\s*:\s*(\d+)/);
  if (!numbers) return null;
  return { bookId: book.id, chapter: Number(numbers[1]), verse: Number(numbers[2]) };
}

function normalizeMemoViewMode(value) {
  return ['grid', 'list'].includes(value) ? value : 'grid';
}

function RepresentativeVerseText({ reference, fallbackText = '', translationId }) {
  const [text, setText] = useState(fallbackText);

  useEffect(() => {
    let active = true;
    const target = resolveBibleReference(reference);
    setText(fallbackText);
    if (!target || !translationId) return () => { active = false; };

    loadBibleChapter(translationId, target.bookId, target.chapter)
      .then((verses) => {
        if (!active) return;
        const verse = verses.find((item) => Number(String(item.label ?? item.verse).split('-')[0]) === target.verse);
        if (verse?.text) setText(verse.text);
      })
      .catch(() => {});

    return () => { active = false; };
  }, [fallbackText, reference, translationId]);

  return text;
}

const weeklyPlan = {
  service: '주일 2부 예배',
  theme: '염려보다 큰 평안',
  passage: '빌립보서 4:4-7',
  hymn: '내 평생에 가는 길',
  time: '9월 6일 오전 11:00',
};

const churchInfo = {
  name: '은혜샘교회',
  pastor: '김은혜 담임목사',
  department: '청년부',
  role: '등록 교인',
  authority: '관리자',
  members: 428,
  notice: '이번 주 셀모임은 예배 후 2층 라운지에서 모입니다.',
};

const MAX_COMMUNITIES = 3;
const COMMUNITY_TYPE_LABELS = {
  church: '교회',
  club: '동아리',
  small_group: '소모임',
  community: '기타',
};

function getCommunityTypeLabel(community) {
  return COMMUNITY_TYPE_LABELS[community?.communityType] ?? COMMUNITY_TYPE_LABELS.community;
}

const communityPosts = [
  {
    author: '민서',
    group: '청년부',
    ref: '빌 4:6-7',
    text: '걱정을 없애려 애쓰기보다 기도로 옮기는 하루를 살아보려고 해요.',
    time: '12분 전',
    reactions: 8,
  },
  {
    author: '재윤',
    group: '새가족부',
    ref: '시 23편',
    text: '회복은 다시 목자의 음성을 듣는 일에 가깝다는 생각이 들었습니다.',
    time: '43분 전',
    reactions: 5,
  },
];

const roadmap = [
  { day: '월', label: '빌립보서 4장', helper: '염려를 기도로 가져가기', state: 'done' },
  { day: '화', label: '시편 23편', helper: '인도하심을 천천히 읽기', state: 'active' },
  { day: '수', label: '요한복음 14장', helper: '예수님이 주시는 평안', state: 'next' },
  { day: '목', label: '로마서 8장', helper: '끊을 수 없는 사랑', state: 'next' },
  { day: '금', label: '시편 42편', helper: '마음이 낙심될 때', state: 'next' },
];

const hymns = [
  { title: '내 평생에 가는 길', tone: '위로', duration: '4:12' },
  { title: '주 하나님 지으신 모든 세계', tone: '경배', duration: '3:58' },
  { title: '예수 사랑하심은', tone: '확신', duration: '2:48' },
];

const defaultPersonalProfile = {
  name: '김온유',
  nickname: '온유빛',
  avatarImage: '',
  verseRef: '빌립보서 4:13',
  representativeVerse: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.',
  featuredAchievementId: '',
  featuredAchievementName: '',
  primaryCommunityId: 'grace-spring',
};

const unavailableNicknames = new Set(['말씀지기', '은혜샘', '바이블온', 'grace24']);

function getNicknameLengthUnits(nickname) {
  return Array.from(nickname).reduce((total, character) => (
    total + (/^[가-힣]$/.test(character) ? 2 : 1)
  ), 0);
}

function validateNickname(nickname, currentNickname = '') {
  const normalized = nickname.trim().normalize('NFKC');
  if (!normalized) return { normalized, state: 'empty', message: '닉네임을 입력해 주세요.' };
  if (!/^[가-힣A-Za-z0-9]+$/.test(normalized)) {
    return { normalized, state: 'invalid', message: '한글, 영문, 숫자만 사용할 수 있어요.' };
  }
  if (/^[0-9]+$/.test(normalized)) {
    return { normalized, state: 'invalid', message: '숫자로만 구성할 수 없어요.' };
  }
  const lengthUnits = getNicknameLengthUnits(normalized);
  if (lengthUnits < 4 || lengthUnits > 16) {
    return { normalized, state: 'invalid', message: '한글 2~8자 또는 영문·숫자 4~16자로 입력해 주세요.' };
  }
  const duplicateKey = normalized.toLocaleLowerCase('ko-KR');
  const currentKey = currentNickname.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  if (duplicateKey !== currentKey && unavailableNicknames.has(duplicateKey)) {
    return { normalized, state: 'duplicate', message: '이미 사용 중인 닉네임이에요.' };
  }
  return { normalized, state: 'available', message: '사용 가능한 닉네임이에요.' };
}

const initialRecentNotifications = [
  {
    id: 'notice-message',
    type: '메시지',
    title: '김민서',
    body: '예배 후에 잠깐 이야기할 수 있을까요?',
    time: '2분 전',
    icon: MessageCircle,
    unread: true,
    destination: { tab: 'messages', kind: 'conversation', id: 'minseo' },
  },
  {
    id: 'notice-church',
    type: '공동체 공지',
    title: '셀모임 장소 안내',
    body: '예배 후 2층 라운지에서 모입니다.',
    time: '28분 전',
    icon: Bell,
    unread: true,
    destination: { tab: 'church', kind: 'announcement', id: 'announcement-cell' },
  },
  {
    id: 'notice-service',
    type: '공동체 업데이트',
    title: '이번 주 예배 정보',
    body: '예배 말씀과 찬양 순서가 등록됐어요.',
    time: '1시간 전',
    icon: Church,
    unread: true,
    destination: { tab: 'church', kind: 'worship' },
  },
  {
    id: 'notice-qt',
    type: 'QT 나눔',
    title: '새로운 공감',
    body: '재윤님이 온유님의 QT에 공감했어요.',
    time: '어제',
    icon: ThumbsUp,
    unread: false,
    destination: { tab: 'messages', kind: 'qt', id: 'qt-peace-together' },
  },
];

const initialChurchConversations = [
  {
    id: 'minseo',
    name: '김민서',
    department: '청년부',
    role: '셀 리더',
    online: true,
    unread: 2,
    time: '오전 10:42',
    lastMessage: '예배 후에 잠깐 이야기할 수 있을까요?',
    messages: [
      { id: 'm1', from: 'them', text: '온유님, 이번 주 QT 나눔 잘 읽었어요.', time: '오전 10:38' },
      { id: 'm2', from: 'me', text: '고마워요. 말씀을 정리하면서 저도 많이 배웠어요.', time: '오전 10:40' },
      { id: 'm3', from: 'them', text: '예배 후에 잠깐 이야기할 수 있을까요?', time: '오전 10:42' },
    ],
  },
  {
    id: 'jaeyun',
    name: '이재윤',
    department: '새가족부',
    role: '매니저',
    online: false,
    unread: 0,
    time: '어제',
    lastMessage: '새가족 모임 자료를 공유했어요.',
    messages: [
      { id: 'j1', from: 'them', text: '이번 주 새가족 모임 자료를 공유했어요.', time: '어제 오후 8:14' },
      { id: 'j2', from: 'me', text: '확인해 볼게요. 감사합니다.', time: '어제 오후 8:20', unreadByCount: 1 },
    ],
  },
  {
    id: 'eunji',
    name: '박은지',
    department: '찬양팀',
    role: '팀원',
    online: true,
    unread: 1,
    time: '월요일',
    lastMessage: '주일 찬양 순서가 정리됐어요.',
    messages: [
      { id: 'e1', from: 'them', text: '주일 찬양 순서가 정리됐어요.', time: '월요일 오후 6:03' },
    ],
  },
];

const translationDisplayNames = {
  KRV: '개역개정',
  RNKSV: '새번역',
};

function createQtSystemMessage(verse, translationId = 'KRV') {
  return {
    id: `qt-passage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    from: 'system',
    type: 'qt-passage',
    text: `QT 말씀 · ${verse.reference}`,
    verse: {
      ...verse,
      translationId,
      translationName: translationDisplayNames[translationId] ?? translationId,
    },
    time: '방금',
  };
}

function createBiblePassageMessage(verses, translationId, unreadByCount = 0) {
  const passages = verses.map((verse) => ({
    reference: verse.ref ?? verse.reference,
    text: verse.text,
    translationId,
    translationName: translationDisplayNames[translationId] ?? translationId,
  }));
  const firstReference = passages[0]?.reference ?? '말씀';
  const referenceLabel = passages.length > 1 ? `${firstReference} 외 ${passages.length - 1}절` : firstReference;
  return {
    id: `bible-passage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    from: 'me',
    type: 'bible-passage',
    text: passages.map(({ reference, text }) => `${reference} ${text}`).join('\n'),
    referenceLabel,
    passages,
    time: '방금',
    unreadByCount,
  };
}

const messageReactionOptions = [
  { id: 'heart', label: '빨간 하트', shortLabel: '하트', Icon: Heart, tone: 'red' },
  { id: 'like', label: '파란 따봉', shortLabel: '따봉', Icon: ThumbsUp, tone: 'blue' },
  { id: 'check', label: '초록 체크', shortLabel: '체크', Icon: Check, tone: 'green' },
  { id: 'amen', label: '아멘', shortLabel: '아멘', tone: 'amen' },
  { id: 'hallelujah', label: '할렐루야', shortLabel: '할렐루야', tone: 'hallelujah' },
];

const initialQtRooms = [
  {
    id: 'qt-peace-together',
    name: '평안을 나누는 QT',
    participantIds: ['minseo', 'harin'],
    verse: {
      reference: '빌립보서 4:6',
      text: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라.',
    },
    messages: [
      {
        id: 'qt-passage-initial',
        from: 'system',
        type: 'qt-passage',
        text: 'QT 말씀 · 빌립보서 4:6',
        verse: {
          reference: '빌립보서 4:6',
          text: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라.',
          translationId: 'KRV',
          translationName: '개역개정',
        },
        time: '어제',
      },
      { id: 'qt-message-1', from: 'minseo', author: '김민서', text: '오늘은 염려를 기도로 바꾸어 보는 하루를 나눠요.', time: '어제 오후 9:10' },
    ],
    time: '어제',
    unread: 1,
    createdAt: Date.now() - 24 * 60 * 60 * 1000,
  },
];

const churchDirectoryMembers = [
  {
    id: 'harin',
    name: '정하린',
    nickname: '하린봄',
    department: '청년부',
    role: '셀원',
    verseRef: '이사야 41:10',
    representativeVerse: '두려워하지 말라 내가 너와 함께 함이라.',
    tone: 'green',
  },
  {
    id: 'doyun',
    name: '최도윤',
    nickname: '도윤길',
    department: '장년부',
    role: '순장',
    verseRef: '여호수아 1:9',
    representativeVerse: '강하고 담대하라. 네 하나님 여호와가 너와 함께 하느니라.',
    tone: 'blue',
  },
  {
    id: 'seoyeon',
    name: '한서연',
    nickname: '서연찬양',
    department: '찬양팀',
    role: '팀 리더',
    verseRef: '시편 119:105',
    representativeVerse: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다.',
    tone: 'rose',
  },
  {
    id: 'jihoon',
    name: '오지훈',
    nickname: '지훈미디어',
    department: '미디어팀',
    role: '팀원',
    verseRef: '로마서 12:12',
    representativeVerse: '소망 중에 즐거워하며 기도에 항상 힘쓰라.',
    tone: 'gold',
  },
  {
    id: 'yerim',
    name: '윤예림',
    nickname: '예림씨앗',
    department: '아동부',
    role: '교사',
    verseRef: '빌립보서 4:13',
    representativeVerse: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.',
    tone: 'violet',
  },
  {
    id: 'subin',
    name: '강수빈',
    nickname: '수빈안내',
    department: '새가족부',
    role: '안내팀',
    verseRef: '마태복음 5:16',
    representativeVerse: '너희 빛이 사람 앞에 비치게 하라.',
    tone: 'teal',
  },
];

const highlightMethodOptions = [
  { id: 'underline', label: '밑줄', icon: Underline },
  { id: 'wave', label: '물결', icon: Waves },
  { id: 'circle', label: '동그라미', icon: Circle },
  { id: 'marker', label: '형광펜', icon: Highlighter },
];

const highlightColorOptions = [
  { id: 'red', label: '빨간색' },
  { id: 'yellow', label: '노란색' },
  { id: 'green', label: '초록색' },
  { id: 'blue', label: '파란색' },
];

const defaultHighlightStyle = { method: 'marker', color: 'yellow' };

const churchMessageMembers = [
  ...initialChurchConversations.map((conversation, index) => ({
    id: conversation.id,
    name: conversation.name,
    nickname: ['민서샘', '재윤길', '은지찬양'][index],
    department: conversation.department,
    role: conversation.role,
    verseRef: ['잠언 16:9', '시편 37:5', '시편 150:6'][index],
    representativeVerse: [
      '사람이 마음으로 자기의 길을 계획할지라도 그의 걸음을 인도하시는 이는 여호와시니라.',
      '네 길을 여호와께 맡기라 그를 의지하면 그가 이루시고.',
      '호흡이 있는 자마다 여호와를 찬양할지어다.',
    ][index],
    tone: ['violet', 'green', 'rose'][index % 3],
    churchId: 'grace-spring',
    churchName: churchInfo.name,
  })),
  ...churchDirectoryMembers.map((member) => ({
    ...member,
    churchId: 'grace-spring',
    churchName: churchInfo.name,
  })),
].sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));

const externalFriendMembers = [
  {
    id: 'jian-external',
    name: '서지안',
    nickname: '지안평안',
    department: '비공개',
    role: '비공개',
    churchId: 'new-light-central',
    churchName: '새빛중앙교회',
    verseRef: '요한복음 14:27',
    representativeVerse: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라.',
    tone: 'blue',
  },
];

const knownMessageMembers = [...churchMessageMembers, ...externalFriendMembers]
  .sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));

const initialDepartmentNodes = [
  { id: 'church-root', parentId: null, name: churchInfo.name, memberIds: churchMessageMembers.map(({ id }) => id) },
  { id: 'department-youth', parentId: 'church-root', name: '청년부', memberIds: ['minseo', 'harin', 'jihoon'] },
  { id: 'department-adult', parentId: 'church-root', name: '장년부', memberIds: ['doyun'] },
  { id: 'department-worship', parentId: 'church-root', name: '찬양팀', memberIds: ['eunji', 'seoyeon'] },
  { id: 'department-media', parentId: 'department-youth', name: '미디어팀', memberIds: ['jihoon'] },
];

const COMMUNITY_SCOPED_CACHE_VERSION = 1;
const SAMPLE_COMMUNITY_ID = 'grace-spring';

function isCommunityScopedCache(value) {
  return value?.scope === 'community'
    && value.version === COMMUNITY_SCOPED_CACHE_VERSION
    && value.byCommunity
    && typeof value.byCommunity === 'object';
}

function readCommunityScopedValue(storageKey, communityId, fallback) {
  const stored = readStoredValue(storageKey, null);
  if (isCommunityScopedCache(stored)) {
    return Object.prototype.hasOwnProperty.call(stored.byCommunity, communityId)
      ? stored.byCommunity[communityId]
      : fallback;
  }
  return communityId === SAMPLE_COMMUNITY_ID && stored !== null ? stored : fallback;
}

function writeCommunityScopedValue(storageKey, communityId, value) {
  if (!communityId) return;
  const stored = readStoredValue(storageKey, null);
  const byCommunity = isCommunityScopedCache(stored)
    ? { ...stored.byCommunity }
    : (stored === null ? {} : { [SAMPLE_COMMUNITY_ID]: stored });
  writeStoredValue(storageKey, {
    scope: 'community',
    version: COMMUNITY_SCOPED_CACHE_VERSION,
    byCommunity: { ...byCommunity, [communityId]: value },
  });
}

function createCommunityDepartmentDefaults(community) {
  if (community?.id === SAMPLE_COMMUNITY_ID) return initialDepartmentNodes;
  const communityId = community?.id ?? 'community';
  return [{
    id: `${communityId}-root`,
    parentId: null,
    name: community?.name ?? '공동체',
    memberIds: [],
  }];
}

function buildCommunityDepartmentNodes(community, serverWorkspace) {
  const hasCurrentServerWorkspace = isCurrentCommunityWorkspace(
    community?.id,
    serverWorkspace?.church?.id
  );
  if (!hasCurrentServerWorkspace) return createCommunityDepartmentDefaults(community);

  const membersByDepartment = new Map();
  serverWorkspace.members.forEach((member) => {
    if (!member.departmentId) return;
    membersByDepartment.set(member.departmentId, [
      ...(membersByDepartment.get(member.departmentId) ?? []),
      member.userId ?? member.id,
    ]);
  });
  if (!serverWorkspace.departments.length) {
    return [{
      id: `${community.id}-root`,
      parentId: null,
      name: community.name,
      memberIds: serverWorkspace.members.map((member) => member.userId ?? member.id),
    }];
  }
  const nodes = serverWorkspace.departments.map((department) => ({
    id: department.id,
    parentId: department.parentId ?? null,
    name: department.name,
    memberIds: membersByDepartment.get(department.id) ?? [],
  }));
  return assignUnassignedMembersToRoot(
    nodes,
    serverWorkspace.members.map((member) => member.userId ?? member.id)
  );
}

function buildCommunityMemberRoles(serverWorkspace, communityId) {
  if (serverWorkspace?.church?.id !== communityId) return {};
  return Object.fromEntries(serverWorkspace.members.map((member) => [member.userId ?? member.id, {
    title: member.title || (member.churchRole === 'admin' ? '공동체 관리자' : '구성원'),
    authority: member.churchRole === 'admin' ? '관리자' : undefined,
    managerDepartmentId: member.managedDepartmentIds?.[0] ?? null,
  }]));
}

function buildCommunityMembers(serverWorkspace, communityId) {
  if (serverWorkspace?.church?.id !== communityId) return [];
  const departmentNames = new Map(serverWorkspace.departments.map(({ id, name }) => [id, name]));
  return serverWorkspace.members.map((member) => ({
    ...member,
    id: member.userId ?? member.id,
    department: departmentNames.get(member.departmentId) ?? serverWorkspace.church?.name ?? '공동체',
    role: member.title || (member.churchRole === 'admin' ? '관리자' : '구성원'),
  }));
}

const initialWorshipPreparations = [
  {
    id: 'service-sunday-2',
    status: 'scheduled',
    title: weeklyPlan.service,
    coreVerse: weeklyPlan.passage,
    supportVerse: '요한복음 14:27',
    hymn: weeklyPlan.hymn,
    content: weeklyPlan.theme,
    pastor: churchInfo.pastor,
    serviceDate: weeklyPlan.time,
    createdAt: weeklyPlan.time,
    communityId: 'grace-spring',
  },
];

const initialChurchAnnouncements = [
  {
    id: 'announcement-cell',
    title: '이번 주 셀모임 안내',
    content: churchInfo.notice,
    author: churchInfo.pastor,
    time: '오늘',
    communityId: 'grace-spring',
  },
  {
    id: 'announcement-worship-time',
    title: '주일 예배 시간 안내',
    content: '이번 주 주일 2부 예배는 오전 11시에 시작합니다.',
    author: churchInfo.pastor,
    time: '어제',
    communityId: 'grace-spring',
  },
  {
    id: 'announcement-parking',
    title: '주차장 이용 안내',
    content: '교회 주차장이 혼잡할 수 있으니 가급적 대중교통을 이용해 주세요.',
    author: '교회 사무실',
    time: '3일 전',
    communityId: 'grace-spring',
  },
  {
    id: 'announcement-prayer',
    title: '금요 기도회 안내',
    content: '금요일 오후 8시 본당에서 함께 기도합니다.',
    author: '예배부',
    time: '5일 전',
    communityId: 'grace-spring',
  },
];

const initialChurchJoinRequests = [
  {
    id: 'join-yuna',
    name: '박유나',
    nickname: '유나별',
    department: '미지정',
    role: '등록 대기',
    verseRef: '시편 23:1',
    representativeVerse: '여호와는 나의 목자시니 내게 부족함이 없으리로다.',
    tone: 'blue',
    requestedAt: '오늘 오전 9:20',
  },
  {
    id: 'join-hyeonwoo',
    name: '이현우',
    nickname: '현우길',
    department: '미지정',
    role: '등록 대기',
    verseRef: '잠언 3:6',
    representativeVerse: '너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라.',
    tone: 'green',
    requestedAt: '어제 오후 7:42',
  },
];

function getConversationParticipantIds(conversation) {
  return conversation.participantIds ?? [conversation.id];
}

function getConversationParticipants(participantIds, members = knownMessageMembers) {
  return members
    .filter((member) => participantIds.includes(member.id))
    .sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));
}

function getConversationDetails(participantIds, customName = '', members = knownMessageMembers) {
  const participants = getConversationParticipants(participantIds, members);
  const firstParticipant = participants[0];
  const isGroup = participants.length > 1;
  const normalizedCustomName = isGroup ? customName.trim() : '';
  const automaticName = isGroup
    ? `${firstParticipant.name} 외 ${participants.length - 1}명`
    : (firstParticipant?.name ?? '대화방');

  return {
    name: normalizedCustomName || automaticName,
    customName: normalizedCustomName,
    department: isGroup ? '단체 채팅' : (firstParticipant?.department ?? churchInfo.department),
    role: isGroup ? `${participants.length}명` : (firstParticipant?.role ?? '교인'),
  };
}

const tabs = [
  { id: 'bible', label: '성경', icon: BookOpen },
  { id: 'church', label: '공동체', icon: Users },
  { id: 'home', label: '홈', icon: Home },
  { id: 'messages', label: '메시지', icon: MessageCircle },
  { id: 'profile', label: '개인', icon: UserRound },
];

function normalizeVerseHighlights(stored) {
  if (Array.isArray(stored)) {
    return Object.fromEntries(stored.map((verseId) => [verseId, { ...defaultHighlightStyle }]));
  }
  if (!stored || typeof stored !== 'object') return {};
  return Object.fromEntries(Object.entries(stored).map(([verseId, style]) => (
    [verseId, normalizeHighlightStyle(style)]
  )));
}

function normalizeHighlightStyle(stored) {
  const storedMethod = stored?.method === 'pencil' ? 'wave' : stored?.method;
  const methodExists = highlightMethodOptions.some(({ id }) => id === storedMethod);
  const colorExists = highlightColorOptions.some(({ id }) => id === stored?.color);
  return {
    method: methodExists ? storedMethod : defaultHighlightStyle.method,
    color: colorExists ? stored.color : defaultHighlightStyle.color,
  };
}

const HOME_CHAT_STORAGE_KEY = 'bibleon.homeChatRoomsV1';
const HOME_CHAT_ACTIVE_KEY = 'bibleon.activeHomeChatV1';
const HOME_CHAT_LEGACY_KEY = 'bibleon.homeTestMessagesV2';
const HOME_CHAT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_ONBOARDING_STORAGE_KEY = 'bibleon.accountOnboardingV1';
const FREE_DAILY_CHAT_TOKEN_LIMIT = 2000;
const PLUS_DAILY_CHAT_TOKEN_LIMIT = FREE_DAILY_CHAT_TOKEN_LIMIT * 10;
const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  dailyVerse: true,
  readingReminder: true,
});
const PLUS_FEATURES = [
  { id: 'analysis', title: '성경 분석', description: '절을 길게 눌러 근거와 함께 분석해요.', icon: Search },
  { id: 'bible-memo', title: '성경 메모', description: '말씀마다 나만의 기록을 이어서 남겨요.', icon: NotebookPen },
  { id: 'chat-limit', title: '채팅 한도 10배', description: '하루 질문 토큰을 기본 한도의 10배로 늘려요.', icon: MessageCircle },
  { id: 'worship-memo', title: '예배 메모', description: '예배별 메모를 모아 다시 확인해요.', icon: PenLine },
  { id: 'worship-summary', title: '예배 음성 요약', description: '예배 음성을 기록하고 핵심 내용을 정리해요.', icon: AudioLines },
  { id: 'theme', title: '테마 커스터마이즈', description: '배경과 강조에 쓰이는 다섯 색조를 각각 바꿔요.', icon: Palette },
];
const THEME_TONE_OPTIONS = Object.freeze([
  { id: 'pale', label: '배경', description: '앱 배경과 가장 옅은 면', cssVariable: '--theme-pale-hue', previewVariable: '--accent-pale', defaultHue: 255, saturation: 46, lightness: 95 },
  { id: 'soft', label: '옅은 강조', description: '선택 배경과 부드러운 강조', cssVariable: '--theme-soft-hue', previewVariable: '--accent-soft', defaultHue: 256, saturation: 49, lightness: 92 },
  { id: 'accent', label: '기본 강조', description: '아이콘과 진행 표시', cssVariable: '--theme-accent-hue', previewVariable: '--accent', defaultHue: 254, saturation: 30, lightness: 70 },
  { id: 'deep', label: '진한 강조', description: '주요 버튼과 활성 상태', cssVariable: '--theme-deep-hue', previewVariable: '--accent-deep', defaultHue: 246, saturation: 39, lightness: 43 },
  { id: 'dark', label: '강한 강조', description: '가장 높은 대비의 포인트', cssVariable: '--theme-dark-hue', previewVariable: '--accent-dark', defaultHue: 247, saturation: 40, lightness: 31 },
]);
const DEFAULT_THEME_PALETTE = Object.freeze(Object.fromEntries(
  THEME_TONE_OPTIONS.map(({ id, defaultHue }) => [id, defaultHue])
));
const LEGACY_THEME_HUES = Object.freeze({
  violet: DEFAULT_THEME_PALETTE,
  mint: Object.freeze({ pale: 165, soft: 168, accent: 168, deep: 168, dark: 169 }),
  rose: Object.freeze({ pale: 345, soft: 339, accent: 340, deep: 341, dark: 340 }),
  sky: Object.freeze({ pale: 209, soft: 207, accent: 208, deep: 210, dark: 208 }),
});

function normalizeThemeHue(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(((parsed % 360) + 360) % 360);
}

function normalizeThemePalette(value, legacyTheme = 'violet') {
  const legacyPalette = LEGACY_THEME_HUES[legacyTheme] ?? DEFAULT_THEME_PALETTE;
  return Object.fromEntries(THEME_TONE_OPTIONS.map(({ id }) => [
    id,
    normalizeThemeHue(value?.[id], legacyPalette[id]),
  ]));
}

function normalizeNotificationPreferences(value) {
  return {
    dailyVerse: value?.dailyVerse ?? DEFAULT_NOTIFICATION_PREFERENCES.dailyVerse,
    readingReminder: value?.readingReminder ?? DEFAULT_NOTIFICATION_PREFERENCES.readingReminder,
  };
}

function normalizeChatUsage(value) {
  const date = getSeoulDateKey();
  if (value?.date !== date) return { date, tokens: 0 };
  return { date, tokens: Math.max(0, Number(value.tokens) || 0) };
}

function estimateChatTokens(text) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 2.5) + 24);
}

function buildGuidanceNotifications(preferences, readingReminderDays) {
  const items = [];
  if (preferences.dailyVerse) {
    items.push({
      id: 'notice-daily-verse',
      type: '말씀 추천',
      title: '오늘의 추천 말씀이에요!',
      body: '시편 23편 1절을 천천히 읽어보세요.',
      time: '오늘',
      icon: Sparkles,
      unread: true,
      destination: { tab: 'bible', kind: 'verse', reference: '시편 23:1' },
    });
  }
  if (preferences.readingReminder && readingReminderDays >= 1) {
    items.push({
      id: 'notice-reading-reminder',
      type: '읽기 알림',
      title: `마지막으로 성경을 읽으신 지 ${readingReminderDays}일이 지났어요.`,
      body: '잠시 시간을 내어 마지막 말씀부터 이어 읽어보세요.',
      time: '오늘',
      icon: BookOpen,
      unread: true,
      destination: { tab: 'bible', kind: 'continue' },
    });
  }
  return items;
}

const APP_TUTORIAL_STEPS = [
  {
    scope: 'home',
    target: 'home-chatbot',
    title: '바이블온 채팅',
    description: '말씀을 찾거나 마음을 나누고 싶을 때 이곳에 편하게 질문하세요.',
  },
  {
    scope: 'home',
    target: 'chat-history',
    title: '지난 대화',
    description: '이전에 나눈 대화를 다시 열거나 새 대화를 시작할 수 있어요.',
  },
  {
    scope: 'home',
    target: 'bottom-navigation',
    title: '하단 메뉴',
    description: '성경, 공동체, 홈, 메시지, 개인 화면을 이곳에서 전환할 수 있어요.',
  },
  {
    scope: 'bible',
    target: 'bible-switcher',
    title: '성경 변경',
    description: '책과 장을 빠르게 바꾸고 원하는 번역으로 읽을 수 있어요.',
  },
  {
    scope: 'bible',
    target: 'verse-interactions',
    title: '절 상호작용',
    description: '두 번 탭하면 읽음 상태가 바뀌고, 길게 누르면 메모·강조·전달·분석이 열려요.',
  },
  {
    scope: 'bible',
    target: 'verse-read-practice',
    title: '읽음 표시',
    description: '이 절을 두 번 눌러 읽음으로 표시한 뒤, 다시 두 번 눌러 읽음 표시를 취소해 보세요.',
    interaction: 'read-cycle',
  },
  {
    scope: 'bible',
    target: 'verse-action-practice',
    title: '절 옵션',
    description: '이 절을 꾹 눌러 옵션 말풍선을 열어보세요.',
    interaction: 'long-press',
  },
  {
    scope: 'bible',
    target: 'recent-passages',
    title: '최근 읽은 성경',
    description: '최근 읽던 책과 장을 좌우로 살펴보고 곧바로 이어 읽을 수 있어요.',
  },
];

const HOME_TUTORIAL_START = APP_TUTORIAL_STEPS.findIndex(({ scope }) => scope === 'home');
const BIBLE_TUTORIAL_START = APP_TUTORIAL_STEPS.findIndex(({ scope }) => scope === 'bible');
const BIBLE_READ_PRACTICE_STEP = APP_TUTORIAL_STEPS.findIndex(({ interaction }) => interaction === 'read-cycle');
const BIBLE_ACTION_PRACTICE_STEP = APP_TUTORIAL_STEPS.findIndex(({ interaction }) => interaction === 'long-press');

function makeHomeChatTitle(messages) {
  const firstQuestion = messages.find(({ role }) => role === 'user')?.text?.trim() ?? '';
  if (!firstQuestion) return '새 대화';
  return firstQuestion.length > 30 ? `${firstQuestion.slice(0, 30)}...` : firstQuestion;
}

function purgeExpiredHomeChats(rooms, now = Date.now()) {
  return rooms.filter((room) => (
    !room.deletedAt || now - room.deletedAt < HOME_CHAT_DELETE_RETENTION_MS
  ));
}

function loadHomeChatRooms() {
  const storedRooms = readStoredValue(HOME_CHAT_STORAGE_KEY, null);
  if (Array.isArray(storedRooms)) return purgeExpiredHomeChats(storedRooms);

  const legacyMessages = readStoredValue(HOME_CHAT_LEGACY_KEY, []);
  if (!Array.isArray(legacyMessages) || legacyMessages.length === 0) return [];

  const createdAt = Date.now();
  return [{
    id: `home-chat-migrated-${createdAt}`,
    title: makeHomeChatTitle(legacyMessages),
    messages: legacyMessages,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }];
}

function formatHomeChatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));

  if (dayDifference === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  }
  if (dayDifference === 1) return '어제';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

const READ_VERSES_STORAGE_KEY = 'bibleon.readVerseIdsV2';
const CHAPTER_POPULARITY_STORAGE_KEY = 'bibleon.versePopularityV1';
const READING_STATE_STORAGE_KEY = 'bibleon.readingStateV1';
const READING_PROGRESS_HISTORY_KEY = 'bibleon.readingProgressHistoryV1';
const ACHIEVEMENTS_STORAGE_KEY = 'bibleon.achievementsV1';

function getSeoulDateKey(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function getPastSeoulDateKey(daysAgo) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return getSeoulDateKey(date);
}

function buildPopularityRankings(popularityData) {
  const periods = {
    today: { label: '오늘', dayOffsets: [1] },
    week: { label: '이번 주', dayOffsets: Array.from({ length: 7 }, (_, index) => index + 1) },
    month: { label: '이번 달', dayOffsets: Array.from({ length: 30 }, (_, index) => index + 1) },
  };
  return Object.fromEntries(Object.entries(periods).map(([periodId, period]) => {
    const dateKeys = period.dayOffsets.map((offset) => getPastSeoulDateKey(offset));
    const items = rankChapterPopularity(popularityData, dateKeys, 5);
    return [periodId, { ...period, items }];
  }));
}

function buildReadingGrowthData(history, currentProgress) {
  const points = history?.points ?? {};
  const sortedEntries = Object.entries(points).sort(([left], [right]) => left.localeCompare(right));
  const valueAt = (dateKey) => {
    const match = sortedEntries.filter(([key]) => key <= dateKey).at(-1);
    return match ? Number(match[1]) : 0;
  };
  const makePoint = (daysAgo, label) => ({ label, value: valueAt(getPastSeoulDateKey(daysAgo)) });
  const daily = Array.from({ length: 7 }, (_, index) => {
    const daysAgo = 6 - index;
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return makePoint(daysAgo, date.toLocaleDateString('ko-KR', { weekday: 'short' }).slice(0, 1));
  });
  const weekly = Array.from({ length: 6 }, (_, index) => makePoint((5 - index) * 7, `${index + 1}주`));
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return { label: `${date.getMonth() + 1}월`, value: valueAt(getSeoulDateKey(date)) };
  });
  daily[daily.length - 1].value = currentProgress;
  weekly[weekly.length - 1].value = currentProgress;
  monthly[monthly.length - 1].value = currentProgress;
  return {
    daily: { label: '일간', items: daily },
    weekly: { label: '주간', items: weekly },
    monthly: { label: '월간', items: monthly },
  };
}

function useHeavyOverscroll(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const releaseTimers = new WeakMap();
    let touchGesture = null;

    const findScrollable = (start) => {
      let current = start instanceof Element ? start : start?.parentElement;
      while (current && current !== root) {
        const { overflowY } = window.getComputedStyle(current);
        if (/(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight + 1) return current;
        current = current.parentElement;
      }
      return null;
    };

    const release = (target, delay = 0) => {
      if (!target) return;
      window.clearTimeout(releaseTimers.get(target));
      const timerId = window.setTimeout(() => {
        target.classList.add('is-heavy-overscroll-releasing');
        target.style.setProperty('--heavy-overscroll-shift', '0px');
        const cleanupId = window.setTimeout(() => {
          target.classList.remove('is-heavy-overscrolling', 'is-heavy-overscroll-releasing');
          target.style.removeProperty('--heavy-overscroll-shift');
        }, 280);
        releaseTimers.set(target, cleanupId);
      }, delay);
      releaseTimers.set(target, timerId);
    };

    const stretch = (target, distance, direction) => {
      const dampedDistance = Math.min(18, Math.sqrt(Math.abs(distance)) * 2.15);
      target.classList.remove('is-heavy-overscroll-releasing');
      target.classList.add('is-heavy-overscrolling');
      target.style.setProperty('--heavy-overscroll-shift', `${dampedDistance * direction}px`);
    };

    const onTouchStart = (event) => {
      const touch = event.touches[0];
      const target = findScrollable(event.target);
      if (!touch || !target) return;
      touchGesture = { target, startY: touch.clientY };
    };

    const onTouchMove = (event) => {
      if (!touchGesture) return;
      const touch = event.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - touchGesture.startY;
      const { target } = touchGesture;
      const atTop = target.scrollTop <= 0;
      const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) stretch(target, deltaY, deltaY > 0 ? 1 : -1);
      else release(target);
    };

    const onTouchEnd = () => {
      release(touchGesture?.target);
      touchGesture = null;
    };

    const onWheel = (event) => {
      const target = findScrollable(event.target);
      if (!target) return;
      const atTop = target.scrollTop <= 0 && event.deltaY < 0;
      const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1 && event.deltaY > 0;
      if (!atTop && !atBottom) return;
      stretch(target, Math.min(Math.abs(event.deltaY), 24), atTop ? 1 : -1);
      release(target, 70);
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    root.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
    root.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => {
      root.removeEventListener('touchstart', onTouchStart, { capture: true });
      root.removeEventListener('touchmove', onTouchMove, { capture: true });
      root.removeEventListener('touchend', onTouchEnd, { capture: true });
      root.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      root.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [rootRef]);
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const tutorialPreviewMode = searchParams.get('tutorial') === '1';
  const plusPreviewMode = searchParams.get('plus') === '1';
  const developmentPlusMode = import.meta.env.DEV
    || window.location.hostname === 'bibleon-staging.ingkko.chatgpt.site';
  const appShellRef = useRef(null);
  const workspaceRef = useRef(null);
  const tutorialSnapshotRef = useRef(null);
  const tutorialAdvanceTimerRef = useRef(null);
  const tutorialPreviewCompletedScopesRef = useRef(new Set());
  const initialHomeChatRoomsRef = useRef(null);
  const sharedDataRequestRef = useRef(0);
  if (initialHomeChatRoomsRef.current === null) {
    initialHomeChatRoomsRef.current = loadHomeChatRooms();
  }
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState('');
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const [isHomeIntro, setIsHomeIntro] = useState(true);
  const [isHomeGradientVisible, setIsHomeGradientVisible] = useState(false);
  const [isHomeReturning, setIsHomeReturning] = useState(false);
  const [themePreference, setThemePreference] = useState(() => readStoredValue('bibleon.themePreference', 'light'));
  const [themeControlMode, setThemeControlMode] = useState(() => readStoredValue(
    'bibleon.themeControlMode',
    ['system', 'schedule'].includes(readStoredValue('bibleon.themePreference', 'light'))
      ? readStoredValue('bibleon.themePreference', 'light')
      : 'always'
  ));
  const [darkModeStart, setDarkModeStart] = useState(() => readStoredValue('bibleon.darkModeStart', '21:00'));
  const [darkModeEnd, setDarkModeEnd] = useState(() => readStoredValue('bibleon.darkModeEnd', '07:00'));
  const [activeTab, setActiveTab] = useState('home');
  const [bibleNavigationTarget, setBibleNavigationTarget] = useState(null);
  const [messageNavigationTarget, setMessageNavigationTarget] = useState(null);
  const [churchNavigationTarget, setChurchNavigationTarget] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState('philippians');
  const [selectedChapter, setSelectedChapter] = useState(4);
  const [selectedTranslation, setSelectedTranslation] = useState(() => (
    readStoredValue('bibleon.defaultTranslation', 'KRV')
  ));
  const [accountOnboarding, setAccountOnboarding] = useState(() => (
    readStoredValue(ACCOUNT_ONBOARDING_STORAGE_KEY, {})
  ));
  const [subscription, setSubscription] = useState({ plan: 'free', status: 'inactive', currentPeriodEnd: null });
  const [plusSheetFeature, setPlusSheetFeature] = useState('');
  const [chatAdVisible, setChatAdVisible] = useState(true);
  const [memoViewMode, setMemoViewMode] = useState(() => normalizeMemoViewMode(
    readStoredValue(ACCOUNT_ONBOARDING_STORAGE_KEY, {}).memoViewMode
  ));
  const [appTutorialStep, setAppTutorialStep] = useState(null);
  const [tutorialReadVerseIds, setTutorialReadVerseIds] = useState([]);
  const [tutorialReadPhase, setTutorialReadPhase] = useState(0);
  const [tutorialLongPressDone, setTutorialLongPressDone] = useState(false);
  const [selectedRef, setSelectedRef] = useState('빌립보서 4:6');
  const [favoriteRefs] = useState(['시편 23:1']);
  const [readVerseIds, setReadVerseIds] = useState(() => readStoredValue(READ_VERSES_STORAGE_KEY, []));
  const [bibleVerseTotal, setBibleVerseTotal] = useState(0);
  const [readingState, setReadingState] = useState(() => readStoredValue(READING_STATE_STORAGE_KEY, { cycle: 1, eligible: true }));
  const [readingProgressHistory, setReadingProgressHistory] = useState(() => readStoredValue(READING_PROGRESS_HISTORY_KEY, { cycle: 1, points: {} }));
  const [achievements, setAchievements] = useState(() => readStoredValue(ACHIEVEMENTS_STORAGE_KEY, []));
  const [completionCelebration, setCompletionCelebration] = useState(null);
  const [popularityData, setPopularityData] = useState(() => normalizeChapterPopularityData(
    readStoredValue(CHAPTER_POPULARITY_STORAGE_KEY, createEmptyChapterPopularityData())
  ));
  const [query, setQuery] = useState('');
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState(communityPosts);
  const [conversations, setConversations] = useState(() => readStoredValue('bibleon.churchConversations', initialChurchConversations));
  const [qtRooms, setQtRooms] = useState(() => readStoredValue('bibleon.qtRooms', initialQtRooms));
  const [isHomeChatOpen, setIsHomeChatOpen] = useState(false);
  const [homeChatHistoryOpen, setHomeChatHistoryOpen] = useState(false);
  const [messageFriendsMenuOpen, setMessageFriendsMenuOpen] = useState(false);
  const [homeChatRooms, setHomeChatRooms] = useState(() => initialHomeChatRoomsRef.current);
  const [activeHomeChatId, setActiveHomeChatId] = useState(() => {
    const storedActiveId = readStoredValue(HOME_CHAT_ACTIVE_KEY, '');
    const availableRooms = initialHomeChatRoomsRef.current.filter(({ deletedAt }) => !deletedAt);
    return availableRooms.some(({ id }) => id === storedActiveId)
      ? storedActiveId
      : (availableRooms[0]?.id ?? '');
  });
  const [personalProfile, setPersonalProfile] = useState(() => ({
    ...defaultPersonalProfile,
    ...readStoredValue('bibleon.personalProfile', {}),
  }));
  const [currentChurchId, setCurrentChurchId] = useState(() => readStoredValue(CURRENT_CHURCH_STORAGE_KEY, 'grace-spring'));
  const [communityIds, setCommunityIds] = useState(() => {
    const storedIds = readStoredValue(COMMUNITY_IDS_STORAGE_KEY, []);
    if (Array.isArray(storedIds) && storedIds.length) return [...new Set(storedIds)].slice(0, MAX_COMMUNITIES);
    const legacyId = readStoredValue(CURRENT_CHURCH_STORAGE_KEY, 'grace-spring');
    return legacyId ? [legacyId] : [];
  });
  const [churchProfiles, setChurchProfiles] = useState(() => readStoredValue(CHURCH_PROFILES_STORAGE_KEY, {}));
  const [churchAccess, setChurchAccess] = useState(() => ({
    authority: churchInfo.authority,
    managerDepartmentId: churchInfo.managerDepartmentId ?? '',
    ...readStoredValue('bibleon.currentChurchAccess', {}),
  }));
  const [verseNotes, setVerseNotes] = useState(() => readStoredValue('bibleon.verseNotes', {}));
  const [verseNoteMeta, setVerseNoteMeta] = useState(() => readStoredValue('bibleon.verseNoteMeta', {}));
  const [memoComments, setMemoComments] = useState(() => {
    const onboarding = readStoredValue(ACCOUNT_ONBOARDING_STORAGE_KEY, {});
    return normalizeMemoComments(
      onboarding.memoCommentsV1,
      readStoredValue('bibleon.verseNotes', {}),
      readStoredValue('bibleon.verseNoteMeta', {}),
      onboarding.memoCommentsVersion === 1
    );
  });
  const [verseHighlights, setVerseHighlights] = useState(() => (
    normalizeVerseHighlights(readStoredValue('bibleon.highlightedVerses', {}))
  ));
  const [lastHighlightStyle, setLastHighlightStyle] = useState(() => (
    normalizeHighlightStyle(readStoredValue('bibleon.lastHighlightStyle', defaultHighlightStyle))
  ));
  const [accountSyncReady, setAccountSyncReady] = useState(false);
  const [personalSyncReady, setPersonalSyncReady] = useState(false);
  const [currentAccountUser, setCurrentAccountUser] = useState(null);
  const [messageMembers, setMessageMembers] = useState(knownMessageMembers);
  const [serverChurchWorkspace, setServerChurchWorkspace] = useState(null);

  const isPlus = developmentPlusMode || plusPreviewMode || subscription.plan === 'plus';
  const notificationPreferences = normalizeNotificationPreferences(accountOnboarding.notificationPreferences);
  const themePalette = useMemo(() => (
    isPlus
      ? normalizeThemePalette(accountOnboarding.themePalette, accountOnboarding.accentTheme)
      : { ...DEFAULT_THEME_PALETTE }
  ), [accountOnboarding.accentTheme, accountOnboarding.themePalette, isPlus]);
  const chatUsage = normalizeChatUsage(accountOnboarding.chatUsage);
  const chatTokenLimit = isPlus ? PLUS_DAILY_CHAT_TOKEN_LIMIT : FREE_DAILY_CHAT_TOKEN_LIMIT;
  const lastBibleReadAt = Number(accountOnboarding.lastBibleReadAt) || 0;
  const readingReminderDays = lastBibleReadAt
    ? Math.max(0, Math.floor((Date.now() - lastBibleReadAt) / (24 * 60 * 60 * 1000)))
    : 0;
  const currentTutorialStep = appTutorialStep === null ? null : APP_TUTORIAL_STEPS[appTutorialStep];
  const activeTutorialScope = currentTutorialStep?.scope ?? null;

  const selectedBook = bibleBooks.find((book) => book.id === selectedBookId) ?? bibleBooks[0];
  const currentChurch = useMemo(() => (
    getRegisteredChurches(churchProfiles).find(({ id }) => id === currentChurchId) ?? null
  ), [churchProfiles, currentChurchId]);
  const currentCommunities = useMemo(() => {
    const profilesById = new Map(getRegisteredChurches(churchProfiles).map((community) => [community.id, community]));
    return communityIds.map((id) => profilesById.get(id)).filter(Boolean);
  }, [churchProfiles, communityIds]);
  const representativeCommunity = personalProfile.primaryCommunityId
    ? (currentCommunities.find(({ id }) => id === personalProfile.primaryCommunityId) ?? currentCommunities[0] ?? null)
    : null;
  const activeHomeChat = homeChatRooms.find((room) => (
    room.id === activeHomeChatId && !room.deletedAt
  ));
  const homeRagMessages = activeHomeChat?.messages ?? [];
  const readVerseCount = new Set(readVerseIds).size;
  const readingProgress = bibleVerseTotal
    ? Math.min(100, Math.round((readVerseCount / bibleVerseTotal) * 10000) / 100)
    : 0;
  const popularityRankings = useMemo(() => buildPopularityRankings(popularityData), [popularityData]);
  const readingGrowthData = useMemo(
    () => buildReadingGrowthData(readingProgressHistory, readingProgress),
    [readingProgress, readingProgressHistory]
  );
  useHeavyOverscroll(appShellRef);

  useEffect(() => {
    if (appTutorialStep !== null || (!tutorialPreviewMode && !accountSyncReady)) return;
    const scope = activeTab === 'home' ? 'home' : activeTab === 'bible' ? 'bible' : null;
    if (!scope) return;
    const completionKey = scope === 'home' ? 'homeTutorialCompletedAt' : 'bibleTutorialCompletedAt';
    const completed = tutorialPreviewMode
      ? tutorialPreviewCompletedScopesRef.current.has(scope)
      : Boolean(accountOnboarding[completionKey] || accountOnboarding.appTutorialCompletedAt);
    if (!completed) setAppTutorialStep(scope === 'home' ? HOME_TUTORIAL_START : BIBLE_TUTORIAL_START);
  }, [accountOnboarding, accountSyncReady, activeTab, appTutorialStep, tutorialPreviewMode]);

  useEffect(() => {
    if (!accountRepository.configured) return undefined;
    let active = true;

    Promise.all([
      accountRepository.loadCurrentAccount(),
      personalDataRepository.loadCurrent().catch(() => null),
      subscriptionRepository.loadCurrent().catch(() => null),
    ]).then(async ([account, personal, currentSubscription]) => {
      if (!active || !account) return;
      setCurrentAccountUser(account.user);
      if (currentSubscription) setSubscription(currentSubscription);
      if (account.profile) {
        const profile = { ...account.profile };
        if (profile.avatarPath) {
          profile.avatarImage = await createSignedMediaUrl({ bucket: 'avatars', path: profile.avatarPath }).catch(() => '');
        }
        setPersonalProfile((current) => ({ ...current, ...profile }));
      }
      const localOnboarding = readStoredValue(ACCOUNT_ONBOARDING_STORAGE_KEY, {});
      const remoteOnboarding = account.preferences?.onboarding ?? {};
      const mergedOnboarding = { ...localOnboarding, ...remoteOnboarding };
      setAccountOnboarding(mergedOnboarding);
      setMemoViewMode(normalizeMemoViewMode(mergedOnboarding.memoViewMode));
      const loadedLegacyNotes = personal?.hasRemoteData ? personal.verseNotes : readStoredValue('bibleon.verseNotes', {});
      const loadedLegacyMeta = personal?.hasRemoteData ? personal.verseNoteMeta : readStoredValue('bibleon.verseNoteMeta', {});
      setMemoComments(normalizeMemoComments(
        mergedOnboarding.memoCommentsV1,
        loadedLegacyNotes,
        loadedLegacyMeta,
        mergedOnboarding.memoCommentsVersion === 1
      ));
      if (account.preferences) {
        const preference = account.preferences;
        if (['KRV', 'RNKSV'].includes(preference.defaultTranslation)) {
          setSelectedTranslation(preference.defaultTranslation);
        }
        if (['light', 'dark', 'system', 'schedule'].includes(preference.themePreference)) {
          setThemePreference(preference.themePreference);
        }
        if (['always', 'system', 'schedule'].includes(preference.themeControlMode)) {
          setThemeControlMode(preference.themeControlMode);
        }
        if (preference.darkModeStart) setDarkModeStart(preference.darkModeStart);
        if (preference.darkModeEnd) setDarkModeEnd(preference.darkModeEnd);
      }
      if (personal?.hasRemoteData) {
        setReadVerseIds(personal.readVerseIds);
        setReadingState(personal.readingState);
        setReadingProgressHistory(personal.readingProgressHistory);
        setVerseNotes(personal.verseNotes);
        setVerseNoteMeta((current) => Object.fromEntries(Object.entries(personal.verseNoteMeta).map(([id, meta]) => [
          id, { ...current[id], ...meta },
        ])));
        setVerseHighlights(normalizeVerseHighlights(personal.verseHighlights));
        setAchievements(personal.achievements);
        setHomeChatRooms(personal.homeChatRooms);
        setActiveHomeChatId((current) => (
          personal.homeChatRooms.some(({ id, deletedAt }) => id === current && !deletedAt)
            ? current
            : (personal.homeChatRooms.find(({ deletedAt }) => !deletedAt)?.id ?? '')
        ));
      }
      setAccountSyncReady(true);
      setPersonalSyncReady(true);
    }).catch(() => {
      // Local data remains available when the account service is temporarily unavailable.
    });

    return () => { active = false; };
  }, []);

  const refreshSharedData = useCallback(async () => {
    if (!currentAccountUser) return;
    const requestId = sharedDataRequestRef.current + 1;
    sharedDataRequestRef.current = requestId;
    const [workspace, messaging, friendships] = await Promise.all([
      churchRepository.loadWorkspace(currentChurchId).catch(() => null),
      messageRepository.loadCurrent(),
      friendRepository.list().catch(() => []),
    ]);
    if (requestId !== sharedDataRequestRef.current) return;
    if (workspace) {
      const remoteCommunityProfiles = await Promise.all((workspace.communities ?? []).map(async (community) => ({
        ...community,
        createdByAdmin: true,
        profileImage: community.profileImagePath
          ? await createSignedMediaUrl({ bucket: 'church-media', path: community.profileImagePath }).catch(() => '')
          : '',
      })));
      if (requestId !== sharedDataRequestRef.current) return;
      setServerChurchWorkspace(workspace);
      setCommunityIds(remoteCommunityProfiles.map(({ id }) => id).slice(0, MAX_COMMUNITIES));
      setChurchProfiles((current) => ({
        ...current,
        ...Object.fromEntries(remoteCommunityProfiles.map((community) => [community.id, community])),
      }));
      if (workspace.church) {
        setCurrentChurchId(workspace.church.id);
        const managedDepartmentId = workspace.members.find(({ userId }) => userId === currentAccountUser.id)
          ?.managedDepartmentIds?.[0] ?? '';
        setChurchAccess({
          authority: workspace.membership.church_role === 'admin' ? '관리자' : (managedDepartmentId ? '부서 관리자' : '성도'),
          managerDepartmentId: managedDepartmentId,
        });
      } else {
        setCurrentChurchId('');
        setChurchAccess({ authority: '성도', managerDepartmentId: '' });
      }
    }
    const viewModel = buildMessageViewModel(messaging, workspace);
    const friendMembers = friendships
      .filter(({ status, profile }) => status === 'accepted' && profile)
      .map(({ profile }) => ({
        id: profile.id,
        name: profile.display_name,
        nickname: profile.nickname ?? '',
        avatarPath: profile.avatar_path ?? '',
        department: '', role: '친구',
        verseRef: profile.representative_verse_ref ?? '',
        representativeVerse: profile.representative_verse_text ?? '',
        tone: 'violet',
      }));
    const uniqueMembers = new Map([...viewModel.members, ...friendMembers].map((member) => [member.id, member]));
    if (requestId !== sharedDataRequestRef.current) return;
    setMessageMembers([...uniqueMembers.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')));
    setConversations(viewModel.conversations);
    setQtRooms(viewModel.qtRooms);
  }, [currentAccountUser?.id, currentChurchId]);

  useEffect(() => {
    if (!currentAccountUser) return undefined;
    refreshSharedData().catch(() => {});
    return undefined;
  }, [currentAccountUser?.id, refreshSharedData]);

  const conversationSubscriptionKey = [...conversations, ...qtRooms]
    .map(({ id }) => id).sort().join(',');

  useEffect(() => {
    if (!currentAccountUser) return undefined;
    const unsubscribeMessages = messageRepository.subscribe(
      conversationSubscriptionKey ? conversationSubscriptionKey.split(',') : [],
      () => refreshSharedData().catch(() => {})
    );
    const unsubscribeChurch = churchRepository.subscribe(
      serverChurchWorkspace?.church?.id,
      () => refreshSharedData().catch(() => {})
    );
    return () => { unsubscribeMessages(); unsubscribeChurch(); };
  }, [conversationSubscriptionKey, currentAccountUser?.id, refreshSharedData, serverChurchWorkspace?.church?.id]);

  useEffect(() => {
    if (!accountRepository.configured) return undefined;
    const retry = () => accountRepository.retryPendingMutations().catch(() => {});
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => writeStoredValue('bibleon.currentChurchAccess', churchAccess), [churchAccess]);

  useEffect(() => {
    let active = true;

    const preloadBibleData = async () => {
      setIsAppLoading(true);
      setLoadingError('');
      setLoadingProgress(0);
      const startedAt = Date.now();

      try {
        await preloadBible(['KRV', 'RNKSV'], (completed, total) => {
          if (active) setLoadingProgress(Math.round((completed / total) * 100));
        });
        const verseTotal = await getBibleVerseCount('KRV');
        if (active) setBibleVerseTotal(verseTotal);
        const remainingMinimumTime = Math.max(0, 700 - (Date.now() - startedAt));
        if (remainingMinimumTime > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingMinimumTime));
        }
        if (!active) return;
        setLoadingProgress(100);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        if (active) setIsAppLoading(false);
      } catch {
        if (active) setLoadingError('성경 본문을 불러오지 못했어요.');
      }
    };

    preloadBibleData();
    return () => { active = false; };
  }, [loadingAttempt]);

  useEffect(() => {
    if (isAppLoading) return undefined;
    setIsHomeGradientVisible(true);
    const returnTimerId = window.setTimeout(() => {
      setIsHomeIntro(false);
      setIsHomeReturning(true);
    }, 1600);
    const settleTimerId = window.setTimeout(() => setIsHomeReturning(false), 2600);

    return () => {
      window.clearTimeout(returnTimerId);
      window.clearTimeout(settleTimerId);
    };
  }, [isAppLoading]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      let resolvedTheme = themePreference;
      if (themePreference === 'system') resolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      if (themePreference === 'schedule') {
        const toMinutes = (value) => {
          const [hour, minute] = value.split(':').map(Number);
          return (hour * 60) + minute;
        };
        const now = new Date();
        const currentMinutes = (now.getHours() * 60) + now.getMinutes();
        const startMinutes = toMinutes(darkModeStart);
        const endMinutes = toMinutes(darkModeEnd);
        const isDarkTime = startMinutes <= endMinutes
          ? currentMinutes >= startMinutes && currentMinutes < endMinutes
          : currentMinutes >= startMinutes || currentMinutes < endMinutes;
        resolvedTheme = isDarkTime ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };
    applyTheme();
    writeStoredValue('bibleon.themePreference', themePreference);
    writeStoredValue('bibleon.themeControlMode', themeControlMode);
    writeStoredValue('bibleon.darkModeStart', darkModeStart);
    writeStoredValue('bibleon.darkModeEnd', darkModeEnd);
    mediaQuery.addEventListener?.('change', applyTheme);
    const intervalId = themePreference === 'schedule' ? window.setInterval(applyTheme, 60 * 1000) : null;
    return () => {
      mediaQuery.removeEventListener?.('change', applyTheme);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [darkModeEnd, darkModeStart, themeControlMode, themePreference]);

  useLayoutEffect(() => {
    delete document.documentElement.dataset.accent;
    THEME_TONE_OPTIONS.forEach(({ id, cssVariable }) => {
      document.documentElement.style.setProperty(cssVariable, String(themePalette[id]));
    });
  }, [themePalette]);

  const selectBiblePassage = (bookId = selectedBookId, chapter = selectedChapter) => {
    setSelectedBookId(bookId);
    setSelectedChapter(chapter);
  };

  const continueCurrentReading = () => {
    setActiveTab('bible');
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const closeHomeChat = () => {
    setIsHomeChatOpen(false);
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const selectTab = (tabId) => {
    setMessageFriendsMenuOpen(false);
    if (tabId === 'home') {
      setActiveTab('home');
      closeHomeChat();
      return;
    }
    setIsHomeChatOpen(false);
    setActiveTab(tabId);
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  useEffect(() => {
    if (appTutorialStep === null) return;
    const tutorialStep = APP_TUTORIAL_STEPS[appTutorialStep];
    if (tutorialStep?.scope === 'bible' && !tutorialSnapshotRef.current) {
      tutorialSnapshotRef.current = {
        selectedBookId,
        selectedChapter,
        selectedTranslation,
        selectedRef,
      };
      setSelectedBookId('philippians');
      setSelectedChapter(4);
      setTutorialReadVerseIds([]);
      setTutorialReadPhase(0);
      setTutorialLongPressDone(false);
    }
    if (appTutorialStep === BIBLE_READ_PRACTICE_STEP) {
      setTutorialReadVerseIds([]);
      setTutorialReadPhase(0);
    }
    if (appTutorialStep === BIBLE_ACTION_PRACTICE_STEP) setTutorialLongPressDone(false);
    setMessageFriendsMenuOpen(false);
    setIsHomeChatOpen(false);
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, [appTutorialStep]);

  useEffect(() => () => window.clearTimeout(tutorialAdvanceTimerRef.current), []);

  const handleTutorialReadToggle = ({ isRead }) => {
    if (appTutorialStep !== BIBLE_READ_PRACTICE_STEP) return;
    setTutorialReadPhase((current) => {
      if (current === 0 && isRead) return 1;
      if (current === 1 && !isRead) {
        window.setTimeout(() => setAppTutorialStep((step) => (
          step === BIBLE_READ_PRACTICE_STEP ? BIBLE_ACTION_PRACTICE_STEP : step
        )), 180);
        return 2;
      }
      return current;
    });
  };

  const handleTutorialVerseActionsOpened = () => {
    if (appTutorialStep !== BIBLE_ACTION_PRACTICE_STEP || tutorialLongPressDone) return;
    setTutorialLongPressDone(true);
  };

  const completeAppTutorial = () => {
    const scope = APP_TUTORIAL_STEPS[appTutorialStep]?.scope;
    if (!scope) return;
    const completedAt = new Date().toISOString();
    const completionKey = scope === 'home' ? 'homeTutorialCompletedAt' : 'bibleTutorialCompletedAt';
    const nextOnboarding = {
      ...accountOnboarding,
      memoViewMode,
      [completionKey]: completedAt,
    };
    const homeCompleted = scope === 'home'
      || Boolean(accountOnboarding.homeTutorialCompletedAt || accountOnboarding.appTutorialCompletedAt);
    const bibleCompleted = scope === 'bible'
      || Boolean(accountOnboarding.bibleTutorialCompletedAt || accountOnboarding.appTutorialCompletedAt);
    if (homeCompleted && bibleCompleted) nextOnboarding.appTutorialCompletedAt = completedAt;
    if (tutorialPreviewMode) tutorialPreviewCompletedScopesRef.current.add(scope);
    if (!tutorialPreviewMode) setAccountOnboarding(nextOnboarding);
    const snapshot = tutorialSnapshotRef.current;
    if (snapshot) {
      setSelectedBookId(snapshot.selectedBookId);
      setSelectedChapter(snapshot.selectedChapter);
      setSelectedTranslation(snapshot.selectedTranslation);
      setSelectedRef(snapshot.selectedRef);
    }
    tutorialSnapshotRef.current = null;
    window.clearTimeout(tutorialAdvanceTimerRef.current);
    setTutorialReadVerseIds([]);
    setTutorialReadPhase(0);
    setTutorialLongPressDone(false);
    setAppTutorialStep(null);
    if (accountSyncReady && !tutorialPreviewMode) {
      void accountRepository.savePreferences({
        defaultTranslation: selectedTranslation,
        themePreference,
        themeControlMode,
        darkModeStart,
        darkModeEnd,
        timezone: 'Asia/Seoul',
        onboarding: nextOnboarding,
      }).catch(() => {});
    }
  };

  const requestPlus = (featureId = '') => {
    setPlusSheetFeature(featureId);
  };

  const updateNotificationPreference = (key, enabled) => {
    setAccountOnboarding((current) => ({
      ...current,
      notificationPreferences: {
        ...normalizeNotificationPreferences(current.notificationPreferences),
        [key]: enabled,
      },
    }));
  };

  const updateThemeHue = (toneId, nextHue) => {
    if (!isPlus) {
      requestPlus('theme');
      return;
    }
    if (!THEME_TONE_OPTIONS.some(({ id }) => id === toneId)) return;
    setAccountOnboarding((current) => ({
      ...current,
      themePalette: {
        ...normalizeThemePalette(current.themePalette, current.accentTheme),
        [toneId]: normalizeThemeHue(nextHue, DEFAULT_THEME_PALETTE[toneId]),
      },
    }));
  };

  const resetThemePalette = () => {
    if (!isPlus) {
      requestPlus('theme');
      return;
    }
    setAccountOnboarding((current) => ({
      ...current,
      accentTheme: 'violet',
      themePalette: { ...DEFAULT_THEME_PALETTE },
    }));
  };

  const consumeChatTokens = (requestedTokens) => {
    const requested = Math.max(0, Number(requestedTokens) || 0);
    const usage = normalizeChatUsage(accountOnboarding.chatUsage);
    if (usage.tokens + requested > chatTokenLimit) {
      if (!isPlus) requestPlus('chat-limit');
      return false;
    }
    setAccountOnboarding((current) => {
      const currentUsage = normalizeChatUsage(current.chatUsage);
      return {
        ...current,
        chatUsage: { date: currentUsage.date, tokens: currentUsage.tokens + requested },
      };
    });
    return true;
  };

  const updateWorshipMemo = (serviceId, nextMemo) => {
    setAccountOnboarding((current) => ({
      ...current,
      worshipMemos: {
        ...(current.worshipMemos ?? {}),
        [serviceId]: nextMemo,
      },
    }));
  };

  const addMemoComment = ({ target, body, parentId = null }) => {
    const trimmedBody = String(body ?? '').trim();
    if (!trimmedBody || !target?.verseIds?.length) return;
    const timestamp = Date.now();
    setMemoComments((current) => [...current, {
      id: createMemoId(),
      threadKey: target.threadKey,
      reference: target.reference,
      verseIds: [...target.verseIds],
      verses: target.verses.map(toMemoVerseSnapshot),
      body: trimmedBody,
      parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }]);
  };

  const updateMemoComment = (commentId, body) => {
    const trimmedBody = String(body ?? '').trim();
    if (!trimmedBody) return;
    setMemoComments((current) => current.map((comment) => (
      comment.id === commentId
        ? { ...comment, body: trimmedBody, updatedAt: Date.now() }
        : comment
    )));
  };

  const recordChapterAccess = (chapter) => {
    const dateKey = getSeoulDateKey();
    setAccountOnboarding((current) => ({ ...current, lastBibleReadAt: Date.now() }));
    setPopularityData((current) => recordUniqueChapterAccess(current, chapter, dateKey));
  };

  const restartBibleReading = () => {
    const nextCycle = Number(readingState.cycle ?? 1) + 1;
    setReadVerseIds([]);
    setReadingState({ cycle: nextCycle, eligible: true, restartedAt: Date.now() });
    setReadingProgressHistory({ cycle: nextCycle, points: { [getSeoulDateKey()]: 0 } });
    setCompletionCelebration(null);
  };

  useEffect(() => {
    writeStoredValue('bibleon.verseNotes', verseNotes);
  }, [verseNotes]);

  useEffect(() => {
    writeStoredValue(READ_VERSES_STORAGE_KEY, readVerseIds);
  }, [readVerseIds]);

  useEffect(() => {
    writeStoredValue(CHAPTER_POPULARITY_STORAGE_KEY, popularityData);
  }, [popularityData]);

  useEffect(() => {
    writeStoredValue(READING_STATE_STORAGE_KEY, readingState);
  }, [readingState]);

  useEffect(() => {
    writeStoredValue(READING_PROGRESS_HISTORY_KEY, readingProgressHistory);
  }, [readingProgressHistory]);

  useEffect(() => {
    writeStoredValue(ACHIEVEMENTS_STORAGE_KEY, achievements);
  }, [achievements]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      personalDataRepository.saveBibleState({
        readVerseIds,
        readingState,
        readingProgressHistory,
        recentPassages: readStoredValue('bibleon.recentPassages', []),
      }).catch(() => {});
    }, 650);
    return () => window.clearTimeout(timerId);
  }, [personalSyncReady, readVerseIds, readingProgressHistory, readingState]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      personalDataRepository.syncNotes(verseNotes).then((results) => {
        if (!results?.length) return;
        setVerseNoteMeta((current) => {
          const next = { ...current };
          results.forEach((result) => {
            if (!result?.verseId) return;
            if (result.status === 'deleted') delete next[result.verseId];
            else next[result.verseId] = {
              ...next[result.verseId],
              version: Number(result.version),
              updatedAt: result.updatedAt ? Date.parse(result.updatedAt) : Date.now(),
              syncConflict: result.status === 'conflict',
            };
          });
          return next;
        });
        results.filter(({ status }) => status === 'conflict').forEach((result) => {
          setVerseNotes((current) => result.note == null
            ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== result.verseId))
            : { ...current, [result.verseId]: result.note });
        });
      }).catch(() => {});
    }, 650);
    return () => window.clearTimeout(timerId);
  }, [personalSyncReady, verseNotes]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      personalDataRepository.syncHighlights(verseHighlights).catch(() => {});
    }, 650);
    return () => window.clearTimeout(timerId);
  }, [personalSyncReady, verseHighlights]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      personalDataRepository.syncAchievements(achievements).catch(() => {});
    }, 650);
    return () => window.clearTimeout(timerId);
  }, [achievements, personalSyncReady]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      personalDataRepository.syncHomeChatRooms(homeChatRooms).catch(() => {});
    }, 650);
    return () => window.clearTimeout(timerId);
  }, [homeChatRooms, personalSyncReady]);

  useEffect(() => {
    if (!personalSyncReady) return undefined;
    const retryPersonalData = () => {
      void personalDataRepository.saveBibleState({
        readVerseIds,
        readingState,
        readingProgressHistory,
        recentPassages: readStoredValue('bibleon.recentPassages', []),
      }).catch(() => {});
      void personalDataRepository.syncNotes(verseNotes).catch(() => {});
      void personalDataRepository.syncHighlights(verseHighlights).catch(() => {});
      void personalDataRepository.syncAchievements(achievements).catch(() => {});
      void personalDataRepository.syncHomeChatRooms(homeChatRooms).catch(() => {});
    };
    window.addEventListener('online', retryPersonalData);
    return () => window.removeEventListener('online', retryPersonalData);
  }, [achievements, homeChatRooms, personalSyncReady, readVerseIds, readingProgressHistory, readingState, verseHighlights, verseNotes]);

  useEffect(() => {
    if (!bibleVerseTotal) return;
    setReadingProgressHistory((current) => {
      const cycle = Number(readingState.cycle ?? 1);
      const points = current.cycle === cycle ? current.points ?? {} : {};
      const dateKey = getSeoulDateKey();
      if (points[dateKey] === readingProgress && current.cycle === cycle) return current;
      return { cycle, points: { ...points, [dateKey]: readingProgress } };
    });
  }, [bibleVerseTotal, readingProgress, readingState.cycle]);

  useEffect(() => {
    if (!bibleVerseTotal || readVerseCount < bibleVerseTotal || !readingState.eligible) return;
    const completedCount = achievements.filter(({ type }) => type === 'full-reading').length;
    if (completedCount >= 99) {
      setReadingState((current) => ({ ...current, eligible: false, completedAt: Date.now(), completionCount: 99 }));
      return;
    }
    const nextCount = completedCount + 1;
    const achievement = {
      id: `full-reading-${nextCount}`,
      type: 'full-reading',
      name: `통독 ${nextCount}회`,
      earnedAt: Date.now(),
    };
    setAchievements((current) => current.some(({ id }) => id === achievement.id) ? current : [...current, achievement]);
    setReadingState((current) => ({ ...current, eligible: false, completedAt: Date.now(), completionCount: nextCount }));
    setCompletionCelebration(achievement);
  }, [achievements, bibleVerseTotal, readVerseCount, readingState.eligible]);

  useEffect(() => {
    writeStoredValue('bibleon.verseNoteMeta', verseNoteMeta);
  }, [verseNoteMeta]);

  useEffect(() => {
    writeStoredValue('bibleon.highlightedVerses', verseHighlights);
  }, [verseHighlights]);

  useEffect(() => {
    writeStoredValue('bibleon.lastHighlightStyle', lastHighlightStyle);
  }, [lastHighlightStyle]);

  useEffect(() => {
    writeStoredValue('bibleon.personalProfile', personalProfile);
  }, [personalProfile]);

  useEffect(() => {
    if (!accountSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      accountRepository.saveProfile(personalProfile).catch(() => {});
    }, 450);
    return () => window.clearTimeout(timerId);
  }, [accountSyncReady, personalProfile]);

  useEffect(() => {
    if (appTutorialStep !== null) return undefined;
    writeStoredValue('bibleon.defaultTranslation', selectedTranslation);
    if (!accountSyncReady) return undefined;
    const timerId = window.setTimeout(() => {
      accountRepository.savePreferences({
        defaultTranslation: selectedTranslation,
        themePreference,
        themeControlMode,
        darkModeStart,
        darkModeEnd,
        timezone: 'Asia/Seoul',
        onboarding: accountOnboarding,
      }).catch(() => {});
    }, 450);
    return () => window.clearTimeout(timerId);
  }, [accountOnboarding, accountSyncReady, appTutorialStep, darkModeEnd, darkModeStart, selectedTranslation, themeControlMode, themePreference]);

  useEffect(() => {
    writeStoredValue(ACCOUNT_ONBOARDING_STORAGE_KEY, accountOnboarding);
  }, [accountOnboarding]);

  useEffect(() => {
    setAccountOnboarding((current) => (
      current.memoCommentsVersion === 1 && current.memoCommentsV1 === memoComments
        ? current
        : { ...current, memoCommentsVersion: 1, memoCommentsV1: memoComments }
    ));
  }, [memoComments]);

  const updateMemoViewMode = (nextMode) => {
    const normalizedMode = normalizeMemoViewMode(nextMode);
    setMemoViewMode(normalizedMode);
    setAccountOnboarding((current) => (
      current.memoViewMode === normalizedMode ? current : { ...current, memoViewMode: normalizedMode }
    ));
  };

  useEffect(() => {
    writeStoredValue(CURRENT_CHURCH_STORAGE_KEY, currentChurchId);
  }, [currentChurchId]);

  useEffect(() => {
    writeStoredValue(COMMUNITY_IDS_STORAGE_KEY, communityIds);
  }, [communityIds]);

  useEffect(() => {
    writeStoredValue(CHURCH_PROFILES_STORAGE_KEY, churchProfiles);
  }, [churchProfiles]);

  useEffect(() => {
    writeStoredValue('bibleon.churchConversations', conversations);
  }, [conversations]);

  useEffect(() => {
    writeStoredValue('bibleon.qtRooms', qtRooms);
  }, [qtRooms]);

  useEffect(() => {
    writeStoredValue(HOME_CHAT_STORAGE_KEY, homeChatRooms);
    writeStoredValue(HOME_CHAT_ACTIVE_KEY, activeHomeChatId);
    removeStoredValue(HOME_CHAT_LEGACY_KEY);
  }, [activeHomeChatId, homeChatRooms]);

  useEffect(() => {
    const purgeDeletedRooms = () => {
      setHomeChatRooms((current) => {
        const retained = purgeExpiredHomeChats(current);
        return retained.length === current.length ? current : retained;
      });
    };
    const intervalId = window.setInterval(purgeDeletedRooms, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const prepareHomeChat = (firstQuestion, forceNew = false) => {
    const currentRoom = homeChatRooms.find((room) => (
      room.id === activeHomeChatId && !room.deletedAt
    ));
    if (currentRoom && !forceNew) return currentRoom.id;

    const createdAt = Date.now();
    const roomId = `home-chat-${createdAt}`;
    const room = {
      id: roomId,
      title: makeHomeChatTitle([{ role: 'user', text: firstQuestion }]),
      messages: [],
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    setHomeChatRooms((current) => [room, ...current]);
    setActiveHomeChatId(roomId);
    return roomId;
  };

  const appendHomeChatMessage = (roomId, message) => {
    setHomeChatRooms((current) => current.map((room) => {
      if (room.id !== roomId) return room;
      const messages = [...room.messages, message];
      return {
        ...room,
        title: makeHomeChatTitle(messages),
        messages,
        updatedAt: Date.now(),
      };
    }));
  };

  const openSavedHomeChat = (roomId) => {
    setActiveHomeChatId(roomId);
    setActiveTab('home');
    setIsHomeChatOpen(true);
  };

  const startNewHomeChat = () => {
    setActiveHomeChatId('');
    setActiveTab('home');
    setIsHomeChatOpen(true);
  };

  const deleteHomeChat = (roomId) => {
    const deletedAt = Date.now();
    setHomeChatRooms((current) => current.map((room) => (
      room.id === roomId ? { ...room, deletedAt } : room
    )));
    if (activeHomeChatId === roomId) {
      const nextRoom = homeChatRooms.find((room) => room.id !== roomId && !room.deletedAt);
      setActiveHomeChatId(nextRoom?.id ?? '');
    }
  };

  const addQtPost = () => {
    const text = newPost.trim();
    if (!text) return;
    setPosts((current) => [
      { author: '나', group: churchInfo.department, ref: selectedRef, text, time: '방금', reactions: 0 },
      ...current,
    ]);
    setNewPost('');
  };

  const openBibleVerse = (verse) => {
    const directTarget = verse?.bookId && Number(verse?.chapter)
      ? { bookId: verse.bookId, chapter: Number(verse.chapter), verse: Number(verse.verse) || 1 }
      : null;
    const target = directTarget ?? resolveBibleReference(verse?.reference);
    if (!target) return;
    setSelectedBookId(target.bookId);
    setSelectedChapter(target.chapter);
    if (translations.some(({ id }) => id === verse.translationId)) {
      setSelectedTranslation(verse.translationId);
    }
    setSelectedRef(verse.reference);
    setBibleNavigationTarget({ ...target, reference: verse.reference, requestedAt: Date.now() });
    setIsHomeChatOpen(false);
    setActiveTab('bible');
    window.requestAnimationFrame(() => workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' }));
  };

  const openNotificationDestination = (notification) => {
    const destination = notification?.destination;
    if (!destination) return;
    setIsHomeChatOpen(false);
    setMessageFriendsMenuOpen(false);

    if (destination.kind === 'verse') {
      openBibleVerse({ reference: destination.reference, translationId: selectedTranslation });
      return;
    }

    if (destination.tab === 'messages') {
      setMessageNavigationTarget({ ...destination, requestedAt: Date.now() });
      setActiveTab('messages');
    } else if (destination.tab === 'church') {
      setChurchNavigationTarget({ ...destination, requestedAt: Date.now() });
      setActiveTab('church');
    } else {
      setActiveTab(destination.tab);
    }
    window.requestAnimationFrame(() => workspaceRef.current?.scrollTo({ top: 0, behavior: 'auto' }));
  };

  const forwardMessageToDestination = (message, { type, item }) => {
    if (!message || !item) return '';
    const makeForwardedMessage = (unreadByCount) => ({
      ...message,
      id: `forwarded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: 'me',
      time: '방금',
      reaction: null,
      unreadByCount,
      forwarded: true,
    });
    const updateRoom = (target, forwardedMessage) => ({
      ...target,
      messages: [...target.messages, forwardedMessage],
      lastMessage: forwardedMessage.type === 'bible-passage'
        ? `말씀 · ${forwardedMessage.referenceLabel}`
        : forwardedMessage.text,
      time: '방금',
    });

    if (type === 'friend') {
      const existingConversation = conversations.find((conversation) => {
        const ids = getConversationParticipantIds(conversation);
        return ids.length === 1 && ids[0] === item.id;
      });
      if (existingConversation) {
        setConversations((current) => {
          const target = current.find(({ id }) => id === existingConversation.id);
          if (!target) return current;
          const updated = updateRoom(target, makeForwardedMessage(1));
          return [updated, ...current.filter(({ id }) => id !== target.id)];
        });
      } else {
        const createdAt = Date.now();
        const forwardedMessage = makeForwardedMessage(1);
        setConversations((current) => [{
          id: `direct-${item.id}-${createdAt}`,
          name: item.name,
          department: item.department,
          role: item.role,
          online: item.online ?? false,
          unread: 0,
          time: '방금',
          lastMessage: forwardedMessage.text,
          participantIds: [item.id],
          participantJoinedAt: { [item.id]: 0 },
          messages: [forwardedMessage],
          createdAt,
        }, ...current]);
      }
    } else {
      const setRooms = type === 'qt' ? setQtRooms : setConversations;
      setRooms((current) => {
        const target = current.find(({ id }) => id === item.id);
        if (!target) return current;
        const forwardedMessage = makeForwardedMessage(getConversationParticipantIds(target).length);
        const updated = updateRoom(target, forwardedMessage);
        return [updated, ...current.filter(({ id }) => id !== target.id)];
      });
    }
    return item.customName ?? item.name ?? '대화방';
  };

  const savePersonalProfile = async (nextProfile) => {
    const profile = { ...nextProfile };
    const selectedFile = profile._avatarFile;
    delete profile._avatarFile;
    if (currentAccountUser && selectedFile) {
      const stored = await uploadAvatar(selectedFile, currentAccountUser.id);
      profile.avatarPath = stored.path;
      profile.avatarImage = await createSignedMediaUrl({ bucket: stored.bucket, path: stored.path });
    } else if (!profile.avatarImage) {
      profile.avatarPath = '';
    }
    setPersonalProfile(profile);
  };

  const saveCurrentChurchProfile = async (nextProfile) => {
    const profile = { ...nextProfile };
    const selectedFile = profile._profileImageFile;
    delete profile._profileImageFile;
    if (currentAccountUser && currentChurchId && selectedFile) {
      const stored = await uploadChurchMedia(selectedFile, currentChurchId, [currentChurchId]);
      profile.profileImagePath = stored.path;
      profile.profileImage = await createSignedMediaUrl({ bucket: stored.bucket, path: stored.path });
    } else if (!profile.profileImage) {
      profile.profileImagePath = '';
    }
    if (currentAccountUser && currentChurchId) await churchRepository.saveProfile(currentChurchId, profile);
    setChurchProfiles((current) => ({ ...current, [profile.id]: profile }));
  };

  const selectCurrentCommunity = (communityId) => {
    if (!communityId || communityId === currentChurchId) return;
    setServerChurchWorkspace(null);
    setCurrentChurchId(communityId);
    if (currentAccountUser) {
      setChurchAccess({ authority: '성도', managerDepartmentId: '' });
    } else {
      const community = getRegisteredChurches(churchProfiles).find(({ id }) => id === communityId);
      setChurchAccess({
        authority: community?.localAuthority ?? (communityId === 'grace-spring' ? '관리자' : '성도'),
        managerDepartmentId: '',
      });
    }
  };

  const registerCurrentChurch = async (church) => {
    if (!church?.id) return;
    if (!communityIds.includes(church.id) && communityIds.length >= MAX_COMMUNITIES) {
      throw new Error('공동체는 최대 3개까지 함께 이용할 수 있어요.');
    }
    if (!currentAccountUser) {
      setChurchProfiles((current) => ({ ...current, [church.id]: { ...current[church.id], ...church } }));
      setCommunityIds((current) => [...new Set([...current, church.id])].slice(0, MAX_COMMUNITIES));
      setCurrentChurchId(church.id);
      setChurchAccess({ authority: church.localAuthority ?? '성도', managerDepartmentId: '' });
      return;
    }
    const status = await churchRepository.requestMembership(church.id);
    if (status === 'active') {
      setChurchProfiles((current) => ({ ...current, [church.id]: { ...current[church.id], ...church } }));
      setCommunityIds((current) => [...new Set([...current, church.id])].slice(0, MAX_COMMUNITIES));
      setCurrentChurchId(church.id);
      return;
    }
    await refreshSharedData();
  };

  const createManagedChurch = async ({ name, communityType }) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('공동체 이름을 입력해 주세요.');
    if (communityIds.length >= MAX_COMMUNITIES) throw new Error('공동체는 최대 3개까지 함께 이용할 수 있어요.');
    if (currentAccountUser) {
      const churchId = await churchRepository.create(trimmedName, communityType);
      setCommunityIds((current) => [...new Set([...current, churchId])].slice(0, MAX_COMMUNITIES));
      setCurrentChurchId(churchId);
      setChurchAccess({ authority: '관리자', managerDepartmentId: '' });
      return churchId;
    }

    const churchId = `church-${Date.now()}`;
    const church = {
      id: churchId,
      name: trimmedName,
      communityType,
      denomination: communityType === 'church' ? '교단 정보 미설정' : getCommunityTypeLabel({ communityType }),
      location: '지역 정보 미설정',
      createdByAdmin: true,
      localAuthority: '관리자',
      profileImage: '',
      verseRef: '',
      representativeVerse: '공동체 관리에서 대표 말씀을 설정해 주세요.',
    };
    const selfMemberId = `self-${churchId}`;
    writeCommunityScopedValue('bibleon.departmentNodes', churchId, [{
      id: `${churchId}-root`,
      parentId: null,
      name: trimmedName,
      memberIds: [selfMemberId],
    }]);
    writeCommunityScopedValue('bibleon.approvedChurchMembers', churchId, [{
      ...personalProfile,
      id: selfMemberId,
      department: trimmedName,
      role: '공동체 관리자',
      churchId,
      churchName: trimmedName,
      tone: 'violet',
    }]);
    writeCommunityScopedValue('bibleon.churchMemberRoles', churchId, {
      [selfMemberId]: { title: '공동체 관리자', authority: '관리자', managerDepartmentId: null },
    });
    setChurchProfiles((current) => ({ ...current, [churchId]: church }));
    setCommunityIds((current) => [...new Set([...current, churchId])].slice(0, MAX_COMMUNITIES));
    setCurrentChurchId(churchId);
    setChurchAccess({ authority: '관리자', managerDepartmentId: '' });
    return churchId;
  };

  const leaveCurrentCommunity = async () => {
    const leavingId = currentChurchId;
    if (!leavingId) return;
    if (currentAccountUser) await churchRepository.leave(leavingId);
    const remainingIds = communityIds.filter((id) => id !== leavingId);
    setCommunityIds(remainingIds);
    setCurrentChurchId(remainingIds[0] ?? '');
    if (personalProfile.primaryCommunityId === leavingId) {
      setPersonalProfile((current) => ({ ...current, primaryCommunityId: remainingIds[0] ?? '' }));
    }
    setServerChurchWorkspace(null);
  };

  const searchAvailableChurches = async (searchText) => {
    if (!currentAccountUser) return searchRegisteredChurches(searchText, churchProfiles).slice(0, 8);
    const results = await churchRepository.search(searchText);
    return results.map((church) => ({
      ...church,
      createdByAdmin: true,
      profileImage: '',
    }));
  };

  const showHomeIntro = activeTab === 'home' && isHomeIntro;

  return (
    <main
      ref={appShellRef}
      className={`app-shell ${activeTab === 'home' ? 'is-home-active' : ''} ${showHomeIntro ? 'is-home-intro' : ''} ${!isHomeGradientVisible ? 'is-home-gradient-hidden' : ''} ${isHomeReturning ? 'is-home-returning' : ''} ${activeTab === 'home' && isHomeChatOpen ? 'is-home-chatting' : ''}`}
      aria-busy={isAppLoading}
    >
      {isAppLoading && (
        <div
          className="app-loading-screen"
          role="status"
          aria-label={`성경 본문 불러오는 중 ${loadingProgress}%`}
        >
          <div className="app-loading-logo-stack" style={{ '--loading-progress': `${loadingProgress}%` }} aria-hidden="true">
            <BibleOnLogo className="app-loading-logo-base" size={132} />
            <span className="app-loading-logo-fill"><BibleOnLogo size={132} /></span>
          </div>
          {loadingError && (
            <div className="app-loading-error">
              <span>{loadingError}</span>
              <button type="button" onClick={() => setLoadingAttempt((current) => current + 1)}>다시 시도</button>
            </div>
          )}
        </div>
      )}
      <section className="workspace" aria-label="바이블온 앱" ref={workspaceRef}>
        {activeTab === 'home' && isHomeChatOpen && chatAdVisible && (
          <ChatBannerAd onClose={() => setChatAdVisible(false)} />
        )}
        <Topbar
          activeTab={activeTab}
          selectedTranslation={selectedTranslation}
          setSelectedTranslation={setSelectedTranslation}
          onOpenChatHistory={() => setHomeChatHistoryOpen(true)}
          onOpenMessageFriends={() => setMessageFriendsMenuOpen(true)}
          themePreference={themePreference}
          setThemePreference={setThemePreference}
          themeControlMode={themeControlMode}
          setThemeControlMode={setThemeControlMode}
          darkModeStart={darkModeStart}
          setDarkModeStart={setDarkModeStart}
          darkModeEnd={darkModeEnd}
          setDarkModeEnd={setDarkModeEnd}
          onOpenNotification={openNotificationDestination}
          signedIn={Boolean(currentAccountUser)}
          accountUser={currentAccountUser}
          personalProfile={personalProfile}
          currentChurch={currentChurch}
          churchAccess={churchAccess}
          serverChurchWorkspace={serverChurchWorkspace}
          isPlus={isPlus}
          plusPreviewMode={plusPreviewMode || developmentPlusMode}
          onRequestPlus={requestPlus}
          notificationPreferences={notificationPreferences}
          onNotificationPreferenceChange={updateNotificationPreference}
          readingReminderDays={readingReminderDays}
          themePalette={themePalette}
          onThemeHueChange={updateThemeHue}
          onThemePaletteReset={resetThemePalette}
          onSignOut={async () => {
            await signOutCurrentAccount();
            window.location.assign('/onboarding');
          }}
        />
        {activeTab === 'home' && (
          <HomeView
            selectedBook={selectedBook}
            selectedChapter={selectedChapter}
            selectedTranslation={selectedTranslation}
            query={query}
            setQuery={setQuery}
            selectBiblePassage={selectBiblePassage}
            continueCurrentReading={continueCurrentReading}
            favoriteRefs={favoriteRefs}
            chatRooms={homeChatRooms.filter(({ deletedAt }) => !deletedAt)}
            activeChatId={activeHomeChatId}
            ragMessages={homeRagMessages}
            isChatOpen={isHomeChatOpen}
            isIntro={showHomeIntro}
            openChat={() => setIsHomeChatOpen(true)}
            closeChat={closeHomeChat}
            prepareChat={prepareHomeChat}
            appendChatMessage={appendHomeChatMessage}
            verseNotes={verseNotes}
            setVerseNotes={setVerseNotes}
            verseNoteMeta={verseNoteMeta}
            setVerseNoteMeta={setVerseNoteMeta}
            memoComments={memoComments}
            onAddMemoComment={addMemoComment}
            onUpdateMemoComment={updateMemoComment}
            worshipMemos={accountOnboarding.worshipMemos ?? {}}
            onWorshipMemoChange={updateWorshipMemo}
            memoViewMode={memoViewMode}
            onMemoViewModeChange={updateMemoViewMode}
            popularityRankings={popularityRankings}
            onOpenBibleVerse={openBibleVerse}
            isPlus={isPlus}
            onRequestPlus={requestPlus}
            chatTokensUsed={chatUsage.tokens}
            chatTokenLimit={chatTokenLimit}
            onConsumeChatTokens={consumeChatTokens}
            currentCommunity={representativeCommunity}
          />
        )}
        {activeTab === 'bible' && (
          <BibleView
            selectedBook={selectedBook}
            selectedBookId={selectedBookId}
            setSelectedBookId={setSelectedBookId}
            selectedChapter={selectedChapter}
            setSelectedChapter={setSelectedChapter}
            selectedTranslation={selectedTranslation}
            setSelectedTranslation={setSelectedTranslation}
            setSelectedRef={setSelectedRef}
            readVerseIds={activeTutorialScope === 'bible' ? tutorialReadVerseIds : readVerseIds}
            setReadVerseIds={activeTutorialScope === 'bible' ? setTutorialReadVerseIds : setReadVerseIds}
            verseNotes={verseNotes}
            setVerseNotes={setVerseNotes}
            verseNoteMeta={verseNoteMeta}
            setVerseNoteMeta={setVerseNoteMeta}
            memoComments={memoComments}
            onAddMemoComment={addMemoComment}
            onUpdateMemoComment={updateMemoComment}
            verseHighlights={verseHighlights}
            setVerseHighlights={setVerseHighlights}
            lastHighlightStyle={lastHighlightStyle}
            setLastHighlightStyle={setLastHighlightStyle}
            navigationTarget={bibleNavigationTarget}
            onNavigationHandled={() => setBibleNavigationTarget(null)}
            conversations={conversations}
            setConversations={setConversations}
            qtRooms={qtRooms}
            setQtRooms={setQtRooms}
            onChapterAccess={activeTutorialScope === 'bible' ? undefined : recordChapterAccess}
            tutorialMode={activeTutorialScope === 'bible'}
            tutorialStep={appTutorialStep}
            onTutorialReadToggle={handleTutorialReadToggle}
            onTutorialVerseActionsOpened={handleTutorialVerseActionsOpened}
            isPlus={isPlus}
            onRequestPlus={requestPlus}
          />
        )}
        {activeTab === 'church' && (
          <ChurchView
            posts={posts}
            newPost={newPost}
            setNewPost={setNewPost}
            addQtPost={addQtPost}
            selectedRef={selectedRef}
            selectedTranslation={selectedTranslation}
            conversations={conversations}
            setConversations={setConversations}
            qtRooms={qtRooms}
            setQtRooms={setQtRooms}
            onOpenBibleVerse={openBibleVerse}
            onForwardMessage={forwardMessageToDestination}
            currentChurch={currentChurch}
            currentChurchId={currentChurchId}
            communities={currentCommunities}
            onSelectCommunity={selectCurrentCommunity}
            churchProfiles={churchProfiles}
            onRegisterChurch={registerCurrentChurch}
            onCreateChurch={createManagedChurch}
            onLeaveCommunity={leaveCurrentCommunity}
            onSaveChurchProfile={saveCurrentChurchProfile}
            navigationTarget={churchNavigationTarget}
            onNavigationHandled={() => setChurchNavigationTarget(null)}
            churchAccess={churchAccess}
            serverChurchWorkspace={serverChurchWorkspace}
            serverBacked={Boolean(currentAccountUser)}
            currentUserId={currentAccountUser?.id ?? ''}
            personalProfile={personalProfile}
            onReloadCommunity={() => refreshSharedData().catch(() => {})}
            onSearchChurches={searchAvailableChurches}
            onDelegateChurchAdmin={(member) => {
              writeStoredValue('bibleon.churchAdminMemberId', member.id);
              setChurchAccess({ authority: '성도', managerDepartmentId: '' });
            }}
            isPlus={isPlus}
            onRequestPlus={requestPlus}
            worshipMemos={accountOnboarding.worshipMemos ?? {}}
            onWorshipMemoChange={updateWorshipMemo}
          />
        )}
        {activeTab === 'messages' && (
          <MessageView
            conversations={conversations}
            setConversations={setConversations}
            qtRooms={qtRooms}
            setQtRooms={setQtRooms}
            friendsMenuOpen={messageFriendsMenuOpen}
            onCloseFriendsMenu={() => setMessageFriendsMenuOpen(false)}
            onOpenBibleVerse={openBibleVerse}
            onForwardMessage={forwardMessageToDestination}
            currentChurchId={currentChurchId}
            navigationTarget={messageNavigationTarget}
            onNavigationHandled={() => setMessageNavigationTarget(null)}
            members={messageMembers}
            personalProfile={personalProfile}
            currentUserId={currentAccountUser?.id ?? ''}
            currentCommunity={currentChurch}
            churchAccess={churchAccess}
            serverChurchWorkspace={serverChurchWorkspace}
            selectedTranslation={selectedTranslation}
            serverBacked={Boolean(currentAccountUser)}
            onReloadMessages={() => refreshSharedData().catch(() => {})}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileView
            personalProfile={personalProfile}
            setPersonalProfile={setPersonalProfile}
            selectedTranslation={selectedTranslation}
            achievements={achievements}
            readVerseCount={readVerseCount}
            bibleVerseTotal={bibleVerseTotal}
            readingProgress={readingProgress}
            readingGrowthData={readingGrowthData}
            canCompleteReading={readingState.eligible}
            onRestartReading={restartBibleReading}
            currentChurch={representativeCommunity}
            communities={currentCommunities}
            onSaveProfile={savePersonalProfile}
          />
        )}
      </section>
      <HomeChatHistory
        isOpen={homeChatHistoryOpen}
        chatRooms={homeChatRooms.filter(({ deletedAt }) => !deletedAt)}
        activeChatId={activeHomeChatId}
        onClose={() => setHomeChatHistoryOpen(false)}
        onOpenChat={openSavedHomeChat}
        onStartNewChat={startNewHomeChat}
        onDeleteChat={deleteHomeChat}
      />
      <BottomNav
        activeTab={activeTab === 'home' && isHomeChatOpen ? null : activeTab}
        onSelectTab={selectTab}
      />
      {appTutorialStep !== null && !isAppLoading && !isHomeIntro && !isHomeReturning && (
        <AppTutorial
          step={appTutorialStep}
          readPracticePhase={tutorialReadPhase}
          longPressDone={tutorialLongPressDone}
          onNext={() => {
            const nextStep = APP_TUTORIAL_STEPS[appTutorialStep + 1];
            if (!nextStep || nextStep.scope !== activeTutorialScope) completeAppTutorial();
            else setAppTutorialStep((current) => current + 1);
          }}
          onSkip={completeAppTutorial}
        />
      )}
      {completionCelebration && (
        <BibleCompletionCelebration
          achievement={completionCelebration}
          onRestart={restartBibleReading}
          onKeep={() => setCompletionCelebration(null)}
        />
      )}
      {plusSheetFeature && (
        <PlusSubscriptionSheet
          activeFeature={plusSheetFeature}
          isPlus={isPlus}
          previewMode={plusPreviewMode || developmentPlusMode}
          onClose={() => setPlusSheetFeature('')}
        />
      )}
    </main>
  );
}

function ChatBannerAd({ onClose }) {
  return (
    <aside className="chat-banner-ad" aria-label="배너 광고">
      <span>AD</span>
      <div><strong>하루의 말씀을 가까이</strong><small>바이블온과 함께 천천히 읽어보세요.</small></div>
      <button type="button" aria-label="배너 광고 닫기" onClick={onClose}><X size={16} aria-hidden="true" /></button>
    </aside>
  );
}

function PlusSubscriptionSheet({ activeFeature, isPlus, previewMode, onClose }) {
  const [billingNotice, setBillingNotice] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  return createPortal(
    <div className={`plus-subscription-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="plus-subscription-backdrop" type="button" aria-label="바이블온 플러스 닫기" onClick={() => dismiss()} />
      <section className="plus-subscription-sheet" role="dialog" aria-modal="true" aria-labelledby="plus-subscription-title">
        <header>
          <span className="plus-subscription-symbol"><Crown size={23} aria-hidden="true" /></span>
          <div><h2 id="plus-subscription-title">바이블온 플러스</h2><p>말씀을 더 깊이 읽고 기록하는 방법</p></div>
          <button type="button" aria-label="바이블온 플러스 닫기" onClick={() => dismiss()}><X size={21} aria-hidden="true" /></button>
        </header>
        <div className="plus-feature-list">
          {PLUS_FEATURES.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <article className={activeFeature === feature.id ? 'is-focused' : ''} key={feature.id}>
                <span><FeatureIcon size={18} aria-hidden="true" /></span>
                <div><strong>{feature.title}</strong><small>{feature.description}</small></div>
                {isPlus && <Check size={17} aria-label="사용 가능" />}
              </article>
            );
          })}
        </div>
        <footer>
          <div><strong>{isPlus ? 'Plus가 활성화되어 있어요' : '월 1,500원'}</strong><small>{previewMode ? '테스트 미리보기 모드' : isPlus ? '모든 Plus 기능 사용 가능' : '결제 및 해지는 스토어 정책에 따라 제공됩니다.'}</small></div>
          <button type="button" className={isPlus ? 'is-active' : ''} onClick={() => {
            if (isPlus) dismiss();
            else {
              setBillingNotice('구독 결제 연결은 출시 준비 단계에서 제공할 예정이에요.');
              window.setTimeout(() => setBillingNotice(''), 2200);
            }
          }}>{isPlus ? '확인' : 'Plus 시작하기'}</button>
          {billingNotice && <p role="status">{billingNotice}</p>}
        </footer>
      </section>
    </div>,
    document.body
  );
}

function Topbar({
  activeTab,
  selectedTranslation,
  setSelectedTranslation,
  onOpenChatHistory,
  onOpenMessageFriends,
  themePreference,
  setThemePreference,
  themeControlMode,
  setThemeControlMode,
  darkModeStart,
  setDarkModeStart,
  darkModeEnd,
  setDarkModeEnd,
  onOpenNotification,
  signedIn,
  accountUser,
  personalProfile,
  currentChurch,
  churchAccess,
  serverChurchWorkspace,
  isPlus,
  plusPreviewMode,
  onRequestPlus,
  notificationPreferences,
  onNotificationPreferenceChange,
  readingReminderDays,
  themePalette,
  onThemeHueChange,
  onThemePaletteReset,
  onSignOut,
}) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState('root');
  const [accountActionMessage, setAccountActionMessage] = useState('');
  const [uidCopied, setUidCopied] = useState(false);
  const [notifications, setNotifications] = useState(() => [
    ...buildGuidanceNotifications(notificationPreferences, readingReminderDays),
    ...initialRecentNotifications,
  ]);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [churchAlerts, setChurchAlerts] = useState(true);
  const { isClosing: notificationClosing, dismiss: dismissNotification } = useSlideDismiss(() => setNotificationOpen(false), 180);
  const { isClosing: settingsClosing, dismiss: dismissSettings } = useSlideDismiss(() => setSettingsOpen(false));
  const unreadCount = notifications.filter(({ unread }) => unread).length;

  useEffect(() => {
    const generatedIds = new Set(['notice-daily-verse', 'notice-reading-reminder']);
    const generated = buildGuidanceNotifications(notificationPreferences, readingReminderDays);
    setNotifications((current) => [
      ...generated.map((item) => current.find(({ id }) => id === item.id) ?? item),
      ...current.filter(({ id }) => !generatedIds.has(id)),
    ]);
  }, [notificationPreferences.dailyVerse, notificationPreferences.readingReminder, readingReminderDays]);

  const markNotificationRead = (notificationId) => {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, unread: false } : notification
    )));
  };

  const openSettings = () => {
    setNotificationOpen(false);
    setSettingsPage('root');
    setAccountActionMessage('');
    setSettingsOpen(true);
  };

  const closeSettings = () => dismissSettings(() => {
    setSettingsPage('root');
    setAccountActionMessage('');
  });

  const copyAccountUid = async () => {
    if (!accountUser?.id) return;
    try {
      await navigator.clipboard.writeText(accountUser.id);
      setUidCopied(true);
      window.setTimeout(() => setUidCopied(false), 1400);
    } catch {
      setAccountActionMessage('UID를 복사하지 못했어요.');
    }
  };

  const connectIdentity = async (provider) => {
    setAccountActionMessage('');
    try {
      await linkSocialIdentity(provider);
    } catch (error) {
      setAccountActionMessage(error?.message || '계정 연동을 시작하지 못했어요.');
    }
  };

  const connectedProviders = new Set(
    (accountUser?.identities ?? []).map((identity) => identity.provider)
  );
  const accountProviders = [
    { id: 'email', label: '이메일' },
    { id: 'google', label: 'Google' },
    { id: 'kakao', label: 'Kakao' },
    { id: 'apple', label: 'Apple' },
    { id: 'naver', label: 'Naver' },
  ];
  const signedChurchMember = serverChurchWorkspace?.members?.find(({ userId }) => userId === accountUser?.id);
  const signedDepartment = serverChurchWorkspace?.departments?.find(({ id }) => id === signedChurchMember?.departmentId);
  const settingsChurchName = currentChurch?.name || '참여 중인 공동체 없음';
  const settingsNickname = personalProfile?.nickname ? `@${personalProfile.nickname}` : '닉네임 미설정';
  const settingsDepartment = signedDepartment?.name
    || (currentChurch?.id === SAMPLE_COMMUNITY_ID ? churchInfo.department : (currentChurch ? '부서 미지정' : '소속 부서 없음'));
  const settingsRole = signedChurchMember?.title
    || (currentChurch ? (churchAccess?.authority || '구성원') : '직책 없음');

  const openNotification = (notification) => {
    markNotificationRead(notification.id);
    dismissNotification(() => onOpenNotification(notification));
  };

  const selectThemeControlMode = (nextMode) => {
    if (nextMode === 'always') {
      const currentlyDark = document.documentElement.dataset.theme === 'dark';
      setThemeControlMode('always');
      setThemePreference(currentlyDark ? 'dark' : 'light');
      return;
    }
    setThemeControlMode(nextMode);
    setThemePreference(nextMode);
  };

  const alwaysDarkEnabled = themeControlMode === 'always' && themePreference === 'dark';
  const darkModeToggleChecked = themeControlMode === 'always' ? alwaysDarkEnabled : true;

  const openPrimaryMenu = () => {
    setNotificationOpen(false);
    setSettingsOpen(false);
    if (activeTab === 'messages') onOpenMessageFriends();
    else onOpenChatHistory();
  };

  const primaryMenuLabel = activeTab === 'messages' ? '친구 관리 열기' : '지난 대화 열기';
  const primaryMenuTitle = activeTab === 'messages' ? '친구 관리' : '지난 대화';

  return (
    <>
      <header className="topbar">
        <button
          className="icon-button topbar-history-button"
          data-tutorial="chat-history"
          type="button"
          aria-label={primaryMenuLabel}
          title={primaryMenuTitle}
          onClick={openPrimaryMenu}
        >
          <Menu size={21} aria-hidden="true" />
        </button>
        <div className="topbar-actions">
          <div className="topbar-action-wrap">
            <button
              className="icon-button notification-button"
              type="button"
              aria-label={`알림${unreadCount ? `, 읽지 않음 ${unreadCount}개` : ''}`}
              aria-expanded={notificationOpen}
              title="알림"
              onClick={() => notificationOpen ? dismissNotification() : setNotificationOpen(true)}
            >
              <Bell size={20} aria-hidden="true" />
              {unreadCount > 0 && <span aria-hidden="true" />}
            </button>
            {notificationOpen && (
              <>
                <button className={`notification-dismiss-layer ${notificationClosing ? 'is-closing' : ''}`} type="button" aria-label="알림 닫기" onClick={() => dismissNotification()} />
                <section className={`notification-popover ${notificationClosing ? 'is-closing' : ''}`} aria-label="최근 알림">
                  <header>
                    <div className="notification-head-copy"><h2>최근 알림</h2><span>{unreadCount}개 안 읽음</span></div>
                    <div className="notification-head-actions">
                      <button type="button" disabled={!notifications.length} onClick={() => setNotifications((current) => current.map((item) => ({ ...item, unread: false })))}>모두 읽음</button>
                      <button type="button" disabled={!notifications.length} onClick={() => setNotifications([])}>모두 삭제</button>
                    </div>
                  </header>
                  <div className="notification-wheel" tabIndex="0" aria-label="최근 알림 목록">
                    {notifications.map((notification) => (
                      <NotificationSwipeItem
                        notification={notification}
                        key={notification.id}
                        onOpen={() => openNotification(notification)}
                        onDelete={() => setNotifications((current) => current.filter(({ id }) => id !== notification.id))}
                      />
                    ))}
                    {notifications.length === 0 && (
                      <div className="notification-empty"><Bell size={20} aria-hidden="true" /><strong>새 알림이 없어요</strong><span>새로운 소식이 도착하면 여기에 표시됩니다.</span></div>
                    )}
                  </div>
                  {notifications.length > 0 && <footer><ChevronDown size={16} aria-hidden="true" /><span>스크롤하여 이전 알림 보기</span></footer>}
                </section>
              </>
            )}
          </div>
          <button className="icon-button" type="button" aria-label="설정 열기" title="설정" onClick={openSettings}>
            <Settings size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {settingsOpen && createPortal(
        <div className={`global-settings-layer ${settingsClosing ? 'is-closing' : ''}`}>
          <button className="global-settings-backdrop" type="button" aria-label="설정 닫기" onClick={closeSettings} />
          <aside className="global-settings-drawer" aria-label="설정">
            <div className={`settings-view-rail ${settingsPage === 'root' ? '' : 'is-detail'}`}>
              <div className="settings-view settings-root-view" aria-hidden={settingsPage !== 'root'} inert={settingsPage !== 'root'}>
                <header>
                  <span className="settings-header-spacer" aria-hidden="true" />
                  <h2>설정</h2>
                  <button type="button" aria-label="설정 닫기" onClick={closeSettings}><X size={22} aria-hidden="true" /></button>
                </header>

                <section className="settings-profile" aria-label="내 프로필 요약">
                  <span className={`member-avatar ${personalProfile?.avatarImage ? 'has-image' : ''}`} aria-hidden="true">
                    {personalProfile?.avatarImage ? <img src={personalProfile.avatarImage} alt="" /> : <UserRound className="default-profile-glyph" />}
                  </span>
                  <div>
                    <strong>{personalProfile?.name || accountUser?.email || '게스트'}</strong>
                    <small>{settingsChurchName} · {settingsNickname}</small>
                    <small>{settingsDepartment} · {settingsRole}</small>
                  </div>
                </section>

                <section className="settings-group settings-plus-group">
                  <h3>구독</h3>
                  <button className="settings-plus-entry" type="button" onClick={() => onRequestPlus('overview')}>
                    <span className="settings-plus-mark"><Crown size={19} aria-hidden="true" /></span>
                    <span><strong>바이블온 플러스</strong><small>{isPlus ? `${plusPreviewMode ? '미리보기 · ' : ''}Plus 사용 중` : '분석, 메모, 음성 요약과 테마'}</small></span>
                    <b className={isPlus ? 'is-active' : ''}>{isPlus ? 'Plus' : '월 1,500원'}</b>
                  </button>
                </section>

                <section className="settings-group">
              <h3>성경 읽기</h3>
              <div className="settings-option-row">
                <span><BookOpen size={20} aria-hidden="true" /><strong>기본 번역</strong></span>
                <div className="settings-segmented" aria-label="기본 번역 선택">
                  {translations.map((translation) => (
                    <button
                      className={selectedTranslation === translation.id ? 'is-active' : ''}
                      type="button"
                      aria-pressed={selectedTranslation === translation.id}
                      key={translation.id}
                      onClick={() => setSelectedTranslation(translation.id)}
                    >
                      {translation.label}
                    </button>
                  ))}
                </div>
              </div>
                </section>

                <section className="settings-group">
              <h3>화면</h3>
              <div className="settings-theme-branch is-above">
                <div className="settings-theme-choices" role="group" aria-label="다크 모드 작동 방식">
                  <button className={themeControlMode === 'always' ? 'is-active' : ''} type="button" aria-pressed={themeControlMode === 'always'} onClick={() => selectThemeControlMode('always')}><Moon size={15} />항상</button>
                  <button className={themeControlMode === 'schedule' ? 'is-active' : ''} type="button" aria-pressed={themeControlMode === 'schedule'} onClick={() => selectThemeControlMode('schedule')}><Clock3 size={15} />시간 지정</button>
                  <button className={themeControlMode === 'system' ? 'is-active' : ''} type="button" aria-pressed={themeControlMode === 'system'} onClick={() => selectThemeControlMode('system')}><Monitor size={15} />시스템</button>
                </div>
                {themeControlMode === 'schedule' && (
                  <div className="settings-theme-schedule">
                    <label><span>시작</span><input type="time" aria-label="다크 모드 시작 시간" value={darkModeStart} onChange={(event) => setDarkModeStart(event.target.value)} /></label>
                    <label><span>종료</span><input type="time" aria-label="다크 모드 종료 시간" value={darkModeEnd} onChange={(event) => setDarkModeEnd(event.target.value)} /></label>
                  </div>
                )}
              </div>
              <button
                className={`settings-toggle-row ${themeControlMode === 'always' ? '' : 'is-locked'}`}
                type="button"
                role="switch"
                aria-checked={darkModeToggleChecked}
                disabled={themeControlMode !== 'always'}
                onClick={() => setThemePreference((current) => current === 'dark' ? 'light' : 'dark')}
              >
                <span><Moon size={20} aria-hidden="true" /><span><strong>다크 모드</strong><small>{themeControlMode === 'always' ? (alwaysDarkEnabled ? '항상 사용 중' : '라이트 모드 사용 중') : themeControlMode === 'system' ? '시스템 설정으로 자동 적용' : `${darkModeStart}부터 ${darkModeEnd}까지 자동 적용`}</small></span></span>
                <i className={darkModeToggleChecked ? 'is-on' : ''}><b /></i>
              </button>
              <div className={`settings-accent-block ${isPlus ? '' : 'is-locked'}`}>
                <div className="settings-accent-heading">
                  <div><Palette size={20} aria-hidden="true" /><span><strong>테마 색상</strong><small>{isPlus ? '다섯 색조를 각각 조정해요' : 'Plus에서 사용할 수 있어요'}</small></span></div>
                  <button type="button" aria-label="테마 색상 초기화" title="초기화" disabled={!isPlus} onClick={onThemePaletteReset}><RotateCcw size={16} aria-hidden="true" /></button>
                </div>
                <div className="settings-theme-palette" role="group" aria-label="테마 색조 조정">
                  {THEME_TONE_OPTIONS.map((tone) => {
                    const hue = themePalette[tone.id];
                    return (
                      <label className="settings-theme-tone" key={tone.id}>
                        <span className="settings-theme-tone-meta">
                          <i style={{ background: `var(${tone.previewVariable})` }} aria-hidden="true" />
                          <span><strong>{tone.label}</strong><small>{tone.description}</small></span>
                          <output>{hue}°</output>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          step="1"
                          value={hue}
                          disabled={!isPlus}
                          aria-label={`${tone.label} 색조`}
                          style={{ '--tone-color': `hsl(${hue} ${tone.saturation}% ${tone.lightness}%)` }}
                          onChange={(event) => onThemeHueChange(tone.id, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
                {!isPlus && <button className="settings-theme-unlock" type="button" onClick={() => onRequestPlus('theme')}>Plus로 테마 열기</button>}
              </div>
                </section>

                <section className="settings-group">
              <h3>알림</h3>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={messageAlerts}
                onClick={() => setMessageAlerts((current) => !current)}
              >
                 <span><MessageCircle size={20} aria-hidden="true" /><span><strong>메시지 알림</strong><small>공동체 구성원의 새 메시지</small></span></span>
                <i className={messageAlerts ? 'is-on' : ''}><b /></i>
              </button>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={churchAlerts}
                onClick={() => setChurchAlerts((current) => !current)}
              >
                 <span><Users size={20} aria-hidden="true" /><span><strong>공동체 알림</strong><small>공지와 예배 정보 업데이트</small></span></span>
                <i className={churchAlerts ? 'is-on' : ''}><b /></i>
              </button>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={notificationPreferences.dailyVerse}
                onClick={() => onNotificationPreferenceChange('dailyVerse', !notificationPreferences.dailyVerse)}
              >
                <span><Sparkles size={20} aria-hidden="true" /><span><strong>오늘의 추천 말씀</strong><small>매일 읽을 말씀을 알려드려요</small></span></span>
                <i className={notificationPreferences.dailyVerse ? 'is-on' : ''}><b /></i>
              </button>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={notificationPreferences.readingReminder}
                onClick={() => onNotificationPreferenceChange('readingReminder', !notificationPreferences.readingReminder)}
              >
                <span><BookOpen size={20} aria-hidden="true" /><span><strong>성경 읽기 알림</strong><small>읽지 않은 기간을 계산해 알려드려요</small></span></span>
                <i className={notificationPreferences.readingReminder ? 'is-on' : ''}><b /></i>
              </button>
                </section>

                <section className="settings-group settings-link-list">
              <h3>계정 및 서비스</h3>
              <button type="button" onClick={() => setSettingsPage('account')}><span><UserRound size={20} /><strong>계정 관리</strong></span><ChevronRight size={18} /></button>
              <button type="button" onClick={() => setSettingsPage('privacy')}><span><ShieldCheck size={20} /><strong>개인정보 및 보안</strong></span><ChevronRight size={18} /></button>
              {signedIn && (
                <button className="settings-signout-button" type="button" onClick={onSignOut}>
                  <span><LogOut size={20} /><strong>로그아웃</strong></span><ChevronRight size={18} />
                </button>
              )}
                </section>
              </div>

              <div className="settings-view settings-detail-view" aria-hidden={settingsPage === 'root'} inert={settingsPage === 'root'}>
                <header>
                  <button type="button" aria-label="설정으로 돌아가기" onClick={() => { setSettingsPage('root'); setAccountActionMessage(''); }}><ChevronLeft size={22} aria-hidden="true" /></button>
                  <h2>{settingsPage === 'privacy' ? '개인정보 및 보안' : '계정 관리'}</h2>
                  <button type="button" aria-label="설정 닫기" onClick={closeSettings}><X size={22} aria-hidden="true" /></button>
                </header>

                {settingsPage === 'account' && (
                  <div className="settings-detail-content">
                    <section className="settings-account-summary">
                      <span className={`member-avatar ${personalProfile?.avatarImage ? 'has-image' : ''}`} aria-hidden="true">
                        {personalProfile?.avatarImage ? <img src={personalProfile.avatarImage} alt="" /> : <UserRound className="default-profile-glyph" />}
                      </span>
                      <div><strong>{personalProfile?.name || accountUser?.email || '게스트'}</strong><small>{accountUser?.email || '로그인하지 않음'}</small></div>
                    </section>

                    <section className="settings-detail-group">
                      <h3>계정 식별자</h3>
                      <button className="settings-uid-row" type="button" disabled={!accountUser?.id} onClick={copyAccountUid}>
                        <span><strong>UID</strong><code>{accountUser?.id || '로그인 후 확인할 수 있어요'}</code></span>
                        <span>{uidCopied ? '복사됨' : <Copy size={17} aria-hidden="true" />}</span>
                      </button>
                    </section>

                    <section className="settings-detail-group settings-identity-list">
                      <h3>계정 연동 관리</h3>
                      {accountProviders.map((provider) => {
                        const linked = connectedProviders.has(provider.id)
                          || (provider.id === 'email' && accountUser?.email && connectedProviders.size === 0);
                        return (
                          <div className="settings-identity-row" key={provider.id}>
                            <span><strong>{provider.label}</strong><small>{linked ? '연동됨' : '연동 안 됨'}</small></span>
                            {provider.id === 'email' || linked
                              ? <b className={linked ? 'is-linked' : ''}>{linked ? '사용 중' : '미연동'}</b>
                              : <button type="button" disabled={!signedIn} onClick={() => connectIdentity(provider.id)}>연동</button>}
                          </div>
                        );
                      })}
                    </section>
                    {accountActionMessage && <p className="settings-account-message" role="status">{accountActionMessage}</p>}
                  </div>
                )}

                {settingsPage === 'privacy' && (
                  <article className="settings-detail-content settings-privacy-policy">
                    <header><strong>바이블온 개인정보 및 보안 정책</strong><small>현재 적용 기준 · 2026년 9월 4일</small></header>
                    <section><h3>개인 기록</h3><p>성경 읽음, 메모, 강조, 통독, 업적과 홈 대화 기록은 로그인한 계정에 귀속됩니다. 로그인 전 기록은 해당 기기의 게스트 공간에만 보관됩니다.</p></section>
                    <section><h3>공동체 기록</h3><p>공동체 가입, 부서, 친구, 대화, QT, 공지와 예배 정보는 공동체 기능 제공을 위해 서버에 저장되며 허용된 구성원에게만 공개됩니다.</p></section>
                    <section><h3>파일과 기기 캐시</h3><p>프로필 이미지와 메시지 첨부파일은 비공개 저장소에 보관합니다. 성경 본문은 빠른 읽기를 위해 기기에 내려받아 캐시하며 계정 간에 내용을 공유해도 개인 기록은 공유하지 않습니다.</p></section>
                    <section><h3>접근 보호</h3><p>데이터베이스 행 단위 접근 정책과 만료되는 파일 주소를 사용합니다. 사용자는 자신의 계정 데이터에만 접근하며, 대화와 공동체 데이터는 참여 여부와 권한을 서버에서 확인합니다.</p></section>
                    <section><h3>사용자 선택권</h3><p>프로필과 개인 기록은 앱에서 수정할 수 있습니다. 로그아웃하면 서버 계정과의 연결이 종료되며 기기의 로그인 세션을 제거합니다.</p></section>
                  </article>
                )}
              </div>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}

function NotificationSwipeItem({ notification, onOpen, onDelete }) {
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const Icon = notification.icon;

  const handlePointerDown = (event) => {
    gestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      initialOffset: offset,
      deleteArmed: offset <= -60,
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event) => {
    if (!gestureRef.current) return;
    const deltaX = event.clientX - gestureRef.current.x;
    const deltaY = event.clientY - gestureRef.current.y;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) > 5) suppressClickRef.current = true;
    const minimumOffset = gestureRef.current.deleteArmed ? -132 : -68;
    setOffset(Math.max(minimumOffset, Math.min(0, gestureRef.current.initialOffset + deltaX)));
  };

  const finishPointerGesture = (event, allowDelete = true) => {
    if (!gestureRef.current) return;
    const gesture = gestureRef.current;
    const deltaX = event ? event.clientX - gesture.x : 0;
    if (allowDelete && gesture.deleteArmed && deltaX < -38) {
      gestureRef.current = null;
      suppressClickRef.current = true;
      deleteNotification();
      return;
    }
    setOffset((current) => (current < -30 ? -68 : 0));
    gestureRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const deleteNotification = () => {
    setDeleting(true);
    window.setTimeout(onDelete, 210);
  };

  return (
    <div className={`notification-swipe-row ${deleting ? 'is-deleting' : ''}`}>
      <button className="notification-delete" type="button" aria-label={`${notification.title} 알림 삭제`} onClick={deleteNotification}>
        <X size={19} aria-hidden="true" />
      </button>
      <button
        className={`notification-item ${notification.unread ? 'is-unread' : ''}`}
        type="button"
        style={{ transform: `translateX(${offset}px)` }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            return;
          }
          if (offset < 0) setOffset(0);
          else onOpen();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={(event) => finishPointerGesture(event, false)}
      >
        <span className="notification-item-icon"><Icon size={18} aria-hidden="true" /></span>
        <span className="notification-item-copy">
          <span><b>{notification.type}</b><time>{notification.time}</time></span>
          <strong>{notification.title}</strong>
          <small>{notification.body}</small>
        </span>
        {notification.unread && <i aria-label="읽지 않음" />}
      </button>
    </div>
  );
}

function HomeChatHistory({
  isOpen,
  chatRooms,
  activeChatId,
  onClose,
  onOpenChat,
  onStartNewChat,
  onDeleteChat,
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const sortedChatRooms = useMemo(() => (
    [...chatRooms].sort((first, second) => second.updatedAt - first.updatedAt)
  ), [chatRooms]);
  const pendingDeleteRoom = chatRooms.find(({ id }) => id === pendingDeleteId);

  useEffect(() => {
    if (!isOpen) setPendingDeleteId('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`home-chat-history-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="home-chat-history-backdrop" type="button" aria-label="지난 대화 닫기" onClick={() => dismiss()} />
      <aside className="home-chat-history" aria-label="지난 대화">
        <header>
          <div><Menu size={20} aria-hidden="true" /><h2>지난 대화</h2></div>
          <div>
            <button
              type="button"
              aria-label="새 대화"
              title="새 대화"
              onClick={() => {
                dismiss(onStartNewChat);
              }}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <button type="button" aria-label="지난 대화 닫기" onClick={() => dismiss()}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="home-chat-history-list">
          {sortedChatRooms.map((room) => (
            <div className={`home-chat-history-row ${room.id === activeChatId ? 'is-active' : ''}`} key={room.id}>
              <button
                type="button"
                onClick={() => {
                  dismiss(() => onOpenChat(room.id));
                }}
              >
                <strong>{room.title}</strong>
                <span>{formatHomeChatTime(room.updatedAt)}</span>
              </button>
              <button type="button" aria-label={`${room.title} 삭제`} onClick={() => setPendingDeleteId(room.id)}>
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          ))}
          {sortedChatRooms.length === 0 && (
            <div className="home-chat-history-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <p>아직 저장된 대화가 없어요.</p>
            </div>
          )}
        </div>

        {pendingDeleteRoom && (
          <div className="home-chat-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="home-chat-delete-title">
            <strong id="home-chat-delete-title">이 대화를 삭제할까요?</strong>
            <p>목록에서 즉시 사라지며 30일 후 완전히 삭제됩니다.</p>
            <div>
              <button type="button" onClick={() => setPendingDeleteId('')}>취소</button>
              <button
                type="button"
                onClick={() => {
                  onDeleteChat(pendingDeleteRoom.id);
                  setPendingDeleteId('');
                }}
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function BottomNav({ activeTab, onSelectTab }) {
  return (
    <nav className="bottom-nav" data-tutorial="bottom-navigation" aria-label="하단 메뉴">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            className={`nav-item ${isActive ? 'is-active' : ''}`}
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="nav-icon">
              <Icon
                size={21}
                strokeWidth={isActive ? 2.35 : 2}
                fill={isActive ? 'currentColor' : 'none'}
                fillOpacity={isActive ? 0.22 : 0}
                aria-hidden="true"
              />
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function AppTutorial({ step, readPracticePhase, longPressDone, onNext, onSkip }) {
  const [spotlight, setSpotlight] = useState(null);
  const currentStep = APP_TUTORIAL_STEPS[step] ?? APP_TUTORIAL_STEPS[0];
  const scopeSteps = APP_TUTORIAL_STEPS.filter(({ scope }) => scope === currentStep.scope);
  const scopeStepIndex = scopeSteps.findIndex(({ target }) => target === currentStep.target);
  const isLastScopeStep = scopeStepIndex === scopeSteps.length - 1;
  const isInteractive = Boolean(currentStep.interaction);
  const description = currentStep.interaction === 'read-cycle' && readPracticePhase === 1
    ? '읽음으로 표시됐어요. 같은 절을 다시 두 번 눌러 읽음 표시를 취소해 보세요.'
    : currentStep.interaction === 'long-press' && longPressDone
      ? '옵션 말풍선을 직접 확인했어요.'
      : currentStep.description;

  useLayoutEffect(() => {
    let hasScrolled = false;
    let settleTimerId;
    const syncSpotlight = () => {
      const shell = document.querySelector('.app-shell');
      const target = document.querySelector(`[data-tutorial="${currentStep.target}"]`);
      if (!shell || !target) {
        setSpotlight(null);
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const baseTargetRect = target.getBoundingClientRect();
      const revealedAction = currentStep.interaction === 'long-press' && longPressDone
        ? target.closest('.verse-wrap')?.querySelector('.verse-action-inline')
        : null;
      const actionRect = revealedAction?.getBoundingClientRect();
      const targetRect = actionRect ? {
        left: Math.min(baseTargetRect.left, actionRect.left),
        right: Math.max(baseTargetRect.right, actionRect.right),
        top: Math.min(baseTargetRect.top, actionRect.top),
        bottom: Math.max(baseTargetRect.bottom, actionRect.bottom),
        width: Math.max(baseTargetRect.right, actionRect.right) - Math.min(baseTargetRect.left, actionRect.left),
        height: Math.max(baseTargetRect.bottom, actionRect.bottom) - Math.min(baseTargetRect.top, actionRect.top),
      } : baseTargetRect;
      if (!hasScrolled && (targetRect.top < shellRect.top + 66 || targetRect.bottom > shellRect.bottom - 92)) {
        hasScrolled = true;
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        settleTimerId = window.setTimeout(syncSpotlight, 260);
      }

      const padding = currentStep.target === 'verse-interactions' ? 5 : 8;
      const left = Math.max(8, targetRect.left - shellRect.left - padding);
      const top = Math.max(8, targetRect.top - shellRect.top - padding);
      const width = Math.min(shellRect.width - left - 8, targetRect.width + (padding * 2));
      const height = Math.min(shellRect.height - top - 8, targetRect.height + (padding * 2));
      const bubbleWidth = Math.min(326, shellRect.width - 28);
      const estimatedBubbleHeight = 174;
      const belowTop = top + height + 14;
      const bubbleTop = belowTop + estimatedBubbleHeight <= shellRect.height - 12
        ? belowTop
        : Math.max(12, top - estimatedBubbleHeight - 14);
      const bubbleLeft = Math.max(14, Math.min(
        shellRect.width - bubbleWidth - 14,
        left + (width / 2) - (bubbleWidth / 2)
      ));

      setSpotlight({ left, top, width, height, bubbleLeft, bubbleTop, bubbleWidth });
    };

    syncSpotlight();
    const intervalId = window.setInterval(syncSpotlight, 90);
    window.addEventListener('resize', syncSpotlight);
    window.addEventListener('scroll', syncSpotlight, true);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(settleTimerId);
      window.removeEventListener('resize', syncSpotlight);
      window.removeEventListener('scroll', syncSpotlight, true);
    };
  }, [currentStep.interaction, currentStep.target, longPressDone]);

  return createPortal(
    <div className={`app-tutorial-layer ${isInteractive ? 'is-interactive' : ''}`} role="dialog" aria-modal={!isInteractive} aria-labelledby="app-tutorial-title">
      {spotlight && (
        <>
          <div
            className="app-tutorial-spotlight"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
            }}
            aria-hidden="true"
          />
          {isInteractive && !longPressDone && (
            <span
              className={`app-tutorial-demo-pointer is-${currentStep.interaction}`}
              style={{
                left: spotlight.left + (spotlight.width * 0.68) - 18,
                top: spotlight.top + (spotlight.height * 0.52) - 18,
              }}
              aria-hidden="true"
            >
              <Pointer size={36} fill="currentColor" strokeWidth={1.35} />
            </span>
          )}
          {!isInteractive && (
            <button
              className="app-tutorial-spotlight-action"
              type="button"
              aria-label={`${currentStep.title} 확인 후 다음 안내`}
              style={{
                left: spotlight.left,
                top: spotlight.top,
                width: spotlight.width,
                height: spotlight.height,
              }}
              onClick={onNext}
            />
          )}
          <section
            className="app-tutorial-card"
            style={{ left: spotlight.bubbleLeft, top: spotlight.bubbleTop, width: spotlight.bubbleWidth }}
          >
            <div className="app-tutorial-progress" style={{ '--tutorial-step-count': scopeSteps.length }} aria-label={`튜토리얼 ${scopeStepIndex + 1}/${scopeSteps.length}`}>
              {scopeSteps.map((item, index) => <i className={index <= scopeStepIndex ? 'is-active' : ''} key={item.target} />)}
            </div>
            <span>{scopeStepIndex + 1} / {scopeSteps.length}</span>
            <h2 id="app-tutorial-title">{currentStep.title}</h2>
            <p aria-live="polite">{description}</p>
            {currentStep.interaction === 'long-press' && longPressDone && (
              <div className="app-tutorial-success" role="status"><Check size={16} aria-hidden="true" />잘했어요!</div>
            )}
            {(!isInteractive || (currentStep.interaction === 'long-press' && longPressDone)) && (
              <footer className={isInteractive ? 'is-guided' : undefined}>
                {!isInteractive && <button type="button" onClick={onSkip}>건너뛰기</button>}
                <button type="button" onClick={onNext}>{isLastScopeStep ? '시작하기' : '다음'}</button>
              </footer>
            )}
          </section>
        </>
      )}
    </div>,
    document.body
  );
}

function HomeView({
  selectedBook,
  selectedChapter,
  selectedTranslation,
  query,
  setQuery,
  selectBiblePassage,
  continueCurrentReading,
  favoriteRefs,
  chatRooms,
  activeChatId,
  ragMessages,
  isChatOpen,
  isIntro,
  openChat,
  closeChat,
  prepareChat,
  appendChatMessage,
  verseNotes,
  setVerseNotes,
  verseNoteMeta,
  setVerseNoteMeta,
  memoComments,
  onAddMemoComment,
  onUpdateMemoComment,
  worshipMemos,
  onWorshipMemoChange,
  memoViewMode,
  onMemoViewModeChange,
  popularityRankings,
  onOpenBibleVerse,
  isPlus,
  onRequestPlus,
  chatTokensUsed,
  chatTokenLimit,
  onConsumeChatTokens,
  currentCommunity,
}) {
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isMemoLibraryOpen, setIsMemoLibraryOpen] = useState(false);
  const [chatLimitNotice, setChatLimitNotice] = useState('');
  const answerEndRef = useRef(null);
  const homePageRef = useRef(null);
  const homeContentClusterRef = useRef(null);
  const searchContainerRef = useRef(null);
  const questionInputRef = useRef(null);
  const swipeGestureRef = useRef(null);
  const activeChatTitle = chatRooms.find(({ id }) => id === activeChatId)?.title ?? '새 대화';

  useEffect(() => {
    if (!isChatOpen) return;
    window.requestAnimationFrame(() => {
      answerEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, [isChatOpen, ragMessages.length]);

  useEffect(() => {
    const input = questionInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const maxHeight = 154;
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [question]);

  useEffect(() => {
    const observedSearch = searchContainerRef.current;
    const syncHomeLayout = () => {
      const page = homePageRef.current;
      const cluster = homeContentClusterRef.current;
      const search = searchContainerRef.current;
      const bottomNav = document.querySelector('.bottom-nav');
      if (!page || !cluster || !search || !bottomNav) return;

      const pageTop = page.getBoundingClientRect().top;
      const availableHeight = bottomNav.getBoundingClientRect().top - pageTop;
      const clusterShift = Math.max(0, availableHeight - cluster.offsetTop - search.offsetHeight);
      page.style.setProperty('--home-chat-height', `${availableHeight}px`);
      page.style.setProperty('--home-cluster-shift', `${clusterShift}px`);
      page.style.setProperty('--home-composer-height', `${search.offsetHeight}px`);

      const shell = page.closest('.app-shell');
      const searchBar = search.querySelector('.home-rag-search') ?? search;
      if (shell) {
        const shellRect = shell.getBoundingClientRect();
        const searchRect = searchBar.getBoundingClientRect();
        shell.style.setProperty(
          '--app-gradient-center-x',
          `${searchRect.left + searchRect.width / 2 - shellRect.left}px`
        );
        shell.style.setProperty(
          '--app-gradient-center-y',
          `${searchRect.top + searchRect.height / 2 - shellRect.top}px`
        );
        const gradientStartWidth = searchRect.width * 0.1;
        const gradientStartHeight = searchRect.height * 0.25;
        const gradientFinalHeight = availableHeight * 0.7;
        const gradientFinalWidth = gradientFinalHeight * (gradientStartWidth / gradientStartHeight);
        const gradientStartScale = gradientStartHeight / gradientFinalHeight;
        shell.style.setProperty('--app-gradient-final-width', `${gradientFinalWidth}px`);
        shell.style.setProperty('--app-gradient-final-height', `${gradientFinalHeight}px`);
        shell.style.setProperty('--app-gradient-start-scale', `${gradientStartScale}`);
      }
    };

    syncHomeLayout();
    const trackingStartedAt = performance.now();
    let frameId;
    const trackMovingSearch = () => {
      syncHomeLayout();
      if (performance.now() - trackingStartedAt < 1100) {
        frameId = window.requestAnimationFrame(trackMovingSearch);
      }
    };
    frameId = window.requestAnimationFrame(trackMovingSearch);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(syncHomeLayout);
    if (observedSearch) resizeObserver?.observe(observedSearch);
    window.addEventListener('resize', syncHomeLayout);
    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncHomeLayout);
    };
  }, [isChatOpen, isIntro, question]);

  const askBibleQuestion = async (nextQuestion) => {
    const text = nextQuestion.trim();
    if (!text || isSearching) return;
    const estimatedTokens = estimateChatTokens(text);
    if (!onConsumeChatTokens(estimatedTokens)) {
      setChatLimitNotice(isPlus
        ? '오늘 사용할 수 있는 채팅 토큰을 모두 사용했어요.'
        : '오늘의 기본 채팅 한도를 모두 사용했어요.');
      window.setTimeout(() => setChatLimitNotice(''), 2200);
      return;
    }

    const userMessage = { id: `question-${Date.now()}`, role: 'user', text };
    const roomId = prepareChat(text, !isChatOpen);
    openChat();
    appendChatMessage(roomId, userMessage);
    setQuestion('');
    setIsSearching(true);

    await new Promise((resolve) => window.setTimeout(resolve, 420));
    appendChatMessage(roomId, {
      id: `answer-${Date.now()}`,
      role: 'assistant',
      text: 'Test 중입니다.',
      citations: [],
    });
    setIsSearching(false);
  };

  const submitQuestion = (event) => {
    event.preventDefault();
    askBibleQuestion(question);
  };

  const handleSwipeStart = (event) => {
    if (!isChatOpen || event.target.closest('.home-rag-search')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    swipeGestureRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleSwipeEnd = (event) => {
    if (!swipeGestureRef.current || !isChatOpen) return;
    const deltaX = event.clientX - swipeGestureRef.current.x;
    const deltaY = event.clientY - swipeGestureRef.current.y;
    swipeGestureRef.current = null;
    if (deltaY < -72 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25) closeChat();
  };

  return (
    <div
      ref={homePageRef}
      className={`home-page ${isChatOpen ? 'is-chatting' : ''} ${isIntro ? 'is-intro' : ''}`}
      onPointerDown={handleSwipeStart}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={() => { swipeGestureRef.current = null; }}
    >
      <div className="home-search-brand" aria-hidden={isChatOpen}>
        <strong>무엇이든 편하게 물어보세요.</strong>
      </div>

      <div className="home-content-cluster" ref={homeContentClusterRef}>
        <div className="home-search-sticky" ref={searchContainerRef}>
          <form className="home-rag-search" data-tutorial="home-chatbot" role="search" onSubmit={submitQuestion}>
            <Search size={20} aria-hidden="true" />
            <textarea
              ref={questionInputRef}
              aria-label="바이블온 질문"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              placeholder="바이블온에게 물어보세요"
              rows="1"
            />
            {question && (
              <button className="home-search-clear" type="button" aria-label="질문 지우기" onClick={() => setQuestion('')}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
            <button className="home-search-submit" type="submit" aria-label="질문 보내기" disabled={!question.trim() || isSearching}>
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="home-lower-content" aria-hidden={isChatOpen} inert={isChatOpen ? true : undefined}>
          <section className="home-dashboard-sheet" aria-label="홈 정보">
            <div className="page-stack">
              <section className="today-reading" aria-labelledby="today-reading-title">
                <div className="today-reading-head">
                  <div>
                    <span className="eyebrow">마지막으로 읽은 성경</span>
                    <h2 id="today-reading-title">{selectedBook.name} {selectedChapter}장</h2>
                    <p>{selectedBook.title} · {selectedBook.lastRead}</p>
                  </div>
                </div>
                <button className="light-button today-reading-continue" type="button" onClick={continueCurrentReading}>
                  성경 이어서 읽기<ChevronRight size={18} aria-hidden="true" />
                </button>
              </section>

              <PopularBibleTop rankings={popularityRankings} onOpenBibleVerse={onOpenBibleVerse} />

              <button className="home-memo-entry" type="button" onClick={() => isPlus ? setIsMemoLibraryOpen(true) : onRequestPlus('bible-memo')}>
                <span className="home-memo-icon"><NotebookPen size={20} aria-hidden="true" /></span>
                <span className="home-memo-copy">
                  <strong>나의 메모</strong>
                  <small>{memoComments.length ? `저장한 메모 ${memoComments.length}개` : '기록한 말씀을 한곳에서 확인해요'}</small>
                </span>
                <ChevronRight size={19} aria-hidden="true" />
              </button>

              {currentCommunity && (
                <section className="church-context">
                  <div className="church-context-mark"><Users size={22} aria-hidden="true" /></div>
                  <div>
                    <span>대표 공동체</span>
                    <strong>{currentCommunity.name}</strong>
                    <small>{getCommunityTypeLabel(currentCommunity)}</small>
                  </div>
                  <ChevronRight size={19} aria-hidden="true" />
                </section>
              )}

              <HomeRecommendations
                query={query}
                setQuery={setQuery}
                selectBiblePassage={selectBiblePassage}
                favoriteRefs={favoriteRefs}
                onOpenBibleVerse={onOpenBibleVerse}
                selectedTranslation={selectedTranslation}
                isPlus={isPlus}
                onRequestPlus={onRequestPlus}
              />
            </div>
          </section>
        </div>
      </div>

      {isChatOpen && (
        <section className="home-rag-chat" aria-label="바이블온 대화" aria-live="polite">
          <div className="home-chat-toolbar">
            <strong>{activeChatTitle}</strong>
            <small>오늘 {chatTokensUsed.toLocaleString()} / {chatTokenLimit.toLocaleString()} 토큰</small>
          </div>
          <div className="home-chat-messages">
            {ragMessages.map((message) => (
              <div className={`home-chat-message is-${message.role}`} key={message.id}>
                {message.role === 'assistant' && (
                  <span className="home-chat-avatar">
                    <BibleOnLogo variant="white" size={32} aria-hidden="true" />
                  </span>
                )}
                <div className="home-chat-message-body">
                  <p>{message.text}</p>
                  {message.citations?.length > 0 && (
                    <div className="home-rag-sources" aria-label="답변 출처">
                      {message.citations.map((citation) => (
                        <article className="home-rag-source" key={citation.id}>
                          <header><strong>{citation.reference}</strong><span>{citation.translation}</span></header>
                          <p>{citation.text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isSearching && (
              <div className="home-chat-message is-assistant is-loading" role="status">
                <span className="home-chat-avatar"><BibleOnLogo variant="white" size={32} aria-hidden="true" /></span>
                <div className="home-chat-thinking"><i /><i /><i /></div>
              </div>
            )}
            <div ref={answerEndRef} />
          </div>
        </section>
      )}

      {chatLimitNotice && <div className="home-chat-limit-notice" role="status">{chatLimitNotice}</div>}

      {isMemoLibraryOpen && (
        <MemoLibraryScreen
          verseNotes={verseNotes}
          setVerseNotes={setVerseNotes}
          verseNoteMeta={verseNoteMeta}
          setVerseNoteMeta={setVerseNoteMeta}
          memoComments={memoComments}
          onAddMemoComment={onAddMemoComment}
          onUpdateMemoComment={onUpdateMemoComment}
          worshipMemos={worshipMemos}
          onWorshipMemoChange={onWorshipMemoChange}
          viewMode={memoViewMode}
          onViewModeChange={onMemoViewModeChange}
          onClose={() => setIsMemoLibraryOpen(false)}
        />
      )}
    </div>
  );
}

function MemoEditorScreen({ target, comments, onAdd, onUpdate, onClose }) {
  const visibleComments = useMemo(() => comments.filter((comment) => (
    target.includeRelated && target.verseIds.length === 1
      ? comment.verseIds.includes(target.verseIds[0])
      : comment.threadKey === target.threadKey
  )).sort((left, right) => left.createdAt - right.createdAt), [comments, target]);
  const [composer, setComposer] = useState(() => visibleComments.length === 0 ? { target, parentId: null } : null);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const [copyActionsOpen, setCopyActionsOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const verseContextRef = useRef(null);
  const verseTextRef = useRef(null);
  const copyPressTimerRef = useRef(null);
  const copyPressRef = useRef(null);
  const displayedVerses = target.verses;
  const passageText = displayedVerses
    .map((item) => `${item.ref}${item.text ? `\n${item.text}` : ''}`)
    .join('\n\n');

  useEffect(() => {
    setComposer(visibleComments.length === 0 ? { target, parentId: null } : null);
    setEditingId('');
    setDraft('');
    setCopyActionsOpen(false);
    setCopyNotice('');
  }, [target.threadKey]);

  useEffect(() => () => window.clearTimeout(copyPressTimerRef.current), []);

  useEffect(() => {
    if (!copyActionsOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!verseContextRef.current?.contains(event.target)) setCopyActionsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [copyActionsOpen]);

  const clearCopyPress = () => {
    window.clearTimeout(copyPressTimerRef.current);
    copyPressTimerRef.current = null;
  };

  const startCopyPress = (event) => {
    if (event.button !== 0 || event.target.closest('.memo-copy-actions')) return;
    clearCopyPress();
    copyPressRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    copyPressTimerRef.current = window.setTimeout(() => {
      setCopyActionsOpen(true);
      copyPressRef.current = null;
    }, 520);
  };

  const moveCopyPress = (event) => {
    const press = copyPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      clearCopyPress();
      copyPressRef.current = null;
    }
  };

  const endCopyPress = () => {
    clearCopyPress();
    copyPressRef.current = null;
  };

  const copyAllPassages = async () => {
    try {
      await navigator.clipboard.writeText(passageText);
      setCopyNotice('복사했어요');
      window.setTimeout(() => setCopyNotice(''), 1400);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(verseTextRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
      setCopyNotice('복사했어요');
    }
    setCopyActionsOpen(false);
  };

  const selectPassageText = () => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(verseTextRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
    setCopyActionsOpen(false);
  };

  const startNewMemo = () => {
    setEditingId('');
    setDraft('');
    setComposer({ target: createMemoTarget(target.verses, { reference: target.reference }), parentId: null });
  };

  const continueMemo = (comment) => {
    setEditingId('');
    setDraft('');
    setComposer({
      target: createMemoTarget(comment.verses, { reference: comment.reference }),
      parentId: comment.id,
    });
  };

  const editMemo = (comment) => {
    setComposer(null);
    setEditingId(comment.id);
    setDraft(comment.body);
  };

  const saveDraft = () => {
    if (!draft.trim()) return;
    if (editingId) onUpdate(editingId, draft);
    else if (composer) onAdd({ target: composer.target, body: draft, parentId: composer.parentId });
    setEditingId('');
    setComposer(null);
    setDraft('');
  };

  return (
    <section className="memo-editor-screen" role="dialog" aria-modal="true" aria-labelledby="memo-editor-title">
      <header className="memo-screen-header">
        <button type="button" aria-label="메모 화면 닫기" title="뒤로" onClick={onClose}>
          <ChevronLeft size={23} aria-hidden="true" />
        </button>
        <h2 id="memo-editor-title">말씀 메모</h2>
        <span aria-hidden="true" />
      </header>
      <div className="memo-editor-body">
        <div
          className={`memo-verse-context ${displayedVerses.length > 1 ? 'is-multiple' : ''}`}
          ref={verseContextRef}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={startCopyPress}
          onPointerMove={moveCopyPress}
          onPointerUp={endCopyPress}
          onPointerCancel={endCopyPress}
          aria-label={`선택한 말씀 ${displayedVerses.length}절`}
        >
          <div className="memo-verse-scroll" ref={verseTextRef}>
            {displayedVerses.map((item) => (
              <article className="memo-selected-verse" key={item.id ?? item.ref}>
                <strong>{item.ref}</strong>
                {item.text && <p>{item.text}</p>}
              </article>
            ))}
          </div>
          {copyActionsOpen && (
            <div className="memo-copy-actions" role="menu" aria-label="말씀 복사">
              <button type="button" role="menuitem" onClick={copyAllPassages}><Copy size={15} aria-hidden="true" />전체 복사</button>
              <button type="button" role="menuitem" onClick={selectPassageText}>선택 복사</button>
            </div>
          )}
          {copyNotice && <span className="memo-copy-notice" role="status">{copyNotice}</span>}
        </div>
        <div className="memo-comment-list" aria-label="지난 메모">
          {visibleComments.map((comment) => {
            const isRelatedPassage = target.includeRelated && comment.threadKey !== target.threadKey;
            return (
              <article className="memo-comment" key={comment.id}>
                <div className="memo-comment-meta">
                  <span>{isRelatedPassage ? comment.reference : '나의 메모'}</span>
                  <time>{new Date(comment.updatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                </div>
                <p>{comment.body}</p>
                <div className="memo-comment-actions">
                  <button type="button" onClick={() => editMemo(comment)}>수정</button>
                  <button type="button" onClick={() => continueMemo(comment)}>이어 적기</button>
                </div>
              </article>
            );
          })}
          {visibleComments.length === 0 && !composer && (
            <div className="memo-thread-empty">아직 작성한 메모가 없어요.</div>
          )}
        </div>
        {(composer || editingId) && (
          <section className="memo-composer">
            <span>{editingId ? '메모 수정' : composer?.parentId ? '이어서 적기' : '새 메모'}</span>
            <textarea
              autoFocus
              className="memo-editor-textarea"
              aria-label={`${composer?.target.reference ?? target.reference} 메모`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="마음에 남은 생각을 적어보세요"
            />
          </section>
        )}
      </div>
      <footer className="memo-editor-footer">
        {composer || editingId ? (
          <><button className="is-secondary" type="button" onClick={() => { setComposer(null); setEditingId(''); setDraft(''); }}>취소</button><button type="button" disabled={!draft.trim()} onClick={saveDraft}>저장</button></>
        ) : (
          <button type="button" onClick={startNewMemo}><NotebookPen size={17} aria-hidden="true" />새 메모 남기기</button>
        )}
      </footer>
    </section>
  );
}

function MemoLibraryScreen({ memoComments, onAddMemoComment, onUpdateMemoComment, worshipMemos, onWorshipMemoChange, viewMode, onViewModeChange, onClose }) {
  const [memoType, setMemoType] = useState('bible');
  const [sortModes, setSortModes] = useState(() => {
    const stored = readStoredValue('bibleon.memoSortModeV2', readStoredValue('bibleon.memoSortMode', 'recent'));
    if (stored && typeof stored === 'object') return { bible: stored.bible ?? 'recent', worship: stored.worship ?? 'recent' };
    return { bible: stored ?? 'recent', worship: 'recent' };
  });
  const [selectedMemoId, setSelectedMemoId] = useState('');
  const sortMode = sortModes[memoType];
  const bibleEntries = useMemo(() => {
    const entries = buildMemoThreadEntries(memoComments);
    return entries.sort((left, right) => {
      if (sortMode === 'recent') return right.updatedAt - left.updatedAt;
      if (sortMode === 'oldest') return left.createdAt - right.createdAt;
      const canonical = (left.bookOrder - right.bookOrder) || (left.chapter - right.chapter) || (left.verse - right.verse);
      return sortMode === 'revelation' ? -canonical : canonical;
    });
  }, [memoComments, sortMode]);
  const worshipEntries = useMemo(() => Object.entries(worshipMemos).map(([id, value]) => {
    const entries = normalizeWorshipMemoEntries(value);
    const latest = [...entries].sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (!latest) return null;
    const worship = value.worship ?? {};
    return {
      id,
      value,
      worship: { id, title: worship.title ?? '예배 메모', coreVerse: worship.coreVerse ?? '', serviceDate: worship.serviceDate ?? worship.createdAt ?? '' },
      latest,
      commentCount: entries.length,
      createdAt: Math.min(...entries.map(({ createdAt }) => createdAt)),
      updatedAt: Math.max(...entries.map(({ updatedAt }) => updatedAt)),
      serviceTime: Date.parse(worship.serviceDate ?? worship.createdAt ?? '') || 0,
    };
  }).filter(Boolean).sort((left, right) => {
    if (sortMode === 'recent') return right.updatedAt - left.updatedAt;
    if (sortMode === 'oldest') return left.createdAt - right.createdAt;
    return sortMode === 'serviceOldest' ? left.serviceTime - right.serviceTime : right.serviceTime - left.serviceTime;
  }), [sortMode, worshipMemos]);
  const memoEntries = memoType === 'bible' ? bibleEntries : worshipEntries;
  const selectedMemo = memoEntries.find(({ id }) => id === selectedMemoId);
  const swipeBack = useSwipeBack(() => {
    if (selectedMemoId) setSelectedMemoId('');
    else onClose();
  });

  useEffect(() => writeStoredValue('bibleon.memoSortModeV2', sortModes), [sortModes]);

  useEffect(() => setSelectedMemoId(''), [memoType]);

  if (selectedMemo) {
    return (
      <div
        className={`memo-library-layer ${swipeBack.className}`}
        style={swipeBack.style}
        {...swipeBack.handlers}
      >
        {memoType === 'bible' ? (
          <MemoEditorScreen
            target={{ ...selectedMemo, includeRelated: selectedMemo.verseIds.length === 1 }}
            comments={memoComments}
            onAdd={onAddMemoComment}
            onUpdate={onUpdateMemoComment}
            onClose={() => setSelectedMemoId('')}
          />
        ) : (
          <WorshipMemoScreen
            worship={selectedMemo.worship}
            value={selectedMemo.value}
            onChange={(nextValue) => onWorshipMemoChange(selectedMemo.id, nextValue)}
            onClose={() => setSelectedMemoId('')}
          />
        )}
      </div>
    );
  }

  return (
    <section
      className={`memo-library-layer ${swipeBack.className}`}
      style={swipeBack.style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memo-library-title"
      {...swipeBack.handlers}
    >
      <header className="memo-screen-header">
        <button type="button" aria-label="메모 닫기" title="뒤로" onClick={onClose}><ChevronLeft size={23} aria-hidden="true" /></button>
        <h2 id="memo-library-title">나의 메모</h2>
        <span className="memo-count">{memoEntries.length}</span>
      </header>
      <div className="memo-type-tabs" role="tablist" aria-label="메모 종류">
        <button className={memoType === 'bible' ? 'is-active' : ''} type="button" role="tab" aria-selected={memoType === 'bible'} onClick={() => setMemoType('bible')}>말씀 메모</button>
        <button className={memoType === 'worship' ? 'is-active' : ''} type="button" role="tab" aria-selected={memoType === 'worship'} onClick={() => setMemoType('worship')}>예배 메모</button>
      </div>
      <div className="memo-library-controls">
        <label>
          <span>정렬</span>
          <select value={sortMode} onChange={(event) => setSortModes((current) => ({ ...current, [memoType]: event.target.value }))}>
            <option value="recent">최근 메모</option>
            <option value="oldest">오래된 메모</option>
            {memoType === 'bible' ? <option value="genesis">창세기부터</option> : <option value="serviceRecent">최근 예배부터</option>}
            {memoType === 'bible' ? <option value="revelation">요한계시록부터</option> : <option value="serviceOldest">오래된 예배부터</option>}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <div className="memo-view-toggle" role="group" aria-label="메모 보기 기준">
          <button className={viewMode === 'grid' ? 'is-active' : ''} type="button" aria-label="정사각형으로 보기" title="정사각형 보기" onClick={() => onViewModeChange('grid')}><Grid3X3 size={18} /></button>
          <button className={viewMode === 'list' ? 'is-active' : ''} type="button" aria-label="한 줄 목록으로 보기" title="목록 보기" onClick={() => onViewModeChange('list')}><List size={19} /></button>
        </div>
      </div>
      <div className={`memo-library-list is-${viewMode}`}>
        {memoEntries.map((entry) => (
          <button type="button" key={entry.id} onClick={() => setSelectedMemoId(entry.id)}>
            <strong>{memoType === 'bible' ? entry.reference : entry.worship.title}</strong>
            {memoType === 'bible' && entry.latest.verses.map(({ text }) => text).filter(Boolean).join(' ') && <span className="memo-library-verse">{entry.latest.verses.map(({ text }) => text).filter(Boolean).join(' ')}</span>}
            {memoType === 'worship' && entry.worship.serviceDate && <span className="memo-library-verse">{entry.worship.serviceDate}{entry.worship.coreVerse ? ` · ${entry.worship.coreVerse}` : ''}</span>}
            <p>{entry.latest.body}</p>
            {entry.commentCount > 1 && <small className="memo-library-comment-count">메모 {entry.commentCount}개</small>}
          </button>
        ))}
        {memoEntries.length === 0 && (
          <div className="memo-library-empty"><NotebookPen size={25} aria-hidden="true" /><strong>아직 {memoType === 'bible' ? '말씀' : '예배'} 메모가 없어요</strong><span>{memoType === 'bible' ? '성경에서 말씀을 길게 눌러 메모를 남겨보세요.' : '공동체의 예배 정보에서 메모를 남겨보세요.'}</span></div>
        )}
      </div>
    </section>
  );
}

function PickerWheel({ items, value, onChange, label }) {
  const listRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const settleTimerRef = useRef(null);
  const valueRef = useRef(String(value));

  useEffect(() => {
    valueRef.current = String(value);
  }, [value]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector(`[data-wheel-value="${value}"]`);
    if (!list || !selected) return;
    list.scrollTo({
      top: selected.offsetTop - ((list.clientHeight - selected.offsetHeight) / 2),
      behavior: 'auto',
    });
  }, [items.length, label]);

  const findCenteredItem = () => {
    const list = listRef.current;
    if (!list) return null;
    const center = list.scrollTop + (list.clientHeight / 2);
    const options = Array.from(list.querySelectorAll('[data-wheel-value]'));
    return options.reduce((current, option) => {
      const distance = Math.abs((option.offsetTop + (option.offsetHeight / 2)) - center);
      return !current || distance < current.distance ? { option, distance } : current;
    }, null);
  };

  const syncCenteredItem = () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextValue = findCenteredItem()?.option.dataset.wheelValue;
      if (nextValue !== undefined && valueRef.current !== nextValue) {
        valueRef.current = nextValue;
        onChange(nextValue);
      }
    });

    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const list = listRef.current;
      const item = findCenteredItem()?.option;
      if (!list || !item) return;
      list.scrollTo({
        top: item.offsetTop - ((list.clientHeight - item.offsetHeight) / 2),
        behavior: 'smooth',
      });
    }, 110);
  };

  const selectItem = (event, nextValue) => {
    const list = listRef.current;
    const item = event.currentTarget;
    valueRef.current = String(nextValue);
    onChange(String(nextValue));
    list?.scrollTo({
      top: item.offsetTop - ((list.clientHeight - item.offsetHeight) / 2),
      behavior: 'smooth',
    });
  };

  useEffect(() => () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  return (
    <div className="picker-wheel-shell">
      <div className="picker-wheel-focus" aria-hidden="true" />
      <div
        className="picker-wheel"
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex="0"
        onScroll={syncCenteredItem}
      >
        {items.map((item) => (
          <button
            className={String(value) === String(item.value) ? 'is-selected' : ''}
            key={item.value}
            type="button"
            role="option"
            aria-selected={String(value) === String(item.value)}
            data-wheel-value={item.value}
            onClick={(event) => selectItem(event, item.value)}
          >
            <strong>{item.label}</strong>
            {item.meta && <span>{item.meta}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function PassagePickerSheet({ selectedBookId, selectedChapter, onClose, onSelect }) {
  const initialBook = bibleBooks.find((book) => book.id === selectedBookId) ?? bibleBooks[0];
  const [step, setStep] = useState('book');
  const [viewMode, setViewMode] = useState('wheel');
  const [bookQuery, setBookQuery] = useState('');
  const [testament, setTestament] = useState(initialBook.testament);
  const [draftBookId, setDraftBookId] = useState(initialBook.id);
  const [draftChapter, setDraftChapter] = useState(selectedChapter);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const draftBook = bibleBooks.find((book) => book.id === draftBookId) ?? initialBook;
  const normalizedBookQuery = bookQuery.trim().replace(/\s+/g, '').toLowerCase();
  const visibleBooks = useMemo(() => bibleBooks.filter((book) => (
    normalizedBookQuery
      ? `${book.name}${book.file}${book.id}`.replace(/\s+/g, '').toLowerCase().includes(normalizedBookQuery)
      : book.testament === testament
  )), [normalizedBookQuery, testament]);
  const chapters = Array.from({ length: draftBook.chapters }, (_, index) => index + 1);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dismiss]);

  const updateDraftBook = (bookId) => {
    const nextBook = bibleBooks.find((book) => book.id === bookId) ?? bibleBooks[0];
    setDraftBookId(nextBook.id);
    setTestament(nextBook.testament);
    setDraftChapter((current) => Math.min(current, nextBook.chapters));
  };

  useEffect(() => {
    if (step !== 'book' || !visibleBooks.length || visibleBooks.some(({ id }) => id === draftBookId)) return;
    const firstBook = visibleBooks[0];
    setDraftBookId(firstBook.id);
    setDraftChapter((current) => Math.min(current, firstBook.chapters));
  }, [draftBookId, step, visibleBooks]);

  const changeTestament = (nextTestament) => {
    setTestament(nextTestament);
    const currentBook = bibleBooks.find((book) => book.id === draftBookId);
    if (currentBook?.testament !== nextTestament) {
      const firstBook = bibleBooks.find((book) => book.testament === nextTestament);
      if (firstBook) updateDraftBook(firstBook.id);
    }
  };

  const chooseGridItem = (value) => {
    if (step === 'book') {
      updateDraftBook(value);
      setStep('chapter');
      return;
    }
    dismiss(() => onSelect(draftBook.id, Number(value)));
  };

  const confirmWheelValue = () => {
    if (step === 'book') {
      setStep('chapter');
      return;
    }
    dismiss(() => onSelect(draftBook.id, draftChapter));
  };

  const wheelItems = step === 'book'
    ? visibleBooks.map((book) => ({ value: book.id, label: book.name }))
    : chapters.map((chapter) => ({ value: chapter, label: String(chapter) }));
  const wheelValue = step === 'book' ? draftBook.id : draftChapter;

  return (
    <div
      className={`passage-picker-overlay ${isClosing ? 'is-closing' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section className="passage-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="passage-picker-title">
        <div className="passage-picker-handle" aria-hidden="true" />
        <header className="passage-picker-header">
          <div className="passage-picker-heading">
            {step === 'chapter' && (
              <button type="button" aria-label="성경 선택으로 돌아가기" title="성경 선택" onClick={() => setStep('book')}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
            )}
            <h2 id="passage-picker-title">{step === 'book' ? '성경 선택' : draftBook.name}</h2>
          </div>
          <div className="passage-picker-actions">
            <button
              type="button"
              aria-label={viewMode === 'wheel' ? '격자로 보기' : 'Wheel로 보기'}
              title={viewMode === 'wheel' ? '격자로 보기' : 'Wheel로 보기'}
              onClick={() => setViewMode((current) => current === 'wheel' ? 'grid' : 'wheel')}
            >
              {viewMode === 'wheel'
                ? <Grid3X3 size={20} aria-hidden="true" />
                : <List size={21} aria-hidden="true" />}
            </button>
            <button type="button" aria-label="성경 선택 닫기" title="닫기" onClick={() => dismiss()}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={`picker-testament-slot ${step === 'book' ? '' : 'is-empty'}`}>
          {step === 'book' && (
            <>
              <div className="picker-testament-tabs" role="tablist" aria-label="성경 구분">
                {['구약', '신약'].map((item) => (
                  <button
                    className={testament === item ? 'is-active' : ''}
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={testament === item}
                    onClick={() => { setBookQuery(''); changeTestament(item); }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="picker-book-search">
                <Search size={17} aria-hidden="true" />
                <input value={bookQuery} onChange={(event) => setBookQuery(event.target.value)} placeholder="성경 이름 검색" />
                {bookQuery && <button type="button" aria-label="성경 이름 검색어 지우기" onClick={() => setBookQuery('')}><X size={16} /></button>}
              </label>
            </>
          )}
        </div>

        <div className={`passage-picker-content is-${viewMode}`}>
        {viewMode === 'wheel' ? (
          <>
            {wheelItems.length ? (
              <PickerWheel
                items={wheelItems}
                value={wheelValue}
                label={step === 'book' ? '성경 Wheel 선택' : `${draftBook.name} 장 Wheel 선택`}
                onChange={(value) => {
                  if (step === 'book') updateDraftBook(value);
                  else setDraftChapter(Number(value));
                }}
              />
            ) : <p className="picker-book-empty">일치하는 성경이 없어요.</p>}
            <button className="picker-confirm-button" type="button" disabled={!wheelItems.length} onClick={confirmWheelValue}>
              {step === 'book' ? '다음' : `${draftBook.name} ${draftChapter}장 열기`}
            </button>
          </>
        ) : (
          <div className={`picker-grid ${step === 'chapter' ? 'is-chapter-grid' : ''}`}>
            {(step === 'book' ? visibleBooks : chapters).map((item) => {
              const value = step === 'book' ? item.id : item;
              const label = step === 'book' ? item.name : item;
              const isSelected = step === 'book'
                ? draftBook.id === value
                : draftChapter === Number(value);
              return (
                <button
                  className={isSelected ? 'is-selected' : ''}
                  key={value}
                  type="button"
                  onClick={() => chooseGridItem(value)}
                >
                  <strong>{label}</strong>
                  {step === 'chapter' && <span>장</span>}
                </button>
              );
            })}
            {step === 'book' && !visibleBooks.length && <p className="picker-book-empty">일치하는 성경이 없어요.</p>}
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

function roundedPolygonPath(points, radius = 8) {
  const uniquePoints = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 0.1 || Math.abs(point.y - previous.y) > 0.1;
  });

  if (uniquePoints.length < 3) return '';

  const moveToward = (from, to, distance) => {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const amount = Math.min(distance, length / 2);
    return {
      x: from.x + (deltaX / length) * amount,
      y: from.y + (deltaY / length) * amount,
    };
  };
  const formatPoint = ({ x, y }) => `${x.toFixed(2)} ${y.toFixed(2)}`;

  return `${uniquePoints.map((point, index) => {
    const previous = uniquePoints[(index - 1 + uniquePoints.length) % uniquePoints.length];
    const next = uniquePoints[(index + 1) % uniquePoints.length];
    const cornerStart = moveToward(point, previous, radius);
    const cornerEnd = moveToward(point, next, radius);
    const prefix = index === 0 ? `M ${formatPoint(cornerStart)}` : `L ${formatPoint(cornerStart)}`;
    return `${prefix} Q ${formatPoint(point)} ${formatPoint(cornerEnd)}`;
  }).join(' ')} Z`;
}

function buildConnectedTextOutline(clientRects, parentRect) {
  const lineTolerance = 3;
  const lines = [];

  [...clientRects]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((first, second) => first.top - second.top || first.left - second.left)
    .forEach((rect) => {
      const normalized = {
        left: rect.left - parentRect.left,
        right: rect.right - parentRect.left,
        top: rect.top - parentRect.top,
        bottom: rect.bottom - parentRect.top,
      };
      const line = lines.find((candidate) => Math.abs(candidate.top - normalized.top) <= lineTolerance);

      if (line) {
        line.left = Math.min(line.left, normalized.left);
        line.right = Math.max(line.right, normalized.right);
        line.top = Math.min(line.top, normalized.top);
        line.bottom = Math.max(line.bottom, normalized.bottom);
      } else {
        lines.push(normalized);
      }
    });

  if (!lines.length) return '';

  const paddedLines = lines.map((line) => ({
    left: line.left - 4,
    right: line.right + 4,
    top: line.top - 1.5,
    bottom: line.bottom + 1.5,
  }));
  const firstLine = paddedLines[0];
  const lastLine = paddedLines[paddedLines.length - 1];
  const points = [
    { x: firstLine.left, y: firstLine.top },
    { x: firstLine.right, y: firstLine.top },
  ];

  for (let index = 0; index < paddedLines.length - 1; index += 1) {
    const currentLine = paddedLines[index];
    const nextLine = paddedLines[index + 1];
    const transitionY = (currentLine.bottom + nextLine.top) / 2;
    points.push(
      { x: currentLine.right, y: transitionY },
      { x: nextLine.right, y: transitionY },
    );
  }

  points.push(
    { x: lastLine.right, y: lastLine.bottom },
    { x: lastLine.left, y: lastLine.bottom },
  );

  for (let index = paddedLines.length - 2; index >= 0; index -= 1) {
    const currentLine = paddedLines[index];
    const nextLine = paddedLines[index + 1];
    const transitionY = (currentLine.bottom + nextLine.top) / 2;
    points.push(
      { x: nextLine.left, y: transitionY },
      { x: currentLine.left, y: transitionY },
    );
  }

  return roundedPolygonPath(points, 8);
}

function VerseHighlightedText({ text, highlight }) {
  const textRef = useRef(null);
  const [circleOutline, setCircleOutline] = useState(null);
  const isCircle = highlight?.method === 'circle';

  useLayoutEffect(() => {
    if (!isCircle || !textRef.current) {
      setCircleOutline(null);
      return undefined;
    }

    const textElement = textRef.current;
    const parentElement = textElement.parentElement;
    let frameId;

    const measureOutline = () => {
      const parentRect = parentElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(textElement);
      const path = buildConnectedTextOutline(range.getClientRects(), parentRect);
      range.detach?.();
      setCircleOutline({
        path,
        width: Math.max(parentRect.width, 1),
        height: Math.max(parentRect.height, 1),
      });
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureOutline);
    };

    scheduleMeasure();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(parentElement);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [isCircle, text]);

  const highlightClassName = highlight && !isCircle
    ? `is-highlighted highlight-${highlight.method} highlight-${highlight.color}`
    : '';

  return (
    <>
      <span ref={textRef} className={`verse-text ${highlightClassName}`}>{text}</span>
      {isCircle && circleOutline?.path && (
        <svg
          className={`verse-circle-outline highlight-${highlight.color}`}
          width={circleOutline.width}
          height={circleOutline.height}
          viewBox={`0 0 ${circleOutline.width} ${circleOutline.height}`}
          aria-hidden="true"
        >
          <path d={circleOutline.path} />
        </svg>
      )}
    </>
  );
}

function PlusFeatureBadge() {
  return <span className="plus-feature-badge" aria-hidden="true"><Plus size={8} strokeWidth={3.2} /></span>;
}

function BibleView({
  selectedBook,
  selectedBookId,
  setSelectedBookId,
  selectedChapter,
  setSelectedChapter,
  selectedTranslation,
  setSelectedTranslation,
  setSelectedRef,
  readVerseIds,
  setReadVerseIds,
  verseNotes,
  setVerseNotes,
  verseNoteMeta,
  setVerseNoteMeta,
  memoComments,
  onAddMemoComment,
  onUpdateMemoComment,
  verseHighlights,
  setVerseHighlights,
  lastHighlightStyle,
  setLastHighlightStyle,
  navigationTarget,
  onNavigationHandled,
  conversations,
  setConversations,
  qtRooms,
  setQtRooms,
  onChapterAccess,
  tutorialMode = false,
  tutorialStep = null,
  onTutorialReadToggle,
  onTutorialVerseActionsOpened,
  isPlus,
  onRequestPlus,
}) {
  const [selectedVerse, setSelectedVerse] = useState(null);
  const [verseActionAnchor, setVerseActionAnchor] = useState(null);
  const [verseActionClosing, setVerseActionClosing] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedVerseIds, setSelectedVerseIds] = useState([]);
  const [multiActionAnchor, setMultiActionAnchor] = useState(null);
  const [multiActionClosing, setMultiActionClosing] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [highlightPickerVerseId, setHighlightPickerVerseId] = useState('');
  const [highlightDraft, setHighlightDraft] = useState(lastHighlightStyle);
  const [chapterState, setChapterState] = useState({ status: 'loading', verses: [] });
  const [noteSheet, setNoteSheet] = useState(null);
  const [isPassagePickerOpen, setIsPassagePickerOpen] = useState(false);
  const [shareSheetVerses, setShareSheetVerses] = useState([]);
  const [recentPassages] = useState(() => {
    const stored = readStoredValue('bibleon.recentPassages', []);
    return Array.isArray(stored) ? stored.slice(0, 10) : [];
  });
  const visibleRecentPassages = tutorialMode ? tutorialRecentPassages : recentPassages;
  const recentReadingListRef = useRef(null);
  const recentReadingDragRef = useRef(null);
  const recentReadingClickGuardRef = useRef(false);
  const recentReadingWheelTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pressGestureRef = useRef(null);
  const swipeGestureRef = useRef(null);
  const lastTapRef = useRef({ verseId: '', timestamp: 0 });
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef(null);
  const verseActionCloseTimerRef = useRef(null);
  const multiActionCloseTimerRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setVerseActionClosing(false);
    setIsMultiSelectMode(false);
    setSelectedVerseIds([]);
    setMultiActionAnchor(null);
    setMultiActionClosing(false);
    setHighlightPickerVerseId('');
    setNoteSheet(null);

    setChapterState({ status: 'loading', verses: [] });
    loadBibleChapter(selectedTranslation, selectedBook.id, selectedChapter)
      .then((verses) => {
        if (!isCurrent) return;
        setChapterState({ status: 'ready', verses });
        onChapterAccess?.({
          bookId: selectedBook.id,
          chapter: selectedChapter,
          reference: `${selectedBook.name} ${selectedChapter}장`,
        });
      })
      .catch(() => {
        if (isCurrent) setChapterState({ status: 'error', verses: [] });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedBook.id, selectedChapter, selectedTranslation]);

  const activeVerses = useMemo(() => {
    return chapterState.verses.map((verse) => ({
      ...verse,
      id: `${selectedBook.id}-${selectedChapter}-${verse.label ?? verse.verse}`,
      ref: `${selectedBook.name} ${selectedChapter}:${verse.label ?? verse.verse}`,
      bookId: selectedBook.id,
      chapter: selectedChapter,
      headings: Array.isArray(verse.segments)
        ? verse.segments.filter((segment) => segment.type === 'heading')
        : [],
    }));
  }, [chapterState.verses, selectedBook.id, selectedBook.name, selectedChapter]);
  const chapterReadCount = activeVerses.filter((verse) => readVerseIds.includes(verse.id)).length;
  const chapterProgress = activeVerses.length
    ? Math.round((chapterReadCount / activeVerses.length) * 100)
    : 0;

  useEffect(() => {
    if (tutorialMode) return;
    const stored = readStoredValue('bibleon.recentPassages', []);
    const current = Array.isArray(stored) ? stored : [];
    const nextPassage = { bookId: selectedBook.id, chapter: selectedChapter };
    const next = [
      nextPassage,
      ...current.filter((item) => (
        item.bookId !== nextPassage.bookId || item.chapter !== nextPassage.chapter
      )),
    ].slice(0, 10);
    writeStoredValue('bibleon.recentPassages', next);
  }, [selectedBook.id, selectedChapter, tutorialMode]);

  useEffect(() => {
    setSelectedVerse(null);
    setSelectedRef(
      activeVerses.length
        ? `${selectedBook.name} ${selectedChapter}:${activeVerses[0].label ?? activeVerses[0].verse}`
        : `${selectedBook.name} ${selectedChapter}장`
    );
  }, [activeVerses, selectedBook.name, selectedChapter, setSelectedRef]);

  const selectPassage = (bookId, chapter) => {
    const nextBook = bibleBooks.find((book) => book.id === bookId) ?? bibleBooks[0];
    setSelectedBookId(bookId);
    setSelectedChapter(Math.min(nextBook.chapters, Math.max(1, chapter)));
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setIsMultiSelectMode(false);
    setSelectedVerseIds([]);
    setMultiActionAnchor(null);
    setHighlightPickerVerseId('');
    setNoteSheet(null);
  };

  const scrollRecentPassages = (event) => {
    const list = recentReadingListRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!distance) return;
    event.preventDefault();
    list.scrollBy({ left: distance * 0.82, behavior: 'smooth' });
    window.clearTimeout(recentReadingWheelTimerRef.current);
    recentReadingWheelTimerRef.current = window.setTimeout(() => {
      const firstItem = list.querySelector('.recent-reading-item');
      const step = firstItem ? firstItem.offsetWidth + 8 : 126;
      const maxScroll = list.scrollWidth - list.clientWidth;
      const snapTarget = maxScroll < step
        ? (list.scrollLeft >= maxScroll / 2 ? maxScroll : 0)
        : Math.min(maxScroll, Math.round(list.scrollLeft / step) * step);
      list.scrollTo({ left: snapTarget, behavior: 'smooth' });
    }, 150);
  };

  const startRecentPassageDrag = (event) => {
    if (event.pointerType !== 'mouse') return;
    const list = recentReadingListRef.current;
    recentReadingClickGuardRef.current = false;
    recentReadingDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: list.scrollLeft,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocity: 0,
      dragged: false,
    };
    list.setPointerCapture?.(event.pointerId);
  };

  const moveRecentPassageDrag = (event) => {
    const gesture = recentReadingDragRef.current;
    const list = recentReadingListRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !list) return;
    const distance = event.clientX - gesture.startX;
    if (Math.abs(distance) > 4) {
      gesture.dragged = true;
      recentReadingClickGuardRef.current = true;
    }
    if (gesture.dragged) {
      const now = performance.now();
      gesture.velocity = (event.clientX - gesture.lastX) / Math.max(1, now - gesture.lastAt);
      gesture.lastX = event.clientX;
      gesture.lastAt = now;
      list.scrollLeft = gesture.scrollLeft - distance;
    }
  };

  const endRecentPassageDrag = (event) => {
    const gesture = recentReadingDragRef.current;
    const list = recentReadingListRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !list) return;
    if (list.hasPointerCapture?.(event.pointerId)) list.releasePointerCapture(event.pointerId);
    recentReadingDragRef.current = null;
    if (gesture.dragged) {
      const firstItem = list.querySelector('.recent-reading-item');
      const step = firstItem ? firstItem.offsetWidth + 8 : 126;
      const momentumTarget = list.scrollLeft - (gesture.velocity * 150);
      const maxScroll = list.scrollWidth - list.clientWidth;
      const boundedTarget = Math.max(0, Math.min(maxScroll, momentumTarget));
      const snapTarget = maxScroll < step
        ? (boundedTarget >= maxScroll / 2 ? maxScroll : 0)
        : Math.min(maxScroll, Math.round(boundedTarget / step) * step);
      list.scrollTo({ left: snapTarget, behavior: 'smooth' });
      window.setTimeout(() => { recentReadingClickGuardRef.current = false; }, 0);
    }
  };

  const moveChapter = (direction) => {
    const nextChapter = Math.min(selectedBook.chapters, Math.max(1, selectedChapter + direction));
    if (nextChapter === selectedChapter) return;
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setIsMultiSelectMode(false);
    setSelectedVerseIds([]);
    setMultiActionAnchor(null);
    setHighlightPickerVerseId('');
    setNoteSheet(null);
    setSelectedChapter(nextChapter);
  };

  const markRead = (verseId) => {
    const wasRead = readVerseIds.includes(verseId);
    setReadVerseIds((current) => (
      current.includes(verseId)
        ? current.filter((id) => id !== verseId)
        : [...current, verseId]
    ));
    if (tutorialStep === BIBLE_READ_PRACTICE_STEP && verseId === activeVerses[0]?.id) {
      onTutorialReadToggle?.({ verseId, isRead: !wasRead });
    }
  };

  const openHighlightPicker = (verseId) => {
    setHighlightDraft(normalizeHighlightStyle(verseHighlights[verseId] ?? lastHighlightStyle));
    setHighlightPickerVerseId((current) => current === verseId ? '' : verseId);
  };

  const handleHighlightButton = (verseId) => {
    if (!verseHighlights[verseId]) {
      openHighlightPicker(verseId);
      return;
    }

    setVerseHighlights((current) => {
      const next = { ...current };
      delete next[verseId];
      return next;
    });
    setHighlightPickerVerseId('');
  };

  const applyHighlight = (verseId) => {
    const nextStyle = normalizeHighlightStyle(highlightDraft);
    setVerseHighlights((current) => ({ ...current, [verseId]: nextStyle }));
    setLastHighlightStyle(nextStyle);
    setHighlightPickerVerseId('');
  };

  const suppressUpcomingClick = () => {
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 500);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openNoteEditor = (selection) => {
    const verses = (Array.isArray(selection) ? selection : [selection]).filter(Boolean);
    if (!verses.length) return;
    if (!isPlus) {
      onRequestPlus('bible-memo');
      return;
    }
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setMultiActionAnchor(null);
    setHighlightPickerVerseId('');
    setNoteSheet(createMemoTarget(verses, { includeRelated: verses.length === 1 }));
  };

  const showActionNotice = (message) => {
    setActionNotice(message);
    window.setTimeout(() => setActionNotice(''), 1800);
  };

  const shareVerses = (verses) => {
    setShareSheetVerses(verses);
  };

  const sendVersesToDestination = ({ type, item }) => {
    if (!shareSheetVerses.length || !item) return;

    if (type === 'friend') {
      const existingConversation = conversations.find((conversation) => {
        const participantIds = getConversationParticipantIds(conversation);
        return participantIds.length === 1 && participantIds[0] === item.id;
      });
      const message = createBiblePassageMessage(shareSheetVerses, selectedTranslation, 1);
      if (existingConversation) {
        setConversations((current) => {
          const target = current.find(({ id }) => id === existingConversation.id);
          if (!target) return current;
          const updated = {
            ...target,
            messages: [...target.messages, message],
            lastMessage: `말씀 · ${message.referenceLabel}`,
            time: '방금',
          };
          return [updated, ...current.filter(({ id }) => id !== target.id)];
        });
      } else {
        const createdAt = Date.now();
        setConversations((current) => [{
          id: `direct-${item.id}-${createdAt}`,
          name: item.name,
          department: item.department,
          role: item.role,
          online: item.online ?? false,
          unread: 0,
          time: '방금',
          lastMessage: `말씀 · ${message.referenceLabel}`,
          participantIds: [item.id],
          participantJoinedAt: { [item.id]: 0 },
          messages: [message],
          createdAt,
        }, ...current]);
      }
    } else {
      const setRooms = type === 'qt' ? setQtRooms : setConversations;
      setRooms((current) => {
        const target = current.find(({ id }) => id === item.id);
        if (!target) return current;
        const unreadByCount = getConversationParticipantIds(target).length;
        const message = createBiblePassageMessage(shareSheetVerses, selectedTranslation, unreadByCount);
        const updated = {
          ...target,
          messages: [...target.messages, message],
          lastMessage: `말씀 · ${message.referenceLabel}`,
          time: '방금',
        };
        return [updated, ...current.filter(({ id }) => id !== target.id)];
      });
    }

    showActionNotice(`${item.customName ?? item.name ?? '대화방'}에 말씀을 보냈어요.`);
  };

  const openVerseAnalysis = () => {
    if (!isPlus) {
      onRequestPlus('analysis');
      return;
    }
    showActionNotice('말씀 분석 기능을 준비하고 있어요.');
  };

  const toggleMultiVerse = (verseId) => {
    setSelectedVerseIds((current) => (
      current.includes(verseId)
        ? current.filter((id) => id !== verseId)
        : [...current, verseId]
    ));
  };

  const closeMultiSelect = () => {
    window.clearTimeout(multiActionCloseTimerRef.current);
    setIsMultiSelectMode(false);
    setSelectedVerseIds([]);
    setMultiActionAnchor(null);
    setMultiActionClosing(false);
  };

  const dismissVerseActions = (afterClose) => {
    if (verseActionClosing) return;
    setVerseActionClosing(true);
    window.clearTimeout(verseActionCloseTimerRef.current);
    verseActionCloseTimerRef.current = window.setTimeout(() => {
      setSelectedVerse(null);
      setVerseActionAnchor(null);
      setHighlightPickerVerseId('');
      setVerseActionClosing(false);
      afterClose?.();
    }, 190);
  };

  const openMultiActions = (source, verseId = '') => {
    if (selectedVerseIds.length === 0) return;
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setHighlightPickerVerseId('');
    setMultiActionClosing(false);
    setMultiActionAnchor({ source, verseId });
  };

  const finishMultiAction = (afterClose) => {
    if (multiActionClosing) return;
    setMultiActionClosing(true);
    window.clearTimeout(multiActionCloseTimerRef.current);
    multiActionCloseTimerRef.current = window.setTimeout(() => {
      closeMultiSelect();
      afterClose?.();
    }, 190);
  };

  const dismissMultiActionPopover = () => {
    if (!multiActionAnchor || multiActionClosing) return;
    setMultiActionClosing(true);
    window.clearTimeout(multiActionCloseTimerRef.current);
    multiActionCloseTimerRef.current = window.setTimeout(() => {
      setMultiActionAnchor(null);
      setMultiActionClosing(false);
    }, 190);
  };

  useEffect(() => {
    if (!verseActionAnchor && !multiActionAnchor) return undefined;
    const cancelOnOutsidePointer = (event) => {
      if (event.target.closest('.verse-action-inline, .highlight-popover')) return;
      if (verseActionAnchor) dismissVerseActions();
      if (multiActionAnchor) dismissMultiActionPopover();
    };
    document.addEventListener('pointerdown', cancelOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', cancelOnOutsidePointer, true);
  }, [multiActionAnchor, multiActionClosing, verseActionAnchor, verseActionClosing]);

  const openVerseActionsFromKeyboard = (event, verse) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    setSelectedRef(verse.ref);
    if (isMultiSelectMode) {
      setSelectedVerseIds((current) => current.includes(verse.id) ? current : [...current, verse.id]);
      setMultiActionClosing(false);
      setMultiActionAnchor({ source: 'verse', verseId: verse.id });
      return;
    }
    setHighlightPickerVerseId('');
    setVerseActionClosing(false);
    setSelectedVerse(verse.id);
    setVerseActionAnchor({ source: 'verse', verseId: verse.id });
  };

  const handleVersePointerDown = (event, verse) => {
    if (event.button !== 0) return;
    clearLongPressTimer();
    pressGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      longPressed: false,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      if (!pressGestureRef.current || pressGestureRef.current.moved) return;
      pressGestureRef.current.longPressed = true;
      suppressUpcomingClick();
      setSelectedRef(verse.ref);
      if (isMultiSelectMode) {
        setSelectedVerseIds((current) => current.includes(verse.id) ? current : [...current, verse.id]);
        setMultiActionClosing(false);
        setMultiActionAnchor({ source: 'verse', verseId: verse.id });
        return;
      }
      setHighlightPickerVerseId('');
      setVerseActionClosing(false);
      setSelectedVerse(verse.id);
      setVerseActionAnchor({ source: 'verse', verseId: verse.id });
      if (tutorialStep === BIBLE_ACTION_PRACTICE_STEP && verse.id === activeVerses[0]?.id) {
        onTutorialVerseActionsOpened?.(verse.id);
      }
    }, 500);
  };

  const handleVersePointerUp = (event, verse) => {
    const press = pressGestureRef.current;
    clearLongPressTimer();
    pressGestureRef.current = null;
    if (!press || press.pointerId !== event.pointerId || press.moved) return;
    if (press.longPressed) {
      suppressUpcomingClick();
      return;
    }
  };

  const handleVerseClick = (verse) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectedRef(verse.ref);
    if (isMultiSelectMode) {
      toggleMultiVerse(verse.id);
      return;
    }

    const now = Date.now();
    const isDoubleTap = lastTapRef.current.verseId === verse.id
      && now - lastTapRef.current.timestamp <= 320;
    lastTapRef.current = isDoubleTap
      ? { verseId: '', timestamp: 0 }
      : { verseId: verse.id, timestamp: now };
    if (isDoubleTap) markRead(verse.id);
  };

  const handleReaderPointerDown = (event) => {
    if (event.button !== 0) return;
    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
    };
  };

  const handleReaderPointerMove = (event) => {
    const swipe = swipeGestureRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const movedX = event.clientX - swipe.startX;
    const movedY = event.clientY - swipe.startY;
    if (Math.abs(movedX) > 9 || Math.abs(movedY) > 9) {
      if (pressGestureRef.current) pressGestureRef.current.moved = true;
      clearLongPressTimer();
    }
  };

  const handleReaderPointerUp = (event) => {
    const swipe = swipeGestureRef.current;
    swipeGestureRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const movedX = event.clientX - swipe.startX;
    const movedY = event.clientY - swipe.startY;
    const elapsed = Date.now() - swipe.startedAt;
    if (Math.abs(movedX) >= 58 && Math.abs(movedX) > Math.abs(movedY) * 1.35 && elapsed < 900) {
      suppressUpcomingClick();
      moveChapter(movedX < 0 ? 1 : -1);
    }
  };

  const cancelReaderGesture = () => {
    clearLongPressTimer();
    pressGestureRef.current = null;
    swipeGestureRef.current = null;
  };

  useEffect(() => () => {
    clearLongPressTimer();
    if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current);
    window.clearTimeout(verseActionCloseTimerRef.current);
    window.clearTimeout(multiActionCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!tutorialMode || tutorialStep === BIBLE_ACTION_PRACTICE_STEP) return;
    setSelectedVerse(null);
    setVerseActionAnchor(null);
    setVerseActionClosing(false);
    setHighlightPickerVerseId('');
  }, [tutorialMode, tutorialStep]);

  useEffect(() => {
    if (
      chapterState.status !== 'ready'
      || !navigationTarget
      || navigationTarget.bookId !== selectedBookId
      || navigationTarget.chapter !== selectedChapter
    ) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const targetVerse = document.querySelector(`[data-verse-number="${navigationTarget.verse}"]`);
      targetVerse?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onNavigationHandled?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [chapterState.status, navigationTarget, onNavigationHandled, selectedBookId, selectedChapter]);

  useEffect(() => {
    if (!noteSheet && !highlightPickerVerseId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setNoteSheet(null);
        setHighlightPickerVerseId('');
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [highlightPickerVerseId, noteSheet]);

  return (
    <div className="page-stack bible-page">
      <section className="recent-reading" data-tutorial="recent-passages" aria-label="최근 읽은 성경">
        <div
          className="recent-reading-list"
          ref={recentReadingListRef}
          onWheel={scrollRecentPassages}
          onPointerDown={startRecentPassageDrag}
          onPointerMove={moveRecentPassageDrag}
          onPointerUp={endRecentPassageDrag}
          onPointerCancel={endRecentPassageDrag}
        >
          {visibleRecentPassages.map((passage) => {
            const book = bibleBooks.find((item) => item.id === passage.bookId);
            if (!book) return null;
            const isActive = selectedBookId === book.id && selectedChapter === passage.chapter;
            return (
              <button
                className={`recent-reading-item ${isActive ? 'is-active' : ''}`}
                key={`${book.id}-${passage.chapter}`}
                type="button"
                onClick={() => {
                  if (!recentReadingClickGuardRef.current) selectPassage(book.id, passage.chapter);
                }}
              >
                <small>{book.testament}</small>
                <strong>{book.name}</strong>
                <span>{passage.chapter}장</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bible-controls" aria-label="성경 본문 선택">
        <button
          className="passage-picker-trigger"
          data-tutorial="bible-switcher"
          type="button"
          aria-haspopup="dialog"
          onClick={() => setIsPassagePickerOpen(true)}
        >
          <Search className="passage-search-icon" size={18} aria-hidden="true" />
          <span>
            <strong>{selectedBook.name}</strong>
            <small>{selectedChapter}</small>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <div className="translation-tabs" aria-label="성경 번역본 선택">
          {translations.map((translation) => (
            <button
              className={selectedTranslation === translation.id ? 'is-active' : ''}
              key={translation.id}
              type="button"
              onClick={() => setSelectedTranslation(translation.id)}
            >
              <strong>{translation.id}</strong>
              <span>{translation.label}</span>
            </button>
          ))}
        </div>
      </section>

      <article
        className="reader-surface"
        onPointerDown={handleReaderPointerDown}
        onPointerMove={handleReaderPointerMove}
        onPointerUp={handleReaderPointerUp}
        onPointerCancel={cancelReaderGesture}
      >
        <header className="reader-header">
          <div>
            <span>{selectedTranslation} · {translations.find((item) => item.id === selectedTranslation)?.label}</span>
            <h2>{selectedBook.name} {selectedChapter}장</h2>
          </div>
          <div className="reader-header-side">
            <div className="reader-selection-controls">
              {isMultiSelectMode ? (
                <>
                  <button type="button" onClick={closeMultiSelect}>취소</button>
                  <button
                    className="is-confirm"
                    type="button"
                    disabled={selectedVerseIds.length === 0}
                    onClick={() => openMultiActions('confirm')}
                  >
                    확인{selectedVerseIds.length ? ` ${selectedVerseIds.length}` : ''}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVerse(null);
                    setHighlightPickerVerseId('');
                    setIsMultiSelectMode(true);
                  }}
                >
                  선택
                </button>
              )}
            </div>
          </div>
          {multiActionAnchor?.source === 'confirm' && (
            <div className={`verse-action-inline is-header ${multiActionClosing ? 'is-closing' : ''}`} role="dialog" aria-label={`${selectedVerseIds.length}개 절 옵션`}>
              <div className="verse-action-toolbar">
                <button className="is-plus-feature" type="button" aria-label="선택한 절 메모, 바이블온 플러스" title="메모 · Plus" onClick={() => {
                  const selectedIds = new Set(selectedVerseIds);
                  const verses = activeVerses.filter(({ id }) => selectedIds.has(id));
                  finishMultiAction(() => openNoteEditor(verses));
                }}><NotebookPen size={18} /><PlusFeatureBadge /></button>
                <button type="button" aria-label="선택한 절 강조" title="강조" onClick={() => {
                  setVerseHighlights((current) => {
                    const next = { ...current };
                    const allHighlighted = selectedVerseIds.every((id) => Boolean(current[id]));
                    selectedVerseIds.forEach((id) => {
                      if (allHighlighted) delete next[id];
                      else next[id] = normalizeHighlightStyle(lastHighlightStyle);
                    });
                    return next;
                  });
                  finishMultiAction();
                }}><Highlighter size={18} /></button>
                <button type="button" aria-label="선택한 절 전달" title="전달" onClick={() => {
                  const selectedIds = new Set(selectedVerseIds);
                  const verses = activeVerses.filter(({ id }) => selectedIds.has(id));
                  finishMultiAction(() => shareVerses(verses));
                }}><Send size={18} /></button>
                <button className="is-plus-feature" type="button" aria-label="선택한 절 분석, 바이블온 플러스" title="분석 · Plus" onClick={() => { openVerseAnalysis(); finishMultiAction(); }}><Search size={18} /><PlusFeatureBadge /></button>
              </div>
            </div>
          )}
          <div className="reader-progress" aria-label={`${chapterProgress}% 읽음`}>
            <ProgressBar value={chapterProgress} />
            <span>{chapterProgress}%</span>
          </div>
        </header>

        {chapterState.status === 'loading' && (
          <div className="chapter-source-empty" role="status">
            <BookOpen size={22} aria-hidden="true" />
            <strong>본문을 불러오고 있어요</strong>
            <p>{selectedBook.name} {selectedChapter}장을 준비하고 있습니다.</p>
          </div>
        )}

        {chapterState.status === 'error' && (
          <div className="chapter-source-empty" role="alert">
            <BookOpen size={22} aria-hidden="true" />
            <strong>본문을 불러오지 못했어요</strong>
            <p>잠시 후 책이나 장을 다시 선택해 주세요.</p>
          </div>
        )}

        {chapterState.status === 'ready' && <div className="verse-list">
          {activeVerses.map((verse) => {
            const isRead = readVerseIds.includes(verse.id);
            const isSelected = selectedVerse === verse.id;
            const isMultiSelected = selectedVerseIds.includes(verse.id);
            const hasNote = memoComments.some((comment) => comment.verseIds.includes(verse.id));
            const highlight = verseHighlights[verse.id];
            const showVerseActions = isSelected
              && verseActionAnchor?.source === 'verse'
              && verseActionAnchor.verseId === verse.id;
            const showMultiActions = multiActionAnchor?.source === 'verse'
              && multiActionAnchor.verseId === verse.id;
            return (
              <React.Fragment key={verse.id}>
                {verse.headings.map((heading, index) => (
                  <h3 className="bible-section-heading" key={`${verse.id}-heading-${index}`}>
                    {heading.text}
                  </h3>
                ))}
                <div className={`verse-wrap ${isSelected ? 'is-selected' : ''} ${isMultiSelectMode ? 'is-multi-mode' : ''} ${isMultiSelected ? 'is-multi-selected' : ''}`}>
                  <button
                    className="verse-row"
                    data-tutorial={verse === activeVerses[0]
                      ? tutorialStep === BIBLE_READ_PRACTICE_STEP
                        ? 'verse-read-practice'
                        : tutorialStep === BIBLE_ACTION_PRACTICE_STEP
                          ? 'verse-action-practice'
                          : 'verse-interactions'
                      : undefined}
                    data-verse-number={verse.verse}
                    type="button"
                    title={isMultiSelectMode ? '탭하여 절 선택' : '두 번 탭하여 읽음 표시, 길게 눌러 옵션 열기'}
                    onContextMenu={(event) => event.preventDefault()}
                    onPointerDown={(event) => handleVersePointerDown(event, verse)}
                    onPointerUp={(event) => handleVersePointerUp(event, verse)}
                    onPointerCancel={cancelReaderGesture}
                    onClick={() => handleVerseClick(verse)}
                    onKeyDown={(event) => openVerseActionsFromKeyboard(event, verse)}
                  >
                    <span
                      className={`verse-number ${isRead ? 'is-read' : ''}`}
                      aria-label={`${verse.label ?? verse.verse}절, ${isRead ? '읽음' : '읽지 않음'}${hasNote ? ', 메모 있음' : ''}`}
                    >
                      {hasNote && <NotebookPen className="verse-note-indicator" size={10} aria-hidden="true" />}
                      <span>{verse.label ?? verse.verse}</span>
                    </span>
                    <span className="verse-copy">
                      <VerseHighlightedText text={verse.text} highlight={highlight} />
                    </span>
                  </button>
                  {showVerseActions && (
                    <div className={`verse-action-inline ${verseActionClosing ? 'is-closing' : ''}`} role="dialog" aria-label={`${verse.ref} 옵션`}>
                      <div className="verse-action-toolbar">
                        <button className={`${hasNote ? 'is-on ' : ''}is-plus-feature`} type="button" aria-label={`${hasNote ? '메모 확인 및 수정' : '메모 작성'}, 바이블온 플러스`} title={`${hasNote ? '메모 수정' : '메모'} · Plus`} onClick={() => dismissVerseActions(() => openNoteEditor(verse))}><NotebookPen size={18} /><PlusFeatureBadge /></button>
                        <button className={highlight ? 'is-on' : ''} type="button" aria-label={highlight ? '강조 해제' : '강조 설정'} title={highlight ? '강조 해제' : '강조'} onClick={() => {
                          if (highlight) {
                            handleHighlightButton(verse.id);
                            dismissVerseActions();
                          } else handleHighlightButton(verse.id);
                        }}><Highlighter size={18} /></button>
                        <button type="button" aria-label="말씀 전달" title="전달" onClick={() => dismissVerseActions(() => shareVerses([verse]))}><Send size={18} /></button>
                        <button className="is-plus-feature" type="button" aria-label="말씀 분석, 바이블온 플러스" title="분석 · Plus" onClick={() => { openVerseAnalysis(); dismissVerseActions(); }}><Search size={18} /><PlusFeatureBadge /></button>
                      </div>
                    </div>
                  )}
                  {showVerseActions && highlightPickerVerseId === verse.id && (
                    <div className="highlight-popover is-flow" role="dialog" aria-label={`${verse.ref} 강조 설정`}>
                      <div className="highlight-method-row" aria-label="강조 방식">
                        {highlightMethodOptions.map((option) => {
                          const MethodIcon = option.icon;
                          const isActive = highlightDraft.method === option.id;
                          return <button className={isActive ? 'is-active' : ''} type="button" key={option.id} aria-pressed={isActive} title={option.label} onClick={() => setHighlightDraft((current) => ({ ...current, method: option.id }))}><MethodIcon size={15} aria-hidden="true" /><span>{option.label}</span></button>;
                        })}
                      </div>
                      <div className="highlight-color-row" aria-label="강조 색상">
                        {highlightColorOptions.map((option) => {
                          const isActive = highlightDraft.color === option.id;
                          return <button className={`highlight-color-${option.id} ${isActive ? 'is-active' : ''}`} type="button" key={option.id} aria-label={option.label} aria-pressed={isActive} title={option.label} onClick={() => setHighlightDraft((current) => ({ ...current, color: option.id }))}>{isActive && <Check size={13} aria-hidden="true" />}</button>;
                        })}
                        <button className="highlight-apply" type="button" onClick={() => { applyHighlight(verse.id); dismissVerseActions(); }}>적용</button>
                      </div>
                    </div>
                  )}
                  {showMultiActions && (
                    <div className={`verse-action-inline ${multiActionClosing ? 'is-closing' : ''}`} role="dialog" aria-label={`${selectedVerseIds.length}개 절 옵션`}>
                      <div className="verse-action-toolbar">
                        <button className="is-plus-feature" type="button" aria-label="선택한 절 메모, 바이블온 플러스" title="메모 · Plus" onClick={() => {
                          const selectedIds = new Set(selectedVerseIds);
                          const verses = activeVerses.filter(({ id }) => selectedIds.has(id));
                          finishMultiAction(() => openNoteEditor(verses));
                        }}><NotebookPen size={18} /><PlusFeatureBadge /></button>
                        <button type="button" aria-label="선택한 절 강조" title="강조" onClick={() => {
                          setVerseHighlights((current) => {
                            const next = { ...current };
                            const allHighlighted = selectedVerseIds.every((id) => Boolean(current[id]));
                            selectedVerseIds.forEach((id) => {
                              if (allHighlighted) delete next[id];
                              else next[id] = normalizeHighlightStyle(lastHighlightStyle);
                            });
                            return next;
                          });
                          finishMultiAction();
                        }}><Highlighter size={18} /></button>
                        <button type="button" aria-label="선택한 절 전달" title="전달" onClick={() => {
                          const selectedIds = new Set(selectedVerseIds);
                          const verses = activeVerses.filter(({ id }) => selectedIds.has(id));
                          finishMultiAction(() => shareVerses(verses));
                        }}><Send size={18} /></button>
                        <button className="is-plus-feature" type="button" aria-label="선택한 절 분석, 바이블온 플러스" title="분석 · Plus" onClick={() => { openVerseAnalysis(); finishMultiAction(); }}><Search size={18} /><PlusFeatureBadge /></button>
                      </div>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>}

        <footer className="reader-footer">
          <button type="button" disabled={selectedChapter === 1} onClick={() => moveChapter(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />이전 장
          </button>
          <span>{selectedChapter} / {selectedBook.chapters}</span>
          <button type="button" disabled={selectedChapter === selectedBook.chapters} onClick={() => moveChapter(1)}>
            다음 장<ChevronRight size={18} aria-hidden="true" />
          </button>
        </footer>
        <div className="source-note">
          <span>
            {selectedTranslation === 'KRV'
              ? '성경전서 개역개정판 · 대한성서공회 사용 허가'
              : '성경전서 새번역 · 대한성서공회 사용 허가'}
          </span>
        </div>
      </article>

      {actionNotice && <div className="bible-action-notice" role="status">{actionNotice}</div>}

      {isPassagePickerOpen && (
        <PassagePickerSheet
          selectedBookId={selectedBookId}
          selectedChapter={selectedChapter}
          onClose={() => setIsPassagePickerOpen(false)}
          onSelect={(bookId, chapter) => {
            selectPassage(bookId, chapter);
            setIsPassagePickerOpen(false);
          }}
        />
      )}

      {shareSheetVerses.length > 0 && (
        <VerseShareSheet
          verses={shareSheetVerses}
          conversations={conversations}
          qtRooms={qtRooms}
          onClose={() => setShareSheetVerses([])}
          onSend={sendVersesToDestination}
        />
      )}

      {noteSheet && (
        <div className="memo-library-layer">
          <MemoEditorScreen
            target={noteSheet}
            comments={memoComments}
            onAdd={onAddMemoComment}
            onUpdate={onUpdateMemoComment}
            onClose={() => setNoteSheet(null)}
          />
        </div>
      )}

    </div>
  );
}

function VerseShareSheet({ verses, conversations, qtRooms, onClose, onSend }) {
  const [mode, setMode] = useState('friend');
  const [query, setQuery] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const friendIds = [...new Set([...readStoredValue('bibleon.friendIds', ['minseo', 'jaeyun', 'eunji']), 'jian-external'])];
  const normalizedQuery = query.trim().toLowerCase();
  const sources = {
    friend: knownMessageMembers.filter(({ id }) => friendIds.includes(id)),
    recent: conversations,
    qt: qtRooms,
  };
  const visibleItems = sources[mode].filter((item) => {
    if (!normalizedQuery) return true;
    return [
      item.name,
      item.customName,
      item.department,
      item.role,
      item.lastMessage,
      ...getConversationParticipants(getConversationParticipantIds(item)).map(({ name }) => name),
    ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const referenceLabel = verses.length > 1 ? `${verses[0].ref} 외 ${verses.length - 1}절` : verses[0].ref;

  return (
    <div className={`verse-share-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="verse-share-backdrop" type="button" aria-label="말씀 전달 닫기" onClick={() => dismiss()} />
      <section className="verse-share-sheet" role="dialog" aria-modal="true" aria-labelledby="verse-share-title">
        <header>
          <div><h2 id="verse-share-title">말씀 전달</h2><p>{referenceLabel}</p></div>
          <button type="button" aria-label="말씀 전달 닫기" onClick={() => dismiss()}><X size={21} /></button>
        </header>
        <div className="verse-share-tabs" role="tablist" aria-label="말씀 전달 대상">
          {[
            { id: 'friend', label: '친구' },
            { id: 'recent', label: '최근 대화' },
            { id: 'qt', label: 'QT방' },
          ].map(({ id, label }) => (
            <button className={mode === id ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === id} key={id} onClick={() => { setMode(id); setQuery(''); }}>{label}</button>
          ))}
        </div>
        <label className="verse-share-search">
          <Search size={17} aria-hidden="true" />
          <input aria-label="말씀 전달 대상 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'friend' ? '친구 검색' : mode === 'recent' ? '최근 대화 검색' : 'QT방 검색'} />
          {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={15} /></button>}
        </label>
        <div className="verse-share-list">
          {visibleItems.map((item) => {
            const participantIds = getConversationParticipantIds(item);
            const isGroup = mode !== 'friend' && participantIds.length > 1;
            const description = mode === 'friend'
              ? `${item.department} · ${item.role}`
              : getConversationParticipants(participantIds).map(({ name }) => name).join(', ') || item.lastMessage;
            return (
              <button type="button" key={`${mode}-${item.id}`} onClick={() => dismiss(() => onSend({ type: mode, item }))}>
                <span className={`directory-avatar tone-${item.tone ?? 'violet'}`} aria-hidden="true">
                  {mode === 'qt' ? <BookOpen className="default-profile-glyph" /> : isGroup ? <Users className="default-profile-glyph" /> : <UserRound className="default-profile-glyph" />}
                </span>
                <span><strong>{item.customName || item.name}</strong><small>{description}</small></span>
                <Send size={17} aria-hidden="true" />
              </button>
            );
          })}
          {!visibleItems.length && <p>전달할 대상을 찾지 못했어요.</p>}
        </div>
      </section>
    </div>
  );
}

function ChurchView({
  posts,
  newPost,
  setNewPost,
  addQtPost,
  selectedRef,
  selectedTranslation,
  conversations,
  setConversations,
  qtRooms,
  setQtRooms,
  onOpenBibleVerse,
  onForwardMessage,
  currentChurch,
  currentChurchId,
  communities,
  onSelectCommunity,
  churchProfiles,
  onRegisterChurch,
  onCreateChurch,
  onLeaveCommunity,
  onSaveChurchProfile,
  navigationTarget,
  onNavigationHandled,
  churchAccess,
  onDelegateChurchAdmin,
  serverChurchWorkspace,
  serverBacked,
  currentUserId,
  personalProfile,
  onReloadCommunity,
  onSearchChurches,
  isPlus,
  onRequestPlus,
  worshipMemos,
  onWorshipMemoChange,
}) {
  const [communityNoticeOpen, setCommunityNoticeOpen] = useState(false);
  const [qtCreatorOpen, setQtCreatorOpen] = useState(false);
  const [activeQtRoomId, setActiveQtRoomId] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementWarningOpen, setManagementWarningOpen] = useState(false);
  const [departmentDirectoryOpen, setDepartmentDirectoryOpen] = useState(false);
  const [announcementsExpanded, setAnnouncementsExpanded] = useState(false);
  const [worshipExpanded, setWorshipExpanded] = useState(false);
  const [worshipReadyNoticeOpen, setWorshipReadyNoticeOpen] = useState(false);
  const [worshipMemoOpen, setWorshipMemoOpen] = useState(false);
  const [churchRegistrationOpen, setChurchRegistrationOpen] = useState(false);
  const [churchAdminRegistrationOpen, setChurchAdminRegistrationOpen] = useState(false);
  const [communityEntryMenuOpen, setCommunityEntryMenuOpen] = useState(false);
  const [leaveChurchConfirmOpen, setLeaveChurchConfirmOpen] = useState(false);
  const [leaveRestriction, setLeaveRestriction] = useState('');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [announcements, setAnnouncements] = useState(() => {
    const saved = readStoredValue('bibleon.churchAnnouncements', []);
    return [...saved, ...initialChurchAnnouncements.filter(({ id }) => !saved.some((item) => item.id === id))];
  });
  const [worshipPreparations, setWorshipPreparations] = useState(() => {
    const saved = readStoredValue('bibleon.worshipPreparations', []);
    return [
      ...saved.map((item) => ({ ...(initialWorshipPreparations.find(({ id }) => id === item.id) ?? {}), ...item })),
      ...initialWorshipPreparations.filter(({ id }) => !saved.some((item) => item.id === id)),
    ];
  });
  const activeQtRoom = qtRooms.find(({ id }) => id === activeQtRoomId);
  const hasCurrentServerWorkspace = isCurrentCommunityWorkspace(
    currentChurchId,
    serverChurchWorkspace?.church?.id
  );
  const resolvedAuthority = churchAccess?.authority
    ?? (currentChurchId === SAMPLE_COMMUNITY_ID ? churchInfo.authority : '성도');
  const currentAuthority = serverBacked && !hasCurrentServerWorkspace ? '성도' : resolvedAuthority;
  const hasChurchAdminPermission = ['관리자', '부서 관리자'].includes(currentAuthority);
  const selfMemberId = currentUserId || `self-${currentChurchId}`;
  const currentDepartmentNodes = useMemo(() => {
    const serverNodes = buildCommunityDepartmentNodes(currentChurch, serverChurchWorkspace);
    const nodes = hasCurrentServerWorkspace
      ? serverNodes
      : readCommunityScopedValue('bibleon.departmentNodes', currentChurchId, serverNodes);
    return currentAuthority === '관리자'
      ? assignUnassignedMembersToRoot(nodes, [selfMemberId])
      : nodes;
  }, [currentAuthority, currentChurch, currentChurchId, hasCurrentServerWorkspace, managementOpen, selfMemberId, serverChurchWorkspace]);
  const localCommunityMemberCount = useMemo(() => new Set(
    currentDepartmentNodes.flatMap(({ memberIds }) => memberIds)
  ).size, [currentDepartmentNodes]);
  const signedCommunityMember = hasCurrentServerWorkspace
    ? serverChurchWorkspace.members.find(({ userId, id }) => (userId ?? id) === currentUserId)
    : null;
  const signedDepartment = currentDepartmentNodes.find(({ id }) => id === signedCommunityMember?.departmentId)
    ?? (currentAuthority === '관리자' ? currentDepartmentNodes.find(({ parentId }) => parentId === null) : null)
    ?? currentDepartmentNodes.find(({ id }) => id === churchAccess?.managerDepartmentId)
    ?? (currentChurchId === SAMPLE_COMMUNITY_ID
      ? currentDepartmentNodes.find(({ name }) => name === churchInfo.department)
      : null);
  const currentDepartmentName = signedDepartment?.name ?? currentChurch?.name ?? '공동체';
  const currentCommunityMemberCount = hasCurrentServerWorkspace
    ? serverChurchWorkspace.members.length
    : (serverBacked ? null : Math.max(currentAuthority === '관리자' ? 1 : 0, localCommunityMemberCount));
  const isSoleCommunityAdministrator = currentAuthority === '관리자' && currentCommunityMemberCount === 1;
  const communityAnnouncements = announcements.filter((item) => (item.communityId ?? 'grace-spring') === currentChurchId);
  const communityWorshipPreparations = worshipPreparations.filter((item) => (item.communityId ?? 'grace-spring') === currentChurchId);
  const visibleAnnouncements = useMemo(() => {
    if (currentAuthority === '관리자') return communityAnnouncements;
    return communityAnnouncements.filter((announcement) => {
      if (!announcement.scopeDepartmentId) return true;
      if (!signedDepartment) return false;
      return getDepartmentSubtreeIds(currentDepartmentNodes, announcement.scopeDepartmentId).has(signedDepartment.id);
    });
  }, [communityAnnouncements, currentAuthority, currentDepartmentNodes, signedDepartment]);
  const visibleScheduledWorship = useMemo(() => {
    if (currentAuthority === '관리자') return communityWorshipPreparations.filter(({ status }) => status === 'scheduled');
    return communityWorshipPreparations.filter((item) => {
      if (item.status !== 'scheduled') return false;
      if (!item.scopeDepartmentId) return true;
      if (!signedDepartment) return false;
      return getDepartmentSubtreeIds(currentDepartmentNodes, item.scopeDepartmentId).has(signedDepartment.id);
    });
  }, [communityWorshipPreparations, currentAuthority, currentDepartmentNodes, signedDepartment]);
  const scheduledWorship = visibleScheduledWorship[0] ?? null;

  useEffect(() => writeStoredValue('bibleon.churchAnnouncements', announcements), [announcements]);
  useEffect(() => writeStoredValue('bibleon.worshipPreparations', worshipPreparations), [worshipPreparations]);
  useEffect(() => {
    const workspaceCommunityId = serverChurchWorkspace?.church?.id;
    if (!workspaceCommunityId || workspaceCommunityId !== currentChurchId) return;
    const memberNames = new Map(serverChurchWorkspace.members.map((member) => [member.userId, member.name]));
    const nextAnnouncements = serverChurchWorkspace.announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      author: memberNames.get(announcement.created_by) ?? '공동체 관리자',
      time: new Date(announcement.created_at).toLocaleDateString('ko-KR'),
      scopeDepartmentId: announcement.visibility_department_id,
      communityId: workspaceCommunityId,
    }));
    const nextWorshipPreparations = serverChurchWorkspace.worshipServices.map((service) => ({
      id: service.id,
      status: service.status,
      title: service.title,
      coreVerse: service.core_verse_ref,
      supportVerse: service.support_verse_ref,
      hymn: service.hymn,
      content: service.description,
      pastor: service.pastor,
      serviceDate: service.service_at ? new Date(service.service_at).toLocaleString('ko-KR') : '',
      createdAt: service.created_at,
      scopeDepartmentId: service.visibility_department_id,
      communityId: workspaceCommunityId,
    }));
    setAnnouncements((current) => [
      ...current.filter((item) => (item.communityId ?? SAMPLE_COMMUNITY_ID) !== workspaceCommunityId),
      ...nextAnnouncements,
    ]);
    setWorshipPreparations((current) => [
      ...current.filter((item) => (item.communityId ?? SAMPLE_COMMUNITY_ID) !== workspaceCommunityId),
      ...nextWorshipPreparations,
    ]);
  }, [currentChurchId, serverChurchWorkspace]);
  useEffect(() => {
    setCommunityNoticeOpen(false);
    setQtCreatorOpen(false);
    setActiveQtRoomId('');
    setManagementOpen(false);
    setManagementWarningOpen(false);
    setDepartmentDirectoryOpen(false);
    setAnnouncementsExpanded(false);
    setWorshipExpanded(false);
    setWorshipMemoOpen(false);
    setSelectedAnnouncement(null);
  }, [currentChurchId]);
  useEffect(() => {
    if (!navigationTarget) return;
    if (navigationTarget.kind === 'announcement') {
      const announcement = announcements.find(({ id }) => id === navigationTarget.id);
      if (announcement) setSelectedAnnouncement(announcement);
    } else if (navigationTarget.kind === 'worship') {
      setWorshipExpanded(true);
    }
    onNavigationHandled?.();
  }, [navigationTarget?.requestedAt]);

  const createQtRoom = (result) => {
    if (result.mode === 'continue') {
      setQtRooms((current) => {
        const target = current.find(({ id }) => id === result.roomId);
        if (!target) return current;
        const updatedRoom = {
          ...target,
          verse: result.verse,
          messages: [...target.messages, result.message],
          lastMessage: result.message.text,
          time: '방금',
          unread: 0,
        };
        return [updatedRoom, ...current.filter(({ id }) => id !== result.roomId)];
      });
      setActiveQtRoomId(result.roomId);
    } else {
      setQtRooms((current) => [result.room, ...current]);
      setActiveQtRoomId(result.room.id);
    }
    setQtCreatorOpen(false);
  };

  const createGroupFromQtRoom = (currentParticipantIds, invitedMembers, customName) => {
    if (!activeQtRoom) return;
    const createdAt = Date.now();
    const participantIds = [...new Set([
      ...currentParticipantIds,
      ...invitedMembers.map(({ id }) => id),
    ])];
    const translationId = activeQtRoom.messages
      .findLast?.(({ type }) => type === 'qt-passage')?.verse?.translationId ?? 'KRV';
    const systemMessage = createQtSystemMessage(activeQtRoom.verse, translationId);
    const room = {
      id: `qt-${createdAt}`,
      type: 'qt',
      name: customName,
      customName,
      participantIds,
      participantJoinedAt: Object.fromEntries(participantIds.map((id) => [id, 0])),
      verse: activeQtRoom.verse,
      messages: [systemMessage],
      lastMessage: systemMessage.text,
      time: '방금',
      unread: 0,
      createdAt,
    };
    setQtRooms((current) => [room, ...current]);
    setActiveQtRoomId(room.id);
  };

  if (!currentChurchId || !currentChurch) {
    return (
      <div className="page-stack church-empty-page">
        <section className="church-empty-state">
          <strong>참여 중인 공동체가 없어요</strong>
          <p>교회, 동아리, 소모임과 그 밖의 모임도 함께할 수 있어요.</p>
          <div className="church-empty-actions">
            <button type="button" onClick={() => setChurchRegistrationOpen(true)}>공동체 추가하기</button>
            <button className="is-secondary" type="button" onClick={() => setChurchAdminRegistrationOpen(true)}>
              <span>공동체 만들기</span>
              <small>누구나 만들 수 있어요</small>
            </button>
          </div>
        </section>
        {churchRegistrationOpen && (
          <ChurchRegistrationSheet
            churchProfiles={churchProfiles}
            joinedCommunityIds={communities.map(({ id }) => id)}
            onSearchChurches={onSearchChurches}
            onClose={() => setChurchRegistrationOpen(false)}
            onRegister={onRegisterChurch}
          />
        )}
        {churchAdminRegistrationOpen && (
          <ChurchAdminRegistrationSheet
            onClose={() => setChurchAdminRegistrationOpen(false)}
            onCreate={onCreateChurch}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="community-switcher" aria-label="공동체 전환">
        {Array.from({ length: MAX_COMMUNITIES }, (_, index) => {
          const community = communities[index];
          return community ? (
            <button
              className={community.id === currentChurchId ? 'is-active' : ''}
              type="button"
              key={community.id}
              aria-pressed={community.id === currentChurchId}
              onClick={() => onSelectCommunity(community.id)}
            >
              <strong>{community.name}</strong>
              <span>{getCommunityTypeLabel(community)}</span>
            </button>
          ) : (
            <button
              className="is-empty"
              type="button"
              key={`empty-community-${index}`}
              aria-label="공동체 추가 또는 만들기"
              onClick={() => setCommunityEntryMenuOpen(true)}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
          );
        })}
      </section>

      <section className="church-summary">
        <div className="church-summary-head">
          <span className={`church-avatar ${currentChurch.profileImage ? 'has-image' : ''}`}>
            {currentChurch.profileImage ? <img src={currentChurch.profileImage} alt="" /> : <Church size={25} aria-hidden="true" />}
          </span>
          <div><span>{getCommunityTypeLabel(currentChurch)}</span><h2>{currentChurch.name}</h2><p>{currentDepartmentName} · {currentCommunityMemberCount === null ? '구성원 확인 중' : `구성원 ${currentCommunityMemberCount}명`}</p></div>
        </div>
        <blockquote className="church-representative-verse"><p>{currentChurch.representativeVerse}</p><cite>{currentChurch.verseRef}</cite></blockquote>
      </section>

      <Section title="공동체 소식">
        <ListSurface>
          {visibleAnnouncements.slice(0, 1).map((announcement) => (
            <ListRow
              icon={Bell}
              title={announcement.title}
              description={`${announcement.author} · ${announcement.time}`}
              action="보기"
              key={announcement.id}
              onClick={() => setSelectedAnnouncement(announcement)}
            />
          ))}
          {!visibleAnnouncements.length && <p className="church-empty-notice">등록된 공지사항이 없어요.</p>}
          {visibleAnnouncements.length > 1 && !announcementsExpanded && (
            <button className="church-announcement-expand" type="button" aria-expanded="false" onClick={() => setAnnouncementsExpanded(true)}>
              <ChevronDown size={18} aria-hidden="true" /><span>지난 공지 {visibleAnnouncements.length - 1}개</span>
            </button>
          )}
          {announcementsExpanded && (
            <div className="church-announcement-history">
              <div>
                {visibleAnnouncements.slice(1).map((announcement) => (
                  <button type="button" key={announcement.id} onClick={() => setSelectedAnnouncement(announcement)}>
                    <span><strong>{announcement.title}</strong><small>{announcement.author} · {announcement.time}</small></span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAnnouncementsExpanded(false)}>지난 공지 닫기<ChevronDown size={16} aria-hidden="true" /></button>
            </div>
          )}
        </ListSurface>
      </Section>

      {scheduledWorship && (
        <Section title="이번 주 예배">
          <div className={`service-expandable ${worshipExpanded ? 'is-expanded' : ''}`}>
            <button className="service-panel" type="button" aria-expanded={worshipExpanded} onClick={() => setWorshipExpanded((current) => !current)}>
              <div className="service-date"><span>예배</span><strong><Church size={22} aria-hidden="true" /></strong><small>예정</small></div>
              <div className="service-copy">
                <span>{scheduledWorship.title}</span>
                <h3>{scheduledWorship.content || scheduledWorship.coreVerse}</h3>
                <p>{scheduledWorship.coreVerse} · {scheduledWorship.serviceDate || scheduledWorship.createdAt}</p>
              </div>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {worshipExpanded && (
              <div className="service-detail">
                <dl>
                  <div><dt>예배 일자</dt><dd>{scheduledWorship.serviceDate || scheduledWorship.createdAt}</dd></div>
                  {scheduledWorship.pastor && <div><dt>담당 목회자</dt><dd>{scheduledWorship.pastor}</dd></div>}
                </dl>
                <button type="button" onClick={() => onOpenBibleVerse({ reference: scheduledWorship.coreVerse, translationId: selectedTranslation })}>
                  <BookOpen size={17} aria-hidden="true" /><span><strong>예배 말씀</strong><small>{scheduledWorship.coreVerse}</small></span><ChevronRight size={17} />
                </button>
                {scheduledWorship.supportVerse && (
                  <button type="button" onClick={() => onOpenBibleVerse({ reference: scheduledWorship.supportVerse, translationId: selectedTranslation })}>
                    <BookOpen size={17} aria-hidden="true" /><span><strong>보조 말씀</strong><small>{scheduledWorship.supportVerse}</small></span><ChevronRight size={17} />
                  </button>
                )}
                <button type="button" onClick={() => isPlus ? setWorshipMemoOpen(true) : onRequestPlus('worship-memo')}>
                  <NotebookPen size={17} aria-hidden="true" /><span><strong>예배 메모</strong><small>{isPlus ? (worshipMemos[scheduledWorship.id]?.memo ? '작성한 메모 이어보기' : '예배 내용을 기록해요') : '바이블온 Plus'}</small></span><ChevronRight size={17} />
                </button>
                {scheduledWorship.hymn && (
                  <button type="button" onClick={() => setWorshipReadyNoticeOpen(true)}>
                    <SixteenthNoteIcon size={17} aria-hidden="true" /><span><strong>찬양</strong><small>{scheduledWorship.hymn}</small></span><ChevronRight size={17} />
                  </button>
                )}
                {scheduledWorship.content && <p>{scheduledWorship.content}</p>}
              </div>
            )}
          </div>
        </Section>
      )}

      <section className="church-action-card" aria-label="공동체 메뉴">
        <button type="button" onClick={() => setCommunityNoticeOpen(true)}><span><strong>커뮤니티</strong><small>공동체 구성원과 소식을 나눠요</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => setQtCreatorOpen(true)}><span><strong>QT</strong><small>친구와 말씀을 묵상하고 나눠요</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => setDepartmentDirectoryOpen(true)}><span><strong>부서</strong><small>{currentDepartmentName === '부서 미지정' ? '공동체 부서와 구성원을 확인해요' : `${currentDepartmentName} 구성원을 확인해요`}</small></span><ChevronRight size={18} /></button>
      </section>

      <div className="church-account-actions">
        <button
          className="church-management-entry"
          type="button"
          aria-label="공동체 관리"
          onClick={() => {
            if (hasChurchAdminPermission) setManagementOpen(true);
            else setManagementWarningOpen(true);
          }}
        >
          <Cog size={15} aria-hidden="true" />공동체 관리
        </button>
        <button className="church-leave-entry" type="button" onClick={() => {
          if (currentAuthority === '관리자' && !isSoleCommunityAdministrator) setLeaveRestriction('administrator');
          else if (currentAuthority === '부서 관리자') setLeaveRestriction('department-manager');
          else setLeaveChurchConfirmOpen(true);
        }}>
          공동체 나가기
        </button>
      </div>

      {communityNoticeOpen && <ChurchReadyNotice onClose={() => setCommunityNoticeOpen(false)} />}
      {communityEntryMenuOpen && (
        <CommunityEntrySheet
          onClose={() => setCommunityEntryMenuOpen(false)}
          onJoin={() => setChurchRegistrationOpen(true)}
          onCreate={() => setChurchAdminRegistrationOpen(true)}
        />
      )}
      {churchRegistrationOpen && (
        <ChurchRegistrationSheet
          churchProfiles={churchProfiles}
          joinedCommunityIds={communities.map(({ id }) => id)}
          onSearchChurches={onSearchChurches}
          onClose={() => setChurchRegistrationOpen(false)}
          onRegister={onRegisterChurch}
        />
      )}
      {churchAdminRegistrationOpen && (
        <ChurchAdminRegistrationSheet
          onClose={() => setChurchAdminRegistrationOpen(false)}
          onCreate={onCreateChurch}
        />
      )}
      {worshipReadyNoticeOpen && <ChurchReadyNotice title="준비중" description="찬양 듣기 기능을 준비하고 있어요." onClose={() => setWorshipReadyNoticeOpen(false)} />}
      {worshipMemoOpen && scheduledWorship && (
        <WorshipMemoScreen
          worship={scheduledWorship}
          value={worshipMemos[scheduledWorship.id] ?? { memo: '', transcript: '', summary: '' }}
          onChange={(nextValue) => onWorshipMemoChange(scheduledWorship.id, {
            ...nextValue,
            worship: {
              id: scheduledWorship.id,
              title: scheduledWorship.title,
              coreVerse: scheduledWorship.coreVerse,
              serviceDate: scheduledWorship.serviceDate,
              createdAt: scheduledWorship.createdAt,
            },
          })}
          onClose={() => setWorshipMemoOpen(false)}
        />
      )}

      {managementWarningOpen && (
        <ConfirmDialog
          title="관리자 권한이 필요해요"
          description="공동체 관리자만 부서, 예배와 공지사항을 관리할 수 있어요."
          confirmLabel="확인"
          onClose={() => setManagementWarningOpen(false)}
          onConfirm={() => setManagementWarningOpen(false)}
        />
      )}

      {leaveChurchConfirmOpen && (
        <ConfirmDialog
          title={`${currentChurch.name}에서 나갈까요?`}
          description={isSoleCommunityAdministrator
            ? '현재 공동체의 마지막 구성원이에요. 나가면 공동체가 비활성화되며 더 이상 검색하거나 이용할 수 없습니다.'
            : '공동체 소식과 부서 정보를 더 이상 볼 수 없어요. 나중에 다시 참여를 신청할 수 있습니다.'}
          confirmLabel="공동체 나가기"
          danger
          onClose={() => setLeaveChurchConfirmOpen(false)}
          onConfirm={() => {
            setLeaveChurchConfirmOpen(false);
            void onLeaveCommunity();
          }}
        />
      )}

      {leaveRestriction && (
        <ConfirmDialog
          title={leaveRestriction === 'administrator' ? '관리자 위임이 필요해요' : '부서 관리자 권한을 먼저 해제해야 해요'}
          description={leaveRestriction === 'administrator'
            ? '공동체를 나가기 전에 공동체 관리 설정에서 다른 구성원에게 관리자 권한을 위임해 주세요.'
            : '부서 관리자는 스스로 공동체를 나갈 수 없어요. 공동체 관리자에게 직위 해제를 요청해 주세요.'}
          confirmLabel="확인"
          onClose={() => setLeaveRestriction('')}
          onConfirm={() => setLeaveRestriction('')}
        />
      )}

      {selectedAnnouncement && (
        <AnnouncementDetail announcement={selectedAnnouncement} onClose={() => setSelectedAnnouncement(null)} />
      )}

      {departmentDirectoryOpen && (
        <ChurchDepartmentDirectorySheet
          community={currentChurch}
          serverWorkspace={serverChurchWorkspace}
          currentUserId={currentUserId}
          personalProfile={personalProfile}
          isCommunityAdministrator={currentAuthority === '관리자'}
          onClose={() => setDepartmentDirectoryOpen(false)}
        />
      )}

      {managementOpen && (
        <ChurchManagementScreen
          announcements={announcements}
          setAnnouncements={setAnnouncements}
          worshipPreparations={worshipPreparations}
          setWorshipPreparations={setWorshipPreparations}
          currentCommunityId={currentChurchId}
          churchProfile={currentChurch}
          selectedTranslation={selectedTranslation}
          onSaveChurchProfile={onSaveChurchProfile}
          churchAccess={churchAccess}
          serverWorkspace={serverChurchWorkspace}
          currentUserId={currentUserId}
          personalProfile={personalProfile}
          onReloadCommunity={onReloadCommunity}
          onDelegateChurchAdmin={(member) => {
            setManagementOpen(false);
            onDelegateChurchAdmin(member);
          }}
          onClose={() => setManagementOpen(false)}
          key={currentChurchId}
        />
      )}

      {qtCreatorOpen && (
        <QtCreationFlow
          conversations={conversations}
          qtRooms={qtRooms}
          selectedTranslation={selectedTranslation}
          onClose={() => setQtCreatorOpen(false)}
          onCreate={createQtRoom}
        />
      )}

      {activeQtRoom && (
        <MessageRoom
          conversation={activeQtRoom}
          setConversations={setQtRooms}
          onBack={() => setActiveQtRoomId('')}
          onCreateGroup={createGroupFromQtRoom}
          onOpenBibleVerse={onOpenBibleVerse}
          forwardConversations={conversations}
          forwardQtRooms={qtRooms}
          onForwardMessage={onForwardMessage}
          selectedTranslation={selectedTranslation}
        />
      )}
    </div>
  );
}

function summarizeWorshipTranscript(transcript) {
  const normalized = transcript.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const sentences = normalized.split(/(?<=[.!?]|다\.)\s+/).filter(Boolean);
  const selected = (sentences.length > 1 ? sentences.slice(0, 3) : [normalized]).join(' ');
  return selected.length > 280 ? `${selected.slice(0, 277)}...` : selected;
}

function WorshipMemoScreen({ worship, value, onChange, onClose }) {
  const [isListening, setIsListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingEntryId, setEditingEntryId] = useState('');
  const recognitionRef = useRef(null);
  const transcriptBaseRef = useRef(value.transcript ?? '');
  const swipeBack = useSwipeBack(onClose);
  const memoEntries = normalizeWorshipMemoEntries(value).sort((left, right) => left.createdAt - right.createdAt);

  useEffect(() => () => recognitionRef.current?.stop?.(), []);

  const updateValue = (patch) => onChange({
    memo: value.memo ?? '',
    entries: memoEntries,
    transcript: value.transcript ?? '',
    summary: value.summary ?? '',
    worship: value.worship ?? {
      id: worship.id,
      title: worship.title,
      coreVerse: worship.coreVerse,
      serviceDate: worship.serviceDate,
      createdAt: worship.createdAt,
    },
    updatedAt: Date.now(),
    ...patch,
  });

  const saveMemo = () => {
    const body = draft.trim();
    if (!body) return;
    const timestamp = Date.now();
    const nextEntries = editingEntryId
      ? memoEntries.map((entry) => entry.id === editingEntryId ? { ...entry, body, updatedAt: timestamp } : entry)
      : [...memoEntries, {
        id: createMemoId('worship-memo'),
        body,
        parentId: replyTo?.id ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }];
    updateValue({ memo: body, entries: nextEntries });
    setDraft('');
    setReplyTo(null);
    setEditingEntryId('');
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop?.();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechMessage('이 브라우저에서는 음성 인식을 지원하지 않아요. 휴대폰 Chrome에서 다시 시도해 주세요.');
      return;
    }
    const recognition = new SpeechRecognition();
    transcriptBaseRef.current = value.transcript?.trim() ?? '';
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => { setSpeechMessage('말씀을 듣고 있어요.'); setIsListening(true); };
    recognition.onend = () => { setIsListening(false); setSpeechMessage('음성 기록이 멈췄어요.'); };
    recognition.onerror = () => { setIsListening(false); setSpeechMessage('음성을 인식하지 못했어요. 마이크 권한을 확인해 주세요.'); };
    recognition.onresult = (event) => {
      const recognized = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
      const transcript = [transcriptBaseRef.current, recognized].filter(Boolean).join(' ');
      updateValue({ transcript, summary: '' });
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <section
      className={`worship-memo-screen ${swipeBack.className}`}
      style={swipeBack.style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="worship-memo-title"
      {...swipeBack.handlers}
    >
      <header>
        <button type="button" aria-label="예배 메모 닫기" onClick={onClose}><ChevronLeft size={23} aria-hidden="true" /></button>
        <h2 id="worship-memo-title">예배 메모</h2>
        <span className="plus-mini-badge">Plus</span>
      </header>
      <div className="worship-memo-body">
        <section className="worship-memo-context">
          <span>{worship.serviceDate || worship.createdAt}</span>
          <strong>{worship.title}</strong>
          <small>{worship.coreVerse}</small>
        </section>
        <section className="worship-memo-field">
          <span>나의 메모</span>
          <div className="worship-memo-comments">
            {memoEntries.map((entry) => (
              <article key={entry.id}>
                <div><span>나</span><time>{new Date(entry.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</time></div>
                <p>{entry.body}</p>
                <div className="worship-memo-comment-actions">
                  <button type="button" onClick={() => { setEditingEntryId(entry.id); setReplyTo(null); setDraft(entry.body); }}>수정</button>
                  <button type="button" onClick={() => { setEditingEntryId(''); setReplyTo(entry); setDraft(''); }}>이어 적기</button>
                </div>
              </article>
            ))}
            {!memoEntries.length && <p className="worship-memo-empty">아직 작성한 메모가 없어요.</p>}
          </div>
          <div className="worship-memo-composer">
            <span>{editingEntryId ? '메모 수정' : replyTo ? '이어서 적기' : '새 메모'}</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="예배에서 마음에 남은 내용을 적어보세요" />
            <div>
              {(replyTo || editingEntryId) && <button type="button" onClick={() => { setReplyTo(null); setEditingEntryId(''); setDraft(''); }}>취소</button>}
              <button type="button" disabled={!draft.trim()} onClick={saveMemo}>저장</button>
            </div>
          </div>
        </section>
        <section className="worship-audio-summary">
          <header><div><strong>음성 요약</strong><small>말한 내용을 기록하고 핵심 문장을 정리해요.</small></div><AudioLines size={20} aria-hidden="true" /></header>
          <button className={isListening ? 'is-listening' : ''} type="button" onClick={toggleListening}>
            <Mic size={18} aria-hidden="true" />{isListening ? '기록 멈추기' : '음성 기록 시작'}
          </button>
          {speechMessage && <p className="worship-speech-message" role="status">{speechMessage}</p>}
          {value.transcript && <div className="worship-transcript"><span>인식된 내용</span><p>{value.transcript}</p></div>}
          {value.transcript && (
            <button className="worship-summary-action" type="button" onClick={() => updateValue({ summary: summarizeWorshipTranscript(value.transcript) })}>
              <Sparkles size={17} aria-hidden="true" />핵심 요약 만들기
            </button>
          )}
          {value.summary && <div className="worship-summary-result"><span>요약</span><p>{value.summary}</p></div>}
        </section>
      </div>
    </section>
  );
}

function ChurchReadyNotice({ onClose, title = '출시 준비중', description = '공동체 커뮤니티는 더 좋은 모습으로 준비하고 있어요.' }) {
  const { isClosing, dismiss } = useSlideDismiss(onClose);

  return (
    <div className={`church-ready-layer ${isClosing ? 'is-closing' : ''}`} role="presentation">
      <button className="church-ready-backdrop" type="button" aria-label="안내 닫기" onClick={() => dismiss()} />
      <section role="dialog" aria-modal="true" aria-labelledby="church-ready-title">
        <MessageCircle size={24} aria-hidden="true" />
        <h2 id="church-ready-title">{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={() => dismiss()}>확인</button>
      </section>
    </div>
  );
}

function CommunityEntrySheet({ onClose, onJoin, onCreate }) {
  const { isClosing, dismiss } = useSlideDismiss(onClose);

  return (
    <div className={`church-registration-layer community-entry-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="church-registration-backdrop" type="button" aria-label="공동체 메뉴 닫기" onClick={() => dismiss()} />
      <section className="church-registration-sheet community-entry-sheet" role="dialog" aria-modal="true" aria-labelledby="community-entry-title">
        <header>
          <div><h2 id="community-entry-title">공동체</h2><p>참여할 공동체를 찾거나 새로 만들 수 있어요.</p></div>
          <button type="button" aria-label="공동체 메뉴 닫기" onClick={() => dismiss()}><X size={20} /></button>
        </header>
        <div className="community-entry-actions">
          <button type="button" onClick={() => dismiss(onJoin)}>
            <span><UserPlus size={19} aria-hidden="true" /></span>
            <span><strong>공동체 추가</strong><small>이미 만들어진 공동체를 찾아 참여해요</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => dismiss(onCreate)}>
            <span><Plus size={19} aria-hidden="true" /></span>
            <span><strong>공동체 만들기</strong><small>교회, 동아리, 소모임과 기타 모임을 시작해요</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}

function ChurchRegistrationSheet({ churchProfiles, joinedCommunityIds = [], onClose, onRegister, onSearchChurches }) {
  const [query, setQuery] = useState('');
  const [selectedChurch, setSelectedChurch] = useState(null);
  const [unregisteredName, setUnregisteredName] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const [suggestions, setSuggestions] = useState([]);
  const joinedCommunityIdSet = useMemo(() => new Set(joinedCommunityIds), [joinedCommunityIds]);

  useEffect(() => {
    if (selectedChurch || !query.trim()) {
      setSuggestions([]);
      return undefined;
    }
    let active = true;
    const timerId = window.setTimeout(() => {
      Promise.resolve(onSearchChurches
        ? onSearchChurches(query)
        : searchRegisteredChurches(query, churchProfiles).slice(0, 5))
        .then((results) => { if (active) setSuggestions(results.slice(0, 5)); })
        .catch(() => { if (active) setSuggestions([]); });
    }, 220);
    return () => { active = false; window.clearTimeout(timerId); };
  }, [churchProfiles, onSearchChurches, query, selectedChurch]);

  const searchChurch = async (event) => {
    event.preventDefault();
    const normalizedQuery = query.trim().replace(/\s+/g, '').toLowerCase();
    if (!normalizedQuery) return;
    const availableChurches = onSearchChurches
      ? await onSearchChurches(query).catch(() => [])
      : getRegisteredChurches(churchProfiles);
    const exactChurch = availableChurches.find(
      ({ name }) => name.replace(/\s+/g, '').toLowerCase() === normalizedQuery
    );
    if (exactChurch) {
      if (joinedCommunityIdSet.has(exactChurch.id)) {
        setSelectedChurch(null);
        setUnregisteredName('');
        setSuggestions(availableChurches.filter(({ id }) => id === exactChurch.id));
        return;
      }
      setSelectedChurch(exactChurch);
      setUnregisteredName('');
      return;
    }
    setSelectedChurch(null);
    setUnregisteredName(query.trim());
  };

  return (
    <div className={`church-registration-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="church-registration-backdrop" type="button" aria-label="공동체 추가 닫기" onClick={() => dismiss()} />
      <section className="church-registration-sheet" role="dialog" aria-modal="true" aria-labelledby="church-registration-title">
        <header><div><h2 id="church-registration-title">공동체 추가</h2><p>이미 만들어진 공동체를 검색해 참여합니다.</p></div><button type="button" aria-label="공동체 추가 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <form className="church-registration-search" onSubmit={searchChurch}>
          <label><Search size={18} aria-hidden="true" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelectedChurch(null); setUnregisteredName(''); setErrorMessage(''); }} placeholder="공동체 이름을 검색해 주세요" /><button type="submit">검색</button></label>
        </form>
        <div className="church-registration-results">
          {suggestions.map((church) => (
            <button
              className={joinedCommunityIdSet.has(church.id) ? 'is-joined' : ''}
              type="button"
              key={church.id}
              disabled={joinedCommunityIdSet.has(church.id)}
              aria-disabled={joinedCommunityIdSet.has(church.id)}
              onClick={() => { setSelectedChurch(church); setQuery(church.name); setUnregisteredName(''); }}
            >
              <span className={`church-search-avatar ${church.profileImage ? 'has-image' : ''}`}>{church.profileImage ? <img src={church.profileImage} alt="" /> : <Users size={20} />}</span>
              <span><strong>{church.name}</strong><small>{joinedCommunityIdSet.has(church.id) ? '이미 참여 중 · ' : ''}{getCommunityTypeLabel(church)} · {church.location || '지역 미설정'}</small><em>{church.verseRef} · {church.representativeVerse}</em></span>
              {joinedCommunityIdSet.has(church.id) ? <Check size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
            </button>
          ))}
          {selectedChurch && (
            <article className="church-registration-selected">
              <span className={`church-search-avatar ${selectedChurch.profileImage ? 'has-image' : ''}`}>{selectedChurch.profileImage ? <img src={selectedChurch.profileImage} alt="" /> : <Users size={22} />}</span>
              <div><strong>{selectedChurch.name}</strong><small>{getCommunityTypeLabel(selectedChurch)} · {selectedChurch.location || '지역 미설정'}</small><blockquote>{selectedChurch.representativeVerse}<cite>{selectedChurch.verseRef}</cite></blockquote></div>
            </article>
          )}
          {unregisteredName && (
            <div className="church-registration-missing" role="status"><strong>‘{unregisteredName}’ 공동체를 찾지 못했어요.</strong><p>공동체를 새로 만들거나, 만든 사람에게 정확한 이름을 확인해 주세요.</p></div>
          )}
          {errorMessage && <p className="church-admin-registration-error" role="alert">{errorMessage}</p>}
        </div>
        <button className="church-registration-confirm" type="button" disabled={!selectedChurch || pending} onClick={async () => {
          if (!selectedChurch) return;
          setPending(true);
          setErrorMessage('');
          try {
            await onRegister(selectedChurch);
            dismiss();
          } catch (error) {
            setErrorMessage(error?.message || '공동체에 참여하지 못했어요. 잠시 후 다시 시도해 주세요.');
            setPending(false);
          }
        }}>{pending ? '참여하고 있어요' : '이 공동체에 참여'}</button>
      </section>
    </div>
  );
}

function ChurchAdminRegistrationSheet({ onClose, onCreate }) {
  const [churchName, setChurchName] = useState('');
  const [communityType, setCommunityType] = useState('church');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const normalizedName = churchName.trim();
  const canCreate = normalizedName.length >= 2 && !pending;

  const submitRegistration = async (event) => {
    event.preventDefault();
    if (!canCreate) return;
    setPending(true);
    setErrorMessage('');
    try {
      await onCreate({ name: normalizedName, communityType });
      dismiss();
    } catch (error) {
      const duplicate = `${error?.message ?? ''}`.toLowerCase().includes('duplicate');
      setErrorMessage(duplicate
        ? '같은 이름의 공동체가 있어요. 공동체 추가에서 검색해 주세요.'
        : (error?.message || '공동체를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'));
      setPending(false);
    }
  };

  return (
    <div className={`church-registration-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="church-registration-backdrop" type="button" aria-label="공동체 만들기 닫기" onClick={() => dismiss()} />
      <section className="church-registration-sheet church-admin-registration-sheet" role="dialog" aria-modal="true" aria-labelledby="church-admin-registration-title">
        <header>
          <div><h2 id="church-admin-registration-title">공동체 만들기</h2><p>누구나 새로운 공동체를 시작할 수 있어요.</p></div>
          <button type="button" aria-label="공동체 만들기 닫기" onClick={() => dismiss()}><X size={20} /></button>
        </header>
        <form onSubmit={submitRegistration}>
          <label className="church-admin-name-field">
            <span>공동체 이름</span>
            <input autoFocus maxLength={80} value={churchName} onChange={(event) => setChurchName(event.target.value)} placeholder="공동체 이름을 입력해 주세요" />
          </label>
          <div className="community-type-picker" role="radiogroup" aria-label="공동체 유형">
            {Object.entries({ church: '교회', club: '동아리', small_group: '소모임', community: '기타' }).map(([id, label]) => (
              <button className={communityType === id ? 'is-selected' : ''} type="button" role="radio" aria-checked={communityType === id} key={id} onClick={() => setCommunityType(id)}>{label}</button>
            ))}
          </div>
          <div className="church-admin-registration-notice"><strong>만든 사람이 관리자가 됩니다.</strong><p>구성원, 부서와 공지를 관리할 수 있고 예배 준비는 필요할 때만 사용할 수 있어요.</p></div>
          {errorMessage && <p className="church-admin-registration-error" role="alert">{errorMessage}</p>}
          <button className="church-registration-confirm" type="submit" disabled={!canCreate}>{pending ? '공동체를 만들고 있어요' : '공동체 만들기'}</button>
        </form>
      </section>
    </div>
  );
}

function ChurchDepartmentDirectorySheet({
  community,
  serverWorkspace,
  currentUserId,
  personalProfile,
  isCommunityAdministrator,
  onClose,
}) {
  const [expandedDepartmentId, setExpandedDepartmentId] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const hasCurrentServerWorkspace = isCurrentCommunityWorkspace(
    community?.id,
    serverWorkspace?.church?.id
  );
  const departmentNodes = useMemo(() => {
    const serverNodes = buildCommunityDepartmentNodes(community, serverWorkspace);
    const nodes = hasCurrentServerWorkspace
      ? serverNodes
      : readCommunityScopedValue('bibleon.departmentNodes', community?.id, serverNodes);
    const selfMemberId = currentUserId || `self-${community?.id}`;
    return isCommunityAdministrator
      ? assignUnassignedMembersToRoot(nodes, [selfMemberId])
      : nodes;
  }, [community, currentUserId, hasCurrentServerWorkspace, isCommunityAdministrator, serverWorkspace]);
  const memberRoles = useMemo(() => {
    const serverRoles = buildCommunityMemberRoles(serverWorkspace, community?.id);
    return hasCurrentServerWorkspace
      ? serverRoles
      : readCommunityScopedValue('bibleon.churchMemberRoles', community?.id, serverRoles);
  }, [community?.id, hasCurrentServerWorkspace, serverWorkspace]);
  const approvedMembers = useMemo(() => {
    const serverMembers = buildCommunityMembers(serverWorkspace, community?.id);
    return hasCurrentServerWorkspace
      ? serverMembers
      : readCommunityScopedValue('bibleon.approvedChurchMembers', community?.id, serverMembers);
  }, [community?.id, hasCurrentServerWorkspace, serverWorkspace]);
  const membersById = useMemo(() => new Map(
    (hasCurrentServerWorkspace
      ? buildCommunityMembers(serverWorkspace, community?.id)
      : [
        ...(community?.id === SAMPLE_COMMUNITY_ID ? churchMessageMembers : []),
        ...approvedMembers,
        ...(isCommunityAdministrator ? [{
          ...defaultPersonalProfile,
          ...personalProfile,
          id: currentUserId || `self-${community?.id}`,
          department: community?.name ?? '공동체',
          role: '공동체 관리자',
          churchId: community?.id,
          churchName: community?.name ?? '공동체',
          tone: 'violet',
        }] : []),
      ])
      .map((member) => [member.id, member])
  ), [approvedMembers, community, currentUserId, hasCurrentServerWorkspace, isCommunityAdministrator, personalProfile, serverWorkspace]);
  const flattenedNodes = useMemo(() => flattenDepartmentNodes(departmentNodes), [departmentNodes]);

  return (
    <div className={`admin-sheet-layer church-department-directory-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="부서 보기 닫기" onClick={() => dismiss()} />
      <section className="church-department-directory-sheet" role="dialog" aria-modal="true" aria-labelledby="church-department-directory-title">
        <header>
          <div><h2 id="church-department-directory-title">공동체 부서</h2><p>부서를 눌러 소속 구성원을 확인할 수 있어요.</p></div>
          <button type="button" aria-label="부서 보기 닫기" onClick={() => dismiss()}><X size={20} /></button>
        </header>
        <div className="church-department-directory-list">
          {flattenedNodes.map((node) => {
            const isExpanded = expandedDepartmentId === node.id;
            const members = getDepartmentMemberIds(departmentNodes, node.id)
              .map((id) => membersById.get(id))
              .filter(Boolean);
            return (
              <article className={isExpanded ? 'is-expanded' : ''} key={node.id} style={{ '--department-depth': node.depth }}>
                <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedDepartmentId(isExpanded ? '' : node.id)}>
                  <Folder size={18} fill={isExpanded ? 'currentColor' : 'none'} aria-hidden="true" />
                  <span><strong>{node.name}</strong><small>{members.length}명</small></span>
                  <ChevronDown size={17} aria-hidden="true" />
                </button>
                {isExpanded && (
                  <div className="church-department-members">
                    {members.map((member) => (
                      <div key={member.id}>
                        <span className={`directory-avatar tone-${member.tone ?? 'violet'}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                        <span><strong>{member.name}</strong><small>{memberRoles[member.id]?.title ?? member.role ?? `${node.name} 소속`}</small></span>
                      </div>
                    ))}
                    {!members.length && <p>현재 소속된 구성원이 없어요.</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ChurchManagementScreen({
  announcements,
  setAnnouncements,
  worshipPreparations,
  setWorshipPreparations,
  currentCommunityId,
  churchProfile,
  selectedTranslation,
  onSaveChurchProfile,
  churchAccess,
  serverWorkspace,
  currentUserId,
  personalProfile,
  onReloadCommunity,
  onDelegateChurchAdmin,
  onClose,
}) {
  const hasCurrentServerWorkspace = isCurrentCommunityWorkspace(
    currentCommunityId,
    serverWorkspace?.church?.id
  );
  const [mode, setMode] = useState('departments');
  const [departmentNodes, setDepartmentNodes] = useState(() => {
    const serverNodes = buildCommunityDepartmentNodes(churchProfile, serverWorkspace);
    return hasCurrentServerWorkspace
      ? serverNodes
      : readCommunityScopedValue('bibleon.departmentNodes', currentCommunityId, serverNodes);
  });
  const [memberRoles, setMemberRoles] = useState(() => {
    const serverRoles = buildCommunityMemberRoles(serverWorkspace, currentCommunityId);
    return hasCurrentServerWorkspace
      ? serverRoles
      : readCommunityScopedValue('bibleon.churchMemberRoles', currentCommunityId, serverRoles);
  });
  const [approvedMembers, setApprovedMembers] = useState(() => {
    const serverMembers = buildCommunityMembers(serverWorkspace, currentCommunityId);
    return hasCurrentServerWorkspace
      ? serverMembers
      : readCommunityScopedValue('bibleon.approvedChurchMembers', currentCommunityId, serverMembers);
  });
  const [joinRequests, setJoinRequests] = useState(() => readCommunityScopedValue(
    'bibleon.churchJoinRequests',
    currentCommunityId,
    currentCommunityId === SAMPLE_COMMUNITY_ID ? initialChurchJoinRequests : []
  ));
  const [autoJoinEnabled, setAutoJoinEnabled] = useState(() => readCommunityScopedValue(
    'bibleon.churchAutoJoin',
    currentCommunityId,
    Boolean(churchProfile?.autoJoin)
  ));
  const [requestListOpen, setRequestListOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState('');
  const [deleteNode, setDeleteNode] = useState(null);
  const [assignmentNodeId, setAssignmentNodeId] = useState('');
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [activeMemberMenuId, setActiveMemberMenuId] = useState('');
  const [moveSelectedIds, setMoveSelectedIds] = useState([]);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [moveDestination, setMoveDestination] = useState(null);
  const [positionTargetId, setPositionTargetId] = useState('');
  const [pendingPosition, setPendingPosition] = useState(null);
  const [kickTargetId, setKickTargetId] = useState('');
  const [worshipFormOpen, setWorshipFormOpen] = useState(false);
  const [churchVersePickerOpen, setChurchVersePickerOpen] = useState(false);
  const [churchProfileDraft, setChurchProfileDraft] = useState(churchProfile);
  const [churchProfileImageError, setChurchProfileImageError] = useState('');
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [pendingAdminTransfer, setPendingAdminTransfer] = useState(null);
  const [adminNotice, setAdminNotice] = useState('');
  const [announcementDraft, setAnnouncementDraft] = useState({ title: '', content: '' });
  const flattenedNodes = useMemo(() => flattenDepartmentNodes(departmentNodes), [departmentNodes]);
  const assignmentNode = departmentNodes.find(({ id }) => id === assignmentNodeId);
  const activeDepartment = departmentNodes.find(({ id }) => id === activeDepartmentId);
  const isChurchAdministrator = churchAccess?.authority === '관리자';
  const selfMemberId = currentUserId || `self-${currentCommunityId}`;
  const managerDepartmentId = churchAccess?.authority === '부서 관리자' ? churchAccess.managerDepartmentId : '';
  const manageableNodeIds = useMemo(() => (
    isChurchAdministrator
      ? new Set(departmentNodes.map(({ id }) => id))
      : getDepartmentSubtreeIds(departmentNodes, managerDepartmentId)
  ), [departmentNodes, isChurchAdministrator, managerDepartmentId]);
  const visibleFlattenedNodes = flattenedNodes.filter(({ id }) => manageableNodeIds.has(id));
  const communityMembers = useMemo(() => {
    const seedMembers = currentCommunityId === SAMPLE_COMMUNITY_ID ? churchMessageMembers : [];
    const membersById = new Map([...seedMembers, ...approvedMembers].map((member) => [member.id, member]));
    if (isChurchAdministrator && !membersById.has(selfMemberId)) {
      membersById.set(selfMemberId, {
        ...defaultPersonalProfile,
        ...personalProfile,
        id: selfMemberId,
        department: churchProfile?.name ?? '공동체',
        role: '공동체 관리자',
        churchId: currentCommunityId,
        churchName: churchProfile?.name ?? '공동체',
        tone: 'violet',
      });
    }
    return [...membersById.values()].sort((left, right) => (left.name ?? '').localeCompare(right.name ?? '', 'ko-KR'));
  }, [approvedMembers, churchProfile?.name, currentCommunityId, isChurchAdministrator, personalProfile, selfMemberId]);
  const activeDepartmentMembers = activeDepartment
    ? getDepartmentMemberIds(departmentNodes, activeDepartment.id)
      .map((memberId) => communityMembers.find(({ id }) => id === memberId))
      .filter(Boolean)
    : [];
  const positionTarget = communityMembers.find(({ id }) => id === positionTargetId);
  const kickTarget = communityMembers.find(({ id }) => id === kickTargetId);
  const scopedWorshipPreparations = worshipPreparations.filter((item) => (
    (item.communityId ?? 'grace-spring') === currentCommunityId
    && (!item.scopeDepartmentId || manageableNodeIds.has(item.scopeDepartmentId))
  ));
  const scopedAnnouncements = announcements.filter((item) => (
    (item.communityId ?? 'grace-spring') === currentCommunityId
    && (!item.scopeDepartmentId || manageableNodeIds.has(item.scopeDepartmentId))
  ));

  const handleBack = () => {
    if (moveSelectedIds.length) {
      setMoveSelectedIds([]);
      setActiveMemberMenuId('');
      return;
    }
    if (activeDepartmentId) {
      setActiveDepartmentId('');
      setActiveMemberMenuId('');
      return;
    }
    onClose();
  };
  const swipeBack = useSwipeBack(handleBack, {
    enabled: !createParentId && !deleteNode && !assignmentNodeId && !movePickerOpen && !moveDestination
      && !positionTargetId && !pendingPosition && !kickTargetId && !worshipFormOpen
      && !adminTransferOpen && !pendingAdminTransfer,
  });

  useEffect(() => {
    if (!hasCurrentServerWorkspace) return;
    setDepartmentNodes(buildCommunityDepartmentNodes(churchProfile, serverWorkspace));
    setMemberRoles(buildCommunityMemberRoles(serverWorkspace, currentCommunityId));
    setApprovedMembers(buildCommunityMembers(serverWorkspace, currentCommunityId));
  }, [churchProfile, currentCommunityId, hasCurrentServerWorkspace, serverWorkspace]);

  useEffect(() => {
    if (hasCurrentServerWorkspace || !isChurchAdministrator) return;
    setApprovedMembers((current) => current.some(({ id }) => id === selfMemberId)
      ? current
      : [...current, {
        ...defaultPersonalProfile,
        ...personalProfile,
        id: selfMemberId,
        department: churchProfile?.name ?? '공동체',
        role: '공동체 관리자',
        churchId: currentCommunityId,
        churchName: churchProfile?.name ?? '공동체',
        tone: 'violet',
      }]);
  }, [churchProfile?.name, currentCommunityId, hasCurrentServerWorkspace, isChurchAdministrator, personalProfile, selfMemberId]);

  useEffect(() => {
    const memberIds = communityMembers.map(({ id }) => id);
    setDepartmentNodes((current) => assignUnassignedMembersToRoot(current, memberIds));
  }, [communityMembers]);

  useEffect(() => {
    if (!hasCurrentServerWorkspace) writeCommunityScopedValue('bibleon.departmentNodes', currentCommunityId, departmentNodes);
  }, [currentCommunityId, departmentNodes, hasCurrentServerWorkspace]);
  useEffect(() => {
    if (!hasCurrentServerWorkspace) writeCommunityScopedValue('bibleon.churchMemberRoles', currentCommunityId, memberRoles);
  }, [currentCommunityId, hasCurrentServerWorkspace, memberRoles]);
  useEffect(() => {
    if (!hasCurrentServerWorkspace) writeCommunityScopedValue('bibleon.approvedChurchMembers', currentCommunityId, approvedMembers);
  }, [approvedMembers, currentCommunityId, hasCurrentServerWorkspace]);
  useEffect(() => writeCommunityScopedValue('bibleon.churchJoinRequests', currentCommunityId, joinRequests), [currentCommunityId, joinRequests]);
  useEffect(() => writeCommunityScopedValue('bibleon.churchAutoJoin', currentCommunityId, autoJoinEnabled), [autoJoinEnabled, currentCommunityId]);

  const showAdminNotice = (message) => {
    setAdminNotice(message);
    window.setTimeout(() => setAdminNotice(''), 1700);
  };

  const loadChurchProfileImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = await readImagePreview(file, 1_500_000);
      setChurchProfileDraft((current) => ({ ...current, profileImage: preview, _profileImageFile: file }));
      setChurchProfileImageError('');
    } catch (error) {
      setChurchProfileImageError(error.message);
    }
  };

  const saveChurchProfile = () => {
    onSaveChurchProfile(churchProfileDraft);
    showAdminNotice('공동체 프로필을 저장했어요.');
  };

  const requestCreateDepartment = (parentNode) => {
    if (getDepartmentDepth(departmentNodes, parentNode.id) >= 4) {
      showAdminNotice('부서는 최대 5단계까지만 만들 수 있어요.');
      return;
    }
    setCreateParentId(parentNode.id);
  };

  const createDepartment = (name) => {
    const normalizedName = name.trim();
    if (!normalizedName || !createParentId) return;
    setDepartmentNodes((current) => [...current, {
      id: `department-${Date.now()}`,
      parentId: createParentId,
      name: normalizedName,
      memberIds: [],
    }]);
    setCreateParentId('');
    showAdminNotice(`${normalizedName} 부서를 만들었어요.`);
  };

  const deleteDepartment = () => {
    if (!deleteNode) return;
    setDepartmentNodes((current) => {
      const removeIds = getDepartmentSubtreeIds(current, deleteNode.id);
      const movedMemberIds = current
        .filter(({ id }) => removeIds.has(id))
        .flatMap(({ memberIds }) => memberIds);
      return current
        .filter(({ id }) => !removeIds.has(id))
        .map((node) => node.id === deleteNode.parentId
          ? { ...node, memberIds: [...new Set([...node.memberIds, ...movedMemberIds])] }
          : node);
    });
    setActiveDepartmentId('');
    showAdminNotice(`${deleteNode.name} 구성원을 상위 부서로 옮기고 부서를 삭제했어요.`);
    setDeleteNode(null);
  };

  const assignMembers = (memberIds) => {
    setDepartmentNodes((current) => {
      const ancestorIds = getDepartmentAncestorIds(current, assignmentNodeId);
      return current.map((node) => ancestorIds.has(node.id)
        ? { ...node, memberIds: [...new Set([...node.memberIds, ...memberIds])] }
        : node);
    });
    setAssignmentNodeId('');
    showAdminNotice('부서 구성원을 지정했어요.');
  };

  const toggleMoveMember = (memberId) => setMoveSelectedIds((current) => current.includes(memberId)
    ? current.filter((id) => id !== memberId)
    : [...current, memberId]);

  const beginMemberMove = (memberId) => {
    setActiveMemberMenuId('');
    setMoveSelectedIds([memberId]);
  };

  const confirmMemberMove = async () => {
    if (!moveDestination || !moveSelectedIds.length) return;
    const destination = moveDestination;
    const memberIds = [...moveSelectedIds];
    if (hasCurrentServerWorkspace) {
      try {
        await churchRepository.moveMembers(memberIds, destination.id);
        await onReloadCommunity?.();
      } catch {
        showAdminNotice('부서 이동을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
    }
    setDepartmentNodes((current) => {
      const destinationAncestorIds = getDepartmentAncestorIds(current, destination.id);
      return current.map((node) => {
        if (!isChurchAdministrator && !manageableNodeIds.has(node.id)) return node;
        const withoutMovedMembers = node.memberIds.filter((memberId) => !memberIds.includes(memberId));
        return destinationAncestorIds.has(node.id)
          ? { ...node, memberIds: [...new Set([...withoutMovedMembers, ...memberIds])] }
          : { ...node, memberIds: withoutMovedMembers };
      });
    });
    setMoveDestination(null);
    setMoveSelectedIds([]);
    showAdminNotice(`${memberIds.length}명을 ${destination.name}(으)로 옮겼어요.`);
  };

  const confirmMemberPosition = () => {
    if (!pendingPosition) return;
    setMemberRoles((current) => ({
      ...current,
      [pendingPosition.memberId]: {
        title: pendingPosition.title,
        managerDepartmentId: pendingPosition.isDepartmentManager ? pendingPosition.departmentId : null,
      },
    }));
    showAdminNotice(`${pendingPosition.memberName}님의 직위를 변경했어요.`);
    setPendingPosition(null);
  };

  const confirmAdminTransfer = () => {
    if (!pendingAdminTransfer) return;
    setMemberRoles((current) => {
      const next = {
        ...current,
        [pendingAdminTransfer.id]: {
          title: '공동체 관리자',
          authority: '관리자',
          managerDepartmentId: null,
        },
      };
      writeCommunityScopedValue('bibleon.churchMemberRoles', currentCommunityId, next);
      return next;
    });
    onDelegateChurchAdmin(pendingAdminTransfer);
    setPendingAdminTransfer(null);
  };

  const confirmKickMember = () => {
    if (!kickTarget) return;
    setDepartmentNodes((current) => current.map((node) => ({
      ...node,
      memberIds: node.memberIds.filter((memberId) => memberId !== kickTarget.id),
    })));
    setApprovedMembers((current) => current.filter(({ id }) => id !== kickTarget.id));
    setMemberRoles((current) => {
      const next = { ...current };
      delete next[kickTarget.id];
      return next;
    });
    showAdminNotice(`${kickTarget.name}님을 공동체에서 내보냈어요.`);
    setKickTargetId('');
  };

  const approveJoinRequest = (request) => {
    const approvedMember = {
      ...request,
      department: churchProfile.name,
      role: '등록 교인',
      churchId: churchProfile.id,
      churchName: churchProfile.name,
    };
    setApprovedMembers((current) => [...current.filter(({ id }) => id !== request.id), approvedMember]);
    setJoinRequests((current) => current.filter(({ id }) => id !== request.id));
    setDepartmentNodes((current) => current.map((node) => node.parentId === null
      ? { ...node, memberIds: [...new Set([...node.memberIds, request.id])] }
      : node));
    showAdminNotice(`${request.name}님의 가입을 승인했어요.`);
  };

  const rejectJoinRequest = (request) => {
    setJoinRequests((current) => current.filter(({ id }) => id !== request.id));
    showAdminNotice(`${request.name}님의 가입 신청을 거절했어요.`);
  };

  const addWorshipPreparation = (draft) => {
    setWorshipPreparations((current) => [{
      id: `service-${Date.now()}`,
      status: 'pending',
      title: `${draft.coreVerse} 예배`,
      ...draft,
      createdAt: '방금 작성',
      scopeDepartmentId: managerDepartmentId || null,
      communityId: currentCommunityId,
    }, ...current]);
    setWorshipFormOpen(false);
    showAdminNotice('예배 준비를 대기 상태로 저장했어요.');
  };

  const publishWorshipPreparation = (preparationId) => {
    setWorshipPreparations((current) => current.map((item) => item.id === preparationId
      ? { ...item, status: 'scheduled', createdAt: '예정됨' }
      : item));
    showAdminNotice('예정된 예배로 등록했어요.');
  };

  const publishAnnouncement = (event) => {
    event.preventDefault();
    if (!announcementDraft.title.trim() || !announcementDraft.content.trim()) return;
    const announcement = {
      id: `announcement-${Date.now()}`,
      title: announcementDraft.title.trim(),
      content: announcementDraft.content.trim(),
      author: '김온유 관리자',
      time: '방금',
      scopeDepartmentId: managerDepartmentId || null,
      communityId: currentCommunityId,
    };
    setAnnouncements((current) => [announcement, ...current]);
    setAnnouncementDraft({ title: '', content: '' });
    showAdminNotice('공동체 공지사항을 등록했어요.');
  };

  return (
    <section
      className={`church-admin-screen ${swipeBack.className}`}
      style={swipeBack.style}
      aria-label="공동체 관리"
      {...swipeBack.handlers}
    >
      <header>
        <button type="button" aria-label="공동체 관리 뒤로가기" onClick={handleBack}><ChevronLeft size={24} /></button>
        <h2>{moveSelectedIds.length ? `${moveSelectedIds.length}명 선택` : (activeDepartment?.name ?? '공동체 관리')}</h2>
        {moveSelectedIds.length
          ? <button type="button" aria-label="부서 이동 대상 선택" disabled={!moveSelectedIds.length} onClick={() => setMovePickerOpen(true)}><Check size={22} /></button>
          : mode === 'worship' && !activeDepartment
            ? <button type="button" aria-label="예배 준비 추가" onClick={() => setWorshipFormOpen(true)}><Plus size={22} /></button>
            : <span />}
      </header>
      {!activeDepartment && (
        <div className={`church-admin-tabs ${isChurchAdministrator ? 'has-settings' : ''}`} role="tablist" aria-label="공동체 관리 메뉴">
          <button className={mode === 'departments' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'departments'} onClick={() => setMode('departments')}>부서</button>
          <button className={mode === 'worship' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'worship'} onClick={() => setMode('worship')}>예배 준비</button>
          <button className={mode === 'announcements' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'announcements'} onClick={() => setMode('announcements')}>공지사항</button>
          {isChurchAdministrator && <button className={mode === 'settings' ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === 'settings'} onClick={() => setMode('settings')}>설정</button>}
        </div>
      )}

      <div className="church-admin-content">
        {mode === 'departments' && !activeDepartment && (
          <div className="department-tree" aria-label="공동체 부서 구조">
            {visibleFlattenedNodes.map((node) => (
              <div className={`department-node ${node.depth === 0 ? 'is-root' : ''}`} style={{ '--department-depth': node.depth }} key={node.id}>
                <button className="department-node-main" type="button" onClick={() => setActiveDepartmentId(node.id)}>
                  <span className="department-folder"><Folder size={19} fill={node.depth === 0 ? 'currentColor' : 'none'} aria-hidden="true" /></span>
                  <span className="department-node-copy"><strong>{node.name}</strong><small>{getDepartmentMemberIds(departmentNodes, node.id).length}명 · {node.depth + 1}단계</small></span>
                </button>
                <div className="department-node-actions">
                  {isChurchAdministrator && node.parentId && <button type="button" aria-label={`${node.name} 구성원 지정`} title="구성원 지정" onClick={() => setAssignmentNodeId(node.id)}><UserPlus size={17} /></button>}
                  {isChurchAdministrator && <button type="button" aria-label={`${node.name} 하위 부서 생성`} title="하위 부서 생성" onClick={() => requestCreateDepartment(node)}><FolderPlus size={17} /></button>}
                  {isChurchAdministrator && node.parentId && <button className="is-danger" type="button" aria-label={`${node.name} 삭제`} title="부서 삭제" onClick={() => setDeleteNode(node)}><Trash2 size={16} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === 'departments' && activeDepartment && (
          <div className={`department-detail ${moveSelectedIds.length ? 'is-selecting' : ''}`}>
            <div className="department-detail-summary">
              <span><Users size={18} aria-hidden="true" /></span>
              <div><strong>{activeDepartment.name} 구성원</strong><small>{activeDepartmentMembers.length}명</small></div>
            </div>
            <div className="department-admin-member-list">
              {activeDepartmentMembers.map((member) => {
                const selected = moveSelectedIds.includes(member.id);
                const directDepartment = getMemberDepartmentNode(departmentNodes, member.id) ?? activeDepartment;
                const title = memberRoles[member.id]?.title || member.role || `${directDepartment.name} 소속`;
                return (
                  <div className={`department-admin-member ${selected ? 'is-selected' : ''}`} key={member.id}>
                    <button className="department-admin-member-main" type="button" disabled={!moveSelectedIds.length} onClick={() => toggleMoveMember(member.id)}>
                      <span className={`member-avatar tone-${member.tone ?? 'violet'}`}><UserRound className="default-profile-glyph" /></span>
                      <span><strong>{member.name}</strong><small>{title}</small></span>
                    </button>
                    {moveSelectedIds.length
                      ? <button className="department-member-check" type="button" aria-label={`${member.name} ${selected ? '선택 해제' : '선택'}`} onClick={() => toggleMoveMember(member.id)}>{selected && <Check size={15} />}</button>
                      : <button className="department-member-more" type="button" aria-label={`${member.name} 관리 메뉴`} onClick={() => setActiveMemberMenuId((current) => current === member.id ? '' : member.id)}><MoreHorizontal size={20} /></button>}
                    {activeMemberMenuId === member.id && (
                      <div className="department-member-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => beginMemberMove(member.id)}><Folder size={16} />부서 이동</button>
                        <button type="button" role="menuitem" onClick={() => { setActiveMemberMenuId(''); setPositionTargetId(member.id); }}><ShieldCheck size={16} />직위 설정</button>
                        {isChurchAdministrator && member.id !== selfMemberId && <button className="is-danger" type="button" role="menuitem" onClick={() => { setActiveMemberMenuId(''); setKickTargetId(member.id); }}><UserMinus size={16} />공동체 강퇴</button>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!activeDepartmentMembers.length && <p className="department-empty">이 부서에 등록된 구성원이 없어요.</p>}
            </div>
          </div>
        )}

        {mode === 'worship' && (
          <div className="worship-admin-list">
            <section>
              <h3>예정된 예배</h3>
              {scopedWorshipPreparations.filter(({ status }) => status === 'scheduled').map((item) => <WorshipPreparationCard item={item} nodes={departmentNodes} key={item.id} />)}
              {!scopedWorshipPreparations.some(({ status }) => status === 'scheduled') && <p>예정된 예배가 없어요.</p>}
            </section>
            <section>
              <h3>대기중인 예배</h3>
              {scopedWorshipPreparations.filter(({ status }) => status === 'pending').map((item) => <WorshipPreparationCard item={item} nodes={departmentNodes} pending onPublish={() => publishWorshipPreparation(item.id)} key={item.id} />)}
              {!scopedWorshipPreparations.some(({ status }) => status === 'pending') && <p>대기중인 예배가 없어요.</p>}
            </section>
          </div>
        )}

        {mode === 'announcements' && (
          <div className="announcement-admin">
            <form onSubmit={publishAnnouncement}>
              <label><span>제목</span><input value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} placeholder="공지 제목" /></label>
              <label><span>내용</span><textarea value={announcementDraft.content} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, content: event.target.value }))} placeholder="공동체 구성원에게 알릴 내용을 적어주세요" /></label>
              <button type="submit" disabled={!announcementDraft.title.trim() || !announcementDraft.content.trim()}><Megaphone size={17} />공지 등록</button>
            </form>
            <div className="announcement-admin-list">
              {scopedAnnouncements.map((announcement) => <div key={announcement.id}><strong>{announcement.title}</strong><small>{announcement.author} · {announcement.time}{announcement.scopeDepartmentId ? ` · ${departmentNodes.find(({ id }) => id === announcement.scopeDepartmentId)?.name} 공개` : ''}</small></div>)}
            </div>
          </div>
        )}

        {mode === 'settings' && isChurchAdministrator && (
          <div className="church-admin-settings">
            <section className="church-admin-setting-card church-profile-setting-card">
              <header className="church-profile-setting-heading">
                <div><strong>공동체 프로필</strong><small>공동체 탭과 검색에 함께 표시됩니다.</small></div>
                <span>{getCommunityTypeLabel(churchProfileDraft)}</span>
              </header>
              <div className="church-profile-identity">
                <span className={`church-profile-preview ${churchProfileDraft.profileImage ? 'has-image' : ''}`}>
                  {churchProfileDraft.profileImage ? <img src={churchProfileDraft.profileImage} alt="" /> : <Users size={28} aria-hidden="true" />}
                </span>
                <div>
                  <strong>{churchProfileDraft.name}</strong>
                  <small>{getCommunityTypeLabel(churchProfileDraft)} 프로필</small>
                  <div className="church-profile-photo-actions">
                    <label><Camera size={15} aria-hidden="true" />사진 변경<input type="file" accept="image/*" onChange={loadChurchProfileImage} /></label>
                    {churchProfileDraft.profileImage && <button type="button" onClick={() => setChurchProfileDraft((current) => ({ ...current, profileImage: '', profileImagePath: '', _profileImageFile: null }))}>기본 이미지</button>}
                  </div>
                </div>
              </div>
              {churchProfileImageError && <p className="church-profile-error" role="alert">{churchProfileImageError}</p>}
              <div className="church-profile-verse-field">
                <span>대표 말씀</span>
                <button className="church-profile-verse-trigger" type="button" onClick={() => setChurchVersePickerOpen(true)}>
                  <BookOpen size={18} aria-hidden="true" />
                  <span><strong>{churchProfileDraft.verseRef || '말씀 선택'}</strong><small>{churchProfileDraft.representativeVerse || '공동체를 소개할 말씀을 골라 주세요.'}</small></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <button className="church-profile-save" type="button" onClick={saveChurchProfile}>공동체 프로필 저장</button>
            </section>
            <section className="church-admin-setting-card">
              <header><span><Users size={19} aria-hidden="true" /></span><div><strong>구성원</strong><small>공동체 참여와 신청을 관리합니다.</small></div></header>
              <button className="church-admin-toggle-row" type="button" role="switch" aria-checked={autoJoinEnabled} onClick={() => { setAutoJoinEnabled((current) => !current); setRequestListOpen(false); }}>
                <span><strong>자동 가입</strong><small>공동체를 선택한 사용자를 바로 승인합니다.</small></span>
                <i className={autoJoinEnabled ? 'is-on' : ''}><b /></i>
              </button>
              <button className="church-join-request-entry" type="button" disabled={autoJoinEnabled} aria-expanded={requestListOpen} onClick={() => setRequestListOpen((current) => !current)}>
                <span><strong>신청 목록</strong><small>{autoJoinEnabled ? '자동 가입 사용 중' : `${joinRequests.length}명이 승인을 기다리고 있어요.`}</small></span>
                <ChevronDown className={requestListOpen ? 'is-open' : ''} size={18} />
              </button>
              {!autoJoinEnabled && requestListOpen && (
                <div className="church-join-request-list">
                  {joinRequests.map((request) => (
                    <div key={request.id}>
                      <span className={`member-avatar tone-${request.tone}`}><UserRound className="default-profile-glyph" /></span>
                      <span><strong>{request.name}</strong><small>{request.nickname} · {request.requestedAt}</small></span>
                      <button className="is-approve" type="button" aria-label={`${request.name} 가입 승인`} onClick={() => approveJoinRequest(request)}><Check size={17} /></button>
                      <button className="is-reject" type="button" aria-label={`${request.name} 가입 거절`} onClick={() => rejectJoinRequest(request)}><Ban size={17} /></button>
                    </div>
                  ))}
                  {!joinRequests.length && <p>대기 중인 가입 신청이 없어요.</p>}
                </div>
              )}
            </section>
            <section className="church-admin-setting-card">
              <header><span><ShieldCheck size={19} aria-hidden="true" /></span><div><strong>관리자 위임</strong><small>다른 구성원에게 공동체 전체 관리 권한을 넘깁니다.</small></div></header>
              <button className="church-admin-transfer-entry" type="button" onClick={() => setAdminTransferOpen(true)}>
                <span><strong>새 관리자 선택</strong><small>위임하면 내 관리자 권한은 즉시 해제됩니다.</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </section>
          </div>
        )}
      </div>

      {activeMemberMenuId && <button className="department-member-menu-backdrop" type="button" aria-label="구성원 메뉴 닫기" onClick={() => setActiveMemberMenuId('')} />}

      {createParentId && (
        <DepartmentNameSheet
          parentName={departmentNodes.find(({ id }) => id === createParentId)?.name}
          onClose={() => setCreateParentId('')}
          onConfirm={createDepartment}
        />
      )}
      {assignmentNode && (
        <DepartmentMemberSheet
          node={assignmentNode}
          nodes={departmentNodes}
          members={communityMembers}
          onClose={() => setAssignmentNodeId('')}
          onConfirm={assignMembers}
        />
      )}
      {deleteNode && (
        <ConfirmDialog
          title={`${deleteNode.name} 부서를 삭제할까요?`}
          description={`하위 부서도 함께 삭제되며 소속된 구성원은 ${departmentNodes.find(({ id }) => id === deleteNode.parentId)?.name ?? '상위 부서'}(으)로 자동 이동합니다.`}
          confirmLabel="부서 삭제"
          danger
          onClose={() => setDeleteNode(null)}
          onConfirm={deleteDepartment}
        />
      )}
      {movePickerOpen && (
        <DepartmentDestinationSheet
          nodes={visibleFlattenedNodes.filter(({ id }) => id !== activeDepartmentId)}
          onClose={() => setMovePickerOpen(false)}
          onSelect={(node) => { setMovePickerOpen(false); setMoveDestination(node); }}
        />
      )}
      {moveDestination && (
        <ConfirmDialog
          title={`${moveSelectedIds.length}명을 옮길까요?`}
          description={`선택한 구성원을 ${moveDestination.name}(으)로 이동합니다.`}
          confirmLabel="부서 이동"
          onClose={() => setMoveDestination(null)}
          onConfirm={confirmMemberMove}
        />
      )}
      {positionTarget && activeDepartment && (
        <MemberPositionSheet
          member={positionTarget}
          department={getMemberDepartmentNode(departmentNodes, positionTarget.id) ?? activeDepartment}
          currentRole={memberRoles[positionTarget.id]}
          onClose={() => setPositionTargetId('')}
          onConfirm={(draft) => {
            setPositionTargetId('');
            setPendingPosition({ ...draft, memberId: positionTarget.id, memberName: positionTarget.name });
          }}
        />
      )}
      {pendingPosition && (
        <ConfirmDialog
          title="직위를 변경할까요?"
          description={`${pendingPosition.memberName}님의 직위를 '${pendingPosition.title}'(으)로 변경합니다.${pendingPosition.isDepartmentManager ? ' 공동체 관리의 해당 부서 권한도 함께 부여됩니다.' : ''}`}
          confirmLabel="직위 변경"
          onClose={() => setPendingPosition(null)}
          onConfirm={confirmMemberPosition}
        />
      )}
      {kickTarget && (
        <ConfirmDialog
          title={`${kickTarget.name}님을 강퇴할까요?`}
          description="이 구성원은 현재 공동체와 모든 부서에서 제외됩니다."
          confirmLabel="공동체 강퇴"
          danger
          onClose={() => setKickTargetId('')}
          onConfirm={confirmKickMember}
        />
      )}
      {worshipFormOpen && <WorshipPreparationSheet onClose={() => setWorshipFormOpen(false)} onConfirm={addWorshipPreparation} />}
      {churchVersePickerOpen && (
        <RepresentativeVersePicker
          currentProfile={churchProfileDraft}
          selectedTranslation={selectedTranslation}
          title="공동체 대표 말씀 선택"
          onClose={() => setChurchVersePickerOpen(false)}
          onSelect={(verse) => {
            setChurchProfileDraft((current) => ({ ...current, verseRef: verse.reference, representativeVerse: verse.text }));
            setChurchVersePickerOpen(false);
          }}
        />
      )}
      {adminTransferOpen && (
        <ChurchAdminTransferSheet
          members={communityMembers.filter(({ id }) => id !== selfMemberId)}
          onClose={() => setAdminTransferOpen(false)}
          onConfirm={(member) => {
            setAdminTransferOpen(false);
            setPendingAdminTransfer(member);
          }}
        />
      )}
      {pendingAdminTransfer && (
        <ConfirmDialog
          title={`${pendingAdminTransfer.name}님에게 관리자 권한을 위임할까요?`}
          description="위임하는 즉시 내 공동체 관리자 권한은 해제됩니다. 새 관리자만 공동체 전체 설정과 권한을 관리할 수 있어요."
          confirmLabel="관리자 위임"
          onClose={() => setPendingAdminTransfer(null)}
          onConfirm={confirmAdminTransfer}
        />
      )}
      {adminNotice && <div className="church-admin-notice" role="status">{adminNotice}</div>}
    </section>
  );
}

function ChurchAdminTransferSheet({ members, onClose, onConfirm }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = members.filter((member) => (
    !normalizedQuery
    || [member.name, member.department, member.role].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const selectedMember = members.find(({ id }) => id === selectedId);

  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="관리자 위임 닫기" onClick={() => dismiss()} />
      <section className="church-admin-transfer-sheet" role="dialog" aria-modal="true" aria-labelledby="admin-transfer-title">
        <header><div><h2 id="admin-transfer-title">새 관리자 선택</h2><p>공동체 전체를 관리할 구성원 한 명을 선택하세요.</p></div><button type="button" aria-label="관리자 위임 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <label className="admin-transfer-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 부서 검색" /></label>
        <div className="admin-transfer-member-list" role="radiogroup" aria-label="새 공동체 관리자">
          {filteredMembers.map((member) => (
            <button className={selectedId === member.id ? 'is-selected' : ''} type="button" role="radio" aria-checked={selectedId === member.id} key={member.id} onClick={() => setSelectedId(member.id)}>
              <span className={`member-avatar tone-${member.tone ?? 'violet'}`}><UserRound className="default-profile-glyph" /></span>
              <span><strong>{member.name}</strong><small>{member.department} · {member.role}</small></span>
              <i>{selectedId === member.id && <Check size={15} aria-hidden="true" />}</i>
            </button>
          ))}
          {!filteredMembers.length && <p>일치하는 공동체원이 없어요.</p>}
        </div>
        <footer><button type="button" disabled={!selectedMember} onClick={() => dismiss(() => onConfirm(selectedMember))}>관리자 위임 계속</button></footer>
      </section>
    </div>
  );
}

function DepartmentNameSheet({ parentName, onClose, onConfirm }) {
  const [name, setName] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="부서 생성 닫기" onClick={() => dismiss()} />
      <section className="admin-compact-sheet" role="dialog" aria-modal="true" aria-labelledby="department-name-title">
        <header><div><h2 id="department-name-title">하위 부서 만들기</h2><p>{parentName} 아래에 생성됩니다.</p></div><button type="button" aria-label="부서 생성 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <label><span>부서 이름</span><input autoFocus value={name} maxLength={20} onChange={(event) => setName(event.target.value)} placeholder="예: 대학청년부" /></label>
        <button className="admin-sheet-confirm" type="button" disabled={!name.trim()} onClick={() => dismiss(() => onConfirm(name))}>부서 생성</button>
      </section>
    </div>
  );
}

function DepartmentMemberSheet({ node, nodes, members, onClose, onConfirm }) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const parent = nodes.find(({ id }) => id === node.parentId);
  const allowedIds = new Set(parent
    ? getDepartmentMemberIds(nodes, parent.id)
    : members.map(({ id }) => id));
  const assignedIds = new Set(getDepartmentMemberIds(nodes, node.id));
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = members.filter((member) => (
    allowedIds.has(member.id)
    && !assignedIds.has(member.id)
    && [member.name, member.department, member.role]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const toggleMember = (memberId) => setSelectedIds((current) => current.includes(memberId)
    ? current.filter((id) => id !== memberId)
    : [...current, memberId]);
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="구성원 지정 닫기" onClick={() => dismiss()} />
      <section className="department-member-sheet" role="dialog" aria-modal="true" aria-labelledby="department-member-title">
        <header><div><h2 id="department-member-title">{node.name} 구성원 지정</h2><p>{parent ? `${parent.name} 소속 구성원만 표시됩니다.` : '현재 공동체 구성원만 표시됩니다.'}</p></div><button type="button" aria-label="구성원 지정 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <label className="admin-member-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="공동체 구성원 검색" /></label>
        <div className="admin-member-list">
          {candidates.map((member) => {
            const selected = selectedIds.includes(member.id);
            return <button className={selected ? 'is-selected' : ''} type="button" key={member.id} onClick={() => toggleMember(member.id)}><span className="member-avatar"><UserRound className="default-profile-glyph" /></span><span><strong>{member.name}</strong><small>{member.department ?? '부서 미지정'} · {member.role ?? '구성원'}</small></span><i>{selected && <Check size={15} />}</i></button>;
          })}
          {!candidates.length && <p>추가할 수 있는 구성원이 없어요.</p>}
        </div>
        <footer><span>{selectedIds.length}명 선택</span><button type="button" disabled={!selectedIds.length} onClick={() => dismiss(() => onConfirm(selectedIds))}>지정하기</button></footer>
      </section>
    </div>
  );
}

function DepartmentDestinationSheet({ nodes, onClose, onSelect }) {
  const [selectedId, setSelectedId] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const selectedNode = nodes.find(({ id }) => id === selectedId);
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="부서 선택 닫기" onClick={() => dismiss()} />
      <section className="department-destination-sheet" role="dialog" aria-modal="true" aria-labelledby="department-destination-title">
        <header><div><h2 id="department-destination-title">이동할 부서</h2><p>한 개의 부서만 선택할 수 있어요.</p></div><button type="button" aria-label="부서 선택 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <div className="department-folder-picker" role="radiogroup" aria-label="이동할 부서 선택">
          {nodes.map((node) => (
            <button
              className={selectedId === node.id ? 'is-selected' : ''}
              type="button"
              role="radio"
              aria-checked={selectedId === node.id}
              style={{ '--department-depth': node.depth ?? 0 }}
              key={node.id}
              onClick={() => setSelectedId(node.id)}
            >
              <Folder size={18} fill={selectedId === node.id ? 'currentColor' : 'none'} />
              <span><strong>{node.name}</strong><small>{getDepartmentMemberIds(nodes, node.id).length}명</small></span>
              <i>{selectedId === node.id && <Check size={14} />}</i>
            </button>
          ))}
        </div>
        <button className="admin-sheet-confirm" type="button" disabled={!selectedNode} onClick={() => dismiss(() => onSelect(selectedNode))}>이 부서 선택</button>
      </section>
    </div>
  );
}

function MemberPositionSheet({ member, department, currentRole, onClose, onConfirm }) {
  const defaultTitle = `${department.name} 소속`;
  const [title, setTitle] = useState(currentRole?.title ?? defaultTitle);
  const [isDepartmentManager, setIsDepartmentManager] = useState(currentRole?.managerDepartmentId === department.id);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const toggleManager = () => {
    setIsDepartmentManager((current) => {
      const next = !current;
      if (next) setTitle(`${department.name} 부서 관리자`);
      else if (title === `${department.name} 부서 관리자`) setTitle(defaultTitle);
      return next;
    });
  };
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="직위 설정 닫기" onClick={() => dismiss()} />
      <section className="member-position-sheet" role="dialog" aria-modal="true" aria-labelledby="member-position-title">
        <header><div><h2 id="member-position-title">직위 설정</h2><p>{member.name} · {department.name}</p></div><button type="button" aria-label="직위 설정 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <label><span>표시할 직위</span><input value={title} maxLength={24} onChange={(event) => setTitle(event.target.value)} placeholder={defaultTitle} /></label>
        <button className="member-manager-toggle" type="button" role="switch" aria-checked={isDepartmentManager} onClick={toggleManager}>
          <span><ShieldCheck size={19} /><span><strong>{department.name} 부서 관리자로 임명</strong><small>이 부서와 하위 부서의 구성원을 관리합니다.</small></span></span>
          <i className={isDepartmentManager ? 'is-on' : ''}><b /></i>
        </button>
        <div className="member-manager-scope"><strong>부서 관리자 권한</strong><span>부서 이동 · 직위 설정 · 부서 대상 예배 및 공지 작성</span><small>공동체 설정과 구성원 강퇴에는 접근할 수 없어요.</small></div>
        <button className="admin-sheet-confirm" type="button" disabled={!title.trim()} onClick={() => dismiss(() => onConfirm({ title: title.trim() || defaultTitle, isDepartmentManager, departmentId: department.id }))}>변경 내용 확인</button>
      </section>
    </div>
  );
}

function WorshipPreparationCard({ item, nodes = [], pending = false, onPublish }) {
  const scopeName = nodes.find(({ id }) => id === item.scopeDepartmentId)?.name;
  return (
    <article className="worship-preparation-card">
      <header><span>{pending ? '대기' : '예정'}</span><time>{item.createdAt}{scopeName ? ` · ${scopeName} 공개` : ''}</time></header>
      <h4>{item.title}</h4>
      <dl>
        <div><dt>예배 일자</dt><dd>{item.serviceDate || item.createdAt}</dd></div>
        <div><dt>핵심 말씀</dt><dd>{item.coreVerse}</dd></div>
        {item.supportVerse && <div><dt>보조 말씀</dt><dd>{item.supportVerse}</dd></div>}
        {item.pastor && <div><dt>담당 목회자</dt><dd>{item.pastor}</dd></div>}
        {item.hymn && <div><dt>찬양</dt><dd>{item.hymn}</dd></div>}
      </dl>
      {item.content && <p>{item.content}</p>}
      {pending && <button type="button" onClick={onPublish}>예배 등록</button>}
    </article>
  );
}

function WorshipPreparationSheet({ onClose, onConfirm }) {
  const [draft, setDraft] = useState({ serviceDate: '', coreVerse: '', supportVerse: '', pastor: '', hymn: '', content: '' });
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const ready = draft.serviceDate.trim() && draft.coreVerse.trim();
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="예배 준비 닫기" onClick={() => dismiss()} />
      <section className="worship-preparation-sheet" role="dialog" aria-modal="true" aria-labelledby="worship-preparation-title">
        <header><h2 id="worship-preparation-title">예배 준비 추가</h2><button type="button" aria-label="예배 준비 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <div className="worship-form-fields">
          <label><span>예배 일자</span><input value={draft.serviceDate} onChange={(event) => updateField('serviceDate', event.target.value)} placeholder="예: 9월 6일 오전 11:00" /></label>
          <label><span>핵심 말씀</span><input value={draft.coreVerse} onChange={(event) => updateField('coreVerse', event.target.value)} placeholder="예: 빌립보서 4:4-7" /></label>
          <label><span>보조 말씀</span><input value={draft.supportVerse} onChange={(event) => updateField('supportVerse', event.target.value)} placeholder="선택 사항" /></label>
          <label><span>담당 목회자</span><input value={draft.pastor} onChange={(event) => updateField('pastor', event.target.value)} placeholder="선택 사항" /></label>
          <label><span>찬양</span><input value={draft.hymn} onChange={(event) => updateField('hymn', event.target.value)} placeholder="선택 사항" /></label>
          <label><span>내용</span><textarea value={draft.content} onChange={(event) => updateField('content', event.target.value)} placeholder="선택 사항" /></label>
        </div>
        <button className="admin-sheet-confirm" type="button" disabled={!ready} onClick={() => dismiss(() => onConfirm(draft))}>대기 상태로 저장</button>
      </section>
    </div>
  );
}

function AnnouncementDetail({ announcement, onClose }) {
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  return (
    <div className={`admin-sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="admin-sheet-backdrop" type="button" aria-label="공지사항 닫기" onClick={() => dismiss()} />
      <article className="announcement-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="announcement-detail-title">
        <header><div><h2 id="announcement-detail-title">{announcement.title}</h2><p>{announcement.author} · {announcement.time}</p></div><button type="button" aria-label="공지사항 닫기" onClick={() => dismiss()}><X size={20} /></button></header>
        <p>{announcement.content}</p>
      </article>
    </div>
  );
}

function QtCreationFlow({ conversations, qtRooms, selectedTranslation, onClose, onCreate }) {
  const [step, setStep] = useState('members');
  const [sourceMode, setSourceMode] = useState('recent');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedQtRoomId, setSelectedQtRoomId] = useState('');
  const [previewMember, setPreviewMember] = useState(null);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const profileHoldTimerRef = useRef(null);

  const recentMemberIds = [...new Set(conversations.flatMap(getConversationParticipantIds))];
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = recentMemberIds
    .map((id) => knownMessageMembers.find((member) => member.id === id))
    .filter(Boolean)
    .filter((member) => [member.name, member.department, member.role]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery)));
  const existingQtRooms = qtRooms.filter((room) => [
    room.name,
    room.verse?.reference,
    ...getConversationParticipants(room.participantIds).map(({ name }) => name),
  ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery)));
  const selectedMembers = knownMessageMembers.filter(({ id }) => selectedIds.includes(id));

  const cancelProfileHold = () => {
    window.clearTimeout(profileHoldTimerRef.current);
    profileHoldTimerRef.current = null;
  };

  const startProfileHold = (member) => {
    cancelProfileHold();
    profileHoldTimerRef.current = window.setTimeout(() => {
      setPreviewMember(member);
      profileHoldTimerRef.current = null;
    }, 500);
  };

  useEffect(() => () => cancelProfileHold(), []);

  const toggleMember = (memberId) => {
    setSelectedIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]);
  };

  const changeSourceMode = (nextMode) => {
    setSourceMode(nextMode);
    setSelectedIds([]);
    setSelectedQtRoomId('');
    setQuery('');
  };

  const createRoomWithVerse = (verse) => {
    const message = createQtSystemMessage(verse, selectedTranslation);
    if (sourceMode === 'qt' && selectedQtRoomId) {
      onCreate({ mode: 'continue', roomId: selectedQtRoomId, verse, message });
      return;
    }

    const createdAt = Date.now();
    const sortedMembers = [...selectedMembers].sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));
    const firstName = sortedMembers[0]?.name ?? '새로운';
    const name = sortedMembers.length > 1 ? `${firstName} 외 ${sortedMembers.length - 1}명 QT` : `${firstName}님과의 QT`;
    onCreate({
      mode: 'new',
      room: {
        id: `qt-${createdAt}`,
        type: 'qt',
        name,
        customName: name,
        participantIds: sortedMembers.map(({ id }) => id),
        participantJoinedAt: Object.fromEntries(sortedMembers.map(({ id }) => [id, 0])),
        verse,
        messages: [message],
        lastMessage: message.text,
        time: '방금',
        unread: 0,
        createdAt,
      },
    });
  };

  if (step === 'verse') {
    return (
      <RepresentativeVersePicker
        title="QT 말씀 선택"
        currentProfile={{ verseRef: '빌립보서 4:13' }}
        selectedTranslation={selectedTranslation}
        onClose={() => setStep('members')}
        onSelect={createRoomWithVerse}
      />
    );
  }

  return (
    <div className={`qt-creation-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="qt-creation-backdrop" type="button" aria-label="QT 만들기 닫기" onClick={() => dismiss()} />
      <section className="qt-creation-sheet" role="dialog" aria-modal="true" aria-labelledby="qt-creation-title">
        <header><div><h2 id="qt-creation-title">{sourceMode === 'qt' ? '이어서 진행할 QT방을 골라주세요' : '함께 QT할 친구를 골라주세요'}</h2><p>{sourceMode === 'qt' ? '기존 대화에 새로운 QT 말씀이 이어져요' : '선택한 친구와 새 QT방을 시작해요'}</p></div><button type="button" aria-label="QT 만들기 닫기" onClick={() => dismiss()}><X size={21} /></button></header>
        <div className="qt-source-switch" role="tablist" aria-label="QT 친구 선택 기준">
          <button className={sourceMode === 'recent' ? 'is-active' : ''} type="button" role="tab" aria-selected={sourceMode === 'recent'} onClick={() => changeSourceMode('recent')}>최근 대화</button>
          <button className={sourceMode === 'qt' ? 'is-active' : ''} type="button" role="tab" aria-selected={sourceMode === 'qt'} onClick={() => changeSourceMode('qt')}>최근 QT</button>
        </div>
        {sourceMode === 'recent' && selectedMembers.length > 0 && (
          <div className="qt-selected-members" aria-label={`선택한 친구 ${selectedMembers.length}명`}>
            {selectedMembers.map((member) => (
              <article key={member.id} onPointerDown={() => startProfileHold(member)} onPointerUp={cancelProfileHold} onPointerCancel={cancelProfileHold} onPointerLeave={cancelProfileHold} onContextMenu={(event) => event.preventDefault()}>
                <span className={`directory-avatar tone-${member.tone ?? 'violet'}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <strong>{member.name}</strong>
                <button type="button" aria-label={`${member.name} 선택 취소`} onPointerDown={(event) => event.stopPropagation()} onClick={() => toggleMember(member.id)}><X size={11} strokeWidth={3} /></button>
              </article>
            ))}
          </div>
        )}
        <label className="qt-member-search"><Search size={18} aria-hidden="true" /><input aria-label={sourceMode === 'qt' ? 'QT방 검색' : 'QT 친구 검색'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={sourceMode === 'qt' ? 'QT방 또는 말씀 검색' : '이름 또는 부서 검색'} />{query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={16} /></button>}</label>
        <div className="qt-member-list">
          {sourceMode === 'recent' && candidates.map((member) => {
            const selected = selectedIds.includes(member.id);
            return <button className={selected ? 'is-selected' : ''} type="button" aria-pressed={selected} key={member.id} onClick={() => toggleMember(member.id)}><span className={`directory-avatar tone-${member.tone ?? 'violet'}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span><span><strong>{member.name}</strong><small>{member.department} · {member.role}</small></span><i aria-hidden="true">{selected && <Check size={16} />}</i></button>;
          })}
          {sourceMode === 'qt' && existingQtRooms.map((room) => {
            const selected = selectedQtRoomId === room.id;
            const participants = getConversationParticipants(room.participantIds);
            return <button className={`qt-existing-room ${selected ? 'is-selected' : ''}`} type="button" aria-pressed={selected} key={room.id} onClick={() => setSelectedQtRoomId(room.id)}><span className="directory-avatar tone-violet" aria-hidden="true"><BookOpen className="default-profile-glyph" /></span><span><strong>{room.name}</strong><small>{participants.map(({ name }) => name).join(', ')} · {room.verse?.reference}</small></span><i aria-hidden="true">{selected && <Check size={16} />}</i></button>;
          })}
          {sourceMode === 'recent' && !candidates.length && <p>최근 대화한 친구가 없어요.</p>}
          {sourceMode === 'qt' && !existingQtRooms.length && <p>이어서 진행할 QT방이 없어요.</p>}
        </div>
        <footer><span>{sourceMode === 'qt' ? (selectedQtRoomId ? 'QT방 선택됨' : 'QT방을 선택해 주세요') : `${selectedMembers.length}명 선택`}</span><button type="button" disabled={sourceMode === 'qt' ? !selectedQtRoomId : !selectedMembers.length} onClick={() => setStep('verse')}>말씀 선택</button></footer>
      </section>
      {previewMember && <MemberProfileSheet member={previewMember} selectedTranslation={selectedTranslation} onClose={() => setPreviewMember(null)} />}
    </div>
  );
}

function PopularBibleTop({ rankings, onOpenBibleVerse }) {
  const [period, setPeriod] = useState('today');
  const activeRanking = rankings[period];
  return (
    <section className="popular-bible-card" aria-label="인기 성경 TOP 5">
      <header>
        <div><strong>인기 성경 TOP 5</strong></div>
        <div className="popular-bible-period" role="tablist" aria-label="인기 말씀 집계 기간">
          {Object.entries(rankings).map(([id, item]) => (
            <button className={period === id ? 'is-active' : ''} type="button" role="tab" aria-selected={period === id} key={id} onClick={() => setPeriod(id)}>{item.label}</button>
          ))}
        </div>
      </header>
      <div className="popular-bible-list">
        {activeRanking.items.map((item, index) => (
          <button type="button" key={item.chapterKey} onClick={() => onOpenBibleVerse({ ...item, verse: 1, translationId: 'KRV' })}>
            <b>{index + 1}</b><span><strong>{item.reference}</strong><small>{item.count.toLocaleString('ko-KR')}회 열람</small></span><ChevronRight size={17} />
          </button>
        ))}
        {!activeRanking.items.length && <p>아직 집계된 장 열람 기록이 없어요.</p>}
      </div>
    </section>
  );
}

function HomeRecommendations({ query, setQuery, selectBiblePassage, onOpenBibleVerse, selectedTranslation, isPlus, onRequestPlus }) {
  const [recommendations, setRecommendations] = useState([]);
  const [searching, setSearching] = useState(false);
  const normalizedQuery = query.trim();
  const todayWeekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date());

  useEffect(() => {
    if (!normalizedQuery) {
      setRecommendations([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const timerId = window.setTimeout(() => {
      searchOpenBibleTopicPassages(normalizedQuery, selectedTranslation, 3)
        .then((results) => {
          if (active) setRecommendations(results);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [normalizedQuery, selectedTranslation]);

  return (
    <>
      <section className="roadmap-spotlight">
        <div className="roadmap-spotlight-head"><span className="eyebrow light">오늘의 로드맵</span><span>{todayWeekday}</span></div>
        <h2>마음이 지칠 때 읽는 말씀</h2>
        <p>오늘은 시편 23편을 천천히 읽어요.</p>
        <button className="light-button" type="button" onClick={() => onOpenBibleVerse({ reference: '시편 23:1', translationId: selectedTranslation })}>
          오늘의 말씀 읽기<ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      <Section title="이번 주 로드맵">
        <div className="roadmap-list">{roadmap.map((item) => <RoadmapRow item={item} key={item.day} />)}</div>
      </Section>

      <Section title="마음에 맞는 말씀 찾기">
        <label className="search-box">
          <Search size={19} aria-hidden="true" />
          <input aria-label="말씀 추천 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지금 마음을 키워드로 적어보세요" />
        </label>
        {normalizedQuery && (
          <div className="home-recommendation-results" aria-live="polite">
            <div className="home-recommendation-group-title"><BookOpen size={16} /><strong>말씀</strong></div>
            {searching ? <p className="home-recommendation-status">주제와 연결된 말씀을 찾고 있어요.</p> : recommendations.length ? (
              <ListSurface>
                {recommendations.map((passage) => (
                  <ListRow
                    key={passage.id}
                    icon={BookOpen}
                    title={passage.reference}
                    description={`${passage.topics.slice(0, 3).join(', ')} · ${passage.text}`}
                    action="읽기"
                    onClick={() => onOpenBibleVerse({ ...passage, translationId: selectedTranslation })}
                  />
                ))}
              </ListSurface>
            ) : <p className="home-recommendation-status">검색 가능한 결과가 없습니다.</p>}
            <div className="home-recommendation-group-title"><SixteenthNoteIcon size={16} /><strong>찬양</strong></div>
            <p className="home-recommendation-status">찬양 추천은 준비중입니다.</p>
          </div>
        )}
      </Section>

      <button className="premium-strip" type="button" onClick={() => onRequestPlus('overview')}>
        <div><span>바이블온 플러스</span><strong>개인화 말씀 분석과 맞춤 로드맵</strong></div>
        <span>{isPlus ? '사용 중' : '월 1,500원'}</span>
      </button>
    </>
  );
}

function MessageView({ conversations, setConversations, qtRooms, setQtRooms, friendsMenuOpen, onCloseFriendsMenu, onOpenBibleVerse, onForwardMessage, currentChurchId, navigationTarget, onNavigationHandled, members = knownMessageMembers, personalProfile, currentUserId, currentCommunity, churchAccess, serverChurchWorkspace, selectedTranslation, serverBacked = false, onReloadMessages }) {
  const [directoryMode, setDirectoryMode] = useState('recent');
  const [openConversationId, setOpenConversationId] = useState('');
  const [openQtRoomId, setOpenQtRoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);
  const [groupBuilderOpen, setGroupBuilderOpen] = useState(false);
  const [draftConversation, setDraftConversation] = useState(null);
  const [friendIds, setFriendIds] = useState(() => [...new Set([
    ...readStoredValue('bibleon.friendIds', ['minseo', 'jaeyun', 'eunji']),
    'jian-external',
  ])]);
  const [blockedFriendIds, setBlockedFriendIds] = useState(() => readStoredValue('bibleon.blockedFriendIds', []));
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState(() => readStoredValue('bibleon.sentFriendRequestIds', []));
  const storedOpenConversation = conversations.find(({ id }) => id === openConversationId);
  const openConversation = storedOpenConversation
    ?? (draftConversation?.id === openConversationId ? draftConversation : null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasCurrentServerWorkspace = isCurrentCommunityWorkspace(
    currentChurchId,
    serverChurchWorkspace?.church?.id
  );
  const signedMember = hasCurrentServerWorkspace
    ? serverChurchWorkspace.members.find(({ userId, id }) => (userId ?? id) === currentUserId)
    : null;
  const signedDepartment = hasCurrentServerWorkspace
    ? serverChurchWorkspace.departments.find(({ id }) => id === signedMember?.departmentId)
    : null;
  const selfProfileMember = {
    id: currentUserId || 'bibleon-self-profile',
    name: personalProfile?.name || '나',
    nickname: personalProfile?.nickname || '',
    avatarImage: personalProfile?.avatarImage || '',
    verseRef: personalProfile?.verseRef || '',
    representativeVerse: personalProfile?.representativeVerse || '',
    featuredAchievementName: personalProfile?.featuredAchievementName || '',
    churchId: currentChurchId || '',
    churchName: currentCommunity?.name || '개인 프로필',
    department: currentCommunity ? (signedDepartment?.name || '부서 미지정') : '소속 공동체 없음',
    role: signedMember?.title || (currentCommunity ? (churchAccess?.authority || '구성원') : '나'),
    tone: 'violet',
    isSelf: true,
  };
  const filteredConversations = conversations.filter((conversation) => (
    [
      conversation.name,
      conversation.department,
      conversation.role,
      conversation.lastMessage,
      ...getConversationParticipants(getConversationParticipantIds(conversation), members).map(({ name }) => name),
      ...conversation.messages.map(({ text }) => text),
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const getConversationPreview = (conversation) => {
    if (!normalizedQuery) return conversation.lastMessage;
    const matchingMessage = [...conversation.messages]
      .reverse()
      .find(({ text }) => text.toLowerCase().includes(normalizedQuery));
    return matchingMessage?.text ?? conversation.lastMessage;
  };
  const recentConversationIds = new Set(conversations.flatMap(getConversationParticipantIds));
  const filteredDirectoryMembers = members.filter((member) => (
    member.id !== currentUserId
    && member.id !== selfProfileMember.id
    && friendIds.includes(member.id)
    && !recentConversationIds.has(member.id)
    && [member.name, member.department, member.role, member.churchName]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const filteredQtRooms = qtRooms.filter((room) => (
    [
      room.name,
      room.verse?.reference,
      room.verse?.text,
      ...getConversationParticipants(room.participantIds, members).map(({ name }) => name),
      ...room.messages.map(({ text }) => text),
    ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const openQtRoom = qtRooms.find(({ id }) => id === openQtRoomId);

  useEffect(() => writeStoredValue('bibleon.friendIds', friendIds), [friendIds]);
  useEffect(() => writeStoredValue('bibleon.blockedFriendIds', blockedFriendIds), [blockedFriendIds]);
  useEffect(() => writeStoredValue('bibleon.sentFriendRequestIds', sentFriendRequestIds), [sentFriendRequestIds]);
  useEffect(() => {
    if (serverBacked) setFriendIds(members.map(({ id }) => id));
  }, [members, serverBacked]);

  const selectConversation = (conversationId) => {
    setDraftConversation(null);
    setOpenQtRoomId('');
    setOpenConversationId(conversationId);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
    )));
    if (serverBacked) {
      const target = conversations.find(({ id }) => id === conversationId);
      const sequence = Math.max(0, ...(target?.messages ?? []).map(({ sequence }) => Number(sequence ?? 0)));
      messageRepository.markRead(conversationId, sequence).then(onReloadMessages).catch(() => {});
    }
  };

  useEffect(() => {
    if (!navigationTarget) return;
    if (navigationTarget.kind === 'conversation' && conversations.some(({ id }) => id === navigationTarget.id)) {
      setDirectoryMode('recent');
      selectConversation(navigationTarget.id);
    } else if (navigationTarget.kind === 'qt' && qtRooms.some(({ id }) => id === navigationTarget.id)) {
      setDirectoryMode('qt');
      setDraftConversation(null);
      setOpenConversationId('');
      setOpenQtRoomId(navigationTarget.id);
      setQtRooms((current) => current.map((room) => room.id === navigationTarget.id ? { ...room, unread: 0 } : room));
    }
    onNavigationHandled?.();
  }, [navigationTarget?.requestedAt]);

  const openDraftConversation = (members, customName = '') => {
    const participantIds = members
      .map(({ id }) => id)
      .sort((firstId, secondId) => {
        const first = members.find(({ id }) => id === firstId);
        const second = members.find(({ id }) => id === secondId);
        return (first?.name ?? '').localeCompare(second?.name ?? '', 'ko-KR');
      });
    const conversation = {
      id: `draft-${Date.now()}-${participantIds.join('-')}`,
      ...getConversationDetails(participantIds, customName, members),
      online: false,
      unread: 0,
      time: '',
      lastMessage: '',
      participantIds,
      participantJoinedAt: Object.fromEntries(participantIds.map((id) => [id, 0])),
      messages: [],
      isDraft: true,
    };
    setDraftConversation(conversation);
    setOpenConversationId(conversation.id);
  };

  const startMemberConversation = (member) => {
    const existingConversation = conversations.find((conversation) => {
      const participantIds = getConversationParticipantIds(conversation);
      return participantIds.length === 1 && participantIds[0] === member.id;
    });
    setSelectedMemberProfile(null);
    if (existingConversation) selectConversation(existingConversation.id);
    else openDraftConversation([member]);
  };

  const startGroupConversation = (members, customName) => {
    setGroupBuilderOpen(false);
    openDraftConversation(members, customName);
  };

  const createGroupFromConversation = (currentParticipantIds, invitedMembers, customName) => {
    const currentParticipants = getConversationParticipants(currentParticipantIds, members);
    setDraftConversation(null);
    openDraftConversation([...currentParticipants, ...invitedMembers], customName);
  };

  const closeConversation = () => {
    setOpenConversationId('');
    setDraftConversation(null);
  };

  const persistDraftConversation = async (conversation) => {
    if (serverBacked) {
      const lastMessage = conversation.messages.at(-1);
      try {
        const remoteId = await messageRepository.create({
          kind: conversation.participantIds.length > 1 ? 'group' : 'direct',
          name: conversation.customName || null,
          churchId: conversation.participantIds.every((id) => members.find((member) => member.id === id)?.churchId === currentChurchId)
            ? (currentChurchId || null)
            : null,
          memberIds: conversation.participantIds,
        });
        if (lastMessage?.text) {
          await messageRepository.send(remoteId, {
            body: lastMessage.text,
            payload: lastMessage.replyTo ? { replyTo: lastMessage.replyTo } : {},
          });
        }
        setDraftConversation(null);
        setOpenConversationId(remoteId);
        await onReloadMessages?.();
      } catch {
        setDraftConversation(conversation);
      }
      return;
    }
    const { isDraft, ...persistedConversation } = conversation;
    setConversations((current) => [persistedConversation, ...current]);
    setDraftConversation(null);
    setOpenConversationId(persistedConversation.id);
  };

  const createGroupFromQtRoom = (currentParticipantIds, invitedMembers, customName) => {
    if (!openQtRoom) return;
    const createdAt = Date.now();
    const participantIds = [...new Set([
      ...currentParticipantIds,
      ...invitedMembers.map(({ id }) => id),
    ])];
    const translationId = openQtRoom.messages
      .findLast?.(({ type }) => type === 'qt-passage')?.verse?.translationId ?? 'KRV';
    const systemMessage = createQtSystemMessage(openQtRoom.verse, translationId);
    const room = {
      id: `qt-${createdAt}`,
      type: 'qt',
      name: customName,
      customName,
      participantIds,
      participantJoinedAt: Object.fromEntries(participantIds.map((id) => [id, 0])),
      verse: openQtRoom.verse,
      messages: [systemMessage],
      lastMessage: systemMessage.text,
      time: '방금',
      unread: 0,
      createdAt,
    };
    setQtRooms((current) => [room, ...current]);
    setOpenQtRoomId(room.id);
  };

  return (
    <div className="message-layout">
      <section className="message-directory" aria-label="공동체 메시지">
        <div className="message-directory-toolbar">
          <div className="message-view-switch" role="tablist" aria-label="메시지 목록 구분">
            <button
              className={directoryMode === 'members' ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={directoryMode === 'members'}
              onClick={() => setDirectoryMode('members')}
            >
              친구
            </button>
            <button
              className={directoryMode === 'recent' ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={directoryMode === 'recent'}
              onClick={() => setDirectoryMode('recent')}
            >
              최근 대화
            </button>
            <button
              className={directoryMode === 'qt' ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={directoryMode === 'qt'}
              onClick={() => setDirectoryMode('qt')}
            >
              QT
            </button>
          </div>
          <button
            className="message-group-create-icon"
            type="button"
            aria-label="단체 채팅 만들기"
            title="단체 채팅 만들기"
            onClick={() => setGroupBuilderOpen(true)}
          >
            <span aria-hidden="true">
              <Users size={22} />
              <Plus className="message-group-plus" size={12} strokeWidth={3} />
            </span>
          </button>
        </div>
        <label className="message-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label={directoryMode === 'recent' ? '최근 대화 검색' : directoryMode === 'qt' ? 'QT 검색' : '친구 검색'}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={directoryMode === 'recent' ? '최근 대화 검색' : directoryMode === 'qt' ? 'QT 검색' : '친구 검색'}
          />
          {searchQuery && (
            <button type="button" aria-label="검색어 지우기" onClick={() => setSearchQuery('')}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        {directoryMode === 'recent' ? (
          <div className="conversation-list">
            {filteredConversations.map((conversation) => (
              <button
                className="conversation-row"
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="member-avatar" aria-hidden="true">
                  {getConversationParticipantIds(conversation).length > 1
                    ? <Users className="default-profile-glyph" />
                    : <UserRound className="default-profile-glyph" />}
                </span>
                <span className="conversation-copy">
                  <span><strong>{conversation.name}</strong><small>{conversation.department} · {conversation.role}</small></span>
                  <p><HighlightedMessage text={getConversationPreview(conversation)} query={normalizedQuery} /></p>
                </span>
                <span className="conversation-meta">
                  <time>{conversation.time}</time>
                  {conversation.unread > 0 && <b aria-label={`읽지 않은 메시지 ${conversation.unread}개`}>{conversation.unread}</b>}
                </span>
              </button>
            ))}
            {filteredConversations.length === 0 && (
              <p className="message-empty">{normalizedQuery ? '일치하는 최근 대화가 없어요.' : '최근 대화가 없어요.'}</p>
            )}
          </div>
        ) : directoryMode === 'members' ? (
          <div className="member-directory-list">
            <button
              className="member-directory-row message-self-profile-row"
              type="button"
              onClick={() => setSelectedMemberProfile(selfProfileMember)}
            >
              <PersonalAvatar profile={personalProfile ?? defaultPersonalProfile} className="directory-avatar message-self-avatar" />
              <span className="member-directory-copy">
                <span><strong>{selfProfileMember.name}</strong><small>내 프로필{selfProfileMember.nickname ? ` · @${selfProfileMember.nickname}` : ''}</small></span>
                <p><BookOpen size={13} aria-hidden="true" /><span>{selfProfileMember.verseRef || '대표 말씀'}</span><RepresentativeVerseText reference={selfProfileMember.verseRef} fallbackText={selfProfileMember.representativeVerse} translationId={selectedTranslation} /></p>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            {filteredDirectoryMembers.map((member) => (
              <button
                className="member-directory-row"
                type="button"
                key={member.id}
                onClick={() => setSelectedMemberProfile(member)}
              >
                <span className={`directory-avatar tone-${member.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <span className="member-directory-copy">
                  <span><strong>{member.name}</strong><small>{member.churchId && member.churchId !== currentChurchId ? member.churchName : `${member.department} · ${member.role}`}</small></span>
                  <p><BookOpen size={13} aria-hidden="true" /><span>{member.verseRef}</span><RepresentativeVerseText reference={member.verseRef} fallbackText={member.representativeVerse} translationId={selectedTranslation} /></p>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
            {filteredDirectoryMembers.length === 0 && (
              <p className="message-empty">{normalizedQuery ? '검색 결과가 없어요.' : '등록된 친구가 없어요.'}</p>
            )}
          </div>
        ) : (
          <div className="qt-room-list">
            {filteredQtRooms.map((room) => {
              const participants = getConversationParticipants(room.participantIds, members);
              const lastMessage = room.messages.at(-1)?.text ?? '아직 나눔이 없어요.';
              return (
                <button type="button" key={room.id} onClick={() => {
                  setOpenQtRoomId(room.id);
                  setQtRooms((current) => current.map((item) => item.id === room.id ? { ...item, unread: 0 } : item));
                }}>
                  <span className="member-avatar" aria-hidden="true"><BookOpen className="default-profile-glyph" /></span>
                  <span className="qt-room-list-copy"><span><strong>{room.name}</strong><small>{participants.map(({ name }) => name).join(', ')}</small></span><p>{lastMessage}</p><cite>{room.verse.reference}</cite></span>
                  <span className="conversation-meta"><time>{room.time}</time>{room.unread > 0 && <b>{room.unread}</b>}</span>
                </button>
              );
            })}
            {!filteredQtRooms.length && <p className="message-empty">{normalizedQuery ? '일치하는 QT가 없어요.' : '함께한 QT가 없어요.'}</p>}
          </div>
        )}
      </section>

      {selectedMemberProfile && (
        <MemberProfileSheet
          member={selectedMemberProfile}
          currentChurchId={currentChurchId}
          selectedTranslation={selectedTranslation}
          onClose={() => setSelectedMemberProfile(null)}
          onMessage={selectedMemberProfile.isSelf ? undefined : () => startMemberConversation(selectedMemberProfile)}
        />
      )}

      {groupBuilderOpen && (
        <MemberSelectionSheet
          title="단체 채팅 만들기"
          description="함께 대화할 친구를 선택하세요"
          candidates={members}
          selectedTranslation={selectedTranslation}
          minimumSelection={2}
          roomNameEnabled
          confirmLabel={(count) => `${count}명과 대화 시작`}
          onClose={() => setGroupBuilderOpen(false)}
          onConfirm={startGroupConversation}
        />
      )}

      {openConversation && (
        <MessageRoom
          conversation={openConversation}
          setConversations={setConversations}
          onBack={closeConversation}
          onPersistDraft={persistDraftConversation}
          onUpdateDraft={setDraftConversation}
          onCreateGroup={createGroupFromConversation}
          onOpenBibleVerse={onOpenBibleVerse}
          forwardConversations={conversations}
          forwardQtRooms={qtRooms}
          onForwardMessage={onForwardMessage}
          members={members}
          currentChurchId={currentChurchId}
          selectedTranslation={selectedTranslation}
          serverBacked={serverBacked}
          onReloadMessages={onReloadMessages}
        />
      )}

      {openQtRoom && (
        <MessageRoom
          conversation={openQtRoom}
          setConversations={setQtRooms}
          onBack={() => setOpenQtRoomId('')}
          onCreateGroup={createGroupFromQtRoom}
          onOpenBibleVerse={onOpenBibleVerse}
          forwardConversations={conversations}
          forwardQtRooms={qtRooms}
          onForwardMessage={onForwardMessage}
          members={members}
          currentChurchId={currentChurchId}
          selectedTranslation={selectedTranslation}
          serverBacked={serverBacked}
          onReloadMessages={onReloadMessages}
        />
      )}

      <MessageFriendsPanel
        isOpen={friendsMenuOpen}
        onClose={onCloseFriendsMenu}
        friendIds={friendIds}
        setFriendIds={setFriendIds}
        blockedFriendIds={blockedFriendIds}
        setBlockedFriendIds={setBlockedFriendIds}
        sentFriendRequestIds={sentFriendRequestIds}
        setSentFriendRequestIds={setSentFriendRequestIds}
        members={members}
        selectedTranslation={selectedTranslation}
        serverBacked={serverBacked}
        onReload={onReloadMessages}
      />
    </div>
  );
}

function MessageFriendsPanel({
  isOpen,
  onClose,
  friendIds,
  setFriendIds,
  blockedFriendIds,
  setBlockedFriendIds,
  sentFriendRequestIds,
  setSentFriendRequestIds,
  members = knownMessageMembers,
  selectedTranslation,
  serverBacked = false,
  onReload,
}) {
  const [mode, setMode] = useState('root');
  const [friendAddOpen, setFriendAddOpen] = useState(false);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const friendMembers = members.filter(({ id }) => friendIds.includes(id));
  const blockedMembers = members.filter(({ id }) => blockedFriendIds.includes(id));

  useEffect(() => {
    if (!isOpen) {
      setMode('root');
      setFriendAddOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const removeFriend = (memberId) => {
    setFriendIds((current) => current.filter((id) => id !== memberId));
    if (serverBacked) friendRepository.removeWithUser(memberId).then(onReload).catch(() => {});
  };

  const blockFriend = (memberId) => {
    removeFriend(memberId);
    setBlockedFriendIds((current) => [...new Set([...current, memberId])]);
    if (serverBacked) friendRepository.block(memberId).then(onReload).catch(() => {});
  };

  const unblockFriend = (memberId) => {
    setBlockedFriendIds((current) => current.filter((id) => id !== memberId));
    if (serverBacked) friendRepository.unblock(memberId).then(onReload).catch(() => {});
  };

  const panelTitle = mode === 'delete' ? '친구 삭제' : mode === 'blocked' ? '차단 관리' : '친구 관리';

  return (
    <div className={`message-friends-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="message-friends-backdrop" type="button" aria-label="친구 관리 닫기" onClick={() => dismiss()} />
      <aside className="message-friends-panel" aria-label={panelTitle}>
        <header>
          {mode !== 'root' && (
            <button type="button" aria-label="친구 관리 메뉴로 돌아가기" onClick={() => setMode('root')}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          )}
          <h2>{panelTitle}</h2>
          <button type="button" aria-label="친구 관리 닫기" onClick={() => dismiss()}><X size={21} aria-hidden="true" /></button>
        </header>

        {mode === 'root' && (
          <div className="message-friend-options">
            <button type="button" onClick={() => setFriendAddOpen(true)}>
              <span><UserPlus size={21} aria-hidden="true" /></span>
              <div><strong>친구 추가</strong><small>고유 닉네임으로 친구를 찾아요</small></div>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setMode('delete')}>
              <span><UserMinus size={21} aria-hidden="true" /></span>
              <div><strong>친구 삭제</strong><small>친구 {friendMembers.length}명을 관리해요</small></div>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setMode('blocked')}>
              <span><ShieldCheck size={21} aria-hidden="true" /></span>
              <div><strong>차단 관리</strong><small>차단한 사용자 {blockedMembers.length}명</small></div>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {mode === 'delete' && (
          <div className="message-friend-list">
            {friendMembers.map((member) => (
              <article key={member.id}>
                <span className={`directory-avatar tone-${member.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <div><strong>{member.name}</strong><small>@{member.nickname}</small></div>
                <span className="message-friend-row-actions">
                  <button type="button" aria-label={`${member.name} 친구 삭제`} title="친구 삭제" onClick={() => removeFriend(member.id)}><UserMinus size={17} /></button>
                  <button type="button" aria-label={`${member.name} 차단`} title="차단" onClick={() => blockFriend(member.id)}><Ban size={17} /></button>
                </span>
              </article>
            ))}
            {!friendMembers.length && <p>관리할 친구가 없어요.</p>}
          </div>
        )}

        {mode === 'blocked' && (
          <div className="message-friend-list">
            {blockedMembers.map((member) => (
              <article key={member.id}>
                <span className={`directory-avatar tone-${member.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <div><strong>{member.name}</strong><small>@{member.nickname}</small></div>
                <button className="message-unblock-button" type="button" onClick={() => unblockFriend(member.id)}>차단 해제</button>
              </article>
            ))}
            {!blockedMembers.length && <p>차단한 사용자가 없어요.</p>}
          </div>
        )}
      </aside>

      {friendAddOpen && (
        <FriendAddSheet
          friendIds={friendIds}
          blockedFriendIds={blockedFriendIds}
          sentFriendRequestIds={sentFriendRequestIds}
          setSentFriendRequestIds={setSentFriendRequestIds}
          onClose={() => setFriendAddOpen(false)}
          members={members}
          selectedTranslation={selectedTranslation}
          serverBacked={serverBacked}
          onReload={onReload}
        />
      )}
    </div>
  );
}

function FriendAddSheet({ friendIds, blockedFriendIds, sentFriendRequestIds, setSentFriendRequestIds, onClose, members = knownMessageMembers, selectedTranslation, serverBacked = false, onReload }) {
  const [nickname, setNickname] = useState('');
  const [matchedMember, setMatchedMember] = useState(null);
  const [searchMessage, setSearchMessage] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const normalizedNickname = nickname.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');

  const findFriend = async (event) => {
    event.preventDefault();
    let match = members.find((member) => (
      member.nickname?.normalize('NFKC').toLocaleLowerCase('ko-KR') === normalizedNickname
    ));
    if (serverBacked) {
      try {
        const profile = await friendRepository.findByNickname(nickname);
        match = profile ? {
          id: profile.user_id, name: profile.display_name, nickname: profile.nickname,
          avatarPath: profile.avatar_path ?? '', verseRef: profile.representative_verse_ref ?? '',
          representativeVerse: profile.representative_verse_text ?? '', churchName: profile.church_name ?? '',
          churchId: null, department: '', role: '친구', tone: 'violet',
        } : null;
      } catch {
        match = null;
      }
    }
    setMatchedMember(match ?? null);
    setSearchMessage(match ? '' : '일치하는 닉네임을 찾지 못했어요.');
  };

  const requestFriend = async () => {
    if (!matchedMember) return;
    setSentFriendRequestIds((current) => [...new Set([...current, matchedMember.id])]);
    if (serverBacked) {
      try {
        await friendRepository.request(matchedMember.id);
        await onReload?.();
      } catch {
        setSentFriendRequestIds((current) => current.filter((id) => id !== matchedMember.id));
      }
    }
  };

  const isFriend = matchedMember && friendIds.includes(matchedMember.id);
  const isBlocked = matchedMember && blockedFriendIds.includes(matchedMember.id);
  const requestSent = matchedMember && sentFriendRequestIds.includes(matchedMember.id);
  const activeChurchId = readStoredValue(CURRENT_CHURCH_STORAGE_KEY, 'grace-spring');
  const isDifferentChurch = matchedMember?.churchId && matchedMember.churchId !== activeChurchId;

  return (
    <div className={`friend-add-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="friend-add-backdrop" type="button" aria-label="친구 추가 닫기" onClick={() => dismiss()} />
      <section className="friend-add-sheet" role="dialog" aria-modal="true" aria-labelledby="friend-add-title">
        <header><div><h2 id="friend-add-title">친구 추가</h2><p>닉네임은 띄어쓰기 없이 정확히 입력해 주세요</p></div><button type="button" aria-label="친구 추가 닫기" onClick={() => dismiss()}><X size={21} /></button></header>
        <form className="friend-nickname-search" onSubmit={findFriend}>
          <label><Search size={18} aria-hidden="true" /><input autoFocus aria-label="친구 닉네임" value={nickname} onChange={(event) => { setNickname(event.target.value); setMatchedMember(null); setSearchMessage(''); }} placeholder="친구의 닉네임" /></label>
          <button type="submit" disabled={!normalizedNickname}>찾기</button>
        </form>

        {searchMessage && <p className="friend-search-message" role="status">{searchMessage}</p>}
        {matchedMember && (
          <article className="friend-search-result">
            <span className={`directory-avatar tone-${matchedMember.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
            <div className="friend-result-heading"><strong>{matchedMember.name}</strong><span>@{matchedMember.nickname}</span><small>{isDifferentChurch ? matchedMember.churchName : `${matchedMember.department} · ${matchedMember.role}`}</small></div>
            <blockquote><BookOpen size={16} aria-hidden="true" /><p><RepresentativeVerseText reference={matchedMember.verseRef} fallbackText={matchedMember.representativeVerse} translationId={selectedTranslation} /></p><cite>{matchedMember.verseRef}</cite></blockquote>
            <button type="button" disabled={isFriend || isBlocked || requestSent} onClick={requestFriend}>
              {isBlocked ? '차단 해제 후 신청 가능' : isFriend ? '이미 친구예요' : requestSent ? '친구 신청을 보냈어요' : '친구 신청'}
            </button>
          </article>
        )}
      </section>
    </div>
  );
}

function MemberProfileSheet({ member, onClose, onMessage, currentChurchId, selectedTranslation }) {
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const activeChurchId = currentChurchId ?? readStoredValue(CURRENT_CHURCH_STORAGE_KEY, 'grace-spring');
  const memberChurchId = member.churchId ?? 'grace-spring';
  const isDifferentChurch = Boolean(memberChurchId && memberChurchId !== activeChurchId);
  const memberChurchName = member.churchName ?? churchInfo.name;

  return (
    <div className={`member-profile-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="member-profile-backdrop" type="button" aria-label="프로필 닫기" onClick={() => dismiss()} />
      <section className="member-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="member-profile-name">
        <button className="member-profile-close" type="button" aria-label="프로필 닫기" onClick={() => dismiss()}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className={`member-profile-avatar tone-${member.tone}`} aria-hidden="true">{member.avatarImage ? <img src={member.avatarImage} alt="" /> : <UserRound className="default-profile-glyph" />}</div>
        <div className="member-profile-heading">
          <span>{memberChurchName}</span>
          <h2 id="member-profile-name">{member.name}</h2>
          {member.featuredAchievementName && <b><Award size={12} aria-hidden="true" />{member.featuredAchievementName}</b>}
        </div>
        <blockquote className="member-profile-verse">
          <BookOpen size={19} aria-hidden="true" />
          <p><RepresentativeVerseText reference={member.verseRef} fallbackText={member.representativeVerse} translationId={selectedTranslation} /></p>
          <cite>{member.verseRef}</cite>
        </blockquote>
        <dl className="member-profile-meta">
          {isDifferentChurch
            ? <div className="is-church-only"><dt>공동체</dt><dd>{memberChurchName}</dd></div>
            : <><div><dt>부서</dt><dd>{member.department || '부서 미지정'}</dd></div><div><dt>직책</dt><dd>{member.role || '구성원'}</dd></div></>}
        </dl>
        {onMessage && (
          <button className="member-profile-message" type="button" onClick={() => dismiss(onMessage)}>
            <MessageCircle size={19} aria-hidden="true" />메시지 보내기
          </button>
        )}
      </section>
    </div>
  );
}

function MemberSelectionSheet({
  title,
  description,
  candidates,
  minimumSelection = 1,
  roomNameEnabled = false,
  selectedTranslation,
  confirmLabel,
  onClose,
  onConfirm,
}) {
  const [query, setQuery] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [step, setStep] = useState('members');
  const [previewMember, setPreviewMember] = useState(null);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const profileHoldTimerRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCandidates = candidates.filter((member) => (
    [member.name, member.department, member.role]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));
  const selectedMembers = candidates.filter(({ id }) => selectedIds.includes(id));

  const toggleMember = (memberId) => {
    setSelectedIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ));
  };

  const cancelProfileHold = () => {
    window.clearTimeout(profileHoldTimerRef.current);
    profileHoldTimerRef.current = null;
  };

  const startProfileHold = (member) => {
    cancelProfileHold();
    profileHoldTimerRef.current = window.setTimeout(() => {
      setPreviewMember(member);
      profileHoldTimerRef.current = null;
    }, 500);
  };

  useEffect(() => () => cancelProfileHold(), []);

  const confirmSelection = () => {
    if (roomNameEnabled) {
      setStep('name');
      return;
    }
    dismiss(() => onConfirm(selectedMembers, ''));
  };

  return (
    <div className={`member-picker-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="member-picker-backdrop" type="button" aria-label={`${title} 닫기`} onClick={() => dismiss()} />
      {step === 'members' ? (
        <section className="member-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="member-picker-title">
          <header>
            <div><h2 id="member-picker-title">{title}</h2><p>{description}</p></div>
            <button type="button" aria-label={`${title} 닫기`} onClick={() => dismiss()}><X size={21} aria-hidden="true" /></button>
          </header>

          {selectedMembers.length > 0 && (
            <section className="selected-member-strip" aria-label={`선택한 친구 ${selectedMembers.length}명`}>
              <div className="selected-member-strip-heading"><strong>선택됨</strong><span>{selectedMembers.length}</span></div>
              <div className="selected-member-strip-list">
                {selectedMembers.map((member) => (
                  <article
                    key={member.id}
                    tabIndex="0"
                    aria-label={`${member.name} 프로필, 길게 눌러 상세 보기`}
                    onPointerDown={() => startProfileHold(member)}
                    onPointerUp={cancelProfileHold}
                    onPointerCancel={cancelProfileHold}
                    onPointerLeave={cancelProfileHold}
                    onContextMenu={(event) => event.preventDefault()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setPreviewMember(member);
                    }}
                  >
                    <span className={`directory-avatar tone-${member.tone ?? 'violet'}`} aria-hidden="true">
                      <UserRound className="default-profile-glyph" />
                    </span>
                    <strong>{member.name}</strong>
                    <button
                      type="button"
                      aria-label={`${member.name} 선택 취소`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => toggleMember(member.id)}
                    >
                      <X size={11} strokeWidth={3} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="member-picker-controls">
            <label className="member-picker-search">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="친구 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="친구 검색"
              />
              {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={16} /></button>}
            </label>
          </div>
          <div className="member-picker-list">
            {filteredCandidates.map((member) => {
              const selected = selectedIds.includes(member.id);
              return (
                <button
                  className={selected ? 'is-selected' : ''}
                  type="button"
                  aria-pressed={selected}
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                >
                  <span className={`directory-avatar tone-${member.tone ?? 'violet'}`} aria-hidden="true">
                    <UserRound className="default-profile-glyph" />
                  </span>
                  <span><strong>{member.name}</strong><small>{member.churchId && member.churchId !== readStoredValue(CURRENT_CHURCH_STORAGE_KEY, 'grace-spring') ? member.churchName : `${member.department} · ${member.role}`}</small></span>
                  <i aria-hidden="true">{selected && <Check size={16} />}</i>
                </button>
              );
            })}
            {filteredCandidates.length === 0 && <p>검색 결과가 없어요.</p>}
          </div>
          <footer>
            <span>{selectedMembers.length}명 선택</span>
            <button
              type="button"
              disabled={selectedMembers.length < minimumSelection}
              onClick={confirmSelection}
            >
              {roomNameEnabled ? '다음' : confirmLabel(selectedMembers.length)}
            </button>
          </footer>
        </section>
      ) : (
        <section className="member-picker-sheet member-picker-name-sheet" role="dialog" aria-modal="true" aria-labelledby="member-picker-name-title">
          <header>
            <div className="member-picker-name-heading">
              <button type="button" aria-label="친구 선택으로 돌아가기" onClick={() => setStep('members')}><ChevronLeft size={22} /></button>
              <div><h2 id="member-picker-name-title">채팅방 이름 설정</h2><p>모든 참여자에게 같은 이름으로 표시돼요</p></div>
            </div>
            <button type="button" aria-label="채팅방 이름 설정 닫기" onClick={() => dismiss()}><X size={21} aria-hidden="true" /></button>
          </header>
          <div className="member-picker-name-content">
            <div className="room-name-avatar-stack" aria-label={`${selectedMembers.length}명 참여`}>
              {selectedMembers.slice(0, 4).map((member) => (
                <span className={`directory-avatar tone-${member.tone ?? 'violet'}`} key={member.id} aria-hidden="true">
                  <UserRound className="default-profile-glyph" />
                </span>
              ))}
              {selectedMembers.length > 4 && <b>+{selectedMembers.length - 4}</b>}
            </div>
            <label className="member-picker-room-name">
              <span>채팅방 이름</span>
              <input
                autoFocus
                aria-label="단체 채팅방 이름"
                maxLength={30}
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="예: 청년부 예배 준비팀"
              />
              <small>{roomName.length}/30</small>
            </label>
          </div>
          <footer>
            <span>{selectedMembers.length}명 참여</span>
            <button
              type="button"
              disabled={!roomName.trim()}
              onClick={() => dismiss(() => onConfirm(selectedMembers, roomName.trim()))}
            >
              채팅방 만들기
            </button>
          </footer>
        </section>
      )}

      {previewMember && (
        <MemberProfileSheet member={previewMember} selectedTranslation={selectedTranslation} onClose={() => setPreviewMember(null)} />
      )}
    </div>
  );
}

function MessageRoom({ conversation, setConversations, onBack, onPersistDraft, onUpdateDraft, onCreateGroup, onOpenBibleVerse, forwardConversations = [], forwardQtRooms = [], onForwardMessage, members = knownMessageMembers, currentChurchId, selectedTranslation, serverBacked = false, onReloadMessages }) {
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reactionMenu, setReactionMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [messageSelectionOpen, setMessageSelectionOpen] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [unsendTarget, setUnsendTarget] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [selectedParticipantProfile, setSelectedParticipantProfile] = useState(null);
  const [roomNotice, setRoomNotice] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentHeight, setAttachmentHeight] = useState(() => Math.min(320, Math.round(window.innerHeight * 0.38)));
  const [roomViewport, setRoomViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
  }));
  const searchInputRef = useRef(null);
  const messageListRef = useRef(null);
  const composerInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuCloseTimerRef = useRef(null);
  const reactionHoldTimerRef = useRef(null);
  const reactionCloseTimerRef = useRef(null);
  const baseViewportHeightRef = useRef(window.visualViewport?.height ?? window.innerHeight);
  const keyboardHeightRef = useRef(Math.min(320, Math.round(window.innerHeight * 0.38)));
  const participantIds = getConversationParticipantIds(conversation);
  const participants = getConversationParticipants(participantIds, members);
  const directParticipant = participants.length === 1 ? participants[0] : null;
  const inviteCandidates = members.filter(({ id }) => !participantIds.includes(id));
  const normalizedMessageQuery = messageQuery.trim().toLowerCase();
  const hiddenMessageIds = new Set(conversation.hiddenMessageIds ?? []);
  const availableMessages = conversation.messages.filter(({ id }) => !hiddenMessageIds.has(id));
  const visibleMessages = normalizedMessageQuery
    ? availableMessages.filter((message) => message.text.toLowerCase().includes(normalizedMessageQuery))
    : availableMessages;
  const roomTitle = conversation.customName || conversation.name || getConversationDetails(participantIds).name;
  const swipeBack = useSwipeBack(onBack, {
    enabled: !menuOpen && !inviteOpen && !reactionMenu && !deleteWarningOpen && !unsendTarget && !forwardMessage,
  });

  const cancelReactionHold = () => {
    window.clearTimeout(reactionHoldTimerRef.current);
    reactionHoldTimerRef.current = null;
  };

  const closeReactionMenu = () => {
    cancelReactionHold();
    if (!reactionMenu || reactionMenu.closing) return;
    setReactionMenu((current) => current ? { ...current, closing: true } : null);
    window.clearTimeout(reactionCloseTimerRef.current);
    reactionCloseTimerRef.current = window.setTimeout(() => setReactionMenu(null), 180);
  };

  const startReactionHold = (messageId) => {
    if (messageSelectionOpen) return;
    cancelReactionHold();
    reactionHoldTimerRef.current = window.setTimeout(() => {
      setReactionMenu({ messageId, closing: false });
      reactionHoldTimerRef.current = null;
    }, 500);
  };

  const openMessageMenusFromKeyboard = (event, messageId) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    setReactionMenu({ messageId, closing: false });
  };

  const openConversationMenu = () => {
    window.clearTimeout(menuCloseTimerRef.current);
    setMenuClosing(false);
    setMenuOpen(true);
  };

  const closeConversationMenu = () => {
    if (!menuOpen || menuClosing) return;
    setMenuClosing(true);
    window.clearTimeout(menuCloseTimerRef.current);
    menuCloseTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 240);
  };

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [attachmentOpen, conversation.messages.length, searchOpen]);

  useEffect(() => {
    if (!reactionMenu) return undefined;
    const closeOnOutsidePointer = (event) => {
      const messageBlock = event.target.closest('.message-bubble-block');
      if (messageBlock?.dataset.messageId === reactionMenu.messageId) return;
      closeReactionMenu();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [reactionMenu]);

  useEffect(() => () => {
    window.clearTimeout(menuCloseTimerRef.current);
    window.clearTimeout(reactionHoldTimerRef.current);
    window.clearTimeout(reactionCloseTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const updateViewport = () => {
      const nextHeight = Math.round(viewport.height);
      const nextTop = Math.round(viewport.offsetTop);
      const obscuredHeight = Math.max(0, baseViewportHeightRef.current - nextHeight - nextTop);
      if (obscuredHeight > 120) keyboardHeightRef.current = obscuredHeight;
      else if (nextHeight > baseViewportHeightRef.current) baseViewportHeightRef.current = nextHeight;
      setRoomViewport({ height: nextHeight, top: nextTop });
    };

    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, []);

  const updateConversation = (updater) => {
    if (conversation.isDraft) {
      onUpdateDraft((current) => (
        current?.id === conversation.id ? updater(current) : current
      ));
      return;
    }
    setConversations((current) => current.map((item) => (
      item.id === conversation.id ? updater(item) : item
    )));
  };

  const appendOutgoingMessage = (messageText) => {
    const text = messageText.trim();
    if (!text) return;
    const appendMessage = (current) => ({
      ...current,
      lastMessage: text,
      time: '방금',
      messages: [
        ...current.messages,
        {
          id: `${current.id}-${Date.now()}`,
          from: 'me',
          text,
          time: '방금',
          unreadByCount: getConversationParticipantIds(current).length,
          replyTo: replyTarget ? {
            id: replyTarget.id,
            text: replyTarget.text,
            author: replyTarget.author,
            kind: replyTarget.kind,
          } : null,
        },
      ],
    });
    if (conversation.isDraft) onPersistDraft(appendMessage(conversation));
    else {
      updateConversation(appendMessage);
      if (serverBacked) {
        messageRepository.send(conversation.id, {
          body: text,
          payload: replyTarget ? { replyTo: {
            id: replyTarget.id, text: replyTarget.text, author: replyTarget.author, kind: replyTarget.kind,
          } } : {},
        }).then(onReloadMessages).catch(() => showRoomNotice('메시지를 전송하지 못했어요.'));
      }
    }
    setReplyTarget(null);
  };

  const applyMessageReaction = (messageId, reactionId) => {
    const previousReaction = conversation.messages.find(({ id }) => id === messageId)?.reaction;
    updateConversation((current) => ({
      ...current,
      messages: current.messages.map((message) => message.id === messageId
        ? { ...message, reaction: message.reaction === reactionId ? null : reactionId }
        : message),
    }));
    closeReactionMenu();
    if (serverBacked) {
      messageRepository.react(messageId, previousReaction === reactionId ? null : reactionId)
        .then(onReloadMessages)
        .catch(() => showRoomNotice('공감을 저장하지 못했어요.'));
    }
  };

  const showRoomNotice = (message) => {
    setRoomNotice(message);
    window.setTimeout(() => setRoomNotice(''), 1700);
  };

  const startMessageDeletion = (messageId) => {
    setReactionMenu(null);
    setSelectedMessageIds([messageId]);
    setMessageSelectionOpen(true);
  };

  const toggleSelectedMessage = (messageId) => {
    setSelectedMessageIds((current) => current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId]);
  };

  const deleteSelectedMessagesForMe = () => {
    const deletingIds = [...selectedMessageIds];
    updateConversation((current) => ({
      ...current,
      hiddenMessageIds: [...new Set([...(current.hiddenMessageIds ?? []), ...selectedMessageIds])],
    }));
    setDeleteWarningOpen(false);
    setMessageSelectionOpen(false);
    setSelectedMessageIds([]);
    showRoomNotice('선택한 메시지를 나에게만 삭제했어요.');
    if (serverBacked) {
      messageRepository.deleteForMe(deletingIds)
        .then(onReloadMessages)
        .catch(() => showRoomNotice('삭제 상태를 저장하지 못했어요.'));
    }
  };

  const cancelMessageSelection = () => {
    setMessageSelectionOpen(false);
    setSelectedMessageIds([]);
    setDeleteWarningOpen(false);
  };

  const confirmUnsendMessage = () => {
    if (!unsendTarget) return;
    const targetId = unsendTarget.id;
    updateConversation((current) => {
      const nextMessages = current.messages.map((message) => message.id === unsendTarget.id
        ? {
          id: message.id,
          from: message.from,
          text: '전송을 취소한 메시지입니다.',
          time: message.time,
          type: 'unsent',
          unsent: true,
        }
        : message);
      const lastMessage = nextMessages.at(-1);
      return {
        ...current,
        messages: nextMessages,
        lastMessage: lastMessage?.text ?? current.lastMessage,
      };
    });
    setUnsendTarget(null);
    showRoomNotice('모든 대화 상대에게서 메시지를 지웠어요.');
    if (serverBacked) {
      messageRepository.cancel(targetId)
        .then(onReloadMessages)
        .catch(() => showRoomNotice('전송 취소를 저장하지 못했어요.'));
    }
  };

  const handleMessageAction = async (action, message) => {
    setReactionMenu(null);
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(message.text);
        showRoomNotice('메시지를 복사했어요.');
      } catch {
        showRoomNotice('메시지를 복사하지 못했어요.');
      }
      return;
    }
    if (action === 'reply' || action === 'comment') {
      setReplyTarget({
        id: message.id,
        text: message.text,
        author: message.from === 'me' ? '나' : (message.author ?? roomTitle),
        kind: action,
      });
      window.requestAnimationFrame(() => composerInputRef.current?.focus());
      return;
    }
    if (action === 'forward') {
      setForwardMessage(message);
      return;
    }
    if (action === 'delete') {
      startMessageDeletion(message.id);
      return;
    }
    if (action === 'unsend') setUnsendTarget(message);
  };

  const sendMessage = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    appendOutgoingMessage(text);
    setDraft('');
  };

  const toggleAttachmentMenu = () => {
    if (attachmentOpen) {
      setAttachmentOpen(false);
      return;
    }
    const fallbackHeight = Math.min(340, Math.round(baseViewportHeightRef.current * 0.38));
    setAttachmentHeight(Math.max(240, keyboardHeightRef.current || fallbackHeight));
    setAttachmentOpen(true);
    composerInputRef.current?.blur();
  };

  const sendSelectedFile = async (kind, files) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const additionalCount = selectedFiles.length > 1 ? ` 외 ${selectedFiles.length - 1}개` : '';
    const label = `${kind} · ${selectedFiles[0].name}${additionalCount}`;
    if (serverBacked && !conversation.isDraft) {
      try {
        for (const file of selectedFiles) {
          const stored = await uploadMessageAttachment(file, conversation.id, [conversation.id]);
          await messageRepository.send(conversation.id, {
            type: kind === '사진' ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file',
            body: `${kind} · ${file.name}`,
            payload: { bucket: stored.bucket, path: stored.path, name: file.name, mimeType: file.type, size: file.size },
          });
        }
        await onReloadMessages?.();
      } catch (error) {
        showRoomNotice(error instanceof Error ? error.message : '파일을 전송하지 못했어요.');
      }
    } else {
      appendOutgoingMessage(label);
    }
    setAttachmentOpen(false);
  };

  const prepareAttachmentDraft = (text) => {
    setDraft(text);
    setAttachmentOpen(false);
    window.requestAnimationFrame(() => composerInputRef.current?.focus());
  };

  const inviteParticipants = (selectedMembers, customName) => {
    if (participantIds.length === 1) {
      setInviteOpen(false);
      setMenuOpen(false);
      setMenuClosing(false);
      onCreateGroup(participantIds, selectedMembers, customName);
      return;
    }

    updateConversation((current) => {
      const currentParticipantIds = getConversationParticipantIds(current);
      const nextParticipantIds = [...new Set([
        ...currentParticipantIds,
        ...selectedMembers.map(({ id }) => id),
      ])];
      const invitedNames = selectedMembers.map(({ name }) => name).join(', ');
      const joinedAtMessageIndex = current.messages.length;
      const participantJoinedAt = {
        ...Object.fromEntries(currentParticipantIds.map((id) => [id, current.participantJoinedAt?.[id] ?? 0])),
        ...Object.fromEntries(selectedMembers.map(({ id }) => [id, joinedAtMessageIndex])),
      };
      return {
        ...current,
        ...getConversationDetails(nextParticipantIds, current.customName, members),
        participantIds: nextParticipantIds,
        participantJoinedAt,
        messages: [
          ...current.messages,
          { id: `${current.id}-invite-${Date.now()}`, from: 'system', text: `${invitedNames}님을 대화에 초대했어요.`, time: '방금' },
        ],
      };
    });
    setInviteOpen(false);
    if (serverBacked) {
      messageRepository.invite(conversation.id, selectedMembers.map(({ id }) => id))
        .then(onReloadMessages)
        .catch(() => showRoomNotice('대화 상대를 초대하지 못했어요.'));
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setMessageQuery('');
  };

  const renderMessageActionMenu = (message) => {
    if (reactionMenu?.messageId !== message.id) return null;
    const actions = [
      { id: 'copy', label: '복사', icon: Copy },
      { id: 'reply', label: '답장', icon: Reply },
      { id: 'forward', label: '전달', icon: Forward },
      { id: 'comment', label: '답글', icon: MessageSquareReply },
      { id: 'delete', label: '삭제', icon: Trash2 },
      ...(message.from === 'me' ? [{ id: 'unsend', label: '전송 취소', icon: Undo2 }] : []),
    ];
    return (
      <div className={`message-action-picker ${message.from === 'me' ? 'is-me' : ''} ${reactionMenu.closing ? 'is-closing' : ''}`} role="menu" aria-label="메시지 작업">
        {actions.map(({ id, label, icon: ActionIcon }) => (
          <button type="button" role="menuitem" key={id} onPointerDown={(event) => event.stopPropagation()} onClick={() => handleMessageAction(id, message)}>
            <ActionIcon size={15} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderMessageReactionMenu = (message) => {
    if (reactionMenu?.messageId !== message.id) return null;
    return (
      <div className={`message-reaction-picker ${reactionMenu.closing ? 'is-closing' : ''}`} role="menu" aria-label="메시지 공감 선택">
        {messageReactionOptions.map(({ id, label, shortLabel, Icon, tone }) => (
          <button className={`tone-${tone} ${message.reaction === id ? 'is-selected' : ''}`} type="button" role="menuitem" aria-label={label} key={id} onPointerDown={(event) => event.stopPropagation()} onClick={() => applyMessageReaction(message.id, id)}>
            {Icon ? <Icon size={19} fill={id === 'heart' ? 'currentColor' : 'none'} aria-hidden="true" /> : <strong>{shortLabel}</strong>}
          </button>
        ))}
      </div>
    );
  };

  const wrapSelectableMessage = (message, content) => {
    if (!messageSelectionOpen) return content;
    const selected = selectedMessageIds.includes(message.id);
    return (
      <div
        className={`message-selection-row ${selected ? 'is-selected' : ''}`}
        key={message.id}
        role="button"
        tabIndex="0"
        aria-pressed={selected}
        onClick={() => toggleSelectedMessage(message.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') toggleSelectedMessage(message.id);
        }}
      >
        <div className="message-selection-content">{content}</div>
        <span className="message-selection-check" aria-hidden="true">{selected && <Check size={15} strokeWidth={3} />}</span>
      </div>
    );
  };

  return (
    <section
      className={`message-room-screen ${swipeBack.className}`}
      aria-label={`${roomTitle} 대화방`}
      style={{ ...swipeBack.style, '--message-viewport-height': `${roomViewport.height}px`, '--message-viewport-top': `${roomViewport.top}px` }}
      {...swipeBack.handlers}
    >
      <header className={`message-room-header ${searchOpen ? 'is-searching' : ''} ${messageSelectionOpen ? 'is-selecting' : ''}`}>
        {messageSelectionOpen ? (
          <>
            <button className="chat-icon-button" type="button" aria-label="메시지 선택 취소" onClick={cancelMessageSelection}>
              <X size={23} aria-hidden="true" />
            </button>
            <span className="message-selection-count">{selectedMessageIds.length}개 선택</span>
          </>
        ) : searchOpen ? (
          <>
            <button className="chat-icon-button" type="button" aria-label="대화 검색 닫기" onClick={closeSearch}>
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <label className="chat-search-bar">
              <Search size={17} aria-hidden="true" />
              <input
                ref={searchInputRef}
                autoFocus
                aria-label="대화 내용 검색"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
                placeholder="메시지 검색"
              />
              {messageQuery && (
                <button type="button" aria-label="검색어 지우기" onClick={() => setMessageQuery('')}>
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
          </>
        ) : (
          <>
            <div className="message-room-title">
              <button className="chat-icon-button" type="button" aria-label="메시지 목록으로 돌아가기" onClick={onBack}>
                <ChevronLeft size={25} aria-hidden="true" />
              </button>
              {directParticipant ? (
                <button
                  className="message-room-profile-trigger"
                  type="button"
                  aria-label={`${directParticipant.name} 프로필 보기`}
                  onClick={() => setSelectedParticipantProfile(directParticipant)}
                >
                  <strong>{roomTitle}</strong><span>{participants.length}명</span>
                </button>
              ) : (
                <div><strong>{roomTitle}</strong><span>{participants.length}명</span></div>
              )}
            </div>
            <div className="message-room-actions">
              <button className="chat-icon-button" type="button" aria-label="대화 검색" onClick={() => { setAttachmentOpen(false); setSearchOpen(true); }}>
                <Search size={21} aria-hidden="true" />
              </button>
              <button className="chat-icon-button" type="button" aria-label="대화방 메뉴" onClick={openConversationMenu}>
                <MoreHorizontal size={23} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </header>

      {searchOpen && (
        <div className="chat-search-summary" role="status">
          {normalizedMessageQuery ? `일치하는 메시지 ${visibleMessages.length}개` : '검색어를 입력해 주세요'}
        </div>
      )}

      <div className={`message-bubbles ${searchOpen ? 'is-searching' : ''}`} ref={messageListRef} aria-live="polite">
        {visibleMessages.map((message) => {
          if (message.type === 'bible-passage') {
            const firstPassage = message.passages?.[0];
            if (!firstPassage) return null;
            return wrapSelectableMessage(message,
              <div className={`message-bubble-block is-special ${message.from === 'me' ? 'is-me' : 'is-them'}`} data-message-id={message.id} key={message.id}>
                {renderMessageActionMenu(message)}
                <div className={`message-special-content-row ${message.from === 'me' ? 'is-me' : 'is-them'}`}>
                  <button
                    className="message-bible-passage"
                    type="button"
                    onPointerDown={() => startReactionHold(message.id)}
                    onPointerUp={cancelReactionHold}
                    onPointerCancel={cancelReactionHold}
                    onPointerLeave={cancelReactionHold}
                    onContextMenu={(event) => event.preventDefault()}
                    onKeyDown={(event) => openMessageMenusFromKeyboard(event, message.id)}
                    onClick={() => { if (reactionMenu?.messageId !== message.id) onOpenBibleVerse?.(firstPassage); }}
                  >
                    <span><BookOpen size={15} aria-hidden="true" />말씀</span>
                    <strong>{message.referenceLabel ?? firstPassage.reference}</strong>
                    <div>
                      {message.passages.map((passage) => <p key={passage.reference}><b>{passage.reference}</b>{passage.text}</p>)}
                    </div>
                    <footer><small>{firstPassage.translationName}</small></footer>
                  </button>
                  <span className="message-bubble-meta">
                    {message.unreadByCount > 0 && <b aria-label={`대화 참여자 ${message.unreadByCount}명이 읽지 않음`}>{message.unreadByCount}</b>}
                    <time>{message.time}</time>
                  </span>
                </div>
                {renderMessageReactionMenu(message)}
              </div>
            );
          }
          if (message.type === 'qt-passage') {
            return wrapSelectableMessage(message,
              <div className="message-bubble-block is-special is-qt-system" data-message-id={message.id} key={message.id}>
                {renderMessageActionMenu(message)}
                <div className="message-special-content-row is-qt-system">
                  <article
                    className="message-qt-passage"
                    tabIndex="0"
                    aria-label={`${message.verse.reference} QT 말씀`}
                    onPointerDown={() => startReactionHold(message.id)}
                    onPointerUp={cancelReactionHold}
                    onPointerCancel={cancelReactionHold}
                    onPointerLeave={cancelReactionHold}
                    onContextMenu={(event) => event.preventDefault()}
                    onKeyDown={(event) => openMessageMenusFromKeyboard(event, message.id)}
                  >
                    <span>QT 말씀</span>
                    <strong>{message.verse.reference}</strong>
                    <p>{message.verse.text}</p>
                    <small>{message.verse.translationName}</small>
                    <button
                      className="message-qt-open-button"
                      type="button"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        cancelReactionHold();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenBibleVerse?.(message.verse);
                      }}
                    >
                      지금 읽으러 가기<ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </article>
                  <span className="message-bubble-meta"><time>{message.time}</time></span>
                </div>
                {renderMessageReactionMenu(message)}
              </div>
            );
          }
          if (message.from === 'system') return wrapSelectableMessage(message, <p className="message-system" key={message.id}>{message.text}</p>);
          if (message.unsent || message.type === 'unsent') {
            return wrapSelectableMessage(message, <p className="message-unsent" key={message.id}>{message.text}</p>);
          }

          const selectedReaction = messageReactionOptions.find(({ id }) => id === message.reaction);
          const SelectedReactionIcon = selectedReaction?.Icon;
          return wrapSelectableMessage(message,
            <div
              className={`message-bubble-block ${message.from === 'me' ? 'is-me' : 'is-them'}`}
              data-message-id={message.id}
              key={message.id}
            >
              {renderMessageActionMenu(message)}
              <div
                className={`message-bubble-row ${message.from === 'me' ? 'is-me' : 'is-them'}`}
                onPointerDown={() => startReactionHold(message.id)}
                onPointerUp={cancelReactionHold}
                onPointerCancel={cancelReactionHold}
                onPointerLeave={cancelReactionHold}
                onContextMenu={(event) => event.preventDefault()}
                tabIndex="0"
                onKeyDown={(event) => openMessageMenusFromKeyboard(event, message.id)}
              >
                <div className="message-bubble-content">
                  {message.replyTo && (
                    <span className="message-reply-reference">
                      <strong>{message.replyTo.kind === 'comment' ? '답글' : '답장'} · {message.replyTo.author}</strong>
                      <small>{message.replyTo.text}</small>
                    </span>
                  )}
                  <p><HighlightedMessage text={message.text} query={normalizedMessageQuery} /></p>
                  {selectedReaction && (
                    <span className={`message-reaction-chip tone-${selectedReaction.tone}`} aria-label={`${selectedReaction.label} 공감 1개`}>
                      {SelectedReactionIcon ? <SelectedReactionIcon size={12} fill={selectedReaction.id === 'heart' ? 'currentColor' : 'none'} /> : <strong>{selectedReaction.shortLabel}</strong>}
                      <b>1</b>
                    </span>
                  )}
                </div>
                <span className="message-bubble-meta">
                  {message.unreadByCount > 0 && (
                    <b aria-label={`대화 참여자 ${message.unreadByCount}명이 읽지 않음`}>
                      {message.unreadByCount}
                    </b>
                  )}
                  <time>{message.time}</time>
                </span>
              </div>
              {renderMessageReactionMenu(message)}
            </div>
          );
        })}
        {normalizedMessageQuery && visibleMessages.length === 0 && <p className="message-search-empty">일치하는 메시지가 없어요.</p>}
      </div>

      {!searchOpen && !messageSelectionOpen && (
        <form className={`message-composer ${attachmentOpen ? 'is-attachment-open' : ''}`} onSubmit={sendMessage}>
          {replyTarget && (
            <div className="message-reply-draft">
              <span><strong>{replyTarget.kind === 'comment' ? '답글' : '답장'} · {replyTarget.author}</strong><small>{replyTarget.text}</small></span>
              <button type="button" aria-label="답장 취소" onClick={() => setReplyTarget(null)}><X size={15} /></button>
            </div>
          )}
          <button className="message-composer-add" type="button" aria-label={attachmentOpen ? '첨부 메뉴 닫기' : '첨부 메뉴 열기'} aria-expanded={attachmentOpen} onClick={toggleAttachmentMenu}>
            <Plus size={22} aria-hidden="true" />
          </button>
          <label className="message-composer-input">
            <input
              ref={composerInputRef}
              aria-label="메시지 입력"
              value={draft}
              onFocus={() => setAttachmentOpen(false)}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="메시지를 입력하세요"
            />
          </label>
          <button className="message-composer-send" type="submit" aria-label="메시지 보내기" disabled={!draft.trim()}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      )}

      {!searchOpen && !messageSelectionOpen && attachmentOpen && (
        <section className="message-attachment-panel" style={{ '--attachment-panel-height': `${attachmentHeight}px` }} aria-label="첨부 메뉴">
          <div className="message-attachment-grid">
            <button type="button" onClick={() => photoInputRef.current?.click()}><span><ImageIcon size={23} aria-hidden="true" /></span><strong>사진</strong></button>
            <button type="button" onClick={() => fileInputRef.current?.click()}><span><FileText size={23} aria-hidden="true" /></span><strong>파일</strong></button>
            <button type="button" onClick={() => prepareAttachmentDraft('음성 메시지')}><span><Mic size={23} aria-hidden="true" /></span><strong>음성</strong></button>
            <button type="button" onClick={() => prepareAttachmentDraft('말씀 · 빌립보서 4:6')}><span><BookOpen size={23} aria-hidden="true" /></span><strong>말씀</strong></button>
          </div>
          <input ref={photoInputRef} className="message-hidden-file" type="file" accept="image/*" multiple onChange={(event) => { sendSelectedFile('사진', event.target.files); event.target.value = ''; }} />
          <input ref={fileInputRef} className="message-hidden-file" type="file" multiple onChange={(event) => { sendSelectedFile('파일', event.target.files); event.target.value = ''; }} />
        </section>
      )}

      {messageSelectionOpen && (
        <div className="message-delete-bar">
          <button type="button" disabled={!selectedMessageIds.length} onClick={() => setDeleteWarningOpen(true)}>
            나에게만 삭제
          </button>
        </div>
      )}

      {deleteWarningOpen && (
        <ConfirmDialog
          title="선택한 메시지를 삭제할까요?"
          description="이 대화방의 내 화면에서만 사라지며 다른 참여자는 계속 볼 수 있어요."
          confirmLabel="나에게만 삭제"
          danger
          onClose={() => setDeleteWarningOpen(false)}
          onConfirm={deleteSelectedMessagesForMe}
        />
      )}

      {unsendTarget && (
        <ConfirmDialog
          title="전송을 취소할까요?"
          description="모든 대화 참여자가 이 메시지를 더 이상 볼 수 없게 됩니다."
          confirmLabel="전송 취소"
          danger
          onClose={() => setUnsendTarget(null)}
          onConfirm={confirmUnsendMessage}
        />
      )}

      {roomNotice && <div className="message-room-notice" role="status">{roomNotice}</div>}

      {forwardMessage && (
        <MessageForwardSheet
          message={forwardMessage}
          conversations={forwardConversations}
          qtRooms={forwardQtRooms}
          onClose={() => setForwardMessage(null)}
          onSend={(destination) => {
            const destinationName = onForwardMessage?.(forwardMessage, destination);
            setForwardMessage(null);
            if (destinationName) showRoomNotice(`${destinationName}에 메시지를 전달했어요.`);
          }}
        />
      )}

      {menuOpen && (
        <div className={`chat-menu-layer ${menuClosing ? 'is-closing' : ''}`}>
          <button className="chat-menu-backdrop" type="button" aria-label="대화방 메뉴 닫기" onClick={closeConversationMenu} />
          <aside className="chat-menu-panel" aria-label="대화방 메뉴">
            <header><h2>대화방 설정</h2><button type="button" aria-label="대화방 메뉴 닫기" onClick={closeConversationMenu}><X size={21} /></button></header>

            <section className="chat-menu-section">
              <div className="chat-menu-section-title"><strong>대화 상대</strong><span>{participants.length}명</span></div>
              <div className="chat-participant-list">
                {participants.map((participant) => (
                  <button
                    className="chat-participant"
                    type="button"
                    aria-label={`${participant.name} 프로필 보기`}
                    key={participant.id}
                    onClick={() => setSelectedParticipantProfile(participant)}
                  >
                    <span className="member-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                    <div><strong>{participant.name}</strong><small>{participant.department} · {participant.role}</small></div>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button className="chat-invite-button" type="button" onClick={() => setInviteOpen(true)}>
                <UserPlus size={18} aria-hidden="true" />대화 상대 초대
              </button>
            </section>

            <section className="chat-setting-list">
              <button
                type="button"
                role="switch"
                aria-checked={conversation.notifications !== false}
                onClick={() => updateConversation((current) => ({ ...current, notifications: current.notifications === false }))}
              >
                <span>{conversation.notifications === false ? <BellOff size={20} /> : <Bell size={20} />}<strong>알림 설정</strong></span>
                <i className={conversation.notifications === false ? '' : 'is-on'}><b /></i>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(conversation.favorite)}
                onClick={() => updateConversation((current) => ({ ...current, favorite: !current.favorite }))}
              >
                <span><Star size={20} fill={conversation.favorite ? 'currentColor' : 'none'} /><strong>즐겨찾기</strong></span>
                <i className={conversation.favorite ? 'is-on' : ''}><b /></i>
              </button>
            </section>
          </aside>
        </div>
      )}

      {inviteOpen && (
        <MemberSelectionSheet
          title={participantIds.length === 1 ? '새 단체 채팅 만들기' : '대화 상대 초대'}
          description={participantIds.length === 1
            ? '현재 대화 내용은 새 채팅방에 포함되지 않아요'
            : '새 친구는 초대 이후의 대화만 볼 수 있어요'}
          candidates={inviteCandidates}
          selectedTranslation={selectedTranslation}
          roomNameEnabled={participantIds.length === 1}
          confirmLabel={(count) => `${count}명 초대`}
          onClose={() => setInviteOpen(false)}
          onConfirm={inviteParticipants}
        />
      )}

      {selectedParticipantProfile && (
        <MemberProfileSheet
          member={selectedParticipantProfile}
          currentChurchId={currentChurchId}
          selectedTranslation={selectedTranslation}
          onClose={() => setSelectedParticipantProfile(null)}
        />
      )}
    </section>
  );
}

function MessageForwardSheet({ message, conversations, qtRooms, onClose, onSend }) {
  const [mode, setMode] = useState('friend');
  const [query, setQuery] = useState('');
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const friendIds = [...new Set([...readStoredValue('bibleon.friendIds', ['minseo', 'jaeyun', 'eunji']), 'jian-external'])];
  const normalizedQuery = query.trim().toLowerCase();
  const sources = {
    friend: knownMessageMembers.filter(({ id }) => friendIds.includes(id)),
    recent: conversations,
    qt: qtRooms,
  };
  const visibleItems = sources[mode].filter((item) => [
    item.customName,
    item.name,
    item.department,
    item.lastMessage,
    ...getConversationParticipants(getConversationParticipantIds(item)).map(({ name }) => name),
  ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery)));

  return (
    <div className={`verse-share-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="verse-share-backdrop" type="button" aria-label="메시지 전달 닫기" onClick={() => dismiss()} />
      <section className="verse-share-sheet" role="dialog" aria-modal="true" aria-labelledby="message-forward-title">
        <header><div><h2 id="message-forward-title">메시지 전달</h2><p className="message-forward-preview">{message.text}</p></div><button type="button" aria-label="메시지 전달 닫기" onClick={() => dismiss()}><X size={21} /></button></header>
        <div className="verse-share-tabs" role="tablist" aria-label="메시지 전달 대상">
          {[{ id: 'friend', label: '친구' }, { id: 'recent', label: '최근 대화' }, { id: 'qt', label: 'QT방' }].map(({ id, label }) => <button className={mode === id ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === id} key={id} onClick={() => { setMode(id); setQuery(''); }}>{label}</button>)}
        </div>
        <label className="verse-share-search"><Search size={17} /><input aria-label="메시지 전달 대상 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="전달 대상 검색" />{query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
        <div className="verse-share-list">
          {visibleItems.map((item) => {
            const participantIds = getConversationParticipantIds(item);
            const description = mode === 'friend'
              ? `${item.department} · ${item.role}`
              : getConversationParticipants(participantIds).map(({ name }) => name).join(', ') || item.lastMessage;
            return <button type="button" key={`${mode}-${item.id}`} onClick={() => dismiss(() => onSend({ type: mode, item }))}><span className={`directory-avatar tone-${item.tone ?? 'violet'}`}><UserRound className="default-profile-glyph" /></span><span><strong>{item.customName || item.name}</strong><small>{description}</small></span><Send size={17} /></button>;
          })}
          {!visibleItems.length && <p>전달할 대상을 찾지 못했어요.</p>}
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel = '확인', danger = false, onClose, onConfirm }) {
  const { isClosing, dismiss } = useSlideDismiss(onClose, 210);
  return (
    <div className={`confirm-dialog-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="confirm-dialog-backdrop" type="button" aria-label="확인 창 닫기" onClick={() => dismiss()} />
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div>
          <button type="button" onClick={() => dismiss()}>취소</button>
          <button className={danger ? 'is-danger' : 'is-primary'} type="button" onClick={() => dismiss(onConfirm)}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function BibleCompletionCelebration({ achievement, onRestart, onKeep }) {
  const confetti = Array.from({ length: 42 }, (_, index) => ({
    id: index,
    color: index % 3,
    left: `${4 + ((index * 37) % 92)}%`,
    delay: `${(index % 9) * 45}ms`,
    drift: `${((index * 23) % 120) - 60}px`,
  }));

  return (
    <div className="completion-celebration-layer" role="presentation">
      <div className="completion-confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <i
            className={`tone-${piece.color}`}
            key={piece.id}
            style={{ '--confetti-left': piece.left, '--confetti-delay': piece.delay, '--confetti-drift': piece.drift }}
          />
        ))}
      </div>
      <section className="completion-celebration" role="alertdialog" aria-modal="true" aria-labelledby="completion-celebration-title">
        <span><Trophy size={34} aria-hidden="true" /></span>
        <p>{achievement.name}</p>
        <h2 id="completion-celebration-title">성경 통독을 축하합니다</h2>
        <small>읽어 온 기록은 업적으로 남아요. 다음 통독을 바로 시작하거나 현재 읽음 상태를 유지할 수 있습니다.</small>
        <div>
          <button type="button" onClick={onKeep}>현재 기록 유지</button>
          <button type="button" onClick={onRestart}>처음부터 다시 읽기</button>
        </div>
      </section>
    </div>
  );
}

function HighlightedMessage({ text, query }) {
  if (!query) return text;
  const start = text.toLowerCase().indexOf(query);
  if (start < 0) return text;
  const end = start + query.length;
  return <>{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</>;
}

function buildMonthActivity(monthOffset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const startDate = new Date(monthDate);
  startDate.setDate(1 - ((monthDate.getDay() + 6) % 7));
  const weeks = Array.from({ length: 6 }, (_, weekIndex) => (
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);
      const isFuture = date > today;
      const isInMonth = date.getMonth() === monthDate.getMonth();
      const activityValue = (date.getDate() * 3 + date.getMonth() * 5 + weekIndex) % 11;
      const level = isFuture || !isInMonth ? null : activityValue >= 8 ? 3 : activityValue >= 5 ? 2 : activityValue >= 3 ? 1 : 0;
      return {
        date,
        day: date.getDate(),
        month: date.getMonth() + 1,
        level,
        isFuture,
        isInMonth,
      };
    })
  ));

  return {
    id: `${monthDate.getFullYear()}-${monthDate.getMonth() + 1}`,
    label: `${monthDate.getFullYear()}년 ${monthDate.getMonth() + 1}월`,
    weeks,
  };
}

function ProfileView({
  personalProfile,
  setPersonalProfile,
  selectedTranslation,
  achievements,
  readVerseCount,
  bibleVerseTotal,
  readingProgress,
  readingGrowthData,
  onRestartReading,
  currentChurch,
  communities,
  onSaveProfile,
}) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [heatmapHistoryOpen, setHeatmapHistoryOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const activityMonth = useMemo(() => buildMonthActivity(), []);

  return (
    <div className="page-stack profile-page">
      <button className="profile-summary profile-summary-button" type="button" onClick={() => setProfileEditorOpen(true)}>
        <PersonalAvatar profile={personalProfile} />
        <div className="profile-copy">
          <span>{currentChurch?.name ?? '개인 프로필'}</span>
          <h2>{personalProfile.name}</h2>
          {personalProfile.featuredAchievementName && (
            <b className="profile-featured-achievement"><Award size={12} aria-hidden="true" />{personalProfile.featuredAchievementName}</b>
          )}
          <p>@{personalProfile.nickname}</p>
          <p className="profile-summary-verse"><RepresentativeVerseText reference={personalProfile.verseRef} fallbackText={personalProfile.representativeVerse} translationId={selectedTranslation} /></p>
          <small>{personalProfile.verseRef}</small>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      <button className="activity-calendar" type="button" aria-label={`${activityMonth.label} 말씀 기록, 전체 기록 열기`} onClick={() => setHeatmapHistoryOpen(true)}>
        <div className="heatmap-heading"><strong>{activityMonth.label}</strong><span>전체 기록 <ChevronRight size={14} /></span></div>
        <MonthHeatmapGrid activityMonth={activityMonth} />
        <div className="calendar-legend" aria-label="말씀 읽기 활동 강도">
          <span>적음</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>많음</span>
        </div>
      </button>

      <GrowthChart
        readVerseCount={readVerseCount}
        bibleVerseTotal={bibleVerseTotal}
        readingProgress={readingProgress}
        readingGrowthData={readingGrowthData}
        onRestart={() => setRestartConfirmOpen(true)}
      />

      <AchievementPanel achievements={achievements} />

      {heatmapHistoryOpen && <HeatmapHistorySheet onClose={() => setHeatmapHistoryOpen(false)} />}

      {profileEditorOpen && (
        <SelfProfileEditor
          profile={personalProfile}
          selectedTranslation={selectedTranslation}
          achievements={achievements}
          communities={communities}
          onClose={() => setProfileEditorOpen(false)}
          onSave={(nextProfile) => {
            void (onSaveProfile ? onSaveProfile(nextProfile) : Promise.resolve(setPersonalProfile(nextProfile)));
            setProfileEditorOpen(false);
          }}
        />
      )}

      {restartConfirmOpen && (
        <ConfirmDialog
          title="성경을 처음부터 다시 읽을까요?"
          description="현재 읽음 표시와 진도율은 0%로 돌아갑니다. 이미 받은 통독 업적은 그대로 유지돼요."
          confirmLabel="처음부터 다시 읽기"
          danger
          onClose={() => setRestartConfirmOpen(false)}
          onConfirm={onRestartReading}
        />
      )}
    </div>
  );
}

function MonthHeatmapGrid({ activityMonth }) {
  return (
    <div className="month-heatmap-grid">
      <div className="heatmap-weekday-axis" aria-hidden="true">
        {['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="heatmap-grid-body">
        <div className="heatmap-week-axis" aria-hidden="true">
          {activityMonth.weeks.map((week, index) => <span key={week[0].date.toISOString()}>{index + 1}주</span>)}
        </div>
        <div className="calendar-grid">
          {activityMonth.weeks.map((week) => (
            <div className="calendar-week" key={week[0].date.toISOString()}>
              {week.map((item) => (
                <span
                  className={!item.isInMonth ? 'is-outside-month' : item.isFuture ? 'is-future' : `level-${item.level}`}
                  aria-label={item.isInMonth ? `${item.month}월 ${item.day}일${item.isFuture ? '' : `, 활동 ${item.level}단계`}` : undefined}
                  aria-hidden={!item.isInMonth ? 'true' : undefined}
                  key={item.date.toISOString()}
                >
                  {item.isInMonth && <small aria-hidden="true">{item.day}</small>}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeatmapHistorySheet({ onClose }) {
  const scrollRef = useRef(null);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const activityMonths = useMemo(() => (
    Array.from({ length: 12 }, (_, index) => buildMonthActivity(index - 11))
  ), []);

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const scrollContainer = scrollRef.current;
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className={`heatmap-history-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="heatmap-history-backdrop" type="button" aria-label="말씀 기록 닫기" onClick={() => dismiss()} />
      <section className="heatmap-history-sheet" role="dialog" aria-modal="true" aria-labelledby="heatmap-history-title">
        <header><div><h2 id="heatmap-history-title">말씀 기록</h2><p>최근 12개월</p></div><button type="button" aria-label="말씀 기록 닫기" onClick={() => dismiss()}><X size={21} /></button></header>
        <div className="heatmap-history-scroll" ref={scrollRef}>
          {activityMonths.map((month) => (
            <article key={month.id}>
              <h3>{month.label}</h3>
              <MonthHeatmapGrid activityMonth={month} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function GrowthChart({ readVerseCount, bibleVerseTotal, readingProgress, readingGrowthData, onRestart }) {
  const [period, setPeriod] = useState('daily');
  const activeData = readingGrowthData[period];
  const values = activeData.items;

  return (
    <section className="growth-panel" aria-label="성장 그래프">
      <header>
        <div><strong>말씀 진도율</strong><span>{readVerseCount.toLocaleString('ko-KR')} / {bibleVerseTotal.toLocaleString('ko-KR')}절</span></div>
        <div className="growth-heading-actions"><b>{readingProgress}%</b><button type="button" onClick={onRestart}><RotateCcw size={14} aria-hidden="true" />처음부터 읽기</button></div>
      </header>
      <div className="growth-chart" style={{ '--growth-columns': values.length }} aria-label={`${activeData.label} 말씀 진도율 그래프`}>
        {values.map((item) => (
          <div className="growth-column" key={item.label}>
            <div><span style={{ '--growth-value': `${item.value}%` }}><i>{item.value}</i></span></div>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
      <div className="growth-period-switch" role="tablist" aria-label="그래프 기간">
        {Object.entries(readingGrowthData).map(([id, item]) => (
          <button type="button" className={period === id ? 'is-active' : ''} role="tab" aria-selected={period === id} key={id} onClick={() => setPeriod(id)}>{item.label}</button>
        ))}
      </div>
    </section>
  );
}

function AchievementPanel({ achievements }) {
  const fullReadingAchievements = achievements
    .filter(({ type }) => type === 'full-reading')
    .sort((left, right) => Number(left.earnedAt) - Number(right.earnedAt));

  return (
    <section className="achievement-panel" aria-label="업적">
      <header>
        <div><Trophy size={18} aria-hidden="true" /><span><strong>업적</strong><small>{fullReadingAchievements.length}개 달성</small></span></div>
      </header>
      <div className="achievement-list">
        {fullReadingAchievements.map((achievement) => (
          <article key={achievement.id}><Award size={18} aria-hidden="true" /><span><strong>{achievement.name}</strong><small>{new Date(achievement.earnedAt).toLocaleDateString('ko-KR')}</small></span></article>
        ))}
        {!fullReadingAchievements.length && <p>아직 획득한 업적이 없어요.</p>}
      </div>
    </section>
  );
}

function PersonalAvatar({ profile, className = 'avatar' }) {
  return (
    <div className={className} aria-hidden="true">
      {profile.avatarImage ? <img src={profile.avatarImage} alt="" /> : <UserRound className="default-profile-glyph" />}
    </div>
  );
}

function SelfProfileEditor({ profile, selectedTranslation, achievements, communities, onClose, onSave }) {
  const [draft, setDraft] = useState(profile);
  const [uploadError, setUploadError] = useState('');
  const [versePickerOpen, setVersePickerOpen] = useState(false);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const nicknameCheck = useMemo(() => validateNickname(draft.nickname ?? '', profile.nickname ?? ''), [draft.nickname, profile.nickname]);

  const loadProfileImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = await readImagePreview(file, 1_500_000);
      setDraft((current) => ({ ...current, avatarImage: preview, _avatarFile: file }));
      setUploadError('');
    } catch (error) {
      setUploadError(error.message);
    }
  };

  const saveProfile = () => {
    const name = draft.name.trim();
    const verseRef = draft.verseRef.trim();
    const representativeVerse = draft.representativeVerse.trim();
    if (name.length < 2 || !verseRef || !representativeVerse || nicknameCheck.state !== 'available') return;
    dismiss(() => onSave({ ...draft, name, nickname: nicknameCheck.normalized, verseRef, representativeVerse }));
  };

  return (
    <div className={`self-profile-editor-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="self-profile-editor-backdrop" type="button" aria-label="프로필 편집 닫기" onClick={() => dismiss()} />
      <section className="self-profile-editor" aria-label="내 프로필 편집">
        <header><h2>프로필 편집</h2><button type="button" aria-label="프로필 편집 닫기" onClick={() => dismiss()}><X size={21} /></button></header>

        <div className="self-profile-photo">
          <PersonalAvatar profile={draft} className="self-profile-avatar" />
          <label className="profile-photo-upload">
            <Camera size={17} aria-hidden="true" />프로필 사진 변경
            <input type="file" accept="image/*" onChange={loadProfileImage} />
          </label>
          {draft.avatarImage && <button type="button" onClick={() => setDraft((current) => ({ ...current, avatarImage: '', avatarPath: '', _avatarFile: null }))}>기본 이미지로 변경</button>}
          {uploadError && <p role="alert">{uploadError}</p>}
        </div>

        <div className="self-profile-fields">
          <label className="profile-name-field">
            <span>이름 <small>모든 사람에게 보여요</small></span>
            <input
              aria-label="표시 이름"
              autoComplete="name"
              maxLength={20}
              value={draft.name ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="표시할 이름"
            />
            {draft.name.trim().length > 0 && draft.name.trim().length < 2 && <em className="is-invalid">이름을 두 글자 이상 입력해 주세요.</em>}
          </label>
          <label className="nickname-field">
            <span>닉네임 <small>친구 추가에 사용돼요</small></span>
            <input
              aria-label="닉네임"
              autoComplete="off"
              maxLength={16}
              value={draft.nickname ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
              placeholder="한글 2~8자"
            />
            <em className={`is-${nicknameCheck.state}`}>{nicknameCheck.message}</em>
          </label>
          <span className="self-profile-field-label">대표 말씀</span>
          <button className="representative-verse-trigger" type="button" onClick={() => setVersePickerOpen(true)}>
            <span><BookOpen size={18} aria-hidden="true" /></span>
            <span><strong>{draft.verseRef}</strong><small><RepresentativeVerseText reference={draft.verseRef} fallbackText={draft.representativeVerse} translationId={selectedTranslation} /></small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <fieldset className="profile-community-picker">
            <legend>대표 공동체 <small>프로필에 표시돼요</small></legend>
            <div>
              <button
                className={!draft.primaryCommunityId ? 'is-selected' : ''}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, primaryCommunityId: '' }))}
              >표시 안 함</button>
              {communities.map((community) => (
                <button
                  className={draft.primaryCommunityId === community.id ? 'is-selected' : ''}
                  type="button"
                  key={community.id}
                  onClick={() => setDraft((current) => ({ ...current, primaryCommunityId: community.id }))}
                >{community.name}<small>{getCommunityTypeLabel(community)}</small></button>
              ))}
            </div>
            {!communities.length && <small>가입한 공동체가 아직 없어요.</small>}
          </fieldset>
          <fieldset className="profile-achievement-picker">
            <legend>프로필에 표시할 업적</legend>
            <div>
              <button
                className={!draft.featuredAchievementId ? 'is-selected' : ''}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, featuredAchievementId: '', featuredAchievementName: '' }))}
              >표시 안 함</button>
              {achievements.map((achievement) => (
                <button
                  className={draft.featuredAchievementId === achievement.id ? 'is-selected' : ''}
                  type="button"
                  key={achievement.id}
                  onClick={() => setDraft((current) => ({
                    ...current,
                    featuredAchievementId: achievement.id,
                    featuredAchievementName: achievement.name,
                  }))}
                ><Award size={14} aria-hidden="true" />{achievement.name}</button>
              ))}
            </div>
            {!achievements.length && <small>획득한 업적이 아직 없어요.</small>}
          </fieldset>
        </div>

        <button className="self-profile-save" type="button" onClick={saveProfile} disabled={draft.name.trim().length < 2 || !draft.verseRef.trim() || !draft.representativeVerse.trim() || nicknameCheck.state !== 'available'}>저장하기</button>
      </section>

      {versePickerOpen && (
        <RepresentativeVersePicker
          currentProfile={draft}
          selectedTranslation={selectedTranslation}
          onClose={() => setVersePickerOpen(false)}
          onSelect={(verse) => {
            setDraft((current) => ({
              ...current,
              verseRef: verse.reference,
              representativeVerse: verse.text,
            }));
            setVersePickerOpen(false);
          }}
        />
      )}

    </div>
  );
}

function RepresentativeVersePicker({ currentProfile, selectedTranslation, onClose, onSelect, title = '대표 말씀 선택' }) {
  const initialBook = bibleBooks.find((book) => currentProfile.verseRef.startsWith(book.name)) ?? bibleBooks.find(({ id }) => id === 'philippians');
  const referenceNumbers = currentProfile.verseRef.match(/(\d+)\s*:\s*(\d+)/);
  const [mode, setMode] = useState('browse');
  const [step, setStep] = useState('book');
  const [testament, setTestament] = useState(initialBook.testament);
  const [draftBookId, setDraftBookId] = useState(initialBook.id);
  const [draftChapter, setDraftChapter] = useState(Number(referenceNumbers?.[1] ?? 1));
  const [draftVerse, setDraftVerse] = useState(Number(referenceNumbers?.[2] ?? 1));
  const [chapterVerses, setChapterVerses] = useState([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const { isClosing, dismiss } = useSlideDismiss(onClose);
  const draftBook = bibleBooks.find(({ id }) => id === draftBookId) ?? initialBook;
  const visibleBooks = bibleBooks.filter((book) => book.testament === testament);

  useEffect(() => {
    if (step !== 'verse') return undefined;
    let active = true;
    setChapterLoading(true);
    loadBibleChapter(selectedTranslation, draftBook.id, draftChapter)
      .then((verses) => {
        if (!active) return;
        setChapterVerses(verses);
        setDraftVerse((current) => Math.min(Math.max(current, 1), verses.length));
        setChapterLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setChapterVerses([]);
        setChapterLoading(false);
      });
    return () => { active = false; };
  }, [draftBook.id, draftChapter, selectedTranslation, step]);

  const updateBook = (bookId) => {
    const nextBook = bibleBooks.find(({ id }) => id === bookId) ?? bibleBooks[0];
    setDraftBookId(nextBook.id);
    setDraftChapter((current) => Math.min(current, nextBook.chapters));
    setDraftVerse(1);
  };

  const changeTestament = (nextTestament) => {
    setTestament(nextTestament);
    if (draftBook.testament === nextTestament) return;
    const firstBook = bibleBooks.find(({ testament: bookTestament }) => bookTestament === nextTestament);
    if (firstBook) updateBook(firstBook.id);
  };

  const moveToNextBrowseStep = () => {
    if (step === 'book') setStep('chapter');
    else if (step === 'chapter') setStep('verse');
    else {
      const selectedVerse = chapterVerses.find(({ verse }) => verse === draftVerse);
      if (selectedVerse) dismiss(() => onSelect({ reference: `${draftBook.name} ${draftChapter}:${selectedVerse.verse}`, text: selectedVerse.text }));
    }
  };

  const goBackBrowseStep = () => {
    if (step === 'verse') setStep('chapter');
    else if (step === 'chapter') setStep('book');
  };

  const searchVerses = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    const results = await searchBibleVerses(selectedTranslation, query, 40);
    setSearchResults(results);
    setSearching(false);
  };

  const wheelItems = step === 'book'
    ? visibleBooks.map((book) => ({ value: book.id, label: book.name }))
    : step === 'chapter'
      ? Array.from({ length: draftBook.chapters }, (_, index) => ({ value: index + 1, label: String(index + 1) }))
      : chapterVerses.map((verse) => ({ value: verse.verse, label: `${verse.verse}절`, meta: verse.text }));
  const wheelValue = step === 'book' ? draftBook.id : step === 'chapter' ? draftChapter : draftVerse;
  const translationLabel = translations.find(({ id }) => id === selectedTranslation)?.label;

  return (
    <div className={`representative-verse-picker-layer ${isClosing ? 'is-closing' : ''}`}>
      <button className="representative-verse-picker-backdrop" type="button" aria-label="대표 말씀 선택 닫기" onClick={() => dismiss()} />
      <section className="representative-verse-picker" role="dialog" aria-modal="true" aria-labelledby="representative-verse-picker-title">
        <header>
          <div>
            {mode === 'browse' && step !== 'book' && <button type="button" aria-label="이전 단계" onClick={goBackBrowseStep}><ChevronLeft size={22} /></button>}
            <div><h2 id="representative-verse-picker-title">{title}</h2><p>{selectedTranslation} · {translationLabel}</p></div>
          </div>
          <button type="button" aria-label="대표 말씀 선택 닫기" onClick={() => dismiss()}><X size={21} /></button>
        </header>

        <div className="verse-picker-mode" role="tablist" aria-label="대표 말씀 탐색 방법">
          <button type="button" className={mode === 'browse' ? 'is-active' : ''} role="tab" aria-selected={mode === 'browse'} onClick={() => setMode('browse')}>성경에서 찾기</button>
          <button type="button" className={mode === 'search' ? 'is-active' : ''} role="tab" aria-selected={mode === 'search'} onClick={() => setMode('search')}>키워드 검색</button>
        </div>

        {mode === 'browse' ? (
          <div className={`representative-verse-browse ${step === 'verse' ? 'is-verse-step' : ''}`}>
            {step === 'book' && (
              <div className="picker-testament-tabs" role="tablist" aria-label="성경 구분">
                {['구약', '신약'].map((item) => (
                  <button className={testament === item ? 'is-active' : ''} type="button" role="tab" aria-selected={testament === item} key={item} onClick={() => changeTestament(item)}>{item}</button>
                ))}
              </div>
            )}
            <div className="representative-verse-step"><span>{step === 'book' ? '성경' : step === 'chapter' ? draftBook.name : `${draftBook.name} ${draftChapter}`}</span><b>{step === 'book' ? '1' : step === 'chapter' ? '2' : '3'} / 3</b></div>
            {chapterLoading ? <p className="verse-picker-status">말씀을 불러오고 있어요.</p> : (
              <PickerWheel
                items={wheelItems}
                value={wheelValue}
                label={`대표 말씀 ${step} Wheel 선택`}
                onChange={(value) => {
                  if (step === 'book') updateBook(value);
                  else if (step === 'chapter') setDraftChapter(Number(value));
                  else setDraftVerse(Number(value));
                }}
              />
            )}
            <button className="picker-confirm-button" type="button" disabled={chapterLoading || wheelItems.length === 0} onClick={moveToNextBrowseStep}>
              {step === 'verse' ? '이 말씀 선택' : '다음'}
            </button>
          </div>
        ) : (
          <div className="representative-verse-search">
            <form onSubmit={searchVerses}>
              <label><Search size={18} aria-hidden="true" /><input aria-label="말씀 키워드 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="평안, 사랑, 두려움..." />{query && <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(''); setSearchResults([]); }}><X size={16} /></button>}</label>
              <button type="submit" disabled={!query.trim() || searching}>{searching ? '검색 중' : '검색'}</button>
            </form>
            <div className="representative-verse-results">
              {searchResults.map((verse) => (
                <button type="button" key={`${verse.bookId}-${verse.chapter}-${verse.verse}`} onClick={() => dismiss(() => onSelect(verse))}>
                  <strong>{verse.reference}</strong><p><HighlightedMessage text={verse.text} query={query.trim().toLowerCase()} /></p>
                </button>
              ))}
              {!searching && query.trim() && searchResults.length === 0 && <p className="verse-picker-status">검색 결과가 없어요.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Section({ title, action, onClick, children }) {
  const ActionIcon = action === '편집' ? PenLine : ChevronRight;
  return (
    <section className="section-block" aria-label={title}>
      {action && (
        <div className="section-action-row">
          <button className="section-icon-action" type="button" aria-label={action} title={action} onClick={onClick}>
            <ActionIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {children}
    </section>
  );
}

function ListSurface({ children }) {
  return <div className="list-surface">{children}</div>;
}

function ListRow({ icon: Icon, title, description, action, onClick, selected }) {
  const content = (
    <>
      <span className="row-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="row-text"><strong>{title}</strong>{description && <small>{description}</small>}</span>
      {action ? <span className="row-action">{action}</span> : <ChevronRight size={18} aria-hidden="true" />}
    </>
  );
  if (onClick) {
    return <button className={`list-row ${selected ? 'is-selected' : ''}`} type="button" onClick={onClick}>{content}</button>;
  }
  return <div className={`list-row ${selected ? 'is-selected' : ''}`}>{content}</div>;
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ProgressBar({ value }) {
  return <div className="progress-track" aria-label={`진행률 ${value}%`}><span style={{ width: `${value}%` }} /></div>;
}

function QuickAction({ icon: Icon, label }) {
  return <button className="quick-action" type="button"><span><Icon size={21} aria-hidden="true" /></span><strong>{label}</strong></button>;
}

function PostCard({ post }) {
  return (
    <article className="post-card">
      <div className="post-head">
        <div className="post-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></div>
        <div><strong>{post.author}</strong><span>{post.group} · {post.time}</span></div>
        <button className="icon-button tiny" type="button" aria-label="게시물 메뉴"><MoreHorizontal size={18} aria-hidden="true" /></button>
      </div>
      <span className="reference-label">{post.ref}</span>
      <p>{post.text}</p>
      <button className="reaction-button" type="button"><ThumbsUp size={16} aria-hidden="true" /> 공감 {post.reactions}</button>
    </article>
  );
}

function RoadmapRow({ item }) {
  return (
    <div className={`roadmap-row ${item.state}`}>
      <span className="roadmap-day">{item.day}</span>
      <div><strong>{item.label}</strong><small>{item.helper}</small></div>
      {item.state === 'done' && <Check size={18} aria-label="완료" />}
      {item.state === 'active' && <Play size={17} fill="currentColor" aria-label="오늘" />}
      {item.state === 'next' && <ChevronRight size={18} aria-hidden="true" />}
    </div>
  );
}

async function bootstrapApplication() {
  let session = null;
  try {
    session = await getCurrentSession();
  } catch {
    // A cached guest session remains usable when Supabase is temporarily unreachable.
  }

  const userId = session?.user?.id ?? null;
  initializePersistenceScope(userId);
  if (shouldAskToImportGuestData(userId)) {
    const shouldImport = window.confirm(
      '이 기기에서 로그인 전에 만든 개인 기록이 있어요. 메모, 읽음 기록, 강조와 개인 설정을 이 계정으로 가져올까요?\n\n기존 공동체, 친구, 대화와 권한 데이터는 가져오지 않습니다.'
    );
    if (shouldImport) importGuestAccountData(userId);
    else keepGuestAccountDataSeparate(userId);
  }

  const isOnboardingRoute = window.location.pathname.replace(/\/$/, '') === '/onboarding';
  document.body.classList.toggle('onboarding-body', isOnboardingRoute);
  document.title = isOnboardingRoute ? '회원가입 | 바이블온' : '바이블온 초안';
  createRoot(document.getElementById('root')).render(isOnboardingRoute ? <OnboardingApp /> : <App />);
}

void bootstrapApplication();
