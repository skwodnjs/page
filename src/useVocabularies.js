import {useCallback,useEffect,useRef,useState} from 'react';
import {collection,doc,onSnapshot,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,db,isOwner} from './firebase.js';

// Cloud-only vocabulary storage. Old demo/localStorage collections are intentionally not imported.
export default function useVocabularies(onError){
  const [collections,setCollectionsState]=useState([]);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [user,setUser]=useState(null);
  const current=useRef([]);
  const pending=useRef(Promise.resolve());
  const errorHandler=useRef(onError);
  errorHandler.current=onError;
  useEffect(()=>{
    try{localStorage.removeItem('page-ui-collections')}catch{}
    return onAuthStateChanged(auth,u=>{setUser(isOwner(u)?u:null);setReady(false);setCollectionsState([]);current.current=[];});
  },[]);
  useEffect(()=>{
    if(!user){setReady(false);return}
    return onSnapshot(collection(db,'users',user.uid,'vocabularies'),snapshot=>{
      const next=snapshot.docs.map(d=>({id:d.id,...d.data(),items:Array.isArray(d.data().items)?d.data().items:[]}));
      current.current=next;
      setCollectionsState(next);
      setReady(true);setError('');
    },err=>{setError(err.message||'단어장을 불러오지 못했습니다');setReady(false);});
  },[user]);
  const setCollections=useCallback(updater=>{
    if(!user||!ready){errorHandler.current?.('단어장을 불러온 후 다시 시도해 주세요');return}
    const previous=current.current;
    const next=typeof updater==='function'?updater(previous):updater;
    const before=new Map(previous.map(x=>[String(x.id),x]));
    const after=new Map(next.map(x=>[String(x.id),x]));
    current.current=next;setCollectionsState(next);
    const writes=[];
    for(const [id,old] of before)if(!after.has(id))writes.push({id,remove:true});
    for(const [id,value] of after)if(JSON.stringify(before.get(id))!==JSON.stringify(value))writes.push({id,value});
    pending.current=pending.current.catch(()=>{}).then(async()=>{
      for(const w of writes){
        const ref=doc(db,'users',user.uid,'vocabularies',w.id);
        if(w.remove)await deleteDoc(ref);
        else {const {id,...fields}=w.value;await setDoc(ref,{...fields,updatedAt:serverTimestamp()});}
      }
    }).catch(err=>{setError(err.message||'저장에 실패했습니다');errorHandler.current?.('단어장 저장 실패: '+(err.message||'오류'));});
  },[user,ready]);
  return {collections,setCollections,ready,error};
}
