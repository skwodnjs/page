import React,{useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,LogIn,LogOut,NotebookPen} from 'lucide-react';
import './daily.css';

// Read-only records for the visual prototype. Editing and persistence will be added later.
const RECORDS={
  '2026-10-29':{
    checkIn:'09:30',checkOut:'01:20',checkoutNextDay:true,
    timeline:[
      {start:'09:30',end:'10:10',title:'출근 및 일정 정리',category:'업무',note:'이메일 확인, 오늘 할 일 정리'},
      {start:'10:10',end:'12:20',title:'논문 읽기',category:'연구',note:'Regime-switching 관련 자료 검토'},
      {start:'12:20',end:'13:10',title:'점심 식사',category:'휴식'},
      {start:'13:10',end:'16:00',title:'연구 및 실험',category:'연구',note:'모형 구조 정리와 실험 결과 확인'},
      {start:'16:10',end:'18:40',title:'자료 정리',category:'업무',note:'발표용 문서 정리'},
      {start:'19:30',end:'23:50',title:'개인 프로젝트',category:'개인',note:'Page UI 작업'},
      {start:'23:50',end:'00:40',endNextDay:true,title:'코드 검토',category:'개인'},
      {start:'00:40',end:'01:20',nextDay:true,endNextDay:true,title:'마무리 및 퇴근',category:'업무'}
    ]
  },
  '2026-10-28':{
    checkIn:'10:05',checkOut:'19:15',
    timeline:[
      {start:'10:05',end:'11:00',title:'일정 확인',category:'업무'},
      {start:'11:00',end:'13:00',title:'논문 정리',category:'연구'},
      {start:'14:00',end:'16:30',title:'세미나 준비',category:'연구'},
      {start:'17:00',end:'19:15',title:'자료 수정',category:'업무'}
    ]
  },
  '2026-10-27':{
    timeline:[
      {start:'09:30',end:'11:30',title:'강의 복습',category:'학습',note:'확률론 필기 정리'},
      {start:'13:00',end:'15:10',title:'개인 공부',category:'학습',note:'HMM 정리'},
      {start:'18:30',end:'20:00',title:'기타 연습',category:'개인'}
    ]
  },
  '2026-10-26':{
    checkIn:'09:00',checkOut:'18:35',
    timeline:[
      {start:'09:00',end:'11:30',title:'과제 및 연구',category:'연구'},
      {start:'12:40',end:'15:00',title:'공동 세미나',category:'연구'},
      {start:'15:20',end:'18:35',title:'세미나 내용 정리',category:'업무'}
    ]
  },
  '2026-10-25':{
    timeline:[
      {start:'10:00',end:'12:00',title:'주간 계획',category:'개인'},
      {start:'14:00',end:'17:30',title:'웹사이트 정리',category:'개인'}
    ]
  },
  '2026-10-23':{
    checkIn:'09:40',checkOut:'18:10',
    timeline:[
      {start:'09:40',end:'12:00',title:'연구 아이디어 정리',category:'연구'},
      {start:'13:00',end:'15:00',title:'연구 미팅',category:'연구'},
      {start:'15:20',end:'18:10',title:'논문 검토',category:'연구'}
    ]
  },
  '2026-10-22':{
    checkIn:'10:00',checkOut:'20:10',
    timeline:[
      {start:'10:00',end:'12:30',title:'발표 준비',category:'업무'},
      {start:'13:20',end:'16:00',title:'세미나',category:'연구'},
      {start:'17:00',end:'20:10',title:'후속 자료 정리',category:'업무'}
    ]
  },
  '2026-10-20':{
    checkIn:'09:20',checkOut:'17:50',
    timeline:[
      {start:'09:20',end:'12:10',title:'자료 조사',category:'연구'},
      {start:'13:00',end:'17:50',title:'모형 검토',category:'연구'}
    ]
  },
  '2026-10-17':{
    timeline:[{start:'11:00',end:'13:10',title:'웹사이트 구조 정리',category:'개인'}]
  },
  '2026-09-30':{
    checkIn:'09:30',checkOut:'18:20',
    timeline:[{start:'09:30',end:'12:00',title:'자료 조사',category:'연구'},{start:'13:20',end:'18:20',title:'실험 정리',category:'연구'}]
  }
};
const pad=n=>String(n).padStart(2,'0');
const toKey=date=>date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
const fromKey=key=>new Date(key+'T12:00:00');
const shiftDate=(key,days)=>{const d=fromKey(key);d.setDate(d.getDate()+days);return toKey(d)};
const prettyDate=key=>fromKey(key).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m};
const durationFor=record=>{
  if(!record?.checkIn||!record?.checkOut)return null;
  const duration=minutes(record.checkOut)-minutes(record.checkIn)+(record.checkoutNextDay?1440:0);
  return duration>=0?duration:null;
};
const hours=total=>total===null?'—':Math.floor(total/60)+'시간 '+pad(total%60)+'분';
const formatEventTime=(time,nextDay)=>nextDay?'익일 '+time:time;
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
      const hasRecord=Boolean(records[key]);
      return <button type="button" key={key} aria-label={key+' 기록 보기'} aria-pressed={selected===key} onClick={()=>onSelect(key)} className={'daily-cal-day'+(selected===key?' selected':'')}>
        <span>{d}</span>
        {hasRecord&&<i className="work" aria-hidden="true"/>}
      </button>;
    })}
  </div>;
}
function Timeline({events}){
  if(!events.length)return <div className="daily-no-timeline"><NotebookPen size={19}/><p>등록된 타임라인이 없습니다.</p></div>;
  return <div className="daily-timeline-list">{events.map((event,i)=>
    <div className="daily-timeline-item" key={event.start+'-'+i}>
      <div className="daily-timeline-clock">
        <strong>{formatEventTime(event.start,event.nextDay)}</strong>
        <span>{formatEventTime(event.end,event.endNextDay)}</span>
      </div>
      <div className="daily-timeline-rail"><i/></div>
      <div className="daily-timeline-content">
        <div className="daily-timeline-title"><strong>{event.title}</strong><span>{event.category}</span></div>
        {event.note&&<p>{event.note}</p>}
      </div>
    </div>
  )}</div>;
}
export default function DailyPage(){
  const [selected,setSelected]=useState('2026-10-29');
  const month=fromKey(selected);
  const record=RECORDS[selected];
  const timeline=record?.timeline||[];
  const monthly=useMemo(()=>{
    const prefix=selected.slice(0,7);
    const entries=Object.entries(RECORDS).filter(([key])=>key.startsWith(prefix));
    const working=entries.filter(([,value])=>durationFor(value)!==null);
    return{
      worked:working.length,
      minutes:working.reduce((sum,[,value])=>sum+durationFor(value),0),
      timeline:entries.reduce((sum,[,value])=>sum+(value.timeline?.length||0),0)
    };
  },[selected]);
  const moveMonth=step=>{
    const next=new Date(month.getFullYear(),month.getMonth()+step,1);
    const prefix=next.getFullYear()+'-'+pad(next.getMonth()+1);
    const available=Object.keys(RECORDS).filter(key=>key.startsWith(prefix)).sort();
    setSelected(available.at(-1)||prefix+'-01');
  };
  return <div className="daily-page">
    <div className="section-head daily-section-head"><div><div className="eyebrow">DAILY</div><h1>일상</h1></div></div>
    <div className="daily-topline"><div><h2>하루 기록</h2><p>날짜별 출퇴근 시간과 활동 내역</p></div></div>
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
        <MonthCalendar month={month} selected={selected} onSelect={setSelected} records={RECORDS}/>
      </section>
      <section className="daily-day-card">
        <div className="daily-day-head">
          <div className="daily-day-heading"><span>선택한 날짜</span><h3>{prettyDate(selected)}</h3></div>
          <div className="daily-nav-controls">
            <button type="button" onClick={()=>setSelected(d=>shiftDate(d,-1))} aria-label="이전 날짜"><ChevronLeft size={18}/></button>
            <button type="button" onClick={()=>setSelected(d=>shiftDate(d,1))} aria-label="다음 날짜"><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="daily-attendance">
          <div><span><LogIn size={14}/> 출근 시간</span><strong>{record?.checkIn||'—'}</strong></div>
          <div><span><LogOut size={14}/> 퇴근 시간</span><strong>{record?.checkOut||'—'}{record?.checkoutNextDay&&<small>익일</small>}</strong></div>
          <div><span><Clock3 size={14}/> 총 근무 시간</span><strong>{hours(durationFor(record))}</strong></div>
        </div>
        <div className="daily-timeline-head"><h3>타임라인</h3><span>{timeline.length}개 기록</span></div>
        <Timeline events={timeline}/>
      </section>
    </div>
  </div>;
}
