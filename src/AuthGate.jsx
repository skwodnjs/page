import React,{useEffect,useState} from 'react';
import {onAuthStateChanged,setPersistence,browserSessionPersistence,signInWithEmailAndPassword,GoogleAuthProvider,signInWithPopup,EmailAuthProvider,linkWithCredential,updatePassword,signOut} from 'firebase/auth';
import {LockKeyhole,Eye,EyeOff,Check,LoaderCircle,KeyRound} from 'lucide-react';
import {auth,OWNER_EMAIL,isOwner} from './firebase.js';
import './auth.css';

const UNLOCK_KEY='page-auth-unlocked-v1';
function describeError(error){
  switch(error?.code){
    case 'auth/invalid-credential':case 'auth/wrong-password':case 'auth/invalid-login-credentials':return '비밀번호가 올바르지 않습니다.';
    case 'auth/too-many-requests':return '인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'auth/popup-closed-by-user':return 'Google 인증 창이 닫혔습니다.';
    case 'auth/popup-blocked':return '팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.';
    case 'auth/email-already-in-use':case 'auth/credential-already-in-use':return '이미 다른 Firebase 계정에 연결된 이메일입니다. 관리자 계정 연결 상태를 확인해 주세요.';
    case 'auth/weak-password':return '더 강한 비밀번호를 입력해 주세요.';
    case 'auth/operation-not-allowed':return 'Firebase Authentication에서 이메일/비밀번호 또는 Google 인증을 활성화해 주세요.';
    case 'auth/unauthorized-domain':return 'Firebase Authentication의 승인된 도메인에 이 사이트 주소를 추가해 주세요.';
    case 'auth/requires-recent-login':return 'Google 계정으로 다시 본인 확인을 진행해 주세요.';
    default:return error?.message||'인증 중 오류가 발생했습니다.';
  }
}
export default function AuthGate({children}){
  const [ready,setReady]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [mode,setMode]=useState('unlock');
  const [googleUser,setGoogleUser]=useState(null);
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true,unsubscribe=()=>{};
    setPersistence(auth,browserSessionPersistence).then(()=>{
      if(!alive)return;
      unsubscribe=onAuthStateChanged(auth,user=>{
        if(!alive)return;
        const allowed=isOwner(user)&&sessionStorage.getItem(UNLOCK_KEY)==='1';
        if(!user||!isOwner(user))sessionStorage.removeItem(UNLOCK_KEY);
        setUnlocked(Boolean(allowed));
        setReady(true);
      },err=>{if(!alive)return;setError(describeError(err));setReady(true)});
    }).catch(err=>{if(!alive)return;setError(describeError(err));setReady(true)});
    return()=>{alive=false;unsubscribe()};
  },[]);
  useEffect(()=>{const onLogout=()=>{sessionStorage.removeItem(UNLOCK_KEY);signOut(auth).catch(()=>{});setUnlocked(false)};window.addEventListener('page:lock',onLogout);return()=>window.removeEventListener('page:lock',onLogout)},[]);
  const unlock=async e=>{
    e.preventDefault();
    if(!OWNER_EMAIL||!password)return;
    setBusy(true);setError('');
    try{
      await setPersistence(auth,browserSessionPersistence);
      const result=await signInWithEmailAndPassword(auth,OWNER_EMAIL,password);
      if(!isOwner(result.user)){await signOut(auth);throw Error('허용되지 않은 사용자입니다. 관리자 설정을 확인해 주세요.')}
      sessionStorage.setItem(UNLOCK_KEY,'1');
      setPassword('');
      setUnlocked(true);
    }catch(err){setError(describeError(err))}
    finally{setBusy(false)}
  };
  const startGoogle=async()=>{
    if(!OWNER_EMAIL)return;
    setBusy(true);setError('');
    try{
      await setPersistence(auth,browserSessionPersistence);
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      const result=await signInWithPopup(auth,provider);
      if(!isOwner(result.user)){await signOut(auth);throw Error('등록된 관리자 Google 계정이 아닙니다.')}
      setGoogleUser(result.user);
      setPassword('');setConfirmPassword('');
      setMode(result.user.providerData.some(p=>p.providerId==='password')?'reset':'setup');
    }catch(err){setError(describeError(err))}
    finally{setBusy(false)}
  };
  const savePassword=async e=>{
    e.preventDefault();
    if(!googleUser||!isOwner(googleUser)){setError('Google 계정으로 다시 본인 확인을 해 주세요.');return}
    if(password.length<10){setError('비밀번호는 10자 이상으로 설정해 주세요.');return}
    if(password!==confirmPassword){setError('비밀번호가 일치하지 않습니다.');return}
    setBusy(true);setError('');
    try{
      if(mode==='setup'){
        await linkWithCredential(googleUser,EmailAuthProvider.credential(OWNER_EMAIL,password));
      }else{
        await updatePassword(googleUser,password);
      }
      await signOut(auth);
      sessionStorage.removeItem(UNLOCK_KEY);
      setGoogleUser(null);setPassword('');setConfirmPassword('');
      setMode('unlock');setUnlocked(false);
      setError('');
    }catch(err){setError(describeError(err))}
    finally{setBusy(false)}
  };
  if(!ready)return <div className="page-auth-shell"><LoaderCircle className="page-auth-spinner" size={23}/><span>인증 상태 확인 중...</span></div>;
  if(unlocked&&isOwner(auth.currentUser))return children;
  return <div className="page-auth-shell"><div className="page-auth-card"><div className="page-auth-brand"><div className="page-auth-lock"><LockKeyhole size={24}/></div><h1>page<span>.</span></h1><p>{!OWNER_EMAIL?'관리자 설정이 필요합니다.':mode==='unlock'?'비밀번호를 입력해 주세요.':mode==='setup'?'Google 계정에 사용할 비밀번호를 설정하세요.':'Google 계정 확인 완료 · 새 비밀번호를 설정하세요.'}</p></div>{!OWNER_EMAIL?<div className="page-auth-warning">관리자 이메일이 설정되지 않았습니다. Cloudflare 빌드 환경변수 <code>VITE_OWNER_EMAIL</code>을 본인의 Google 이메일로 지정해야 인증을 시작할 수 있습니다.</div>:<form onSubmit={mode==='unlock'?unlock:savePassword} className="page-auth-form"><label className="page-auth-password"><KeyRound size={16}/><input autoFocus autoComplete={mode==='unlock'?'current-password':'new-password'} type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='unlock'?'비밀번호':'새 비밀번호 (10자 이상)'}/><button type="button" aria-label={visible?'비밀번호 숨기기':'비밀번호 보기'} onClick={()=>setVisible(x=>!x)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></label>{mode!=='unlock'&&<label className="page-auth-password"><Check size={16}/><input type={visible?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="비밀번호 확인"/></label>}{error&&<p className="page-auth-error" role="alert">{error}</p>}<button className="page-auth-submit" disabled={busy||!password||(mode!=='unlock'&&!confirmPassword)} type="submit">{busy?<LoaderCircle className="page-auth-spinner" size={16}/>:null}{mode==='unlock'?'잠금 해제':mode==='setup'?'비밀번호 등록':'비밀번호 변경'}</button><div className="page-auth-recovery">{mode==='unlock'?<button disabled={busy} type="button" onClick={startGoogle}>최초 설정 · 비밀번호 재설정 (Google)</button>:<button disabled={busy} type="button" onClick={async()=>{await signOut(auth);setGoogleUser(null);setMode('unlock');setPassword('');setConfirmPassword('');setError('')}}>취소</button>}</div></form>}</div></div>;
}
