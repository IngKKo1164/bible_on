export const registeredChurches = [
  {
    id: 'grace-spring',
    name: '은혜샘교회',
    denomination: '대한예수교장로회',
    location: '서울 마포구',
    createdByAdmin: true,
    profileImage: '',
    verseRef: '빌립보서 4:6-7',
    representativeVerse: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로 하나님께 아뢰라.',
  },
  {
    id: 'new-light-central',
    name: '새빛중앙교회',
    denomination: '기독교대한감리회',
    location: '서울 송파구',
    createdByAdmin: true,
    profileImage: '',
    verseRef: '마태복음 5:14',
    representativeVerse: '너희는 세상의 빛이라 산 위에 있는 동네가 숨겨지지 못할 것이요.',
  },
  {
    id: 'green-hill',
    name: '푸른언덕교회',
    denomination: '대한예수교장로회',
    location: '경기 성남시',
    createdByAdmin: true,
    profileImage: '',
    verseRef: '시편 121:1-2',
    representativeVerse: '나의 도움은 천지를 지으신 여호와에게서로다.',
  },
  {
    id: 'joy-community',
    name: '기쁨공동체교회',
    denomination: '한국기독교장로회',
    location: '인천 연수구',
    createdByAdmin: true,
    profileImage: '',
    verseRef: '빌립보서 4:4',
    representativeVerse: '주 안에서 항상 기뻐하라 내가 다시 말하노니 기뻐하라.',
  },
  {
    id: 'one-heart',
    name: '한마음교회',
    denomination: '대한예수교장로회',
    location: '대전 서구',
    createdByAdmin: true,
    profileImage: '',
    verseRef: '에베소서 4:3',
    representativeVerse: '평안의 매는 줄로 성령이 하나 되게 하신 것을 힘써 지키라.',
  },
];

export const CURRENT_CHURCH_STORAGE_KEY = 'bibleon.currentChurchId';
export const CHURCH_PROFILES_STORAGE_KEY = 'bibleon.churchProfilesV1';

export function getRegisteredChurches(profileOverrides = {}) {
  const builtIn = registeredChurches
    .filter(({ createdByAdmin }) => createdByAdmin)
    .map((church) => ({ ...church, ...(profileOverrides[church.id] ?? {}) }));
  const builtInIds = new Set(builtIn.map(({ id }) => id));
  return [
    ...builtIn,
    ...Object.values(profileOverrides).filter((church) => church?.id && !builtInIds.has(church.id)),
  ];
}

export function searchRegisteredChurches(query, profileOverrides = {}) {
  const normalizedQuery = query.trim().replace(/\s+/g, '').toLowerCase();
  if (!normalizedQuery) return [];
  return getRegisteredChurches(profileOverrides).filter((church) => (
    [church.name, church.location, church.denomination]
      .some((value) => value.replace(/\s+/g, '').toLowerCase().includes(normalizedQuery))
  ));
}
