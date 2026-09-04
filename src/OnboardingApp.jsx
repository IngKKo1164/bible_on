import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
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
  sendPasswordReset,
  signInWithEmail,
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
  { id: '20', label: '깊이 있게', helper: '하루 20분' },
];

function OnboardingApp() {
  const [screen, setScreen] = useState('signup');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [authMethod, setAuthMethod] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [formError, setFormError] = useState('');
  const [unregisteredChurchName, setUnregisteredChurchName] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [churchProfiles] = useState(() => readStoredValue(CHURCH_PROFILES_STORAGE_KEY, {}));
  const [profile, setProfile] = useState({
    churchStatus: '',
    churchId: '',
    churchName: '',
    interests: ['성경 읽기'],
    pace: '10',
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
      const displayName = user.user_metadata?.display_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || '';
      setAuthUser(user);
      setAuthMethod(user.app_metadata?.provider ?? 'email');
      setForm((current) => ({
        ...current,
        name: current.name || displayName,
        email: current.email || user.email || '',
      }));
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
    setAuthNotice('');
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

  const submitEmailSignin = async (event) => {
    event.preventDefault();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(form.email) || !form.password) {
      setFormError('이메일과 비밀번호를 확인해 주세요.');
      return;
    }
    setFormError('');
    setAuthNotice('');
    setAuthPending(true);
    try {
      const result = await signInWithEmail({
        email: form.email.trim(),
        password: form.password,
      });
      if (result.mode === 'preview') beginTutorial('email');
      else window.location.replace('/');
    } catch (error) {
      setFormError(error?.message || '로그인하지 못했어요.');
    } finally {
      setAuthPending(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError('먼저 가입한 이메일 주소를 입력해 주세요.');
      return;
    }
    setAuthPending(true);
    setFormError('');
    try {
      await sendPasswordReset(form.email.trim());
      setAuthNotice('비밀번호 재설정 메일을 보냈어요.');
    } catch (error) {
      setFormError(error?.message || '재설정 메일을 보내지 못했어요.');
    } finally {
      setAuthPending(false);
    }
  };

  const goBack = () => {
    if (screen === 'signin') {
      setFormError('');
      setScreen('signup');
      return;
    }
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
      const displayName = form.name.trim()
        || authUser?.user_metadata?.display_name
        || authUser?.user_metadata?.full_name
        || '바이블온 사용자';
      writeStoredValue(CURRENT_CHURCH_STORAGE_KEY, '');
      const savedProfile = readStoredValue('bibleon.personalProfile', {});
      writeStoredValue('bibleon.personalProfile', { ...savedProfile, name: displayName });

      try {
        await accountRepository.saveOnboarding({
          displayName,
          profile: { ...savedProfile, name: displayName },
          onboarding: {
            churchStatus: profile.churchStatus,
            churchId: profile.churchStatus === 'member' ? profile.churchId : '',
            churchName: profile.churchStatus === 'member' ? profile.churchName : '',
            interests: profile.interests,
            pace: profile.pace,
            authMethod,
            completedAt: new Date().toISOString(),
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

  const resetPreview = () => {
    setScreen('signup');
    setTutorialStep(0);
    setAuthMethod('');
  };

  return (
    <main className="onboarding-root">
      <section className="onboarding-shell" aria-label="바이블온 회원가입 및 튜토리얼">
        <header className="onboarding-header">
          {screen === 'signin' || screen === 'tutorial' ? (
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

            <button className="existing-account-button" type="button" onClick={() => {
              setFormError('');
              setAuthNotice('');
              setScreen('signin');
            }}>
              이미 계정이 있나요? <strong>로그인</strong>
            </button>

            <p className="auth-legal">계속하면 바이블온 이용약관과 개인정보 처리방침에 동의하게 됩니다.</p>
          </div>
        )}

        {screen === 'signin' && (
          <form className="email-signup-view" onSubmit={submitEmailSignin} noValidate>
            <div className="flow-heading">
              <span>계정 로그인</span>
              <h1>다시 만나서 반가워요</h1>
            </div>

            <div className="signup-fields">
              <label className="signup-field">
                <span>이메일</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="name@example.com"
                />
              </label>
              <label className="signup-field">
                <span>비밀번호</span>
                <div className="password-input">
                  <input
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="비밀번호"
                  />
                  <button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </label>
            </div>

            {formError && <p className="form-error" role="alert">{formError}</p>}
            {authNotice && <p className="form-notice" role="status">{authNotice}</p>}

            <button className="password-reset-button" type="button" disabled={authPending} onClick={requestPasswordReset}>
              비밀번호를 잊었어요
            </button>
            <button className="onboarding-primary-button" type="submit" disabled={authPending}>
              {authPending ? '로그인 중...' : '로그인'}
            </button>
          </form>
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
              <p>{providers.find((provider) => provider.id === authMethod)?.label ?? '이메일'} 계정과 개인 설정이 준비되었습니다.</p>
            </div>
            <dl className="onboarding-summary">
              <div><dt>교회</dt><dd>{profile.churchStatus === 'member' ? profile.churchName : '개인으로 시작'}</dd></div>
              <div><dt>관심 기능</dt><dd>{profile.interests.slice(0, 2).join(', ')}</dd></div>
              <div><dt>읽기 목표</dt><dd>하루 {profile.pace}분</dd></div>
            </dl>
            <button className="onboarding-primary-button" type="button" onClick={resetPreview}>튜토리얼 다시 보기</button>
          </div>
        )}
      </section>
    </main>
  );
}

export default OnboardingApp;
