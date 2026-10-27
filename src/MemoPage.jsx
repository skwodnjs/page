import React,{useCallback,useEffect,useRef,useState} from 'react';
import {collection,doc,onSnapshot,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {CalendarDays,List,Plus,ChevronLeft,ChevronRight,Check,LoaderCircle,AlertCircle,Trash2} from 'lucide-react';
import {db,auth} from './firebase.js';
import './memo-cloud.css';

const isoDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const labelDay=s=>{const d=new Date(s+'T12:00:00');return d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})};
const timestampLabel=v=>v?.toDate?.()?.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})||'오늘';
const draftKey=uid=>'page-unsaved-notes-v1:'+uid;
function useCloudMemo(uid){
  const [dated,setDated]=useState({});
  const [notes,setNotes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [statuses,setStatuses]=useState({});
  const drafts=useRef({});
  const revisions=useRef({});
  const activeWrites=useRef(new Set());
  const timers=useRef({});
  const persistDrafts=useCallback(()=>{try{const val=JSON.stringify(drafts.current);if(Object.keys(drafts.current).length)localStorage.setItem(draftKey(uid),val);else localStorage.removeItem(draftKey(uid))}catch{}},[uid]);
  const status=(key,value)=>setStatuses(s=>({...s,[key]:value}));
  const flush=useCallback(async key=>{
    if(activeWrites.current.has(key))return;
    const data=drafts.current[key];if(!data)return;
    clearTimeout(timers.current[key]);delete timers.current[key];
    activeWrites.current.add(key);status(key,'saving');
    const revision=revisions.current[key];
    try{
      const ref=doc(db,'users',uid,data.type==='dated'?'datedNotes':'generalNotes',data.id);
      if(data.deleted){
        await deleteDoc(ref);
      }else if(data.type==='dated'){
        await setDoc(ref,{date:data.id,content:data.content,updatedAt:serverTimestamp()},{merge:true});
      }else{
        await setDoc(ref,{title:data.title,body:data.body,updatedAt:serverTimestamp()},{merge:true});
      }
      if(revisions.current[key]===revision){
        delete drafts.current[key];persistDrafts();status(key,'saved');
      }
    }catch(err){
      if(revisions.current[key]===revision)status(key,'error');
      console.error('메모 저장 실패',err);
    }finally{
      activeWrites.current.delete(key);
      if(drafts.current[key]&&revisions.current[key]!==revision)timers.current[key]=setTimeout(()=>flush(key),0);
    }
  },[uid,persistDrafts]);
  const queue=useCallback((payload,delay=2000)=>{
    const key=payload.type+':'+payload.id;
    revisions.current[key]=(revisions.current[key]||0)+1;
    drafts.current[key]=payload;persistDrafts();
    status(key,'pending');
    clearTimeout(timers.current[key]);
    timers.current[key]=setTimeout(()=>flush(key),delay);
  },[persistDrafts,flush]);
  useEffect(()=>{
    let alive=true;let datedSeen=false,notesSeen=false;
    try{
      const stored=JSON.parse(localStorage.getItem(draftKey(uid))||'{}');
      drafts.current=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
      for(const key of Object.keys(drafts.current)){revisions.current[key]=1;status(key,'pending')}
    }catch{drafts.current={}}
    const datePath=collection(db,'users',uid,'datedNotes');
    const notesPath=collection(db,'users',uid,'generalNotes');
    const onLoaded=kind=>{if(kind==='dated')datedSeen=true;else notesSeen=true;if(datedSeen&&notesSeen&&alive)setLoading(false)};
    const unsubs=[
      onSnapshot(datePath,snap=>{
        if(!alive)return;
        const server={};
        snap.docs.forEach(d=>{const data=d.data();if(typeof data.content==='string'&&data.content.trim())server[d.id]=data.content});
        for(const pending of Object.values(drafts.current))if(pending.type==='dated'){if(pending.deleted||!pending.content?.trim())delete server[pending.id];else server[pending.id]=pending.content}
        setDated(server);
        onLoaded('dated');
      },err=>{if(alive){setLoadError(err.message);setLoading(false)}}),
      onSnapshot(notesPath,snap=>{
        if(!alive)return;
        const server=snap.docs.map(d=>({id:d.id,title:d.data().title||'',body:d.data().body||'',updated:timestampLabel(d.data().updatedAt)}));
        const map=new Map(server.map(n=>[n.id,n]));
        for(const pending of Object.values(drafts.current))if(pending.type==='general'){if(pending.deleted)map.delete(pending.id);else map.set(pending.id,{id:pending.id,title:pending.title||'',body:pending.body||'',updated:'오늘'})}
        setNotes([...map.values()].sort((a,b)=>String(b.id).localeCompare(String(a.id))));
        onLoaded('notes');
      },err=>{if(alive){setLoadError(err.message);setLoading(false)}})
    ];
    Object.keys(drafts.current).forEach(key=>{timers.current[key]=setTimeout(()=>flush(key),2000)});
    return()=>{alive=false;unsubs.forEach(fn=>fn());Object.values(timers.current).forEach(clearTimeout)};
  },[uid,flush]);
  const editDated=(date,content)=>{
    setDated(all=>{const next={...all};if(content.trim())next[date]=content;else delete next[date];return next});
    queue({type:'dated',id:date,content,deleted:!content.trim()});
  };
  const saveNote=(note)=>{setNotes(ns=>ns.map(n=>n.id===note.id?{...note,updated:'오늘'}:n));queue({type:'general',id:String(note.id),title:note.title||'',body:note.body||''})};
  const createNote=()=>{
    const id=doc(collection(db,'users',uid,'generalNotes')).id;
    const note={id,title:'',body:'',updated:'오늘'};
    setNotes(ns=>[note,...ns]);
    queue({type:'general',id,title:'',body:''},0);
    return id;
  };
  const removeNote=id=>{
    setNotes(ns=>ns.filter(n=>String(n.id)!==String(id)));
    queue({type:'general',id:String(id),deleted:true},0);
  };
  const retry=key=>{if(drafts.current[key]){status(key,'pending');clearTimeout(timers.current[key]);timers.current[key]=setTimeout(()=>flush(key),0)}};
  return{dated,notes,loading,loadError,statuses,editDated,saveNote,createNote,removeNote,retry};
}
function SaveState({state,onRetry}){
  if(state==='error')return <button type="button" className="memo-sync-error" onClick={onRetry}><AlertCircle size={14}/> 저장 실패 · 재시도</button>;
  if(state==='pending'||state==='saving')return <span className="memo-save-status" role="status"><LoaderCircle className="memo-spin" size={14}/> {state==='pending'?'저장 대기 중...':'저장 중...'}</span>;
  return <span className="memo-save-status" role="status"><Check size={14}/> 저장됨</span>;
}
function DatedCalendar({month,setMonth,selected,setSelected,dated}){
  const first=new Date(month.y,month.m,1).getDay();
  const count=new Date(month.y,month.m+1,0).getDate();
  const cells=[...Array(first).fill(null),...Array.from({length:count},(_,i)=>i+1)];
  const move=step=>setMonth(m=>{const date=new Date(m.y,m.m+step,1);return{y:date.getFullYear(),m:date.getMonth()}});
  return <div className="calendar"><div className="calendar-head"><button className="iconbtn" onClick={()=>move(-1)} aria-label="이전 달"><ChevronLeft size={18}/></button><strong>{month.y}년 {month.m+1}월</strong><button className="iconbtn" onClick={()=>move(1)} aria-label="다음 달"><ChevronRight size={18}/></button></div><div className="calendar-grid">{['일','월','화','수','목','금','토'].map(day=><span className="weekday" key={day}>{day}</span>)}{cells.map((day,i)=>{const key=day&&month.y+'-'+String(month.m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');return day?<button key={key} className={'day '+(selected===key?'chosen':'')} onClick={()=>setSelected(key)}><span>{day}</span>{dated[key]?.trim()&&<i/>}</button>:<span key={'pad'+i}/>})}</div></div>;
}
export default function MemoPage({route,section,go}){
  const uid=auth.currentUser?.uid;
  const {dated,notes,loading,loadError,statuses,editDated,saveNote,createNote,removeNote,retry}=useCloudMemo(uid);
  const [month,setMonth]=useState(()=>{const now=new Date();return{y:now.getFullYear(),m:now.getMonth()}});
  const [selectedDate,setSelectedDate]=useState(()=>isoDay(new Date()));
  const [view,setView]=useState('calendar');
  const [legacy,setLegacy]=useState(false);
  const [migrationMessage,setMigrationMessage]=useState('');
  useEffect(()=>{const flag=localStorage.getItem('page-memo-imported-v1:'+uid);setLegacy(!flag&&Boolean(localStorage.getItem('page-ui-dated')||localStorage.getItem('page-ui-notes')))},[uid]);
  const activeId=route.split('/')[3];
  const active=notes.find(n=>String(n.id)===activeId);
  const importLegacy=()=>{
    if(!window.confirm('이 브라우저의 기존 메모를 Firestore로 가져올까요? UI 테스트용 예시 메모도 포함될 수 있습니다. 기존 서버 메모는 유지됩니다.'))return;
    let count=0;
    try{
      const datedLocal=JSON.parse(localStorage.getItem('page-ui-dated')||'{}');
      for(const [date,content] of Object.entries(datedLocal))if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&typeof content==='string'&&content.trim()&&!dated[date]){editDated(date,content);count++}
      const localNotes=JSON.parse(localStorage.getItem('page-ui-notes')||'[]');
      if(Array.isArray(localNotes))for(const n of localNotes)if(n&&typeof n.title==='string'&&typeof n.body==='string'){const id=createNote();saveNote({id,title:n.title,body:n.body});count++}
      localStorage.setItem('page-memo-imported-v1:'+uid,'1');
      setLegacy(false);setMigrationMessage(count+'개 메모의 저장을 요청했습니다. 저장 상태를 확인해 주세요.');
    }catch{setMigrationMessage('기존 메모를 읽지 못했습니다. 브라우저 데이터를 확인해 주세요.')}
  };
  if(loading)return <div className="memo-loading"><LoaderCircle className="memo-spin" size={19}/> 메모를 불러오는 중...</div>;
  if(loadError)return <div className="memo-load-error"><AlertCircle size={17}/> 메모를 불러오지 못했습니다. {loadError}<button className="btn outline small" onClick={()=>location.reload()}>다시 시도</button></div>;
  return <><div className="section-head"><div><div className="eyebrow">NOTES</div><h1>메모</h1></div></div><nav className="tabs"><button className={section!=='notes'?'selected':''} onClick={()=>go('/memo')}>날짜별 메모</button><button className={section==='notes'?'selected':''} onClick={()=>go('/memo/notes')}>전체 메모</button></nav>{legacy&&<div className="memo-migration"><span>이 브라우저에 이전 메모가 있습니다.</span><button onClick={importLegacy}>기존 메모 가져오기</button></div>}{migrationMessage&&<p className="memo-migration-result">{migrationMessage}</p>}{section!=='notes'?<><div className="page-actions"><div><h2>{view==='calendar'?'달력':'몰아보기'}</h2><p className="subtle">날짜별로 기록한 메모</p></div><button className="btn outline small" onClick={()=>setView(view==='calendar'?'all':'calendar')}>{view==='calendar'?<List size={15}/>:<CalendarDays size={15}/>} {view==='calendar'?'몰아보기':'달력 보기'}</button></div>{view==='calendar'?<><DatedCalendar month={month} setMonth={setMonth} selected={selectedDate} setSelected={setSelectedDate} dated={dated}/><div className="date-editor"><div className="panelhead"><h3>{labelDay(selectedDate)}</h3><SaveState state={statuses['dated:'+selectedDate]} onRetry={()=>retry('dated:'+selectedDate)}/></div><textarea placeholder="이 날짜의 메모를 입력하세요." value={dated[selectedDate]||''} onChange={e=>editDated(selectedDate,e.target.value)}/></div></>:<div className="all-notes">{Object.entries(dated).filter(([,content])=>content.trim()).sort(([a],[b])=>a.localeCompare(b)).map(([date,content])=><button className="dated-note" key={date} onClick={()=>{const [y,m]=date.split('-').map(Number);setMonth({y,m:m-1});setSelectedDate(date);setView('calendar')}}><strong>{labelDay(date)}</strong><p>{content}</p><ChevronRight size={16}/></button>)}</div>}</>:!activeId?<><div className="page-actions"><div><h2>전체 메모</h2><p className="subtle">{notes.length}개의 메모</p></div><button className="btn primary small" onClick={()=>go('/memo/notes/'+createNote())}><Plus size={15}/> 새 메모</button></div><div className="note-grid">{notes.map(n=><button className="note-card" key={n.id} onClick={()=>go('/memo/notes/'+n.id)}><strong>{n.title||'제목 없음'}</strong><p>{n.body||'내용을 입력하세요.'}</p><span>{n.updated}</span></button>)}</div></>:!active?<div className="memo-not-found"><p>해당 메모를 찾을 수 없습니다.</p><button className="btn outline small" onClick={()=>go('/memo/notes')}>전체 메모</button></div>:<div className="note-editor"><button className="back small-back" onClick={()=>go('/memo/notes')}><ChevronLeft size={16}/> 전체 메모</button><input className="note-title-input" placeholder="제목" value={active.title} onChange={e=>saveNote({...active,title:e.target.value})}/><div className="editor-meta"><SaveState state={statuses['general:'+active.id]} onRetry={()=>retry('general:'+active.id)}/><button className="textlink danger" onClick={()=>{if(window.confirm('이 메모를 삭제하시겠습니까?')){removeNote(active.id);go('/memo/notes')}}}><Trash2 size={14}/> 삭제</button></div><textarea className="note-body-input" placeholder="내용을 입력하세요." value={active.body} onChange={e=>saveNote({...active,body:e.target.value})}/></div>}</>;
}
