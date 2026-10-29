import React,{useEffect,useMemo,useRef,useState} from 'react';
import {collection,doc,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore';
import {ChevronLeft,ChevronRight,Clock3,LogIn,LogOut,NotebookPen,Pencil,Plus,Trash2,LoaderCircle,AlertCircle,Check} from 'lucide-react';
import {auth,db} from './firebase.js';
import './daily.css';

// All daily records come from Firestore. Do not seed or upload UI sample records.
const pad=n=>String(n).padStart(2,'0');
const toKey=date=>date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
const fromKey=key=>new Date(key+'T12:00:00');
const shiftDate=(key,days)=>{const d=fromKey(key);d.setDate(d.getDate()+days);return toKey(d)};
const prettyDate=key=>fromKey(key).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
const timeOf=date=>pad(date.getHours())+':'+pad(date.getMinutes());
const localDateTime=date=>toKey(date)+'T'+timeOf(date);
const parseDateTime=value=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const date=new Date(value);
  return !Number.isNaN(date.getTime())&&localDateTime(date)===value?date:null;
};
const offsetFromDay=(dateKey,date)=>{
  const [year,month,day]=dateKey.split('-').map(Number);
  return Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(year,month-1,day))/86400000);
};
const dayOffsetFor=record=>record?.checkoutDayOffset??(record?.checkoutNextDay?1:0);
const dateFromRecord=(selected,record,field)=>{
  if(!record?.[field])return '';
  const stamp=record[field+'At'];
  if(stamp){
    const parsed=new Date(stamp);
    if(!Number.isNaN(parsed.getTime()))return localDateTime(parsed);
  }
  const date=field==='checkOut'?shiftDate(selected,dayOffsetFor(record)):selected;
  return date+'T'+record[field];
};
const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m};
const durationFor=record=>{
  if(!record?.checkIn||!record?.checkOut)return null;
  const start=record.checkInAt?new Date(record.checkInAt):null;
  const end=record.checkOutAt?new Date(record.checkOutAt):null;
  if(start&&!Number.isNaN(start.getTime())&&end&&!Number.isNaN(end.getTime())){
    const elapsed=Math.floor((end-start)/60000);
    return elapsed>=0?elapsed:null;
  }
  const elapsed=minutes(record.checkOut)-minutes(record.checkIn)+dayOffsetFor(record)*1440;
  return elapsed>=0?elapsed:null;
};
const hours=total=>total===null?'—':Math.floor(total/60)+'시간 '+pad(total%60)+'분';
const timelineItems=record=>Array.isArray(record?.timeline)?record.timeline:[];
const sortedTimeline=items=>[...items].sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)));
function MonthCalendar({month,selected,onSelect,records}){
  const year=month.getFullYear(),m=month.getMonth();
  const count=new Date(year,m+1,0).getDate();
  const offset=new Date(year,m,1).getDay();
  const dates=[...Array(offset).fill(null),...Array.from({length:count},(_,i)=>i+1)];
  return <div className="daily-calendar-grid">
    {['일','월','화','수','목','금','토'].map((day,i)=><span className={'daily-weekday'+(i===0?' sunday':'')} key={day}>{day}</span>)}
    {dates.map((d,i)=>{
      if(d===null)return <span aria-hidden="true" key={'gap-'+i}/>;
      const key=year+'-'+pad(m+1)+'-'+pad(d);
      const record=records[key];
      const hasRecord=Boolean(record&&(record.checkIn||record.checkOut||timelineItems(record).length));
      return <button type="button" key={key} aria-label={key+' 기록 보기'} aria-pressed={selected===key} onClick={()=>onSelect(key)} className={'daily-cal-day'+(selected===key?' selected':'')}>
        <span>{d}</span>
        {hasRecord&&<i className="work" aria-hidden="true"/>}
      </button>;
    })}
  </div>;
}
function Timeline({events,onEdit}){
  if(!events.length)return <div className="daily-no-timeline"><NotebookPen size={19}/><p>등록된 타임라인이 없습니다.</p></div>;
  return <div className="daily-timeline-list">{sortedTimeline(events).map((event,i)=>{
    const start=parseDateTime(event.startAt);
    const end=parseDateTime(event.endAt);
    return <div className="daily-timeline-item" key={event.id||i}>
      <div className="daily-timeline-clock">
        <strong>{start?timeOf(start):'—'}</strong>
        <span>{end?(start&&toKey(end)!==toKey(start)?'익일 ':'')+timeOf(end):'—'}</span>
      </div>
      <div className="daily-timeline-rail"><i/></div>
      <div className="daily-timeline-content">
        <div className="daily-timeline-title">
          <strong>{event.title||'제목 없음'}</strong>
          <div className="daily-timeline-controls"><span>{event.category||'기타'}</span><button type="button" title="타임라인 수정" aria-label={event.title+' 수정'} onClick={()=>onEdit(event)}><Pencil size={13}/></button></div>
        </div>
        {event.note&&<p>{event.note}</p>}
      </div>
    </div>;
  })}</div>;
}
export default function DailyPage(){
  const uid=auth.currentUser?.uid;
  const [today,setToday]=useState(()=>toKey(new Date()));
  const [selected,setSelected]=useState(()=>toKey(new Date()));
  const [records,setRecords]=useState({});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [saveState,setSaveState]=useState('');
  const [saveError,setSaveError]=useState('');
  const [editing,setEditing]=useState(null);
  const busyRef=useRef(false);

  useEffect(()=>{
    const updateToday=()=>setToday(toKey(new Date()));
    const timer=setInterval(updateToday,30000);
    window.addEventListener('focus',updateToday);
    return()=>{clearInterval(timer);window.removeEventListener('focus',updateToday)};
  },[]);

  useEffect(()=>{
    if(!uid){setLoadError('인증 정보가 없습니다. 다시 로그인해 주세요.');setLoading(false);return}
    setLoading(true);setLoadError('');
    const unsubscribe=onSnapshot(collection(db,'users',uid,'dailyRecords'),snapshot=>{
      const next={};
      snapshot.docs.forEach(item=>{
        if(/^\d{4}-\d{2}-\d{2}$/.test(item.id))next[item.id]=item.data();
      });
      setRecords(next);
      setLoading(false);
      setLoadError('');
    },error=>{
      console.error('일상 기록 불러오기 실패',error);
      setLoadError('일상 기록을 불러오지 못했습니다. Firestore 보안 규칙과 네트워크 상태를 확인해 주세요. ('+error.code+')');
      setLoading(false);
    });
    return()=>unsubscribe();
  },[uid]);

  // A write is confirmed only after Firestore acknowledges it. No localStorage is used.
  const savePatch=async(date,patch)=>{
    if(busyRef.current||!uid||loadError)return false;
    busyRef.current=true;setSaveState('saving');setSaveError('');
    try{
      await setDoc(doc(db,'users',uid,'dailyRecords',date),{date,...patch,updatedAt:serverTimestamp()},{merge:true});
      setSaveState('saved');
      return true;
    }catch(error){
      console.error('일상 기록 저장 실패',error);
      setSaveState('error');
      setSaveError('저장하지 못했습니다. 네트워크와 Firestore 보안 규칙을 확인해 주세요. ('+error.code+')');
      return false;
    }finally{busyRef.current=false}
  };

  const month=fromKey(selected);
  const record=records[selected];
  const timeline=timelineItems(record);
  const canCheckIn=selected===today&&!record?.checkIn;
  const canCheckOut=Boolean(record?.checkIn&&!record?.checkOut);
  const canEdit=selected<=today;
  const saving=saveState==='saving';
  const checkoutOffset=dayOffsetFor(record);
  const chooseDate=key=>{setEditing(null);setSelected(key)};

  const checkIn=async()=>{
    const now=new Date();
    if(saving||selected!==toKey(now)||records[selected]?.checkIn)return;
    await savePatch(selected,{checkIn:timeOf(now),checkInAt:now.toISOString(),checkOut:null,checkOutAt:null,checkoutDayOffset:0,checkoutNextDay:false});
  };
  const checkOut=async()=>{
    const now=new Date();
    if(saving||!record?.checkIn||record.checkOut)return;
    const dayOffset=offsetFromDay(selected,now);
    if(dayOffset<0)return;
    await savePatch(selected,{checkOut:timeOf(now),checkOutAt:now.toISOString(),checkoutDayOffset:dayOffset,checkoutNextDay:dayOffset===1});
  };

  const startEdit=field=>{
    if(selected>toKey(new Date()))return;
    setSaveError('');
    setEditing({kind:'attendance',field,value:dateFromRecord(selected,record,field),error:''});
  };
  const startTimelineEdit=event=>{
    setSaveError('');
    setEditing({kind:'timeline',id:event?.id||null,title:event?.title||'',category:event?.category||'업무',note:event?.note||'',startAt:event?.startAt||selected+'T09:00',endAt:event?.endAt||selected+'T10:00',error:''});
  };
  const submitEdit=async(event)=>{
    event.preventDefault();
    if(!editing||saving)return;
    if(editing.kind==='attendance'){
      const date=parseDateTime(editing.value);
      if(!date){setEditing(e=>({...e,error:'날짜와 시간을 정확히 입력해 주세요.'}));return}
      const offset=offsetFromDay(selected,date);
      if((editing.field==='checkIn'&&offset!==0)||(editing.field==='checkOut'&&(offset<0||offset>1))){
        setEditing(e=>({...e,error:editing.field==='checkIn'?'출근 시간은 선택한 날짜에만 설정할 수 있습니다.':'퇴근은 당일 또는 다음 날로 설정해 주세요.'}));return;
      }
      const inDate=editing.field==='checkIn'?date:parseDateTime(dateFromRecord(selected,record,'checkIn'));
      const outDate=editing.field==='checkOut'?date:parseDateTime(dateFromRecord(selected,record,'checkOut'));
      if(editing.field==='checkOut'&&!inDate){
        setEditing(e=>({...e,error:'출근 시간을 먼저 입력해 주세요.'}));return;
      }
      if(inDate&&outDate&&outDate<=inDate){
        setEditing(e=>({...e,error:'퇴근 시간은 출근 시간보다 늦어야 합니다.'}));return;
      }
      const patch={[editing.field]:timeOf(date),[editing.field+'At']:date.toISOString()};
      if(editing.field==='checkOut'){patch.checkoutDayOffset=offset;patch.checkoutNextDay=offset===1}
      if(await savePatch(selected,patch))setEditing(null);
      return;
    }
    const start=parseDateTime(editing.startAt),end=parseDateTime(editing.endAt);
    if(!editing.title.trim()){setEditing(e=>({...e,error:'활동 제목을 입력해 주세요.'}));return}
    if(!start||!end||toKey(start)!==selected||offsetFromDay(selected,end)<0||offsetFromDay(selected,end)>1||end<=start){
      setEditing(e=>({...e,error:'시작은 선택한 날짜, 종료는 당일 또는 다음 날로 설정하고 종료가 시작보다 늦어야 합니다.'}));return;
    }
    const id=editing.id||doc(collection(db,'users',uid,'dailyRecords')).id;
    const item={id,title:editing.title.trim(),category:editing.category.trim()||'기타',note:editing.note.trim(),startAt:editing.startAt,endAt:editing.endAt};
    const updated=editing.id?timeline.map(x=>x.id===editing.id?item:x):[...timeline,item];
    if(await savePatch(selected,{timeline:sortedTimeline(updated)}))setEditing(null);
  };
  const clearEdit=async()=>{
    if(!editing||saving)return;
    if(editing.kind==='timeline'){
      if(!window.confirm('이 타임라인 기록을 삭제할까요?'))return;
      if(await savePatch(selected,{timeline:timeline.filter(x=>x.id!==editing.id)}))setEditing(null);
      return;
    }
    const field=editing.field;
    if(field==='checkIn'&&record?.checkOut&&!window.confirm('출근 시간을 삭제하면 퇴근 시간도 함께 삭제됩니다. 계속할까요?'))return;
    const patch={[field]:null,[field+'At']:null};
    if(field==='checkIn'){patch.checkOut=null;patch.checkOutAt=null}
    patch.checkoutDayOffset=0;patch.checkoutNextDay=false;
    if(await savePatch(selected,patch))setEditing(null);
  };
  const monthly=useMemo(()=>{
    const prefix=selected.slice(0,7);
    const entries=Object.entries(records).filter(([key])=>key.startsWith(prefix));
    const working=entries.filter(([,value])=>Boolean(value.checkIn));
    return {
      worked:working.length,
      minutes:working.reduce((sum,[,value])=>sum+(durationFor(value)??0),0),
      timeline:entries.reduce((sum,[,value])=>sum+timelineItems(value).length,0)
    };
  },[selected,records]);
  const moveMonth=step=>{
    const next=new Date(month.getFullYear(),month.getMonth()+step,1);
    const prefix=next.getFullYear()+'-'+pad(next.getMonth()+1);
    const available=Object.keys(records).filter(key=>key.startsWith(prefix)).sort();
    chooseDate(available.at(-1)||prefix+'-01');
  };

  if(loading)return <div className="daily-loading"><LoaderCircle className="memo-spin" size={17}/> 일상 기록을 불러오는 중...</div>;
  if(loadError)return <div className="daily-loading daily-loading-error"><AlertCircle size={17}/>{loadError}<button type="button" className="daily-attendance-action" onClick={()=>window.location.reload()}>다시 시도</button></div>;
  return <div className="daily-page">
    <div className="section-head daily-section-head"><div><div className="eyebrow">DAILY</div><h1>일상</h1></div></div>
    <div className="daily-topline"><div><h2>하루 기록</h2><p>날짜별 출퇴근 시간과 활동 내역</p></div>
      <div className="daily-sync-status" role="status">
        {saving?<><LoaderCircle size={14} className="memo-spin"/> 저장 중...</>:saveState==='saved'?<><Check size={14}/> 저장됨</>:null}
      </div>
    </div>
    {saveError&&<div className="daily-save-error" role="alert"><AlertCircle size={15}/>{saveError}</div>}
    <div className="daily-overview">
      <div><span>이번 달 출근</span><strong>{monthly.worked}<small>일</small></strong></div>
      <div><span>누적 근무 시간</span><strong>{Math.floor(monthly.minutes/60)}<small>시간</small> {pad(monthly.minutes%60)}<small>분</small></strong></div>
      <div><span>타임라인 기록</span><strong>{monthly.timeline}<small>개</small></strong></div>
    </div>
    <div className="daily-main-layout">
      <section className="daily-calendar-card">
        <div className="daily-calendar-head">
          <h3>{month.getFullYear()}년 {month.getMonth()+1}월</h3>
          <div className="daily-nav-controls">
            <button type="button" onClick={()=>moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={18}/></button>
            <button type="button" onClick={()=>moveMonth(1)} aria-label="다음 달"><ChevronRight size={18}/></button>
          </div>
        </div>
        <MonthCalendar month={month} selected={selected} onSelect={chooseDate} records={records}/>
      </section>
      <section className="daily-day-card">
        <div className="daily-day-head">
          <div className="daily-day-heading"><span>선택한 날짜</span><h3>{prettyDate(selected)}</h3></div>
          <div className="daily-nav-controls">
            <button type="button" onClick={()=>chooseDate(shiftDate(selected,-1))} aria-label="이전 날짜"><ChevronLeft size={18}/></button>
            <button type="button" onClick={()=>chooseDate(shiftDate(selected,1))} aria-label="다음 날짜"><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="daily-attendance">
          <div><span><LogIn size={14}/> 출근 시간</span>{canCheckIn?<button type="button" disabled={saving} className="daily-attendance-action" onClick={checkIn}>출근하기</button>:<div className="daily-time-editable"><strong onDoubleClick={canEdit?()=>startEdit('checkIn'):undefined} title={canEdit?'더블클릭하여 시간 수정':undefined}>{record?.checkIn||'—'}</strong>{canEdit&&<button type="button" disabled={saving} className="daily-time-edit-trigger" aria-label="출근 시간 수정" title="출근 시간 수정" onClick={()=>startEdit('checkIn')}><Pencil size={12}/></button>}</div>}</div>
          <div><span><LogOut size={14}/> 퇴근 시간</span>{canCheckOut?<button type="button" disabled={saving} className="daily-attendance-action" onClick={checkOut}>퇴근하기</button>:<div className="daily-time-editable"><strong onDoubleClick={canEdit?()=>startEdit('checkOut'):undefined} title={canEdit?'더블클릭하여 시간 수정':undefined}>{record?.checkOut||'—'}{checkoutOffset>0&&record?.checkOut&&<small>{checkoutOffset===1?'익일':checkoutOffset+'일 후'}</small>}</strong>{canEdit&&<button type="button" disabled={saving} className="daily-time-edit-trigger" aria-label="퇴근 시간 수정" title="퇴근 시간 수정" onClick={()=>startEdit('checkOut')}><Pencil size={12}/></button>}</div>}</div>
          <div><span><Clock3 size={14}/> 총 근무 시간</span><strong>{hours(durationFor(record))}</strong></div>
        </div>
        <div className="daily-timeline-head"><h3>타임라인</h3><div className="daily-timeline-tools"><span>{timeline.length}개 기록</span><button type="button" disabled={saving||selected>today} onClick={()=>startTimelineEdit(null)}><Plus size={14}/> 추가</button></div></div>
        <Timeline events={timeline} onEdit={startTimelineEdit}/>
      </section>
    </div>
    {editing&&<div className="daily-edit-overlay" onMouseDown={event=>{if(!saving&&event.target===event.currentTarget)setEditing(null)}} onKeyDown={event=>{if(!saving&&event.key==='Escape')setEditing(null)}}>
      <form className="daily-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-edit-title" onSubmit={submitEdit}>
        <div className="daily-edit-heading">
          <span>{prettyDate(selected)}</span>
          <h3 id="daily-edit-title">{editing.kind==='attendance'?(editing.field==='checkIn'?'출근':'퇴근')+' 시간 '+(record?.[editing.field]?'수정':'입력'):editing.id?'타임라인 수정':'타임라인 추가'}</h3>
        </div>
        {editing.kind==='attendance'?<>
          <label className="daily-edit-label" htmlFor="daily-edit-time">날짜 및 시간</label>
          <input id="daily-edit-time" type="datetime-local" required autoFocus disabled={saving} value={editing.value}
            min={selected+'T00:00'} max={(editing.field==='checkIn'?selected:shiftDate(selected,1))+'T23:59'}
            onChange={event=>setEditing(e=>({...e,value:event.target.value,error:''}))}/>
          {editing.field==='checkOut'&&<p className="daily-edit-hint">다음 날 퇴근한 경우 날짜를 다음 날로 선택하세요.</p>}
        </>:<>
          <label className="daily-edit-label" htmlFor="daily-edit-title-input">활동 제목</label>
          <input id="daily-edit-title-input" type="text" required autoFocus maxLength={100} disabled={saving} value={editing.title} placeholder="활동 제목"
            onChange={event=>setEditing(e=>({...e,title:event.target.value,error:''}))}/>
          <div className="daily-edit-time-grid">
            <label>시작<input type="datetime-local" required disabled={saving} value={editing.startAt} onChange={event=>setEditing(e=>({...e,startAt:event.target.value,error:''}))}/></label>
            <label>종료<input type="datetime-local" required disabled={saving} value={editing.endAt} onChange={event=>setEditing(e=>({...e,endAt:event.target.value,error:''}))}/></label>
          </div>
          <label className="daily-edit-label" htmlFor="daily-edit-category">분류</label>
          <select id="daily-edit-category" value={editing.category} disabled={saving} onChange={event=>setEditing(e=>({...e,category:event.target.value}))}>
            {['업무','연구','학습','개인','휴식','기타'].map(category=><option key={category} value={category}>{category}</option>)}
          </select>
          <label className="daily-edit-label" htmlFor="daily-edit-note">메모</label>
          <textarea id="daily-edit-note" rows={3} disabled={saving} value={editing.note} placeholder="선택 사항" onChange={event=>setEditing(e=>({...e,note:event.target.value}))}/>
        </>}
        {editing.error&&<p className="daily-edit-error" role="alert">{editing.error}</p>}
        <div className="daily-edit-actions">
          {(editing.kind==='attendance'?Boolean(record?.[editing.field]):Boolean(editing.id))&&<button type="button" disabled={saving} className="daily-edit-remove" onClick={clearEdit}><Trash2 size={13}/> 삭제</button>}
          <button type="button" disabled={saving} className="daily-edit-cancel" onClick={()=>setEditing(null)}>취소</button>
          <button type="submit" disabled={saving} className="daily-edit-save">{saving?'저장 중...':'저장'}</button>
        </div>
      </form>
    </div>}
  </div>;
}