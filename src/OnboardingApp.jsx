import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Search,
} from 'lucide-react';
import { BibleOnLogo, ChurchCrossIcon as Church } from './brandIcons';
import { FaApple } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import { SiKakao, SiNaver } from 'react-icons/si';
import {
  CHURCH_PROFILES_STORAGE_KEY,
  CURRENT_CHURCH_STORAGE_KEY,
  getRegisteredChurches,
  searchRegisteredChurches,
} from './churchData';
import {
  getCurrentSession,
  onAuthStateChange,
  signInWithSocialProvider,
} from './data/repositories/authRepository';
import { readStoredValue, writeStoredValue } from './data/repositories/persistenceRepository';
import { accountRepository } from './data/repositories/accountRepository';
import { churchRepository } from './data/repositories/churchRepository';
import './onboarding.css';

const providers = [
  { id: 'apple', label: 'Apple', Icon: FaApple },
  { id: 'kakao', label: '카카오', Icon: SiKakao },
  { id: 'naver', label: '네이버', Icon: SiNaver },
  { id: 'google', label: 'Google', Icon: FcGoogle },
];

const churchChoices = [
  { id: 'member', label: '다니는 교회가 있어요', helper: '교회를 등록하고 공동체와 연결해요' },
  { id: 'looking', label: '교회를 찾고 있어요', helper: '개인 말씀 생활부터 시작해요' },
  { id: 'personal', label: '개인으로 먼저 시작할게요', helper: '교회는 나중에 등록할 수 있어요' },
];

const interestChoices = ['성경 읽기', 'QT와 묵상', '교회 소식', '예배 준비', '찬양 추천', '말씀 로드맵'];
const paceChoices = [
  { id: '5', label: '가볍게', helper: '하루 5분' },
  { id: '10', label: '꾸준하게', helper: '하루 10분' },
  { id: '20', label: '깊이 있게', helper: '하루 20분 이상' },
];

function OnboardingApp() {
  const [screen, setScreen] = useState('signup');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [authMethod, setAuthMethod] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [formError, setFormError] = useState('');
  const [unregisteredChurchName, setUnregisteredChurchName] = useState('');
  const [churchProfiles] = useState(() => readStoredValue(CHURCH_PROFILES_STORAGE_KEY, {}));
  const [profile, setProfile] = useState({
    churchStatus: '',
    churchId: '',
    churchName: '',
    interests: [],
    pace: '',
  });

  const progress = useMemo(() => ((tutorialStep + 1) / 3) * 100, [tutorialStep]);
  const [churchSuggestions, setChurchSuggestions] = useState([]);

  useEffect(() => {
    const query = profile.churchName.trim();
    if (!query || profile.churchId) {
      setChurchSuggestions([]);
      return undefined;
    }
    let active = true;
    const timerId = window.setTimeout(() => {
      const lookup = authUser && churchRepository.configured
        ? churchRepository.search(query)
        : Promise.resolve(searchRegisteredChurches(query, churchProfiles).slice(0, 4));
      lookup.then((results) => {
        if (active) setChurchSuggestions(results.slice(0, 4));
      }).catch(() => {
        if (active) setChurchSuggestions([]);
      });
    }, 220);
    return () => { active = false; window.clearTimeout(timerId); };
  }, [authUser, churchProfiles, profile.churchId, profile.churchName]);

  useEffect(() => {
    if (!accountRepository.configured) return undefined;
    let active = true;

    const acceptSession = async (session) => {
      if (!active || !session?.user) return;
      const user = session.user;
      setAuthUser(user);
      setAuthMethod(user.app_metadata?.provider ?? 'social');
      try {
        const account = await accountRepository.loadCurrentAccount();
        if (account?.preferences?.onboarding?.completedAt) {
          window.location.replace('/');
          return;
        }
      } catch {
        // The tutorial can still continue from the local account cache.
      }
      setTutorialStep(0);
      setScreen('tutorial');
    };

    getCurrentSession().then(acceptSession).catch(() => {
      if (active) setFormError('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    });
    const unsubscribe = onAuthStateChange((_event, session) => acceptSession(session));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const beginTutorial = (method) => {
    setAuthMethod(method);
    setTutorialStep(0);
    setScreen('tutorial');
  };

  const beginSocialSignup = async (provider) => {
    setFormError('');
    setAuthPending(true);
    try {
      const result = await signInWithSocialProvider(provider);
      if (result.mode === 'preview') beginTutorial(provider);
    } catch (error) {
      setFormError(error?.message || '소셜 로그인을 시작하지 못했어요.');
    } finally {
      setAuthPending(false);
    }
  };

  const goBack = () => {
    if (screen === 'tutorial' && tutorialStep > 0) {
      setTutorialStep((current) => current - 1);
      return;
    }
    if (screen === 'tutorial') setScreen('signup');
  };

  const toggleInterest = (interest) => {
    setProfile((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }));
  };

  const chooseChurchStatus = (status) => {
    setUnregisteredChurchName('');
    setProfile((current) => ({
      ...current,
      churchStatus: status,
      churchId: status === 'member' ? current.churchId : '',
      churchName: status === 'member' ? current.churchName : '',
    }));
  };

  const selectRegisteredChurch = (church) => {
    setUnregisteredChurchName('');
    setProfile((current) => ({
      ...current,
      churchStatus: 'member',
      churchId: church.id,
      churchName: church.name,
    }));
  };

  const searchChurch = async (event) => {
    event.preventDefault();
    const query = profile.churchName.trim().replace(/\s+/g, '').toLowerCase();
    if (!query) return;
    const availableChurches = authUser && churchRepository.configured
      ? await churchRepository.search(query).catch(() => [])
      : getRegisteredChurches(churchProfiles);
    const exactChurch = availableChurches.find(
      (church) => church.name.replace(/\s+/g, '').toLowerCase() === query
    );
    if (exactChurch) {
      selectRegisteredChurch(exactChurch);
      return;
    }
    const searchedName = profile.churchName.trim();
    setUnregisteredChurchName(searchedName);
    setProfile((current) => ({ ...current, churchStatus: 'personal', churchId: '', churchName: '' }));
  };

  const canContinue = tutorialStep === 0
    ? Boolean(profile.churchStatus) && (profile.churchStatus !== 'member' || Boolean(profile.churchId))
    : tutorialStep === 1
      ? profile.interests.length > 0
      : Boolean(profile.pace);

  const advanceTutorial = async () => {
    if (!canContinue) return;
    if (tutorialStep < 2) setTutorialStep((current) => current + 1);
    else {
      setAuthPending(true);
      setFormError('');
      const displayName = authUser?.user_metadata?.display_name
        || authUser?.user_metadata?.full_name
        || authUser?.user_metadata?.name
        || '바이블온 사용자';
      writeStoredValue(CURRENT_CHURCH_STORAGE_KEY, '');
      const savedProfile = readStoredValue('bibleon.personalProfile', {});
      writeStoredValue('bibleon.personalProfile', { ...savedProfile, name: displayName });

      try {
        const answeredAt = new Date().toISOString();
        await accountRepository.saveOnboarding({
          displayName,
          profile: { ...savedProfile, name: displayName },
          onboarding: {
            churchStatus: profile.churchStatus,
            churchId: profile.churchStatus === 'member' ? profile.churchId : '',
            churchName: profile.churchStatus === 'member' ? profile.churchName : '',
            interests: profile.interests,
            pace: profile.pace,
            preferenceSurvey: {
              version: 1,
              interests: profile.interests,
              dailyReadingMinutes: Number(profile.pace),
              answeredAt,
            },
            authMethod,
            completedAt: answeredAt,
          },
        });
        if (authUser && profile.churchStatus === 'member' && profile.churchId) {
          const membershipStatus = await churchRepository.requestMembership(profile.churchId);
          if (membershipStatus === 'active') writeStoredValue(CURRENT_CHURCH_STORAGE_KEY, profile.churchId);
        }
        setScreen('complete');
      } catch {
        setFormError('설정은 기기에 저장했지만 계정 동기화에 실패했어요. 다시 시도해 주세요.');
      } finally {
        setAuthPending(false);
      }
    }
  };

  return (
    <main className="onboarding-root">
      <section className="onboarding-shell" aria-label="바이블온 회원가입 및 튜토리얼">
        <header className="onboarding-header">
          {screen === 'tutorial' ? (
            <button className="onboarding-icon-button" type="button" aria-label="이전" onClick={goBack}>
              <ArrowLeft size={21} aria-hidden="true" />
            </button>
          ) : <span className="onboarding-header-space" />}
          <div className="onboarding-brand"><BibleOnLogo size={22} aria-hidden="true" /><strong>바이블온</strong></div>
          <span className="onboarding-header-space" />
        </header>

        {screen === 'signup' && (
          <div className="signup-view">
            <div className="signup-heading">
              <span>새로운 말씀 생활</span>
              <h1>바이블온을 시작해요</h1>
              <p>한 번의 가입으로 성경 읽기와 교회 공동체를 함께 이용할 수 있어요.</p>
            </div>

            <div className="social-login-list" aria-label="소셜 계정으로 가입">
              {providers.map(({ id, label, Icon }) => (
                <button className={`social-login-button ${id}`} type="button" key={id} disabled={authPending} onClick={() => beginSocialSignup(id)}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}로 계속하기</span>
                </button>
              ))}
            </div>

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <p className="auth-legal">계속하면 바이블온 이용약관과 개인정보 처리방침에 동의하게 됩니다.</p>
          </div>
        )}

        {screen === 'tutorial' && (
          <div className="tutorial-view">
            <div className="tutorial-progress" aria-label={`튜토리얼 ${tutorialStep + 1}/3`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="tutorial-step-count">{tutorialStep + 1} / 3</div>

            {tutorialStep === 0 && (
              <div className="tutorial-content">
                <div className="flow-heading">
                  <span>교회 연결</span>
                  <h1>현재 교회 생활을 알려주세요</h1>
                </div>
                <div className="choice-list">
                  {churchChoices.map((choice) => (
                    <button
                      className={`choice-row ${profile.churchStatus === choice.id ? 'is-selected' : ''}`}
                      type="button"
                      key={choice.id}
                      onClick={() => chooseChurchStatus(choice.id)}
                    >
                      <span><strong>{choice.label}</strong><small>{choice.helper}</small></span>
                      <i>{profile.churchStatus === choice.id && <Check size={14} aria-hidden="true" />}</i>
                    </button>
                  ))}
                </div>
                {profile.churchStatus === 'member' && (
                  <form className="church-search-wrap" onSubmit={searchChurch}>
                    <label className="church-search-field">
                      <Search size={18} aria-hidden="true" />
                      <input
                        autoFocus
                        aria-autocomplete="list"
                        aria-controls="registered-church-suggestions"
                        value={profile.churchName}
                        onChange={(event) => {
                          const value = event.target.value;
                          setUnregisteredChurchName('');
                          setProfile((current) => ({ ...current, churchId: '', churchName: value }));
                        }}
                        placeholder="등록된 교회 이름을 검색해 주세요"
                      />
                      <button type="submit">검색</button>
                    </label>

                    {churchSuggestions.length > 0 && (
                      <div className="church-suggestions" id="registered-church-suggestions" role="listbox" aria-label="등록된 교회 검색 결과">
                        <span>등록된 교회</span>
                        {churchSuggestions.map((church) => (
                          <button type="button" role="option" aria-selected="false" key={church.id} onClick={() => selectRegisteredChurch(church)}>
                            <i className={`onboarding-church-avatar ${church.profileImage ? 'has-image' : ''}`}>{church.profileImage ? <img src={church.profileImage} alt="" /> : <Church size={18} />}</i>
                            <span><strong>{church.name}</strong><small>{church.location} · {church.denomination}</small><em>{church.verseRef} · {church.representativeVerse}</em></span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}

                    {profile.churchId && (
                      <div className="selected-church" role="status">
                        {(() => {
                          const selectedChurch = getRegisteredChurches(churchProfiles).find(({ id }) => id === profile.churchId);
                          return <><i className={`onboarding-church-avatar ${selectedChurch?.profileImage ? 'has-image' : ''}`}>{selectedChurch?.profileImage ? <img src={selectedChurch.profileImage} alt="" /> : <Check size={16} aria-hidden="true" />}</i><span><strong>{profile.churchName}</strong><small>{selectedChurch?.verseRef ?? '등록된 교회와 연결합니다'}</small><em>{selectedChurch?.representativeVerse}</em></span></>;
                        })()}
                      </div>
                    )}
                  </form>
                )}
                {unregisteredChurchName && (
                  <div className="unregistered-church-notice" role="status">
                    <strong>‘{unregisteredChurchName}’ 검색 결과는 아직 등록된 교회에 없어요.</strong>
                    <p>교회 관리자에게 바이블온에서 교회를 등록하면 함께 사용할 수 있다고 알려주세요. 지금은 개인으로 먼저 시작합니다.</p>
                  </div>
                )}
              </div>
            )}

            {tutorialStep === 1 && (
              <div className="tutorial-content">
                <div className="flow-heading">
                  <span>관심 기능</span>
                  <h1>무엇을 가장 기대하나요?</h1>
                  <p>여러 개를 선택할 수 있어요.</p>
                </div>
                <div className="interest-grid">
                  {interestChoices.map((interest) => {
                    const selected = profile.interests.includes(interest);
                    return (
                      <button className={selected ? 'is-selected' : ''} type="button" key={interest} onClick={() => toggleInterest(interest)}>
                        <span>{interest}</span>{selected && <Check size={15} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tutorialStep === 2 && (
              <div className="tutorial-content">
                <div className="flow-heading">
                  <span>읽기 목표</span>
                  <h1>하루에 얼마나 읽어볼까요?</h1>
                  <p>설정은 언제든 바꿀 수 있어요.</p>
                </div>
                <div className="pace-list">
                  {paceChoices.map((pace) => (
                    <button
                      className={profile.pace === pace.id ? 'is-selected' : ''}
                      type="button"
                      key={pace.id}
                      onClick={() => setProfile((current) => ({ ...current, pace: pace.id }))}
                    >
                      <span><strong>{pace.label}</strong><small>{pace.helper}</small></span>
                      <i>{profile.pace === pace.id && <Check size={14} aria-hidden="true" />}</i>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="tutorial-actions">
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="onboarding-primary-button" type="button" disabled={!canContinue || authPending} onClick={advanceTutorial}>
                {authPending ? '계정에 저장하고 있어요' : tutorialStep === 2 ? '설정 완료하기' : '다음'}
              </button>
            </div>
          </div>
        )}

        {screen === 'complete' && (
          <div className="complete-view">
            <span className="complete-check"><Check size={28} aria-hidden="true" /></span>
            <div>
              <span>가입 완료</span>
              <h1>바이블온을 시작할 준비가 됐어요</h1>
              <p>{providers.find((provider) => provider.id === authMethod)?.label ?? '연동'} 계정과 개인 설정이 준비되었습니다.</p>
            </div>
            <dl className="onboarding-summary">
              <div><dt>교회</dt><dd>{profile.churchStatus === 'member' ? profile.churchName : '개인으로 시작'}</dd></div>
              <div><dt>관심 기능</dt><dd>{profile.interests.slice(0, 2).join(', ')}</dd></div>
              <div><dt>읽기 목표</dt><dd>하루 {profile.pace}분</dd></div>
            </dl>
            <button className="onboarding-primary-button" type="button" onClick={() => window.location.assign('/')}>바이블온 시작하기</button>
          </div>
        )}
      </section>
    </main>
  );
}

export default OnboardingApp;
