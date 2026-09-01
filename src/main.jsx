import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  BellOff,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flame,
  Grid3X3,
  Highlighter,
  Home,
  List,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  PenLine,
  Play,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { BibleOnLogo, BibleBookIcon as BookOpen, ChurchCrossIcon as Church, SixteenthNoteIcon } from './brandIcons';
import { bibleCatalog, loadKrvChapter } from './bibleData';
import { homeQuestionSuggestions } from './ragPrototype';
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
  { id: 'KRV', label: '개역한글' },
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

const profileItems = [
  { icon: UserRound, title: '프로필 설정', description: '이름, 소속 부서, 공개 범위' },
  { icon: Bell, title: '알림 설정', description: '예배, QT, 커뮤니티 알림' },
  { icon: ShieldCheck, title: '프리미엄', description: '로드맵과 개인화 추천 사용 중' },
  { icon: Settings, title: '앱 설정', description: '번역본, 글자 크기, 접근성' },
];

const defaultPersonalProfile = {
  name: '김온유',
  avatarImage: '',
  verseRef: '빌립보서 4:13',
  representativeVerse: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.',
};

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
      { id: 'j2', from: 'me', text: '확인해 볼게요. 감사합니다.', time: '어제 오후 8:20' },
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
    department: '청년부',
    role: '셀원',
    verseRef: '이사야 41:10',
    representativeVerse: '두려워하지 말라 내가 너와 함께 함이라.',
    tone: 'green',
  },
  {
    id: 'doyun',
    name: '최도윤',
    department: '장년부',
    role: '순장',
    verseRef: '여호수아 1:9',
    representativeVerse: '강하고 담대하라. 네 하나님 여호와가 너와 함께 하느니라.',
    tone: 'blue',
  },
  {
    id: 'seoyeon',
    name: '한서연',
    department: '찬양팀',
    role: '팀 리더',
    verseRef: '시편 119:105',
    representativeVerse: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다.',
    tone: 'rose',
  },
  {
    id: 'jihoon',
    name: '오지훈',
    department: '미디어팀',
    role: '팀원',
    verseRef: '로마서 12:12',
    representativeVerse: '소망 중에 즐거워하며 기도에 항상 힘쓰라.',
    tone: 'gold',
  },
  {
    id: 'yerim',
    name: '윤예림',
    department: '아동부',
    role: '교사',
    verseRef: '빌립보서 4:13',
    representativeVerse: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.',
    tone: 'violet',
  },
  {
    id: 'subin',
    name: '강수빈',
    department: '새가족부',
    role: '안내팀',
    verseRef: '마태복음 5:16',
    representativeVerse: '너희 빛이 사람 앞에 비치게 하라.',
    tone: 'teal',
  },
];

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

function App() {
  const workspaceRef = useRef(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
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
  const [homeRagMessages, setHomeRagMessages] = useState(() => (
    readStoredValue('bibleon.homeTestMessagesV2', [])
  ));
  const [personalProfile, setPersonalProfile] = useState(() => ({
    ...defaultPersonalProfile,
    ...readStoredValue('bibleon.personalProfile', {}),
  }));
  const [verseNotes, setVerseNotes] = useState(() => readStoredValue('bibleon.verseNotes', {}));
  const [highlightedVerseIds, setHighlightedVerseIds] = useState(() =>
    readStoredValue('bibleon.highlightedVerses', [])
  );

  const selectedBook = bibleBooks.find((book) => book.id === selectedBookId) ?? bibleBooks[0];

  useEffect(() => {
    const timerId = window.setTimeout(() => setIsAppLoading(false), 1050);
    return () => window.clearTimeout(timerId);
  }, []);

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
    if (tabId === 'home') {
      setActiveTab('home');
      closeHomeChat();
      return;
    }
    setIsHomeChatOpen(false);
    setActiveTab(tabId);
  };

  useEffect(() => {
    writeStoredValue('bibleon.verseNotes', verseNotes);
  }, [verseNotes]);

  useEffect(() => {
    writeStoredValue('bibleon.highlightedVerses', highlightedVerseIds);
  }, [highlightedVerseIds]);

  useEffect(() => {
    writeStoredValue('bibleon.personalProfile', personalProfile);
  }, [personalProfile]);

  useEffect(() => {
    writeStoredValue('bibleon.homeTestMessagesV2', homeRagMessages);
  }, [homeRagMessages]);

  const addQtPost = () => {
    const text = newPost.trim();
    if (!text) return;
    setPosts((current) => [
      { author: '나', group: churchInfo.department, ref: selectedRef, text, time: '방금', reactions: 0 },
      ...current,
    ]);
    setNewPost('');
  };

  return (
    <main className="app-shell" aria-busy={isAppLoading}>
      {isAppLoading && (
        <div className="app-loading-screen" role="status" aria-label="바이블온 불러오는 중">
          <BibleOnLogo className="app-loading-logo" variant="white" size={120} aria-hidden="true" />
          <span className="app-loading-progress" aria-hidden="true"><i /></span>
        </div>
      )}
      <section className="workspace" aria-label="바이블온 앱" ref={workspaceRef}>
        <Topbar
          selectedTranslation={selectedTranslation}
          setSelectedTranslation={setSelectedTranslation}
        />
        {activeTab === 'home' && (
          <HomeView
            selectedBook={selectedBook}
            selectedChapter={selectedChapter}
            readCount={readVerseIds.length}
            query={query}
            setQuery={setQuery}
            selectBiblePassage={selectBiblePassage}
            continueCurrentReading={continueCurrentReading}
            favoriteRefs={favoriteRefs}
            ragMessages={homeRagMessages}
            setRagMessages={setHomeRagMessages}
            isChatOpen={isHomeChatOpen}
            openChat={() => setIsHomeChatOpen(true)}
            closeChat={closeHomeChat}
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
            highlightedVerseIds={highlightedVerseIds}
            setHighlightedVerseIds={setHighlightedVerseIds}
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
          <MessageView conversations={conversations} setConversations={setConversations} />
        )}
        {activeTab === 'profile' && (
          <ProfileView
            readCount={readVerseIds.length}
            favoriteCount={favoriteRefs.length}
            personalProfile={personalProfile}
            setPersonalProfile={setPersonalProfile}
          />
        )}
      </section>
      <BottomNav activeTab={activeTab} onSelectTab={selectTab} />
    </main>
  );
}

function Topbar({ selectedTranslation, setSelectedTranslation }) {
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

  return (
    <>
      <header className="topbar">
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
                      {translation.id === 'KRV' ? '개역개정' : '새번역'}
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
    gestureRef.current = { x: event.clientX, y: event.clientY, initialOffset: offset };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event) => {
    if (!gestureRef.current) return;
    const deltaX = event.clientX - gestureRef.current.x;
    const deltaY = event.clientY - gestureRef.current.y;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) > 5) suppressClickRef.current = true;
    setOffset(Math.max(-68, Math.min(0, gestureRef.current.initialOffset + deltaX)));
  };

  const finishPointerGesture = () => {
    if (!gestureRef.current) return;
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
        onPointerCancel={finishPointerGesture}
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

function BottomNav({ activeTab, onSelectTab }) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            className={`nav-item ${activeTab === tab.id ? 'is-active' : ''}`}
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="nav-icon">
              <Icon size={21} strokeWidth={activeTab === tab.id ? 2.5 : 2} aria-hidden="true" />
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
  readCount,
  query,
  setQuery,
  selectBiblePassage,
  continueCurrentReading,
  favoriteRefs,
  ragMessages,
  setRagMessages,
  isChatOpen,
  openChat,
  closeChat,
}) {
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const answerEndRef = useRef(null);
  const homePageRef = useRef(null);
  const homeContentClusterRef = useRef(null);
  const searchContainerRef = useRef(null);
  const questionInputRef = useRef(null);
  const swipeGestureRef = useRef(null);

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
    };

    syncHomeLayout();
    const frameId = window.requestAnimationFrame(syncHomeLayout);
    window.addEventListener('resize', syncHomeLayout);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', syncHomeLayout);
    };
  }, [isChatOpen, question]);

  const askBibleQuestion = async (nextQuestion) => {
    const text = nextQuestion.trim();
    if (!text || isSearching) return;

    const userMessage = { id: `question-${Date.now()}`, role: 'user', text };
    openChat();
    setRagMessages((current) => [...current, userMessage]);
    setQuestion('');
    setIsSearching(true);

    await new Promise((resolve) => window.setTimeout(resolve, 420));
    setRagMessages((current) => [
      ...current,
      {
        id: `answer-${Date.now()}`,
        role: 'assistant',
        text: 'Test 중입니다.',
        citations: [],
      },
    ]);
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
      className={`home-page ${isChatOpen ? 'is-chatting' : ''}`}
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
          <div className="home-question-suggestions" aria-label="추천 질문">
            {homeQuestionSuggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => askBibleQuestion(suggestion)}>{suggestion}</button>
            ))}
          </div>

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

              <Section title="오늘 할 일">
                <ListSurface>
                  <ListRow
                    icon={PenLine}
                    title="오늘의 QT 남기기"
                    description={`${churchInfo.department}에 묵상을 나눠보세요`}
                    action="쓰기"
                  />
                  <ListRow
                    icon={Sparkles}
                    title="말씀 로드맵 확인"
                    description={`이번 주 5일 중 1일 완료 · ${readCount}절 읽음`}
                    action="보기"
                  />
                </ListSurface>
              </Section>

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
            <button type="button" aria-label="새 대화" title="새 대화" onClick={() => setRagMessages([])}>
              <PenLine size={18} aria-hidden="true" />
            </button>
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
  highlightedVerseIds,
  setHighlightedVerseIds,
}) {
  const [selectedVerse, setSelectedVerse] = useState(null);
  const [chapterState, setChapterState] = useState({ status: 'loading', verses: [] });
  const [noteSheet, setNoteSheet] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isPassagePickerOpen, setIsPassagePickerOpen] = useState(false);
  const [recentPassages, setRecentPassages] = useState(() => {
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
    setNoteSheet(null);

    if (selectedTranslation === 'RNKSV') {
      setChapterState({ status: 'license-required', verses: [] });
      return () => {
        isCurrent = false;
      };
    }

    setChapterState({ status: 'loading', verses: [] });
    loadKrvChapter(selectedBook.id, selectedChapter)
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
      id: `${selectedBook.id}-${selectedChapter}-${verse.verse}`,
      ref: `${selectedBook.name} ${selectedChapter}:${verse.verse}`,
    }));
  }, [chapterState.verses, selectedBook.id, selectedBook.name, selectedChapter]);
  const chapterReadCount = activeVerses.filter((verse) => readVerseIds.includes(verse.id)).length;
  const chapterProgress = activeVerses.length
    ? Math.round((chapterReadCount / activeVerses.length) * 100)
    : 0;

  useEffect(() => {
    setRecentPassages((current) => {
      const nextPassage = { bookId: selectedBook.id, chapter: selectedChapter };
      const next = [
        nextPassage,
        ...current.filter((item) => (
          item.bookId !== nextPassage.bookId || item.chapter !== nextPassage.chapter
        )),
      ].slice(0, 7);
      return next;
    });
  }, [selectedBook.id, selectedChapter]);

  useEffect(() => {
    writeStoredValue('bibleon.recentPassages', recentPassages);
  }, [recentPassages]);

  useEffect(() => {
    setSelectedVerse(null);
    setSelectedRef(
      activeVerses.length
        ? `${selectedBook.name} ${selectedChapter}:${activeVerses[0].verse}`
        : `${selectedBook.name} ${selectedChapter}장`
    );
  }, [activeVerses, selectedBook.name, selectedChapter, setSelectedRef]);

  const selectPassage = (bookId, chapter) => {
    const nextBook = bibleBooks.find((book) => book.id === bookId) ?? bibleBooks[0];
    setSelectedBookId(bookId);
    setSelectedChapter(Math.min(nextBook.chapters, Math.max(1, chapter)));
    setSelectedVerse(null);
    setNoteSheet(null);
  };

  const moveChapter = (direction) => {
    const nextChapter = Math.min(selectedBook.chapters, Math.max(1, selectedChapter + direction));
    if (nextChapter === selectedChapter) return;
    setSelectedVerse(null);
    setNoteSheet(null);
    setSelectedChapter(nextChapter);
  };

  const markRead = (verseId) => {
    setReadVerseIds((current) => current.includes(verseId) ? current : [...current, verseId]);
  };

  const toggleHighlight = (verseId) => {
    setHighlightedVerseIds((current) =>
      current.includes(verseId) ? current.filter((item) => item !== verseId) : [...current, verseId]
    );
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
    if (!noteSheet) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNoteSheet(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [noteSheet]);

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
        <div className="reader-progress" aria-label={`${chapterProgress}% 읽음`}>
          <ProgressBar value={chapterProgress} />
          <span>{chapterProgress}%</span>
        </div>
        <header className="reader-header">
          <div>
            <span>{selectedTranslation} · {translations.find((item) => item.id === selectedTranslation)?.label}</span>
            <h2>{selectedBook.name} {selectedChapter}장</h2>
            <p>{selectedTranslation === 'KRV' ? '개역한글 전문' : '원문 데이터 준비 중'}</p>
          </div>
          <button className="icon-button small" type="button" aria-label="본문 메뉴" title="본문 메뉴">
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
        </header>

        {chapterState.status === 'loading' && (
          <div className="chapter-source-empty" role="status">
            <BookOpen size={22} aria-hidden="true" />
            <strong>본문을 불러오고 있어요</strong>
            <p>{selectedBook.name} {selectedChapter}장을 준비하고 있습니다.</p>
          </div>
        )}

        {chapterState.status === 'license-required' && (
          <div className="chapter-source-empty">
            <ShieldCheck size={22} aria-hidden="true" />
            <strong>새번역 원문 데이터 준비 중</strong>
            <p>대한성서공회 사용 허가 후 전달받은 전문을 이 화면에서 바로 제공합니다.</p>
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
            const isHighlighted = highlightedVerseIds.includes(verse.id);
            return (
              <div
                className={`verse-wrap ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                key={verse.id}
              >
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
                    aria-label={`${verse.verse}절, ${isRead ? '읽음' : '읽지 않음'}${hasNote ? ', 메모 있음' : ''}`}
                  >
                    {hasNote && <NotebookPen className="verse-note-indicator" size={10} aria-hidden="true" />}
                    <span>{verse.verse}</span>
                  </span>
                  <span className="verse-copy">{verse.text}</span>
                </button>
                {isSelected && (
                  <div className="verse-actions" aria-label={`${verse.ref} 동작`}>
                    <span>{verse.ref}</span>
                    <button className={hasNote ? 'is-on' : ''} type="button" onClick={() => openNoteEditor(verse)}>
                      <NotebookPen size={16} aria-hidden="true" />{hasNote ? '메모 수정' : '메모'}
                    </button>
                    <button className={isHighlighted ? 'is-on' : ''} type="button" onClick={() => toggleHighlight(verse.id)}>
                      <Highlighter size={16} aria-hidden="true" />{isHighlighted ? '강조 해제' : '강조'}
                    </button>
                  </div>
                )}
              </div>
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
              ? '성경전서 개역한글판 (1961) · 대한성서공회'
              : '성경전서 새번역 · 사용 허가 후 전문 제공'}
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

function MessageView({ conversations, setConversations }) {
  const [directoryMode, setDirectoryMode] = useState('recent');
  const [openConversationId, setOpenConversationId] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);
  const openConversation = conversations.find(({ id }) => id === openConversationId);
  const normalizedQuery = memberQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((conversation) =>
    [conversation.name, conversation.department, conversation.role]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  );
  const recentConversationIds = new Set(conversations.map(({ id }) => id));
  const filteredDirectoryMembers = churchDirectoryMembers.filter((member) => (
    !recentConversationIds.has(member.id)
    && [member.name, member.department, member.role]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  ));

  const selectConversation = (conversationId) => {
    setOpenConversationId(conversationId);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
    )));
  };

  const startMemberConversation = (member) => {
    const existingConversation = conversations.find(({ id }) => id === member.id);
    if (!existingConversation) {
      setConversations((current) => [
        {
          id: member.id,
          name: member.name,
          department: member.department,
          role: member.role,
          online: false,
          unread: 0,
          time: '방금',
          lastMessage: '새 대화를 시작했어요.',
          participantIds: [member.id],
          messages: [
            { id: `${member.id}-start`, from: 'system', text: `${member.name}님과의 대화를 시작했어요.`, time: '방금' },
          ],
        },
        ...current,
      ]);
    }
    setSelectedMemberProfile(null);
    setOpenConversationId(member.id);
  };

  return (
    <div className="message-layout">
      <section className="message-directory" aria-label="교회 메시지">
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
        <label className="message-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="이름 또는 부서 검색"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="이름 또는 부서 검색"
          />
          {memberQuery && (
            <button type="button" aria-label="검색어 지우기" onClick={() => setMemberQuery('')}>
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
                <span className="member-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                <span className="conversation-copy">
                  <span><strong>{conversation.name}</strong><small>{conversation.department} · {conversation.role}</small></span>
                  <p>{conversation.lastMessage}</p>
                </span>
                <span className="conversation-meta">
                  <time>{conversation.time}</time>
                  {conversation.unread > 0 && <b aria-label={`읽지 않은 메시지 ${conversation.unread}개`}>{conversation.unread}</b>}
                </span>
              </button>
            ))}
            {filteredConversations.length === 0 && <p className="message-empty">최근 대화가 없어요.</p>}
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

      {openConversation && (
        <MessageRoom
          conversation={openConversation}
          conversations={conversations}
          setConversations={setConversations}
          onBack={() => setOpenConversationId('')}
        />
      )}
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
        <button className="member-profile-message" type="button" onClick={onMessage}>
          <MessageCircle size={19} aria-hidden="true" />메시지 보내기
        </button>
      </section>
    </div>
  );
}

function MessageRoom({ conversation, conversations, setConversations, onBack }) {
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const searchInputRef = useRef(null);
  const messageListRef = useRef(null);
  const participantIds = conversation.participantIds ?? [conversation.id];
  const participants = conversations.filter(({ id }) => participantIds.includes(id));
  const inviteCandidates = conversations.filter(({ id }) => !participantIds.includes(id));
  const normalizedMessageQuery = messageQuery.trim().toLowerCase();
  const visibleMessages = normalizedMessageQuery
    ? conversation.messages.filter((message) => message.text.toLowerCase().includes(normalizedMessageQuery))
    : conversation.messages;
  const roomTitle = participants.length > 1
    ? `${participants[0].name} 외 ${participants.length - 1}명`
    : conversation.name;

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [conversation.messages.length, searchOpen]);

  const updateConversation = (updater) => {
    setConversations((current) => current.map((item) => (
      item.id === conversation.id ? updater(item) : item
    )));
  };

  const sendMessage = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    updateConversation((current) => ({
      ...current,
      lastMessage: text,
      time: '방금',
      messages: [
        ...current.messages,
        { id: `${current.id}-${Date.now()}`, from: 'me', text, time: '방금' },
      ],
    }));
    setDraft('');
  };

  const inviteParticipant = (candidate) => {
    updateConversation((current) => {
      const currentParticipantIds = current.participantIds ?? [current.id];
      if (currentParticipantIds.includes(candidate.id)) return current;
      return {
        ...current,
        participantIds: [...currentParticipantIds, candidate.id],
        messages: [
          ...current.messages,
          { id: `${current.id}-invite-${candidate.id}`, from: 'system', text: `${candidate.name}님을 대화에 초대했어요.`, time: '방금' },
        ],
      };
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setMessageQuery('');
  };

  return (
    <section className="message-room-screen" aria-label={`${roomTitle} 대화방`}>
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
              <button className="chat-icon-button" type="button" aria-label="대화 검색" onClick={() => setSearchOpen(true)}>
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
              <time>{message.time}</time>
            </div>
          )
        ))}
        {normalizedMessageQuery && visibleMessages.length === 0 && <p className="message-search-empty">일치하는 메시지가 없어요.</p>}
      </div>

      {!searchOpen && (
        <form className="message-composer" onSubmit={sendMessage}>
          <input
            aria-label="메시지 입력"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="메시지를 입력하세요"
          />
          <button type="submit" aria-label="메시지 보내기" disabled={!draft.trim()}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
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
              <button className="chat-invite-button" type="button" onClick={() => setInviteOpen((current) => !current)}>
                <UserPlus size={18} aria-hidden="true" />대화 상대 초대
              </button>
              {inviteOpen && (
                <div className="chat-invite-list">
                  {inviteCandidates.length > 0 ? inviteCandidates.map((candidate) => (
                    <button type="button" key={candidate.id} onClick={() => inviteParticipant(candidate)}>
                      <span className="member-avatar" aria-hidden="true"><UserRound className="default-profile-glyph" /></span>
                      <span><strong>{candidate.name}</strong><small>{candidate.department}</small></span>
                      <i>초대</i>
                    </button>
                  )) : <p>초대할 구성원이 없어요.</p>}
                </div>
              )}
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

function ProfileView({ readCount, favoriteCount, personalProfile, setPersonalProfile }) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  return (
    <div className="page-stack">
      <div className="profile-streak-toast" role="status">
        <span><Flame size={16} aria-hidden="true" /></span>
        <div><strong>7일 연속 읽기</strong><small>오늘도 말씀을 이어가고 있어요</small></div>
        <em>최고 12일</em>
      </div>

      <button className="profile-summary profile-summary-button" type="button" onClick={() => setProfileEditorOpen(true)}>
        <PersonalAvatar profile={personalProfile} />
        <div className="profile-copy">
          <span>{churchInfo.name}</span>
          <h2>{personalProfile.name}</h2>
          <p>{churchInfo.department} · {personalProfile.verseRef}</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      <section className="score-grid">
        <Metric label="이번 달 읽은 절" value={`${readCount}절`} />
        <Metric label="저장한 말씀" value={`${favoriteCount}개`} />
        <Metric label="QT 나눔" value="6개" />
      </section>

      <Section title="최근 12주 말씀 기록" action="전체보기">
        <div className="activity-calendar" aria-label="최근 12주 말씀 읽기 활동">
          <div className="calendar-grid">
            {Array.from({ length: 84 }, (_, index) => {
              const activityValue = (index * 7 + Math.floor(index / 5)) % 10;
              const level = activityValue >= 8 ? 3 : activityValue >= 6 ? 2 : activityValue >= 4 ? 1 : 0;
              return <span className={`level-${level}`} aria-hidden="true" key={index} />;
            })}
          </div>
          <div className="calendar-legend" aria-label="말씀 읽기 활동 강도">
            <span>적음</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>많음</span>
          </div>
        </div>
      </Section>

      <Section title="내 설정">
        <ListSurface>
          {profileItems.map((item) => <ListRow key={item.title} icon={item.icon} title={item.title} description={item.description} />)}
        </ListSurface>
      </Section>

      {profileEditorOpen && (
        <SelfProfileEditor
          profile={personalProfile}
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

function PersonalAvatar({ profile, className = 'avatar' }) {
  return (
    <div className={className} aria-hidden="true">
      {profile.avatarImage ? <img src={profile.avatarImage} alt="" /> : <UserRound className="default-profile-glyph" />}
    </div>
  );
}

function SelfProfileEditor({ profile, onClose, onSave }) {
  const [draft, setDraft] = useState(profile);
  const [uploadError, setUploadError] = useState('');

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

  const saveProfile = (event) => {
    event.preventDefault();
    const verseRef = draft.verseRef.trim();
    const representativeVerse = draft.representativeVerse.trim();
    if (!verseRef || !representativeVerse) return;
    onSave({ ...draft, verseRef, representativeVerse });
  };

  return (
    <div className="self-profile-editor-layer">
      <button className="self-profile-editor-backdrop" type="button" aria-label="프로필 편집 닫기" onClick={onClose} />
      <form className="self-profile-editor" aria-label="내 프로필 편집" onSubmit={saveProfile}>
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
          <label><span>대표 말씀</span><input value={draft.verseRef} onChange={(event) => setDraft((current) => ({ ...current, verseRef: event.target.value }))} placeholder="예: 빌립보서 4:13" /></label>
          <label><span>말씀 내용</span><textarea value={draft.representativeVerse} onChange={(event) => setDraft((current) => ({ ...current, representativeVerse: event.target.value }))} placeholder="대표 말씀을 입력해 주세요" /></label>
        </div>

        <button className="self-profile-save" type="submit" disabled={!draft.verseRef.trim() || !draft.representativeVerse.trim()}>저장하기</button>
      </form>
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
