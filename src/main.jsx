import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  BellOff,
  Bookmark,
  Camera,
  Check,
  Circle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Flame,
  Grid3X3,
  Highlighter,
  Home,
  Image as ImageIcon,
  List,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  NotebookPen,
  PenLine,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  ThumbsUp,
  Trash2,
  Underline,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  Waves,
  X,
  Ban,
} from 'lucide-react';
import { BibleOnLogo, BibleBookIcon as BookOpen, ChurchCrossIcon as Church, SixteenthNoteIcon } from './brandIcons';
import { bibleCatalog, loadBibleChapter, preloadBible, searchBibleVerses } from './bibleData';
import OnboardingApp from './OnboardingApp';
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

const translations = [
  { id: 'KRV', label: '개역개정' },
  { id: 'RNKSV', label: '새번역' },
];

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
  members: 428,
  notice: '이번 주 셀모임은 예배 후 2층 라운지에서 모입니다.',
};

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
  },
  {
    id: 'notice-church',
    type: '교회 공지',
    title: '셀모임 장소 안내',
    body: '예배 후 2층 라운지에서 모입니다.',
    time: '28분 전',
    icon: Bell,
    unread: true,
  },
  {
    id: 'notice-service',
    type: '교회 업데이트',
    title: '이번 주 예배 정보',
    body: '예배 말씀과 찬양 순서가 등록됐어요.',
    time: '1시간 전',
    icon: Church,
    unread: true,
  },
  {
    id: 'notice-roadmap',
    type: '말씀 로드맵',
    title: '오늘의 말씀',
    body: '시편 23편을 천천히 읽어보세요.',
    time: '오늘 오전 7:00',
    icon: BookOpen,
    unread: false,
  },
  {
    id: 'notice-qt',
    type: 'QT 나눔',
    title: '새로운 공감',
    body: '재윤님이 온유님의 QT에 공감했어요.',
    time: '어제',
    icon: ThumbsUp,
    unread: false,
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
  })),
  ...churchDirectoryMembers,
].sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));

function getConversationParticipantIds(conversation) {
  return conversation.participantIds ?? [conversation.id];
}

function getConversationParticipants(participantIds) {
  return churchMessageMembers
    .filter((member) => participantIds.includes(member.id))
    .sort((first, second) => first.name.localeCompare(second.name, 'ko-KR'));
}

function getConversationDetails(participantIds, customName = '') {
  const participants = getConversationParticipants(participantIds);
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
  { id: 'church', label: '교회', icon: Church },
  { id: 'home', label: '홈', icon: Home },
  { id: 'messages', label: '메시지', icon: MessageCircle },
  { id: 'profile', label: '개인', icon: UserRound },
];

function readStoredValue(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current session still keeps the data when browser storage is unavailable.
  }
}

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
  const appShellRef = useRef(null);
  const workspaceRef = useRef(null);
  const initialHomeChatRoomsRef = useRef(null);
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
  const [activeTab, setActiveTab] = useState('home');
  const [selectedBookId, setSelectedBookId] = useState('philippians');
  const [selectedChapter, setSelectedChapter] = useState(4);
  const [selectedTranslation, setSelectedTranslation] = useState('KRV');
  const [selectedRef, setSelectedRef] = useState('빌립보서 4:6');
  const [favoriteRefs] = useState(['시편 23:1']);
  const [readVerseIds, setReadVerseIds] = useState([
    'genesis-1-1',
    'genesis-1-2',
    'philippians-4-4',
    'philippians-4-5',
  ]);
  const [query, setQuery] = useState('불안');
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState(communityPosts);
  const [conversations, setConversations] = useState(initialChurchConversations);
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
  const [verseNotes, setVerseNotes] = useState(() => readStoredValue('bibleon.verseNotes', {}));
  const [verseHighlights, setVerseHighlights] = useState(() => (
    normalizeVerseHighlights(readStoredValue('bibleon.highlightedVerses', {}))
  ));
  const [lastHighlightStyle, setLastHighlightStyle] = useState(() => (
    normalizeHighlightStyle(readStoredValue('bibleon.lastHighlightStyle', defaultHighlightStyle))
  ));

  const selectedBook = bibleBooks.find((book) => book.id === selectedBookId) ?? bibleBooks[0];
  const activeHomeChat = homeChatRooms.find((room) => (
    room.id === activeHomeChatId && !room.deletedAt
  ));
  const homeRagMessages = activeHomeChat?.messages ?? [];
  useHeavyOverscroll(appShellRef);

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
    }, 1800);
    const settleTimerId = window.setTimeout(() => setIsHomeReturning(false), 2800);

    return () => {
      window.clearTimeout(returnTimerId);
      window.clearTimeout(settleTimerId);
    };
  }, [isAppLoading]);

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
    writeStoredValue('bibleon.verseNotes', verseNotes);
  }, [verseNotes]);

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
    writeStoredValue(HOME_CHAT_STORAGE_KEY, homeChatRooms);
    writeStoredValue(HOME_CHAT_ACTIVE_KEY, activeHomeChatId);
    try {
      window.localStorage.removeItem(HOME_CHAT_LEGACY_KEY);
    } catch {
      // The migrated chat remains available in the current session when storage is unavailable.
    }
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
        <Topbar
          activeTab={activeTab}
          selectedTranslation={selectedTranslation}
          setSelectedTranslation={setSelectedTranslation}
          onOpenChatHistory={() => setHomeChatHistoryOpen(true)}
          onOpenMessageFriends={() => setMessageFriendsMenuOpen(true)}
        />
        {activeTab === 'home' && (
          <HomeView
            selectedBook={selectedBook}
            selectedChapter={selectedChapter}
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
            readVerseIds={readVerseIds}
            setReadVerseIds={setReadVerseIds}
            verseNotes={verseNotes}
            setVerseNotes={setVerseNotes}
            verseHighlights={verseHighlights}
            setVerseHighlights={setVerseHighlights}
            lastHighlightStyle={lastHighlightStyle}
            setLastHighlightStyle={setLastHighlightStyle}
          />
        )}
        {activeTab === 'church' && (
          <ChurchView
            posts={posts}
            newPost={newPost}
            setNewPost={setNewPost}
            addQtPost={addQtPost}
            selectedRef={selectedRef}
          />
        )}
        {activeTab === 'messages' && (
          <MessageView
            conversations={conversations}
            setConversations={setConversations}
            friendsMenuOpen={messageFriendsMenuOpen}
            onCloseFriendsMenu={() => setMessageFriendsMenuOpen(false)}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileView
            personalProfile={personalProfile}
            setPersonalProfile={setPersonalProfile}
            selectedTranslation={selectedTranslation}
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
    </main>
  );
}

function Topbar({ activeTab, selectedTranslation, setSelectedTranslation, onOpenChatHistory, onOpenMessageFriends }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialRecentNotifications);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [churchAlerts, setChurchAlerts] = useState(true);
  const unreadCount = notifications.filter(({ unread }) => unread).length;

  const markNotificationRead = (notificationId) => {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, unread: false } : notification
    )));
  };

  const openSettings = () => {
    setNotificationOpen(false);
    setSettingsOpen(true);
  };

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
              onClick={() => setNotificationOpen((current) => !current)}
            >
              <Bell size={20} aria-hidden="true" />
              {unreadCount > 0 && <span aria-hidden="true" />}
            </button>
            {notificationOpen && (
              <>
                <button className="notification-dismiss-layer" type="button" aria-label="알림 닫기" onClick={() => setNotificationOpen(false)} />
                <section className="notification-popover" aria-label="최근 알림">
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
                        onRead={() => markNotificationRead(notification.id)}
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

      {settingsOpen && (
        <div className="global-settings-layer">
          <button className="global-settings-backdrop" type="button" aria-label="설정 닫기" onClick={() => setSettingsOpen(false)} />
          <aside className="global-settings-drawer" aria-label="설정">
            <header>
              <h2>설정</h2>
              <button type="button" aria-label="설정 닫기" onClick={() => setSettingsOpen(false)}><X size={22} aria-hidden="true" /></button>
            </header>

            <section className="settings-profile">
              <span className="member-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
              <div><strong>김온유</strong><small>{churchInfo.name} · {churchInfo.department}</small></div>
              <ChevronRight size={19} aria-hidden="true" />
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
              <h3>알림</h3>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={messageAlerts}
                onClick={() => setMessageAlerts((current) => !current)}
              >
                <span><MessageCircle size={20} aria-hidden="true" /><span><strong>메시지 알림</strong><small>교회 구성원의 새 메시지</small></span></span>
                <i className={messageAlerts ? 'is-on' : ''}><b /></i>
              </button>
              <button
                className="settings-toggle-row"
                type="button"
                role="switch"
                aria-checked={churchAlerts}
                onClick={() => setChurchAlerts((current) => !current)}
              >
                <span><Church size={20} aria-hidden="true" /><span><strong>교회 알림</strong><small>공지와 예배 정보 업데이트</small></span></span>
                <i className={churchAlerts ? 'is-on' : ''}><b /></i>
              </button>
            </section>

            <section className="settings-group settings-link-list">
              <h3>계정 및 서비스</h3>
              <button type="button"><span><UserRound size={20} /><strong>계정 관리</strong></span><ChevronRight size={18} /></button>
              <button type="button"><span><ShieldCheck size={20} /><strong>개인정보 및 보안</strong></span><ChevronRight size={18} /></button>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function NotificationSwipeItem({ notification, onRead, onDelete }) {
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
          else onRead();
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
  const sortedChatRooms = useMemo(() => (
    [...chatRooms].sort((first, second) => second.updatedAt - first.updatedAt)
  ), [chatRooms]);
  const pendingDeleteRoom = chatRooms.find(({ id }) => id === pendingDeleteId);

  useEffect(() => {
    if (!isOpen) setPendingDeleteId('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="home-chat-history-layer">
      <button className="home-chat-history-backdrop" type="button" aria-label="지난 대화 닫기" onClick={onClose} />
      <aside className="home-chat-history" aria-label="지난 대화">
        <header>
          <div><Menu size={20} aria-hidden="true" /><h2>지난 대화</h2></div>
          <div>
            <button
              type="button"
              aria-label="새 대화"
              title="새 대화"
              onClick={() => {
                onStartNewChat();
                onClose();
              }}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <button type="button" aria-label="지난 대화 닫기" onClick={onClose}>
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
                  onOpenChat(room.id);
                  onClose();
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
    <nav className="bottom-nav" aria-label="하단 메뉴">
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

function HomeView({
  selectedBook,
  selectedChapter,
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
}) {
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
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
          <form className="home-rag-search" role="search" onSubmit={submitQuestion}>
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
              <button className="today-reading" type="button" aria-labelledby="today-reading-title" onClick={continueCurrentReading}>
                <div className="today-reading-head">
                  <div>
                    <span className="eyebrow">성경 이어서 읽기</span>
                    <h2 id="today-reading-title">{selectedBook.name} {selectedChapter}장</h2>
                    <p>{selectedBook.title} · {selectedBook.lastRead}</p>
                  </div>
                  <span className="progress-number">{selectedBook.progress}%</span>
                </div>
                <ProgressBar value={selectedBook.progress} />
              </button>

              <section className="church-context">
                <div className="church-context-mark"><Church size={22} aria-hidden="true" /></div>
                <div>
                  <span>내 교회</span>
                  <strong>{churchInfo.name}</strong>
                  <small>{churchInfo.department} · {churchInfo.role}</small>
                </div>
                <ChevronRight size={19} aria-hidden="true" />
              </section>

              <HomeRecommendations
                query={query}
                setQuery={setQuery}
                selectBiblePassage={selectBiblePassage}
                favoriteRefs={favoriteRefs}
              />
            </div>
          </section>
        </div>
      </div>

      {isChatOpen && (
        <section className="home-rag-chat" aria-label="바이블온 대화" aria-live="polite">
          <div className="home-chat-toolbar">
            <strong>{activeChatTitle}</strong>
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
    </div>
  );
}

function PickerWheel({ items, value, onChange, label }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector(`[data-wheel-value="${value}"]`);
    if (!list || !selected) return;
    list.scrollTo({
      top: selected.offsetTop - ((list.clientHeight - selected.offsetHeight) / 2),
      behavior: 'auto',
    });
  }, [items.length, label]);

  const syncCenteredItem = () => {
    const list = listRef.current;
    if (!list) return;
    const center = list.scrollTop + (list.clientHeight / 2);
    const options = Array.from(list.querySelectorAll('[data-wheel-value]'));
    const closest = options.reduce((current, option) => {
      const distance = Math.abs((option.offsetTop + (option.offsetHeight / 2)) - center);
      return !current || distance < current.distance ? { option, distance } : current;
    }, null);
    const nextValue = closest?.option.dataset.wheelValue;
    if (nextValue !== undefined && String(value) !== nextValue) onChange(nextValue);
  };

  const selectItem = (event, nextValue) => {
    const list = listRef.current;
    const item = event.currentTarget;
    onChange(String(nextValue));
    list?.scrollTo({
      top: item.offsetTop - ((list.clientHeight - item.offsetHeight) / 2),
      behavior: 'smooth',
    });
  };

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
  const [testament, setTestament] = useState(initialBook.testament);
  const [draftBookId, setDraftBookId] = useState(initialBook.id);
  const [draftChapter, setDraftChapter] = useState(selectedChapter);
  const draftBook = bibleBooks.find((book) => book.id === draftBookId) ?? initialBook;
  const visibleBooks = bibleBooks.filter((book) => book.testament === testament);
  const chapters = Array.from({ length: draftBook.chapters }, (_, index) => index + 1);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const updateDraftBook = (bookId) => {
    const nextBook = bibleBooks.find((book) => book.id === bookId) ?? bibleBooks[0];
    setDraftBookId(nextBook.id);
    setDraftChapter((current) => Math.min(current, nextBook.chapters));
  };

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
    onSelect(draftBook.id, Number(value));
  };

  const confirmWheelValue = () => {
    if (step === 'book') {
      setStep('chapter');
      return;
    }
    onSelect(draftBook.id, draftChapter);
  };

  const wheelItems = step === 'book'
    ? visibleBooks.map((book) => ({ value: book.id, label: book.name, meta: `${book.chapters}장` }))
    : chapters.map((chapter) => ({ value: chapter, label: `${chapter}장` }));
  const wheelValue = step === 'book' ? draftBook.id : draftChapter;

  return (
    <div
      className="passage-picker-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
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
            <button type="button" aria-label="성경 선택 닫기" title="닫기" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        {step === 'book' && (
          <div className="picker-testament-tabs" role="tablist" aria-label="성경 구분">
            {['구약', '신약'].map((item) => (
              <button
                className={testament === item ? 'is-active' : ''}
                key={item}
                type="button"
                role="tab"
                aria-selected={testament === item}
                onClick={() => changeTestament(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'wheel' ? (
          <>
            <PickerWheel
              items={wheelItems}
              value={wheelValue}
              label={step === 'book' ? '성경 Wheel 선택' : `${draftBook.name} 장 Wheel 선택`}
              onChange={(value) => {
                if (step === 'book') updateDraftBook(value);
                else setDraftChapter(Number(value));
              }}
            />
            <button className="picker-confirm-button" type="button" onClick={confirmWheelValue}>
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
          </div>
        )}
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
  verseHighlights,
  setVerseHighlights,
  lastHighlightStyle,
  setLastHighlightStyle,
}) {
  const [selectedVerse, setSelectedVerse] = useState(null);
  const [highlightPickerVerseId, setHighlightPickerVerseId] = useState('');
  const [highlightDraft, setHighlightDraft] = useState(lastHighlightStyle);
  const [chapterState, setChapterState] = useState({ status: 'loading', verses: [] });
  const [noteSheet, setNoteSheet] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isPassagePickerOpen, setIsPassagePickerOpen] = useState(false);
  const [recentPassages] = useState(() => {
    const stored = readStoredValue('bibleon.recentPassages', defaultRecentPassages);
    return Array.isArray(stored) ? stored.slice(0, 7) : defaultRecentPassages;
  });
  const longPressTimerRef = useRef(null);
  const pressGestureRef = useRef(null);
  const swipeGestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    setSelectedVerse(null);
    setHighlightPickerVerseId('');
    setNoteSheet(null);

    setChapterState({ status: 'loading', verses: [] });
    loadBibleChapter(selectedTranslation, selectedBook.id, selectedChapter)
      .then((verses) => {
        if (isCurrent) setChapterState({ status: 'ready', verses });
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
    const stored = readStoredValue('bibleon.recentPassages', defaultRecentPassages);
    const current = Array.isArray(stored) ? stored : defaultRecentPassages;
    const nextPassage = { bookId: selectedBook.id, chapter: selectedChapter };
    const next = [
      nextPassage,
      ...current.filter((item) => (
        item.bookId !== nextPassage.bookId || item.chapter !== nextPassage.chapter
      )),
    ].slice(0, 7);
    writeStoredValue('bibleon.recentPassages', next);
  }, [selectedBook.id, selectedChapter]);

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
    setHighlightPickerVerseId('');
    setNoteSheet(null);
  };

  const moveChapter = (direction) => {
    const nextChapter = Math.min(selectedBook.chapters, Math.max(1, selectedChapter + direction));
    if (nextChapter === selectedChapter) return;
    setSelectedVerse(null);
    setHighlightPickerVerseId('');
    setNoteSheet(null);
    setSelectedChapter(nextChapter);
  };

  const markRead = (verseId) => {
    setReadVerseIds((current) => current.includes(verseId) ? current : [...current, verseId]);
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

  const openNoteEditor = (verse) => {
    setSelectedVerse(null);
    setHighlightPickerVerseId('');
    setNoteDraft(verseNotes[verse.id] ?? '');
    setNoteSheet({ mode: 'edit', verse });
  };

  const updateNote = (verseId, value) => {
    setNoteDraft(value);
    setVerseNotes((current) => {
      const next = { ...current };
      if (value.trim()) next[verseId] = value;
      else delete next[verseId];
      return next;
    });
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
      markRead(verse.id);
      setSelectedRef(verse.ref);
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
    setHighlightPickerVerseId('');
    setSelectedVerse((current) => current === verse.id ? null : verse.id);
    setSelectedRef(verse.ref);
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
  }, []);

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
      <section className="recent-reading" aria-label="최근 읽은 성경">
        <div className="recent-reading-list">
          {recentPassages.map((passage) => {
            const book = bibleBooks.find((item) => item.id === passage.bookId);
            if (!book) return null;
            const isActive = selectedBookId === book.id && selectedChapter === passage.chapter;
            return (
              <button
                className={`recent-reading-item ${isActive ? 'is-active' : ''}`}
                key={`${book.id}-${passage.chapter}`}
                type="button"
                onClick={() => selectPassage(book.id, passage.chapter)}
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
          type="button"
          aria-haspopup="dialog"
          onClick={() => setIsPassagePickerOpen(true)}
        >
          <Search className="passage-search-icon" size={18} aria-hidden="true" />
          <span>
            <strong>{selectedBook.name}</strong>
            <small>{selectedChapter}장</small>
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
            <button className="icon-button small" type="button" aria-label="본문 메뉴" title="본문 메뉴">
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
            <div className="reader-progress" aria-label={`${chapterProgress}% 읽음`}>
              <ProgressBar value={chapterProgress} />
              <span>{chapterProgress}%</span>
            </div>
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
            const hasNote = Boolean(verseNotes[verse.id]?.trim());
            const highlight = verseHighlights[verse.id];
            const isHighlighted = Boolean(highlight);
            return (
              <React.Fragment key={verse.id}>
                {verse.headings.map((heading, index) => (
                  <h3 className="bible-section-heading" key={`${verse.id}-heading-${index}`}>
                    {heading.text}
                  </h3>
                ))}
                <div className={`verse-wrap ${isSelected ? 'is-selected' : ''}`}>
                  <button
                    className="verse-row"
                    type="button"
                    title="0.5초 이상 누르면 읽음으로 표시됩니다"
                    onContextMenu={(event) => event.preventDefault()}
                    onPointerDown={(event) => handleVersePointerDown(event, verse)}
                    onPointerUp={(event) => handleVersePointerUp(event, verse)}
                    onPointerCancel={cancelReaderGesture}
                    onClick={() => handleVerseClick(verse)}
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
                  {isSelected && (
                    <div className="verse-actions" aria-label={`${verse.ref} 동작`}>
                      <span>{verse.ref}</span>
                      <button className={hasNote ? 'is-on' : ''} type="button" onClick={() => openNoteEditor(verse)}>
                        <NotebookPen size={16} aria-hidden="true" />{hasNote ? '메모 수정' : '메모'}
                      </button>
                      <button className={isHighlighted ? 'is-on' : ''} type="button" onClick={() => handleHighlightButton(verse.id)}>
                        <Highlighter size={16} aria-hidden="true" />{isHighlighted ? '강조 해제' : '강조'}
                      </button>
                      {highlightPickerVerseId === verse.id && (
                        <div className="highlight-popover" role="dialog" aria-label={`${verse.ref} 강조 설정`}>
                        <div className="highlight-method-row" aria-label="강조 방식">
                          {highlightMethodOptions.map((option) => {
                            const MethodIcon = option.icon;
                            const isActive = highlightDraft.method === option.id;
                            return (
                              <button
                                className={isActive ? 'is-active' : ''}
                                type="button"
                                key={option.id}
                                aria-pressed={isActive}
                                title={option.label}
                                onClick={() => setHighlightDraft((current) => ({ ...current, method: option.id }))}
                              >
                                <MethodIcon size={15} aria-hidden="true" /><span>{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="highlight-color-row" aria-label="강조 색상">
                          {highlightColorOptions.map((option) => {
                            const isActive = highlightDraft.color === option.id;
                            return (
                              <button
                                className={`highlight-color-${option.id} ${isActive ? 'is-active' : ''}`}
                                type="button"
                                key={option.id}
                                aria-label={option.label}
                                aria-pressed={isActive}
                                title={option.label}
                                onClick={() => setHighlightDraft((current) => ({ ...current, color: option.id }))}
                              >
                                {isActive && <Check size={13} aria-hidden="true" />}
                              </button>
                            );
                          })}
                          <button className="highlight-apply" type="button" onClick={() => applyHighlight(verse.id)}>적용</button>
                        </div>
                        </div>
                      )}
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

      {noteSheet && (
        <div
          className="memo-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setNoteSheet(null);
          }}
        >
          <section className="memo-sheet" role="dialog" aria-modal="true" aria-labelledby="memo-sheet-title">
            <header className="memo-sheet-header">
              <div>
                <span>{noteSheet.verse.ref}</span>
                <h2 id="memo-sheet-title">{noteSheet.mode === 'edit' ? '말씀 메모' : '저장된 메모'}</h2>
              </div>
              <button className="icon-button tiny" type="button" aria-label="메모 닫기" onClick={() => setNoteSheet(null)}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            {noteSheet.mode === 'edit' ? (
              <>
                <textarea
                  autoFocus
                  className="memo-textarea"
                  aria-label={`${noteSheet.verse.ref} 메모`}
                  value={noteDraft}
                  onChange={(event) => updateNote(noteSheet.verse.id, event.target.value)}
                  placeholder="마음에 남은 생각을 적어보세요"
                />
                <footer className="memo-sheet-footer">
                  <span>입력한 내용은 자동으로 저장돼요</span>
                  <button className="memo-done-button" type="button" onClick={() => setNoteSheet(null)}>완료</button>
                </footer>
              </>
            ) : (
              <>
                <p className="memo-preview">{verseNotes[noteSheet.verse.id]}</p>
                <button
                  className="memo-edit-button"
                  type="button"
                  onClick={() => {
                    setNoteDraft(verseNotes[noteSheet.verse.id] ?? '');
                    setNoteSheet((current) => ({ ...current, mode: 'edit' }));
                  }}
                >
                  <NotebookPen size={17} aria-hidden="true" />메모 수정
                </button>
              </>
            )}
          </section>
        </div>
      )}

    </div>
  );
}

function ChurchView({ posts, newPost, setNewPost, addQtPost, selectedRef }) {
  return (
    <div className="page-stack">
      <section className="church-summary">
        <div className="church-summary-head">
          <span className="church-avatar"><Church size={25} aria-hidden="true" /></span>
          <div><span>나의 교회</span><h2>{churchInfo.name}</h2><p>{churchInfo.department} · 교인 {churchInfo.members}명</p></div>
        </div>
        <div className="summary-metrics">
          <Metric label="새 소식" value="3" />
          <Metric label="QT 나눔" value={`${posts.length}`} />
          <Metric label="이번 주 예배" value="2" />
        </div>
      </section>

      <section className="quick-grid" aria-label="교회 바로가기">
        <QuickAction icon={MessageCircle} label="커뮤니티" />
        <QuickAction icon={PenLine} label="QT" />
        <QuickAction icon={ClipboardList} label="예배 준비" />
        <QuickAction icon={Users} label="부서" />
      </section>

      <Section title="이번 주 예배">
        <div className="service-panel">
          <div className="service-date"><span>9월</span><strong>6</strong><small>주일</small></div>
          <div className="service-copy">
            <span>{weeklyPlan.service}</span>
            <h3>{weeklyPlan.theme}</h3>
            <p>{weeklyPlan.passage} · {weeklyPlan.time}</p>
          </div>
          <button className="icon-button small" type="button" aria-label="예배 정보 열기">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <ListSurface>
          <ListRow icon={BookOpen} title={weeklyPlan.passage} description={weeklyPlan.theme} action="본문" />
          <ListRow icon={SixteenthNoteIcon} title={weeklyPlan.hymn} description="이번 주 찬양" action="듣기" />
        </ListSurface>
      </Section>

      <Section title="교회 소식" action="전체보기">
        <ListSurface>
          <ListRow icon={Bell} title={churchInfo.notice} description={`${churchInfo.pastor} · 오늘`} />
        </ListSurface>
      </Section>

      <Section title="QT 나눔" action="전체보기">
        <div className="composer">
          <div className="composer-head"><span>{selectedRef}</span><small>{churchInfo.department}에 공개</small></div>
          <textarea
            aria-label="QT 나눔 작성"
            value={newPost}
            onChange={(event) => setNewPost(event.target.value)}
            placeholder="오늘 마음에 남은 말씀을 적어보세요"
          />
          <button className="primary-button composer-submit" type="button" onClick={addQtPost} disabled={!newPost.trim()}>등록</button>
        </div>
        <div className="feed-list">
          {posts.map((post, index) => <PostCard post={post} key={`${post.author}-${post.time}-${index}`} />)}
        </div>
      </Section>
    </div>
  );
}

function HomeRecommendations({ query, setQuery, selectBiblePassage, favoriteRefs }) {
  const prompts = ['불안', '감사', '회복', '관계'];
  const recommendations = useMemo(() => {
    const normalized = query.trim();
    return bibleBooks
      .map((book) => ({
        ...book,
        score: book.tags.some((tag) => normalized.includes(tag) || tag.includes(normalized)) ? 2 : 0,
      }))
      .sort((a, b) => b.score - a.score || b.progress - a.progress)
      .slice(0, 3);
  }, [query]);

  return (
    <>
      <section className="roadmap-spotlight">
        <div className="roadmap-spotlight-head"><span className="eyebrow light">오늘의 로드맵</span><span>2 / 5일</span></div>
        <h2>마음이 지칠 때 읽는 말씀</h2>
        <p>오늘은 시편 23편을 천천히 읽어요.</p>
        <button className="light-button" type="button" onClick={() => selectBiblePassage('psalms', 23)}>
          오늘 말씀 선택<ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      <Section title="이번 주 로드맵" action="편집">
        <div className="roadmap-list">{roadmap.map((item) => <RoadmapRow item={item} key={item.day} />)}</div>
      </Section>

      <Section title="마음에 맞는 말씀 찾기">
        <label className="search-box">
          <Search size={19} aria-hidden="true" />
          <input aria-label="말씀 추천 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지금 마음이나 고민을 적어보세요" />
        </label>
        <div className="chip-row">
          {prompts.map((prompt) => (
            <button className={query === prompt ? 'chip is-active' : 'chip'} type="button" key={prompt} onClick={() => setQuery(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <ListSurface>
          {recommendations.map((book) => (
            <ListRow
              key={book.id}
              icon={favoriteRefs.some((ref) => ref.startsWith(book.name)) ? Bookmark : BookOpen}
              title={`${book.name} ${book.chapter}장`}
              description={`${book.title} · ${book.tags.slice(0, 2).join(', ')}`}
              action="선택"
              onClick={() => selectBiblePassage(book.id, book.chapter)}
            />
          ))}
        </ListSurface>
      </Section>

      <Section title="오늘의 찬양">
        <ListSurface>
          {hymns.map((hymn) => (
            <ListRow key={hymn.title} icon={SixteenthNoteIcon} title={hymn.title} description={`${hymn.tone} · ${hymn.duration}`} action="재생" />
          ))}
        </ListSurface>
      </Section>

      <section className="premium-strip">
        <div><span>바이블온 플러스</span><strong>개인화 말씀 분석과 맞춤 로드맵</strong></div>
        <span>월 1,500원</span>
      </section>
    </>
  );
}

function MessageView({ conversations, setConversations, friendsMenuOpen, onCloseFriendsMenu }) {
  const [directoryMode, setDirectoryMode] = useState('recent');
  const [openConversationId, setOpenConversationId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);
  const [groupBuilderOpen, setGroupBuilderOpen] = useState(false);
  const [draftConversation, setDraftConversation] = useState(null);
  const [friendIds, setFriendIds] = useState(() => readStoredValue('bibleon.friendIds', ['minseo', 'jaeyun', 'eunji']));
  const [blockedFriendIds, setBlockedFriendIds] = useState(() => readStoredValue('bibleon.blockedFriendIds', []));
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState(() => readStoredValue('bibleon.sentFriendRequestIds', []));
  const storedOpenConversation = conversations.find(({ id }) => id === openConversationId);
  const openConversation = storedOpenConversation
    ?? (draftConversation?.id === openConversationId ? draftConversation : null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((conversation) => (
    [
      conversation.name,
      conversation.department,
      conversation.role,
      conversation.lastMessage,
      ...getConversationParticipants(getConversationParticipantIds(conversation)).map(({ name }) => name),
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
  const filteredDirectoryMembers = churchDirectoryMembers.filter((member) => (
    !recentConversationIds.has(member.id)
    && [member.name, member.department, member.role]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));

  useEffect(() => writeStoredValue('bibleon.friendIds', friendIds), [friendIds]);
  useEffect(() => writeStoredValue('bibleon.blockedFriendIds', blockedFriendIds), [blockedFriendIds]);
  useEffect(() => writeStoredValue('bibleon.sentFriendRequestIds', sentFriendRequestIds), [sentFriendRequestIds]);

  const selectConversation = (conversationId) => {
    setDraftConversation(null);
    setOpenConversationId(conversationId);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
    )));
  };

  const openDraftConversation = (members, customName = '') => {
    const participantIds = members
      .map(({ id }) => id)
      .sort((firstId, secondId) => {
        const first = churchMessageMembers.find(({ id }) => id === firstId);
        const second = churchMessageMembers.find(({ id }) => id === secondId);
        return first.name.localeCompare(second.name, 'ko-KR');
      });
    const conversation = {
      id: `draft-${Date.now()}-${participantIds.join('-')}`,
      ...getConversationDetails(participantIds, customName),
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
    const currentParticipants = getConversationParticipants(currentParticipantIds);
    setDraftConversation(null);
    openDraftConversation([...currentParticipants, ...invitedMembers], customName);
  };

  const closeConversation = () => {
    setOpenConversationId('');
    setDraftConversation(null);
  };

  const persistDraftConversation = (conversation) => {
    const { isDraft, ...persistedConversation } = conversation;
    setConversations((current) => [persistedConversation, ...current]);
    setDraftConversation(null);
    setOpenConversationId(persistedConversation.id);
  };

  return (
    <div className="message-layout">
      <section className="message-directory" aria-label="교회 메시지">
        <div className="message-directory-toolbar">
          <div className="message-view-switch" role="tablist" aria-label="메시지 목록 구분">
            <button
              className={directoryMode === 'members' ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={directoryMode === 'members'}
              onClick={() => setDirectoryMode('members')}
            >
              구성원
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
            aria-label={directoryMode === 'recent' ? '최근 대화 검색' : '구성원 검색'}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={directoryMode === 'recent' ? '최근 대화 검색' : '구성원 검색'}
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
        ) : (
          <div className="member-directory-list">
            {filteredDirectoryMembers.map((member) => (
              <button
                className="member-directory-row"
                type="button"
                key={member.id}
                onClick={() => setSelectedMemberProfile(member)}
              >
                <span className={`directory-avatar tone-${member.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <span className="member-directory-copy">
                  <span><strong>{member.name}</strong><small>{member.department} · {member.role}</small></span>
                  <p><BookOpen size={13} aria-hidden="true" /><span>{member.verseRef}</span>{member.representativeVerse}</p>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
            {filteredDirectoryMembers.length === 0 && <p className="message-empty">검색 결과가 없어요.</p>}
          </div>
        )}
      </section>

      {selectedMemberProfile && (
        <MemberProfileSheet
          member={selectedMemberProfile}
          onClose={() => setSelectedMemberProfile(null)}
          onMessage={() => startMemberConversation(selectedMemberProfile)}
        />
      )}

      {groupBuilderOpen && (
        <MemberSelectionSheet
          title="단체 채팅 만들기"
          description="함께 대화할 구성원을 선택하세요"
          candidates={churchMessageMembers}
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
}) {
  const [mode, setMode] = useState('root');
  const [friendAddOpen, setFriendAddOpen] = useState(false);
  const friendMembers = churchMessageMembers.filter(({ id }) => friendIds.includes(id));
  const blockedMembers = churchMessageMembers.filter(({ id }) => blockedFriendIds.includes(id));

  useEffect(() => {
    if (!isOpen) {
      setMode('root');
      setFriendAddOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const removeFriend = (memberId) => {
    setFriendIds((current) => current.filter((id) => id !== memberId));
  };

  const blockFriend = (memberId) => {
    removeFriend(memberId);
    setBlockedFriendIds((current) => [...new Set([...current, memberId])]);
  };

  const unblockFriend = (memberId) => {
    setBlockedFriendIds((current) => current.filter((id) => id !== memberId));
  };

  const panelTitle = mode === 'delete' ? '친구 삭제' : mode === 'blocked' ? '차단 관리' : '친구 관리';

  return (
    <div className="message-friends-layer">
      <button className="message-friends-backdrop" type="button" aria-label="친구 관리 닫기" onClick={onClose} />
      <aside className="message-friends-panel" aria-label={panelTitle}>
        <header>
          {mode !== 'root' && (
            <button type="button" aria-label="친구 관리 메뉴로 돌아가기" onClick={() => setMode('root')}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          )}
          <h2>{panelTitle}</h2>
          <button type="button" aria-label="친구 관리 닫기" onClick={onClose}><X size={21} aria-hidden="true" /></button>
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
        />
      )}
    </div>
  );
}

function FriendAddSheet({ friendIds, blockedFriendIds, sentFriendRequestIds, setSentFriendRequestIds, onClose }) {
  const [nickname, setNickname] = useState('');
  const [matchedMember, setMatchedMember] = useState(null);
  const [searchMessage, setSearchMessage] = useState('');
  const normalizedNickname = nickname.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');

  const findFriend = (event) => {
    event.preventDefault();
    const match = churchMessageMembers.find((member) => (
      member.nickname.normalize('NFKC').toLocaleLowerCase('ko-KR') === normalizedNickname
    ));
    setMatchedMember(match ?? null);
    setSearchMessage(match ? '' : '일치하는 닉네임을 찾지 못했어요.');
  };

  const requestFriend = () => {
    if (!matchedMember) return;
    setSentFriendRequestIds((current) => [...new Set([...current, matchedMember.id])]);
  };

  const isFriend = matchedMember && friendIds.includes(matchedMember.id);
  const isBlocked = matchedMember && blockedFriendIds.includes(matchedMember.id);
  const requestSent = matchedMember && sentFriendRequestIds.includes(matchedMember.id);

  return (
    <div className="friend-add-layer">
      <button className="friend-add-backdrop" type="button" aria-label="친구 추가 닫기" onClick={onClose} />
      <section className="friend-add-sheet" role="dialog" aria-modal="true" aria-labelledby="friend-add-title">
        <header><div><h2 id="friend-add-title">친구 추가</h2><p>닉네임은 띄어쓰기 없이 정확히 입력해 주세요</p></div><button type="button" aria-label="친구 추가 닫기" onClick={onClose}><X size={21} /></button></header>
        <form className="friend-nickname-search" onSubmit={findFriend}>
          <label><Search size={18} aria-hidden="true" /><input autoFocus aria-label="친구 닉네임" value={nickname} onChange={(event) => { setNickname(event.target.value); setMatchedMember(null); setSearchMessage(''); }} placeholder="친구의 닉네임" /></label>
          <button type="submit" disabled={!normalizedNickname}>찾기</button>
        </form>

        {searchMessage && <p className="friend-search-message" role="status">{searchMessage}</p>}
        {matchedMember && (
          <article className="friend-search-result">
            <span className={`directory-avatar tone-${matchedMember.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
            <div className="friend-result-heading"><strong>{matchedMember.name}</strong><span>@{matchedMember.nickname}</span><small>{matchedMember.department} · {matchedMember.role}</small></div>
            <blockquote><BookOpen size={16} aria-hidden="true" /><p>{matchedMember.representativeVerse}</p><cite>{matchedMember.verseRef}</cite></blockquote>
            <button type="button" disabled={isFriend || isBlocked || requestSent} onClick={requestFriend}>
              {isBlocked ? '차단 해제 후 신청 가능' : isFriend ? '이미 친구예요' : requestSent ? '친구 신청을 보냈어요' : '친구 신청'}
            </button>
          </article>
        )}
      </section>
    </div>
  );
}

function MemberProfileSheet({ member, onClose, onMessage }) {
  return (
    <div className="member-profile-layer">
      <button className="member-profile-backdrop" type="button" aria-label="프로필 닫기" onClick={onClose} />
      <section className="member-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="member-profile-name">
        <button className="member-profile-close" type="button" aria-label="프로필 닫기" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className={`member-profile-avatar tone-${member.tone}`} aria-hidden="true"><UserRound className="default-profile-glyph" /></div>
        <div className="member-profile-heading">
          <span>{churchInfo.name}</span>
          <h2 id="member-profile-name">{member.name}</h2>
        </div>
        <blockquote className="member-profile-verse">
          <BookOpen size={19} aria-hidden="true" />
          <p>{member.representativeVerse}</p>
          <cite>{member.verseRef}</cite>
        </blockquote>
        <dl className="member-profile-meta">
          <div><dt>부서</dt><dd>{member.department}</dd></div>
          <div><dt>직책</dt><dd>{member.role}</dd></div>
        </dl>
        {onMessage && (
          <button className="member-profile-message" type="button" onClick={onMessage}>
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
  confirmLabel,
  onClose,
  onConfirm,
}) {
  const [query, setQuery] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [step, setStep] = useState('members');
  const [previewMember, setPreviewMember] = useState(null);
  const profileHoldTimerRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCandidates = candidates.filter((member) => (
    [member.name, member.department, member.role]
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
    onConfirm(selectedMembers, '');
  };

  return (
    <div className="member-picker-layer">
      <button className="member-picker-backdrop" type="button" aria-label={`${title} 닫기`} onClick={onClose} />
      {step === 'members' ? (
        <section className="member-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="member-picker-title">
          <header>
            <div><h2 id="member-picker-title">{title}</h2><p>{description}</p></div>
            <button type="button" aria-label={`${title} 닫기`} onClick={onClose}><X size={21} aria-hidden="true" /></button>
          </header>

          {selectedMembers.length > 0 && (
            <section className="selected-member-strip" aria-label={`선택한 구성원 ${selectedMembers.length}명`}>
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
                aria-label="구성원 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="구성원 검색"
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
                  <span><strong>{member.name}</strong><small>{member.department} · {member.role}</small></span>
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
              <button type="button" aria-label="구성원 선택으로 돌아가기" onClick={() => setStep('members')}><ChevronLeft size={22} /></button>
              <div><h2 id="member-picker-name-title">채팅방 이름 설정</h2><p>모든 참여자에게 같은 이름으로 표시돼요</p></div>
            </div>
            <button type="button" aria-label="채팅방 이름 설정 닫기" onClick={onClose}><X size={21} aria-hidden="true" /></button>
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
              onClick={() => onConfirm(selectedMembers, roomName.trim())}
            >
              채팅방 만들기
            </button>
          </footer>
        </section>
      )}

      {previewMember && (
        <MemberProfileSheet member={previewMember} onClose={() => setPreviewMember(null)} />
      )}
    </div>
  );
}

function MessageRoom({ conversation, setConversations, onBack, onPersistDraft, onUpdateDraft, onCreateGroup }) {
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
  const baseViewportHeightRef = useRef(window.visualViewport?.height ?? window.innerHeight);
  const keyboardHeightRef = useRef(Math.min(320, Math.round(window.innerHeight * 0.38)));
  const participantIds = getConversationParticipantIds(conversation);
  const participants = getConversationParticipants(participantIds);
  const inviteCandidates = churchMessageMembers.filter(({ id }) => !participantIds.includes(id));
  const normalizedMessageQuery = messageQuery.trim().toLowerCase();
  const visibleMessages = normalizedMessageQuery
    ? conversation.messages.filter((message) => message.text.toLowerCase().includes(normalizedMessageQuery))
    : conversation.messages;
  const roomTitle = conversation.customName || getConversationDetails(participantIds).name;

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [attachmentOpen, conversation.messages.length, searchOpen]);

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
        },
      ],
    });
    if (conversation.isDraft) onPersistDraft(appendMessage(conversation));
    else updateConversation(appendMessage);
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

  const sendSelectedFile = (kind, files) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const additionalCount = selectedFiles.length > 1 ? ` 외 ${selectedFiles.length - 1}개` : '';
    appendOutgoingMessage(`${kind} · ${selectedFiles[0].name}${additionalCount}`);
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
        ...getConversationDetails(nextParticipantIds, current.customName),
        participantIds: nextParticipantIds,
        participantJoinedAt,
        messages: [
          ...current.messages,
          { id: `${current.id}-invite-${Date.now()}`, from: 'system', text: `${invitedNames}님을 대화에 초대했어요.`, time: '방금' },
        ],
      };
    });
    setInviteOpen(false);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setMessageQuery('');
  };

  return (
    <section
      className="message-room-screen"
      aria-label={`${roomTitle} 대화방`}
      style={{ '--message-viewport-height': `${roomViewport.height}px`, '--message-viewport-top': `${roomViewport.top}px` }}
    >
      <header className={`message-room-header ${searchOpen ? 'is-searching' : ''}`}>
        {searchOpen ? (
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
              <div><strong>{roomTitle}</strong><span>{participants.length}명</span></div>
            </div>
            <div className="message-room-actions">
              <button className="chat-icon-button" type="button" aria-label="대화 검색" onClick={() => { setAttachmentOpen(false); setSearchOpen(true); }}>
                <Search size={21} aria-hidden="true" />
              </button>
              <button className="chat-icon-button" type="button" aria-label="대화방 메뉴" onClick={() => setMenuOpen(true)}>
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
        {visibleMessages.map((message) => (
          message.from === 'system' ? (
            <p className="message-system" key={message.id}>{message.text}</p>
          ) : (
            <div className={`message-bubble-row ${message.from === 'me' ? 'is-me' : 'is-them'}`} key={message.id}>
              <p><HighlightedMessage text={message.text} query={normalizedMessageQuery} /></p>
              <span className="message-bubble-meta">
                {message.unreadByCount > 0 && (
                  <b aria-label={`대화 참여자 ${message.unreadByCount}명이 읽지 않음`}>
                    {message.unreadByCount}
                  </b>
                )}
                <time>{message.time}</time>
              </span>
            </div>
          )
        ))}
        {normalizedMessageQuery && visibleMessages.length === 0 && <p className="message-search-empty">일치하는 메시지가 없어요.</p>}
      </div>

      {!searchOpen && (
        <form className={`message-composer ${attachmentOpen ? 'is-attachment-open' : ''}`} onSubmit={sendMessage}>
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

      {!searchOpen && attachmentOpen && (
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

      {menuOpen && (
        <div className="chat-menu-layer">
          <button className="chat-menu-backdrop" type="button" aria-label="대화방 메뉴 닫기" onClick={() => setMenuOpen(false)} />
          <aside className="chat-menu-panel" aria-label="대화방 메뉴">
            <header><h2>대화방 설정</h2><button type="button" aria-label="대화방 메뉴 닫기" onClick={() => setMenuOpen(false)}><X size={21} /></button></header>

            <section className="chat-menu-section">
              <div className="chat-menu-section-title"><strong>대화 상대</strong><span>{participants.length}명</span></div>
              <div className="chat-participant-list">
                {participants.map((participant) => (
                  <div className="chat-participant" key={participant.id}>
                    <span className="member-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                    <div><strong>{participant.name}</strong><small>{participant.department} · {participant.role}</small></div>
                  </div>
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
            : '새 구성원은 초대 이후의 대화만 볼 수 있어요'}
          candidates={inviteCandidates}
          roomNameEnabled={participantIds.length === 1}
          confirmLabel={(count) => `${count}명 초대`}
          onClose={() => setInviteOpen(false)}
          onConfirm={inviteParticipants}
        />
      )}
    </section>
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

const growthData = {
  daily: {
    label: '일간',
    points: ['월', '화', '수', '목', '금', '토', '일'],
    progress: [42, 68, 55, 81, 76, 90, 64],
    attendance: [0, 0, 0, 0, 0, 0, 100],
  },
  weekly: {
    label: '주간',
    points: ['1주', '2주', '3주', '4주', '5주', '6주'],
    progress: [48, 55, 63, 71, 68, 79],
    attendance: [100, 100, 0, 100, 100, 100],
  },
  monthly: {
    label: '월간',
    points: ['4월', '5월', '6월', '7월', '8월', '9월'],
    progress: [39, 51, 58, 66, 72, 78],
    attendance: [75, 100, 75, 100, 100, 100],
  },
};

function ProfileView({ personalProfile, setPersonalProfile, selectedTranslation }) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [heatmapHistoryOpen, setHeatmapHistoryOpen] = useState(false);
  const [showStreakNotice, setShowStreakNotice] = useState(false);
  const activityMonth = useMemo(() => buildMonthActivity(), []);

  useEffect(() => {
    const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    if (readStoredValue('bibleon.profileStreakNoticeDate', '') === todayKey) return undefined;
    writeStoredValue('bibleon.profileStreakNoticeDate', todayKey);
    setShowStreakNotice(true);
    const timerId = window.setTimeout(() => setShowStreakNotice(false), 1000);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <div className="page-stack profile-page">
      {showStreakNotice && <div className="profile-streak-toast" role="status">
        <span><Flame size={16} aria-hidden="true" /></span>
        <div><strong>7일 연속 읽기</strong><small>오늘도 말씀을 이어가고 있어요</small></div>
        <em>최고 12일</em>
      </div>}

      <button className="profile-summary profile-summary-button" type="button" onClick={() => setProfileEditorOpen(true)}>
        <PersonalAvatar profile={personalProfile} />
        <div className="profile-copy">
          <span>{churchInfo.name}</span>
          <h2>{personalProfile.name}</h2>
          <p>@{personalProfile.nickname} · {churchInfo.department}</p>
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

      <GrowthChart />

      {heatmapHistoryOpen && <HeatmapHistorySheet onClose={() => setHeatmapHistoryOpen(false)} />}

      {profileEditorOpen && (
        <SelfProfileEditor
          profile={personalProfile}
          selectedTranslation={selectedTranslation}
          onClose={() => setProfileEditorOpen(false)}
          onSave={(nextProfile) => {
            setPersonalProfile(nextProfile);
            setProfileEditorOpen(false);
          }}
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
    <div className="heatmap-history-layer">
      <button className="heatmap-history-backdrop" type="button" aria-label="말씀 기록 닫기" onClick={onClose} />
      <section className="heatmap-history-sheet" role="dialog" aria-modal="true" aria-labelledby="heatmap-history-title">
        <header><div><h2 id="heatmap-history-title">말씀 기록</h2><p>최근 12개월</p></div><button type="button" aria-label="말씀 기록 닫기" onClick={onClose}><X size={21} /></button></header>
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

function GrowthChart() {
  const [period, setPeriod] = useState('daily');
  const [metric, setMetric] = useState('progress');
  const activeData = growthData[period];
  const values = activeData[metric];
  const metricLabel = metric === 'progress' ? '말씀 진도율' : '예배 참석률';
  const latestValue = values.at(-1);

  return (
    <section className="growth-panel" aria-label="성장 그래프">
      <header>
        <div><strong>{metricLabel}</strong><span>최근 {activeData.label} 기록</span></div>
        <b>{latestValue}%</b>
      </header>
      <div className="growth-metric-switch" role="tablist" aria-label="성장 지표">
        <button type="button" className={metric === 'progress' ? 'is-active' : ''} role="tab" aria-selected={metric === 'progress'} onClick={() => setMetric('progress')}>말씀 진도율</button>
        <button type="button" className={metric === 'attendance' ? 'is-active' : ''} role="tab" aria-selected={metric === 'attendance'} onClick={() => setMetric('attendance')}>예배 참석률</button>
      </div>
      <div className="growth-chart" style={{ '--growth-columns': values.length }} aria-label={`${activeData.label} ${metricLabel} 그래프`}>
        {values.map((value, index) => (
          <div className="growth-column" key={activeData.points[index]}>
            <div><span style={{ '--growth-value': `${value}%` }}><i>{value}</i></span></div>
            <small>{activeData.points[index]}</small>
          </div>
        ))}
      </div>
      <div className="growth-period-switch" role="tablist" aria-label="그래프 기간">
        {Object.entries(growthData).map(([id, item]) => (
          <button type="button" className={period === id ? 'is-active' : ''} role="tab" aria-selected={period === id} key={id} onClick={() => setPeriod(id)}>{item.label}</button>
        ))}
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

function SelfProfileEditor({ profile, selectedTranslation, onClose, onSave }) {
  const [draft, setDraft] = useState(profile);
  const [uploadError, setUploadError] = useState('');
  const [versePickerOpen, setVersePickerOpen] = useState(false);
  const nicknameCheck = useMemo(() => validateNickname(draft.nickname ?? '', profile.nickname ?? ''), [draft.nickname, profile.nickname]);

  const loadProfileImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setUploadError('1.5MB 이하의 이미지를 선택해 주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({ ...current, avatarImage: String(reader.result) }));
      setUploadError('');
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = () => {
    const verseRef = draft.verseRef.trim();
    const representativeVerse = draft.representativeVerse.trim();
    if (!verseRef || !representativeVerse || nicknameCheck.state !== 'available') return;
    onSave({ ...draft, nickname: nicknameCheck.normalized, verseRef, representativeVerse });
  };

  return (
    <div className="self-profile-editor-layer">
      <button className="self-profile-editor-backdrop" type="button" aria-label="프로필 편집 닫기" onClick={onClose} />
      <section className="self-profile-editor" aria-label="내 프로필 편집">
        <header><h2>프로필 편집</h2><button type="button" aria-label="프로필 편집 닫기" onClick={onClose}><X size={21} /></button></header>

        <div className="self-profile-photo">
          <PersonalAvatar profile={draft} className="self-profile-avatar" />
          <label className="profile-photo-upload">
            <Camera size={17} aria-hidden="true" />프로필 사진 변경
            <input type="file" accept="image/*" onChange={loadProfileImage} />
          </label>
          {draft.avatarImage && <button type="button" onClick={() => setDraft((current) => ({ ...current, avatarImage: '' }))}>기본 이미지로 변경</button>}
          {uploadError && <p role="alert">{uploadError}</p>}
        </div>

        <div className="self-profile-fields">
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
            <span><strong>{draft.verseRef}</strong><small>{draft.representativeVerse}</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <button className="self-profile-save" type="button" onClick={saveProfile} disabled={!draft.verseRef.trim() || !draft.representativeVerse.trim() || nicknameCheck.state !== 'available'}>저장하기</button>
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

function RepresentativeVersePicker({ currentProfile, selectedTranslation, onClose, onSelect }) {
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
      if (selectedVerse) onSelect({ reference: `${draftBook.name} ${draftChapter}:${selectedVerse.verse}`, text: selectedVerse.text });
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
    ? visibleBooks.map((book) => ({ value: book.id, label: book.name, meta: `${book.chapters}장` }))
    : step === 'chapter'
      ? Array.from({ length: draftBook.chapters }, (_, index) => ({ value: index + 1, label: `${index + 1}장` }))
      : chapterVerses.map((verse) => ({ value: verse.verse, label: `${verse.verse}절`, meta: verse.text }));
  const wheelValue = step === 'book' ? draftBook.id : step === 'chapter' ? draftChapter : draftVerse;
  const translationLabel = translations.find(({ id }) => id === selectedTranslation)?.label;

  return (
    <div className="representative-verse-picker-layer">
      <button className="representative-verse-picker-backdrop" type="button" aria-label="대표 말씀 선택 닫기" onClick={onClose} />
      <section className="representative-verse-picker" role="dialog" aria-modal="true" aria-labelledby="representative-verse-picker-title">
        <header>
          <div>
            {mode === 'browse' && step !== 'book' && <button type="button" aria-label="이전 단계" onClick={goBackBrowseStep}><ChevronLeft size={22} /></button>}
            <div><h2 id="representative-verse-picker-title">대표 말씀 선택</h2><p>{selectedTranslation} · {translationLabel}</p></div>
          </div>
          <button type="button" aria-label="대표 말씀 선택 닫기" onClick={onClose}><X size={21} /></button>
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
            <div className="representative-verse-step"><span>{step === 'book' ? '성경' : step === 'chapter' ? draftBook.name : `${draftBook.name} ${draftChapter}장`}</span><b>{step === 'book' ? '1' : step === 'chapter' ? '2' : '3'} / 3</b></div>
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
                <button type="button" key={`${verse.bookId}-${verse.chapter}-${verse.verse}`} onClick={() => onSelect(verse)}>
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

const isOnboardingRoute = window.location.pathname.replace(/\/$/, '') === '/onboarding';
document.body.classList.toggle('onboarding-body', isOnboardingRoute);
document.title = isOnboardingRoute ? '회원가입 | 바이블온' : '바이블온 초안';

createRoot(document.getElementById('root')).render(isOnboardingRoute ? <OnboardingApp /> : <App />);
