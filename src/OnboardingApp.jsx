import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import { BibleOnLogo } from './brandIcons';
import { FaApple } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import { SiKakao, SiNaver } from 'react-icons/si';
import { registeredChurches } from './churchData';
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
  const [formError, setFormError] = useState('');
  const [unregisteredChurchName, setUnregisteredChurchName] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', agreed: false });
  const [profile, setProfile] = useState({
    churchStatus: '',
    churchId: '',
    churchName: '',
    interests: ['성경 읽기'],
    pace: '10',
  });

  const progress = useMemo(() => ((tutorialStep + 1) / 3) * 100, [tutorialStep]);
  const churchSuggestions = useMemo(() => {
    const query = profile.churchName.trim().replace(/\s+/g, '').toLowerCase();
    if (!query || profile.churchId) return [];
    return registeredChurches
      .filter((church) => church.createdByAdmin && church.name.replace(/\s+/g, '').toLowerCase().includes(query))
      .slice(0, 4);
  }, [profile.churchId, profile.churchName]);

  const beginTutorial = (method) => {
    setAuthMethod(method);
    setTutorialStep(0);
    setScreen('tutorial');
  };

  const submitEmailSignup = (event) => {
    event.preventDefault();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (form.name.trim().length < 2) {
      setFormError('이름을 두 글자 이상 입력해 주세요.');
      return;
    }
    if (!emailPattern.test(form.email)) {
      setFormError('이메일 주소를 확인해 주세요.');
      return;
    }
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      setFormError('비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.');
      return;
    }
    if (!form.agreed) {
      setFormError('필수 약관에 동의해 주세요.');
      return;
    }
    setFormError('');
    beginTutorial('email');
  };

  const goBack = () => {
    if (screen === 'email') {
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

  const searchChurch = (event) => {
    event.preventDefault();
    const query = profile.churchName.trim().replace(/\s+/g, '').toLowerCase();
    if (!query) return;
    const exactChurch = registeredChurches.find(
      (church) => church.createdByAdmin && church.name.replace(/\s+/g, '').toLowerCase() === query
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

  const advanceTutorial = () => {
    if (!canContinue) return;
    if (tutorialStep < 2) setTutorialStep((current) => current + 1);
    else setScreen('complete');
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
          {screen === 'email' || screen === 'tutorial' ? (
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
                <button className={`social-login-button ${id}`} type="button" key={id} onClick={() => beginTutorial(id)}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}로 계속하기</span>
                </button>
              ))}
            </div>

            <div className="signup-divider"><span>또는</span></div>

            <button className="email-signup-button" type="button" onClick={() => setScreen('email')}>
              이메일로 직접 가입하기<ChevronRight size={18} aria-hidden="true" />
            </button>

            <p className="auth-legal">계속하면 바이블온 이용약관과 개인정보 처리방침에 동의하게 됩니다.</p>
          </div>
        )}

        {screen === 'email' && (
          <form className="email-signup-view" onSubmit={submitEmailSignup} noValidate>
            <div className="flow-heading">
              <span>직접 회원가입</span>
              <h1>기본 정보를 입력해 주세요</h1>
            </div>

            <div className="signup-fields">
              <label className="signup-field">
                <span>이름</span>
                <input
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="이름을 입력해 주세요"
                />
              </label>
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
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="영문과 숫자 포함 8자 이상"
                  />
                  <button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </label>
            </div>

            <label className="terms-check">
              <input
                checked={form.agreed}
                type="checkbox"
                onChange={(event) => setForm((current) => ({ ...current, agreed: event.target.checked }))}
              />
              <span>이용약관 및 개인정보 처리방침에 동의합니다. <b>필수</b></span>
            </label>

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <button className="onboarding-primary-button" type="submit">가입하고 계속하기</button>
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
                            <span><strong>{church.name}</strong><small>{church.location} · {church.denomination}</small></span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}

                    {profile.churchId && (
                      <div className="selected-church" role="status">
                        <Check size={16} aria-hidden="true" />
                        <span><strong>{profile.churchName}</strong><small>등록된 교회와 연결합니다</small></span>
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
              <button className="onboarding-primary-button" type="button" disabled={!canContinue} onClick={advanceTutorial}>
                {tutorialStep === 2 ? '설정 완료하기' : '다음'}
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
