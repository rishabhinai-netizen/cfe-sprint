/* ===================== CFE SPRINT ENGINE (GitHub Pages + Supabase) ===================== */
const CFE = (function(){
  "use strict";
  const D = window.__CFE_DATA || {};
  const SECMETA = D.meta.sections;
  const CFG = window.CFE_CONFIG || {};

  /* ---------- memory + persistence ---------- */
  const MEM = {};
  let state;                 // set in init()
  let sb = null;             // supabase client
  let syncCode = null;       // personal sync code
  let syncing = false;

  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

  function blankState(){
    return { startDate: todayStr(), lastStudy:null, streak:0,
      doneDays:{}, readTopics:{}, quizState:{}, cardBox:{} };
  }
  function loadLocal(){
    let s=null;
    try{ s=JSON.parse(localStorage.getItem('cfe_state')); }catch(e){}
    if(!s && MEM.cfe_state){ s=JSON.parse(MEM.cfe_state); }
    return s || blankState();
  }
  function saveLocal(){
    const j=JSON.stringify(state);
    try{ localStorage.setItem('cfe_state',j); }catch(e){ MEM.cfe_state=j; }
  }
  function save(){ saveLocal(); pushCloud(); render(); }

  /* ---------- supabase sync ---------- */
  function supabaseReady(){
    return CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('__')!==0
      && CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY.indexOf('__')!==0
      && window.supabase;
  }
  function initSync(){
    if(!supabaseReady()){ setSyncUI('local'); return; }
    try{ sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); }
    catch(e){ setSyncUI('local'); return; }
    try{ syncCode = localStorage.getItem('cfe_sync_code'); }catch(e){ syncCode=MEM.cfe_sync_code; }
    if(syncCode){ setSyncUI('on'); pullCloud(); }
    else setSyncUI('ready');
  }
  function setSyncUI(stateStr){
    const dot=document.getElementById('syncDot'), txt=document.getElementById('syncTxt');
    if(!dot) return;
    dot.classList.toggle('on', stateStr==='on');
    txt.textContent = stateStr==='on' ? (syncCode? 'synced':'synced')
      : stateStr==='ready' ? 'sync ready' : 'local';
  }
  async function pushCloud(){
    if(!sb || !syncCode) return;
    try{
      await sb.from(CFG.TABLE).upsert({ code: syncCode, data: state, updated_at:new Date().toISOString() });
    }catch(e){ /* offline ok */ }
  }
  async function pullCloud(){
    if(!sb || !syncCode) return;
    syncing=true;
    try{
      const { data, error } = await sb.from(CFG.TABLE).select('data').eq('code',syncCode).maybeSingle();
      if(!error && data && data.data){
        // merge: take the most-progressed (more doneDays wins)
        const cloud=data.data;
        if(Object.keys(cloud.doneDays||{}).length >= Object.keys(state.doneDays||{}).length){
          state=cloud; saveLocal();
        } else { pushCloud(); }
        render();
      }
    }catch(e){}
    syncing=false;
  }

  /* ---------- derived ---------- */
  function totalDays(){ return D.plan.length; }
  function doneCount(){ return Object.keys(state.doneDays).length; }
  function nextDay(){ for(const p of D.plan){ if(!state.doneDays[p.d]) return p.d; } return null; }
  function dayPlan(n){ return D.plan.find(p=>p.d===n); }
  function pct(n,d){ return d?Math.round(n/d*100):0; }
  function secProgress(sec){
    const days=D.plan.filter(p=>p.sec===sec);
    const done=days.filter(p=>state.doneDays[p.d]).length;
    return {done,total:days.length,pct:pct(done,days.length)};
  }
  function avgScore(){
    const v=Object.values(state.doneDays).map(x=>x.score).filter(x=>typeof x==='number');
    return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;
  }
  function bumpStreak(){
    const t=todayStr();
    if(state.lastStudy===t) return;
    if(state.lastStudy && daysBetween(state.lastStudy,t)===1) state.streak+=1;
    else state.streak=1;
    state.lastStudy=t;
  }

  /* ===================== RENDER ===================== */
  function render(){
    const sN=document.getElementById('streakN'); if(sN) sN.textContent=state.streak;
    const rf=document.getElementById('railFill'); if(rf) rf.style.width=pct(doneCount(),totalDays())+'%';
    const active=document.querySelector('.tabs button.on');
    renderHome();
    if(active){ const t=active.dataset.tab;
      if(t==='plan')renderPlan(); if(t==='learn')renderLearn();
      if(t==='cards'){ if(!cardsInit)initCards(); } if(t==='mock')renderMock(); if(t==='drill')renderDrill(); if(t==='practice')renderPractice(); }
  }

  function renderHome(){
    const el=document.getElementById('p-home'); if(!el) return;
    const nd=nextDay();
    const examLeft=D.meta.examDays - daysBetween(state.startDate,todayStr());
    const av=avgScore();
    let today;
    if(nd===null){
      today=`<div class="card pad" style="text-align:center">
        <div style="font-size:38px">&#9733;</div>
        <h3 style="font-family:var(--serif);font-size:22px;color:var(--navy);margin:8px 0 4px">All chapters complete</h3>
        <p class="sub" style="margin-bottom:14px">Every chapter is cleared. Keep the mock papers and flashcards warm before exam day.</p>
        <button class="btn primary" onclick="CFE.go('mock')">Review mock exams</button></div>`;
    } else {
      const p=dayPlan(nd);
      const isMock=p.sec==='mock';
      const tasks=(p.topics||[]).map(t=>{
        const done=state.readTopics[t];
        return `<li><span class="dot ${done?'done':''}">${done?'&#10003;':''}</span>Read &middot; ${D.lessons[t].title}</li>`;
      }).join('');
      const qDone=state.quizState[p.quiz]&&state.quizState[p.quiz].done;
      today=`<div class="today">
        <div class="top"><span class="day">Day ${p.d}</span><b>${p.title}</b>
          <span class="sec">${isMock?'MOCK':p.sec.toUpperCase()}</span></div>
        <div class="body"><ul class="tasklist">${tasks}
          <li><span class="dot ${qDone?'done':''}">${qDone?'&#10003;':''}</span>${isMock?'Timed mock exam':'Practice set'} &middot; clear at &ge;75%</li>
        </ul>
        <button class="btn gold wide" onclick="CFE.startDay(${p.d})">${(p.topics&&p.topics.length)?'Begin today\u2019s lesson':'Start mock exam'} &rarr;</button>
        </div></div>`;
    }
    el.innerHTML=`
      <div class="hero">
        <div class="ey">Certified Fraud Examiner &middot; full three-section prep</div>
        <h1>${nd===null?'Sprint complete':'Day '+nd+' awaits'}</h1>
        <p>${nd===null?'Stay sharp with mock reviews and flashcards.':'Six days a week, about an hour a day. Read the briefing, learn the craft through real cases, then clear the drill at 75% to keep your streak.'}</p>
        <div class="countdown">
          <div class="cd"><b>${Math.max(examLeft,0)}</b><span>days to target</span></div>
          <div class="cd"><b>${doneCount()}/${totalDays()}</b><span>days cleared</span></div>
          <div class="cd"><b>${av===null?'\u2014':av+'%'}</b><span>avg score</span></div>
        </div>
      </div>
      ${today}
      <div class="grid g3">${secCard('s1')}${secCard('s2')}${secCard('s3')}</div>`;
  }
  function secCard(sec){
    const sp=secProgress(sec),m=SECMETA[sec];
    const color=sec==='s1'?'var(--gold)':sec==='s2'?'var(--navy-3)':'var(--green)';
    return `<div class="card stat"><div class="n">${sp.pct}%</div>
      <div class="l">${m.name.replace('Fraud ','')}</div>
      <div class="bar"><i style="width:${sp.pct}%;background:${color}"></i></div>
      <div class="meta">${m.q} Q &middot; ${m.weight} &middot; ${sp.done}/${sp.total} days</div></div>`;
  }

  function renderPlan(){
    const el=document.getElementById('p-plan'); if(!el) return;
    const nd=nextDay();
    const secTitles={s1:'Section 1 \u00b7 Fraud Schemes & Financial Crimes',s2:'Section 2 \u00b7 Investigations & Legal Issues',s3:'Section 3 \u00b7 Prevention & Deterrence',mock:'Mock exams & final review'};
    let html=`<h2 class="head">The study plan</h2>
      <div class="card pad" style="margin-bottom:14px;border-left:3px solid var(--gold)">
        <b style="color:var(--navy)">40 chapters &middot; 371 exam-style + 1,366 rapid-recall questions &middot; 12 mock papers</b>
        <p style="font-size:13px;color:var(--ink-faint);margin:6px 0 0;line-height:1.6">
        Every chapter carries a briefing and a drill. Clear a drill at <b>75%</b> to mark the day done.
        Each section ends with its own <b>full-length mock</b> plus two independent re-test papers.
        Tap any chapter to read the briefing &mdash; you can revise ahead at any time.</p>
      </div>
      <div class="card" style="overflow:hidden">`;
    let last=null;
    D.plan.forEach(p=>{
      const bandKey=p.sec==='mock'?('mock_'+(p.mockOf||'x')):p.sec;
      if(bandKey!==last){
        const label=p.sec==='mock'
          ? (secTitles[p.mockOf]||'Mock exams').replace(/^Section (\d).*/,'Section $1 &middot; mock papers')
          : secTitles[p.sec];
        html+=`<div class="secband">${label}</div>`; last=bandKey; }
      const done=!!state.doneDays[p.d], active=p.d===nd;
      const tag=p.sec==='mock'?'mock':p.sec;
      const sc=done?state.doneDays[p.d].score+'%':'';
      html+=`<div class="dayrow ${done?'done':''} ${active?'active':''}" onclick="CFE.startDay(${p.d})">
        <div class="idx">${done?'&#10003;':p.d}</div>
        <div class="meta"><b>${p.title}</b><span>${(p.topics&&p.topics.length)?p.topics.length+' lesson'+(p.topics.length>1?'s':'')+' + drill':'Full timed mock'}${sc?' \u00b7 '+sc:''}</span></div>
        <div class="tag ${tag}">${tag==='mock'?'MOCK':tag.toUpperCase()}</div>
        <div class="chk">${done?'&#10003;':active?'&#9656;':'&#9711;'}</div></div>`;
    });
    html+=`</div>`; el.innerHTML=html;
  }

  function renderLearn(){
    const el=document.getElementById('p-learn'); if(!el) return;
    const secTitles={s1:'Section 1 \u00b7 Schemes & Financial Crimes',s2:'Section 2 \u00b7 Investigations & Law',s3:'Section 3 \u00b7 Prevention & Deterrence'};
    let html=`<h2 class="head">Lesson library</h2><p class="sub">Every briefing — essentials, real-world case studies, and the examiner\u2019s eye. Open any topic for revision.</p>`;
    ['s1','s2','s3'].forEach((sec,i)=>{
      const topics=Object.keys(D.lessons).filter(t=>D.lessons[t].sec===sec)
        .sort((a,b)=>(D.lessons[a].day-D.lessons[b].day)|| (a<b?-1:1));
      html+=`<details class="acc" ${i===0?'open':''}><summary><span class="n">${i+1}</span>${secTitles[sec]}<span class="ar">&#9656;</span></summary>
        <div class="inner">${topics.map(t=>{const r=state.readTopics[t];
          return `<div class="topiclink" onclick="CFE.openLesson('${t}')"><span class="ic">&#9656;</span>${D.lessons[t].title}<span class="st ${r?'read':'new'}">${r?'read':'new'}</span></div>`;
        }).join('')}</div></details>`;
    });
    el.innerHTML=html;
  }

  /* ===================== DAY FLOW ===================== */
  let flow=null;
  function startDay(d){
    const p=dayPlan(d); if(!p) return;
    // Lessons are always readable (revision + jump-ahead). The 75% gate still governs
    // whether a day counts as "cleared" for streaks/progress — but never blocks access.
    go('home');
    if(p.topics&&p.topics.length){ flow={day:d,topics:p.topics.slice(),idx:0,quizId:p.quiz}; openLesson(p.topics[0],true); }
    else startQuiz(p.quiz,{day:d,mock:true});
  }
  function openLesson(topicId,inFlow){
    const L=D.lessons[topicId]; if(!L) return;
    state.readTopics[topicId]=true; save();
    const host=document.getElementById('p-home');
    const total=flow?flow.topics.length:1, pos=flow?flow.idx+1:1;
    const body=L.body.map(seg=>{
      if(seg.h) return `<h4>${seg.h}</h4>`;
      if(seg.p) return `<p>${seg.p}</p>`;
      if(seg.ul) return `<ul>${seg.ul.map(x=>`<li>${x}</li>`).join('')}</ul>`;
      if(seg.ol) return `<ol>${seg.ol.map(x=>`<li>${x}</li>`).join('')}</ol>`;
      if(seg.key) return `<div class="keybox"><b>&#9733; Exam-critical</b><p>${seg.key}</p></div>`;
      if(seg.warn) return `<div class="warnbox"><b>&#9888; Watch out</b><p>${seg.warn}</p></div>`;
      if(seg.case) return `<div class="casebox"><span class="ct">&#9678; Case file</span><p>${seg.case}</p></div>`;
      if(seg.eye) return `<div class="eyebox"><span class="icn">&#128065;</span><p>${seg.eye}</p></div>`;
      if(seg.table) return tableHtml(seg.table);
      return '';
    }).join('');
    const next=inFlow
      ? `<button class="btn gold wide" onclick="CFE.lessonNext()">${(flow&&flow.idx<flow.topics.length-1)?'Next lesson &rarr;':'Start today\u2019s drill &rarr;'}</button>`
      : `<button class="btn ghost wide" onclick="CFE.go('learn')">&larr; Back to library</button>`;
    host.innerHTML=`<div class="reader">
      <div class="rdr-top"><button class="back" onclick="CFE.${inFlow?'exitFlow()':'go(\'learn\')'}">&larr; ${inFlow?'Exit':'Library'}</button>
        ${inFlow?`<div style="font-size:12px;color:var(--ink-faint);font-weight:600">Lesson ${pos} of ${total}</div>`:''}</div>
      <div class="lesson card pad">
        <div class="eyebrow">${SECMETA[L.sec].name}</div>
        <h3>${L.title}</h3>${body}</div>${next}</div>`;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function tableHtml(rows){
    const h=rows[0],b=rows.slice(1);
    return `<table class="cmp"><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${b.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function lessonNext(){
    if(!flow) return;
    if(flow.idx<flow.topics.length-1){ flow.idx++; openLesson(flow.topics[flow.idx],true); }
    else startQuiz(flow.quizId,{day:flow.day});
  }
  function exitFlow(){ flow=null; go('home'); renderHome(); }

  /* ===================== QUIZ ===================== */
  let quiz=null;
  function startQuiz(quizId,ctx){
    quiz={quizId,ids:D.quizzes[quizId].slice(),idx:0,answers:{},ctx:ctx||{},mock:!!(ctx&&ctx.mock)};
    renderQuiz();
  }
  /* Ad-hoc drill from an arbitrary set of question ids (not a stored quiz). */
  function startCustom(ids,label,ctx){
    if(!ids||!ids.length){ toast('No questions match that filter'); return; }
    quiz={quizId:'__custom__',ids:ids.slice(),idx:0,answers:{},
          ctx:Object.assign({custom:true,label:label||'Drill'},ctx||{}),mock:!!(ctx&&ctx.mock)};
    go('home'); renderQuiz();
  }
  function renderQuiz(){
    const host=document.getElementById('p-home');
    const q=D.questions[quiz.ids[quiz.idx]];
    const answered=quiz.answers[quiz.idx]!==undefined;
    const total=quiz.ids.length, L=['A','B','C','D'];
    const opts=q.o.map((o,i)=>{
      let c='opt';
      if(answered){ c+=' locked'; if(i===q.a)c+=' correct'; else if(i===quiz.answers[quiz.idx])c+=' wrong'; }
      return `<div class="${c}" onclick="CFE.answer(${i})"><span class="lt">${L[i]}</span><span>${o}</span></div>`;
    }).join('');
    const correct=answered&&quiz.answers[quiz.idx]===q.a;
    const expl=answered?`<div class="expl ${correct?'ok':'no'} show"><b>${correct?'\u2713 Correct':'\u2717 Not quite'}</b>${q.e}</div>`:'';
    // scenario panel: show the shared fact pattern; keep it visible when consecutive Qs share a scenarioId
    const prevId=quiz.idx>0?D.questions[quiz.ids[quiz.idx-1]]:null;
    const sameScenario=q.scenarioId&&prevId&&prevId.scenarioId===q.scenarioId;
    const scen=q.scenario?`<div class="scenario"><div class="scenario-tag">Case scenario${sameScenario?' (continued)':''}</div>${q.scenario}</div>`
              :(q.scenarioId&&sameScenario?`<div class="scenario carry"><div class="scenario-tag">Same case scenario &mdash; scroll up to reread</div></div>`:'');
    const tBadge=q.type?`<span class="pill ${q.type}">${({judgment:'Judgment',scenario:'Scenario',discrimination:'Discrimination',recall:'Recall'})[q.type]||q.type}</span>`:'';
    const dBadge=q.diff==='hard'?`<span class="pill hard">Hard</span>`:'';
    host.innerHTML=`<div class="quiz">
      <div class="qmeta"><span class="pill">${quiz.ctx.mock?'Mock':'Practice'} &middot; ${(q.chapter||SECMETA[q.sec].name.replace('Fraud ','')).slice(0,28)}</span>
        <div class="right">${tBadge}${dBadge}<span class="pill">${quiz.idx+1} / ${total}</span></div></div>
      <div class="qprog"><i style="width:${Math.round(quiz.idx/total*100)}%"></i></div>
      <div class="card qcard"><div class="qnum">Question ${quiz.idx+1}</div>
        ${scen}
        <div class="qtext">${q.t}</div><div class="opts">${opts}</div>${expl}
        <div class="qfoot">${quiz.idx>0?'<button class="btn ghost" onclick="CFE.qPrev()">&larr; Prev</button>':''}
          <button class="btn primary" style="margin-left:auto" onclick="CFE.qNext()" ${!answered?'disabled':''}>${quiz.idx<total-1?'Next &rarr;':'See results'}</button></div></div></div>`;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function answer(i){ if(quiz.answers[quiz.idx]!==undefined) return; quiz.answers[quiz.idx]=i; renderQuiz(); }
  function qNext(){ if(quiz.idx<quiz.ids.length-1){ quiz.idx++; renderQuiz(); } else finishQuiz(); }
  function qPrev(){ if(quiz.idx>0){ quiz.idx--; renderQuiz(); } }
  function finishQuiz(){
    let correct=0; quiz.ids.forEach((id,i)=>{ if(quiz.answers[i]===D.questions[id].a) correct++; });
    const score=Math.round(correct/quiz.ids.length*100), pass=score>=D.meta.passMark;
    if(!quiz.ctx.custom) state.quizState[quiz.quizId]={score,done:true};
    // per-question history powers the Drill tab's weak-area targeting
    state.qHist=state.qHist||{};
    quiz.ids.forEach((id,i)=>{
      const h=state.qHist[id]||{seen:0,wrong:0};
      h.seen++; if(quiz.answers[i]!==D.questions[id].a) h.wrong++;
      h.last=quiz.answers[i]===D.questions[id].a?1:0;
      state.qHist[id]=h;
    });
    if(quiz.ctx.day && pass){
      const already=!!state.doneDays[quiz.ctx.day];
      state.doneDays[quiz.ctx.day]={score,ts:Date.now()};
      if(!already) bumpStreak();
    }
    save();
    const host=document.getElementById('p-home');
    const circ=326.7, off=circ*(1-score/100), col=pass?'var(--green)':'var(--red)';
    const cleared=quiz.ctx.day&&pass;
    host.innerHTML=`<div class="card result">
      <div class="ring"><svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line-soft)" stroke-width="10"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/>
      </svg><div class="pct">${score}%</div></div>
      <div class="verdict ${pass?'pass':'fail'}">${pass?'&#10003; Passed the bar':'&#10007; Below 75%'}</div>
      <h3>${correct} of ${quiz.ids.length} correct</h3>
      <p>${pass?(cleared?'Day '+quiz.ctx.day+' cleared \u2014 streak safe.':'Above the 75% line.'):'The real exam needs 75% per section. Review the rationales and retry \u2014 this day clears once you hit 75%.'}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn ${pass?'ghost':'gold'}" onclick="CFE.retryQuiz()">Retry</button>
        ${pass?`<button class="btn gold" onclick="CFE.afterDay()">${nextDay()===null?'Finish':'Next day'} &rarr;</button>`:''}
        <button class="btn ghost" onclick="CFE.exitFlow()">Today</button></div>
      ${!pass?`<div class="card pad" style="margin-top:18px;border-left:3px solid var(--gold)"><b style="color:var(--navy)">Below the 75% bar</b><p style="font-size:13px;color:var(--ink-faint);margin:6px 0 12px;line-height:1.6">Review every miss above, then drill the questions you got wrong.</p><button class="btn gold" onclick="CFE.drillWeak(20)">Drill my weak questions</button></div>`:''}</div>`;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function retryQuiz(){ quiz.idx=0; quiz.answers={}; renderQuiz(); }
  function afterDay(){ flow=null; go('home'); renderHome(); }

  /* ===================== FLASHCARDS ===================== */
  let cardsInit=false,fcList=[],fcIdx=0,fcFlip=false,fcSec='all';
  function initCards(){ cardsInit=true; buildCards(); }
  function buildCards(){ fcList=D.flashcards.map((c,i)=>({...c,_i:i})).filter(c=>fcSec==='all'||c.sec===fcSec); fcIdx=0; fcFlip=false; renderCards(); }
  function renderCards(){
    const el=document.getElementById('p-cards'); if(!el) return;
    if(!fcList.length){ el.innerHTML='<div class="empty"><div class="big">&#9635;</div>No cards in this filter.</div>'; return; }
    const c=fcList[fcIdx];
    const nm=c.sec==='s1'?'Schemes':c.sec==='s2'?'Investigation/Law':'Prevention';
    el.innerHTML=`<h2 class="head">Flashcards</h2><p class="sub">Tap to flip. Rate yourself \u2014 \u2018Again\u2019 resurfaces a card sooner.</p>
      <div class="fc-filter">${['all','s1','s2','s3'].map(s=>`<button class="btn sm ${fcSec===s?'primary':'ghost'}" onclick="CFE.fcFilter('${s}')">${s==='all'?'All':s.toUpperCase()}</button>`).join('')}</div>
      <div class="fc-wrap"><div class="fc ${fcFlip?'flip':''}" onclick="CFE.fcTurn()">
        <div class="fc-face fc-front"><div class="tag">${nm} &middot; prompt</div><div class="q">${c.q}</div><div class="fc-hint">tap to reveal</div></div>
        <div class="fc-face fc-back"><div class="tag">answer</div><div class="a">${c.a}</div><div class="fc-hint">tap to flip back</div></div>
      </div></div>
      <div class="fc-rate"><button class="btn sm hard" onclick="CFE.fcRate(0)">&#8635; Again</button><button class="btn sm good" onclick="CFE.fcRate(1)">&#10003; Got it</button></div>
      <div class="fc-nav"><button class="btn sm ghost" onclick="CFE.fcPrev()">&larr;</button><button class="btn sm ghost" onclick="CFE.fcNext()">&rarr;</button><span class="count">${fcIdx+1} / ${fcList.length}</span></div>`;
  }
  function fcTurn(){ fcFlip=!fcFlip; renderCards(); }
  function fcNext(){ fcIdx=(fcIdx+1)%fcList.length; fcFlip=false; renderCards(); }
  function fcPrev(){ fcIdx=(fcIdx-1+fcList.length)%fcList.length; fcFlip=false; renderCards(); }
  function fcFilter(s){ fcSec=s; buildCards(); }
  function fcRate(good){
    const c=fcList[fcIdx];
    state.cardBox[c._i]=good?Math.min((state.cardBox[c._i]||1)+1,3):1; save();
    if(good) fcNext();
    else { const it=fcList.splice(fcIdx,1)[0]; fcList.push(it); if(fcIdx>=fcList.length)fcIdx=0; fcFlip=false; renderCards(); }
    toast(good?'Marked known':'Will resurface');
  }

  /* ===================== MOCK ===================== */
  /* ===================== DRILL ===================== */
  function chapterIndex(){
    const idx={};
    Object.entries(D.questions).forEach(([qid,q])=>{
      const k=q.sec+'||'+(q.chapter||'General');
      (idx[k]=idx[k]||[]).push(qid);
    });
    return idx;
  }
  function weakQuestions(limit){
    const h=state.qHist||{};
    const scored=Object.keys(D.questions).map(qid=>{
      const r=h[qid];
      if(!r||!r.seen) return {qid,pri:1};              // unseen: medium priority
      return {qid,pri:1+(r.wrong/r.seen)*3+(r.last===0?1:0)};  // wrong more often = higher
    }).filter(x=>{
      const r=h[x.qid];
      return !r || r.wrong>0 || !r.seen;               // only unseen or previously missed
    });
    scored.sort((a,b)=>b.pri-a.pri);
    return scored.slice(0,limit||20).map(x=>x.qid);
  }
  function renderDrill(){
    const el=document.getElementById('p-drill'); if(!el) return;
    const h=state.qHist||{};
    const total=Object.keys(D.questions).length;
    const seen=Object.keys(h).filter(k=>h[k].seen).length;
    const missed=Object.keys(h).filter(k=>h[k].wrong>0).length;
    const idx=chapterIndex();

    // accuracy per chapter, weakest first
    const rows=Object.entries(idx).map(([k,ids])=>{
      const [sec,chap]=k.split('||');
      let s=0,w=0;
      ids.forEach(id=>{ const r=h[id]; if(r&&r.seen){ s+=r.seen; w+=r.wrong; } });
      return {sec,chap,ids,attempted:s,acc:s?Math.round((s-w)/s*100):null};
    }).sort((a,b)=>{
      if(a.acc===null&&b.acc===null) return a.sec.localeCompare(b.sec);
      if(a.acc===null) return 1; if(b.acc===null) return -1;
      return a.acc-b.acc;
    });

    const typeBtn=(t,title,sub)=>{
      const n=Object.keys(D.questions).filter(q=>D.questions[q].type===t).length;
      return `<button class="btn ghost" style="flex:1 1 150px;min-width:140px;height:auto;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:13px 14px;text-align:left" onclick="CFE.drillType('${t}')">
        <span style="font-weight:600;color:var(--navy);font-size:14px">${title}</span>
        <span style="font-weight:400;font-size:11px;color:var(--ink-faint);line-height:1.35">${sub}</span>
        <span style="font-size:11px;color:var(--gold);font-weight:700;margin-top:auto">${n} questions</span>
      </button>`;
    };

    el.innerHTML=`<h2 class="head">Drill</h2>
      <p class="sub">Targeted practice outside the day plan. Nothing here affects your streak &mdash; drill as often as you like.</p>

      <div class="card pad" style="margin-bottom:16px;border-left:3px solid var(--gold)">
        <b style="color:var(--navy);font-size:15px">Weak-area drill</b>
        <p style="font-size:13px;color:var(--ink-faint);margin:6px 0 12px;line-height:1.6">
          Builds a set from questions you have <b>missed before</b> or <b>never seen</b>, hardest first.
          This is the highest-value practice on the app.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn gold" onclick="CFE.drillWeak(20)">Drill 20 weak questions</button>
          <button class="btn ghost" onclick="CFE.drillWeak(40)">Drill 40</button>
        </div>
        <div style="font-size:12px;color:var(--ink-faint);margin-top:10px">
          ${seen} of ${total} questions attempted &middot; ${missed} missed at least once</div>
      </div>

      <div class="card pad" style="margin-bottom:16px">
        <b style="color:var(--navy);font-size:15px">By question style</b>
        <p style="font-size:13px;color:var(--ink-faint);margin:6px 0 12px;line-height:1.6">
          The real exam leans on judgment and scenario items. Drill a single style to build that specific skill.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${typeBtn('judgment','Judgment','Most effective / least supports')}
          ${typeBtn('scenario','Case scenarios','Multi-part fact patterns')}
          ${typeBtn('discrimination','Discrimination','Look-alike scheme pairs')}
        </div>
      </div>

      <p class="sub" style="margin:22px 0 10px">By chapter &mdash; weakest first</p>
      <div class="card" style="overflow:hidden">
      ${rows.map(r=>{
        const badge=r.acc===null?'<span class="pill">not attempted</span>'
          :`<span class="pill" style="background:${r.acc>=75?'#e4f2e8':'#fbe4e4'};color:${r.acc>=75?'#1f7a44':'#a23030'}">${r.acc}%</span>`;
        return `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--rule)">
          <div style="flex:1;min-width:0">
            <b style="font-size:14px;color:var(--navy)">${r.chap}</b>
            <div style="font-size:11.5px;color:var(--ink-faint)">${r.sec.toUpperCase()} &middot; ${r.ids.length} questions${r.attempted?` &middot; ${r.attempted} attempted`:''}</div>
          </div>${badge}
          <button class="btn ghost" onclick="CFE.drillChapter('${r.sec}','${r.chap.replace(/'/g,"\\'")}')">Drill</button>
        </div>`;
      }).join('')}
      </div>`;
  }
  function drillWeak(n){ startCustom(weakQuestions(n),'Weak-area drill'); }
  function drillType(t){
    const ids=Object.keys(D.questions).filter(q=>D.questions[q].type===t);
    shuffle(ids); startCustom(ids.slice(0,25),'Style drill');
  }
  function drillChapter(sec,chap){
    const ids=Object.keys(D.questions).filter(q=>D.questions[q].sec===sec&&(D.questions[q].chapter||'General')===chap);
    startCustom(ids,'Chapter drill');
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  /* ===================== MOCK ===================== */
  function renderPractice(){
    const el=document.getElementById('p-practice'); if(!el) return;
    const P=D.practice;
    if(!P){ el.innerHTML='<h2 class="head">Practice</h2><p class="sub">No practice bank loaded.</p>'; return; }
    const rmock={s1:'mock_s1_recall',s2:'mock_s2_recall',s3:'mock_s3_recall'};
    const tot=(D.meta.recall&&D.meta.recall.total)||0;
    let h='<h2 class="head">Rapid recall practice</h2>';
    h+='<div class="card pad" style="margin-bottom:18px;border-left:3px solid var(--gold);background:var(--gold-bg)"><b style="color:var(--navy)">'+tot+' rapid-recall questions</b><p style="font-size:13px;color:var(--ink-soft);margin:6px 0 0;line-height:1.6">Short, factual questions — one per concept — that test whether the essentials have stuck. They <b>complement</b> the exam-style questions in your lessons and mocks: those build applied <b>judgment</b>, these build fast <b>recall</b> of definitions and rules. Aim for <b>75%</b> on a chapter to know it is solid.</p><p style="font-size:11px;color:var(--ink-faint);margin:10px 0 0;line-height:1.5">These questions are written independently for study purposes, drawing on a range of publicly available fraud-examination references. They are not affiliated with, endorsed by, or reproduced from any certifying body or its official materials.</p></div>';
    P.order.forEach(function(sec){
      const S=P.sections[sec]; if(!S||!S.chapters.length) return;
      const secTot=S.chapters.reduce(function(a,c){return a+c.ids.length;},0);
      h+='<p class="sub" style="margin:22px 0 10px"><b style="color:var(--navy)">'+SECMETA[sec].name+'</b> &middot; '+secTot+' recall questions</p>';
      const mk=rmock[sec];
      if(D.quizzes[mk]){ const st=state.quizState[mk], done=st&&st.done;
        h+='<div class="card pad" style="margin-bottom:10px;display:flex;align-items:center;gap:14px;border:1px solid var(--gold)"><div style="font-family:var(--mono);width:48px;height:48px;border-radius:11px;background:var(--navy);color:var(--gold);display:grid;place-items:center;font-weight:600;flex:none;font-size:13px">'+D.quizzes[mk].length+'</div><div style="flex:1;min-width:0"><b style="font-size:14px;color:var(--navy)">Recall mock &middot; '+D.quizzes[mk].length+'Q</b><div style="font-size:12px;color:var(--ink-faint)">Full-length recall paper'+(done?' &middot; last <b style="color:'+(st.score>=D.meta.passMark?'var(--green)':'var(--red)')+'">'+st.score+'%</b>':'')+'</div></div><button class="btn '+(done?'ghost':'gold')+'" onclick="CFE.startMock(\''+mk+'\')">'+(done?'Retake':'Start')+'</button></div>';
      }
      S.chapters.forEach(function(c,idx){
        h+='<div class="card pad" style="margin-bottom:8px;display:flex;align-items:center;gap:12px"><div style="flex:1;min-width:0"><b style="font-size:14px;color:var(--navy)">'+c.chapter+'</b><div style="font-size:12px;color:var(--ink-faint)">'+c.ids.length+' questions</div></div><button class="btn gold sm" onclick="CFE.practiceChapter(\''+sec+'\','+idx+',20)">Quick 20</button><button class="btn ghost sm" onclick="CFE.practiceChapter(\''+sec+'\','+idx+',0)">All</button></div>';
      });
    });
    el.innerHTML=h;
  }
  function practiceChapter(sec,idx,n){
    const S=D.practice&&D.practice.sections[sec]; if(!S) return;
    const c=S.chapters[idx]; if(!c||!c.ids.length){ toast('No questions'); return; }
    let ids=c.ids.slice(); shuffle(ids); if(n>0) ids=ids.slice(0,n);
    startCustom(ids, c.chapter+' — recall', {});
  }

  function renderMock(){
    const el=document.getElementById('p-mock'); if(!el) return;
    const SEC=[
      {sec:'s1',full:'mock_s1_full',a:'mock_s1_a',b:'mock_s1_b'},
      {sec:'s2',full:'mock_s2_full',a:'mock_s2_a',b:'mock_s2_b'},
      {sec:'s3',full:'mock_s3_full',a:'mock_s3_a',b:'mock_s3_b'}
    ].filter(s=>D.quizzes[s.full]);

    const card=(qz,title,note,primary)=>{
      if(!D.quizzes[qz]) return '';
      const st=state.quizState[qz], n=D.quizzes[qz].length;
      const done=st&&st.done;
      return `<div class="card pad" style="margin-bottom:10px;display:flex;align-items:center;gap:14px${primary?';border:1px solid var(--gold)':''}">
        <div style="font-family:var(--mono);width:48px;height:48px;border-radius:11px;background:${primary?'var(--navy)':'var(--gold-bg)'};color:${primary?'var(--gold)':'var(--gold)'};display:grid;place-items:center;font-weight:600;flex:none;font-size:13px">${n}</div>
        <div style="flex:1;min-width:0">
          <b style="font-size:14px;color:var(--navy)">${title}</b>
          <div style="font-size:12px;color:var(--ink-faint)">${note}${done?` &middot; last score <b style="color:${st.score>=D.meta.passMark?'var(--green)':'var(--red)'}">${st.score}%</b>`:' &middot; not attempted'}</div>
        </div>
        <button class="btn ${done?'ghost':(primary?'gold':'ghost')}" onclick="CFE.startMock('${qz}')">${done?'Retake':'Start'}</button></div>`;
    };

    el.innerHTML=`<h2 class="head">Mock exams</h2>
      <div class="card pad" style="margin-bottom:18px;border-left:3px solid var(--gold);background:var(--gold-bg)">
        <b style="color:var(--navy)">Sit the full paper cold</b>
        <p style="font-size:13px;color:var(--ink-soft);margin:6px 0 0;line-height:1.6">
          Each section's <b>full paper matches the real exam length and timing</b>. Sit it
          <b>before</b> revising, timed and closed-book &mdash; that score is your honest baseline.
          Papers <b>A</b> and <b>B</b> share no questions with each other, so they are two clean re-tests.</p>
      </div>
      ${SEC.map(s=>{
        const m=SECMETA[s.sec];
        return `<p class="sub" style="margin:20px 0 10px"><b style="color:var(--navy)">${m.name}</b> &middot; real exam: ${m.q} questions in ${m.mins} min</p>
        ${card(s.full,`Full paper &middot; ${D.quizzes[s.full].length}Q`,`Exam length &middot; ${m.mins} min, closed book`,true)}
        ${card(s.a,'Paper A','Independent re-test')}
        ${card(s.b,'Paper B','No overlap with Paper A')}`;
      }).join('')}`;
  }

  function startMock(id){ go('home'); startQuiz(id,{mock:true}); }

  /* ===================== ASK CLAUDE ===================== */

  /* ===================== NAV ===================== */
  function go(tab){
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id==='p-'+tab));
    if(tab==='plan')renderPlan(); if(tab==='learn')renderLearn();
    if(tab==='cards'){ if(!cardsInit)initCards(); else renderCards(); }
    if(tab==='mock')renderMock(); if(tab==='drill')renderDrill(); if(tab==='practice')renderPractice(); if(tab==='home')renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  /* ===================== SYNC MODAL & DATA TOOLS ===================== */
  function openSyncModal(){
    const m=document.getElementById('modal'),c=document.getElementById('modalCard');
    if(!supabaseReady()){
      c.innerHTML=`<h3>Cross-device sync</h3>
        <p>Sync isn\u2019t configured on this deployment yet. You can still move progress between devices with Export / Import at the bottom of the page.</p>
        <div class="modal-actions"><button class="btn primary" style="flex:1" onclick="CFE.closeModal()">Got it</button></div>`;
      m.classList.add('show'); return;
    }
    const cur=syncCode||'';
    c.innerHTML=`<h3>Cross-device sync</h3>
      <p>Pick a private sync code (any phrase only you know). Enter the same code on your phone and laptop, and progress flows automatically.</p>
      <label>Your sync code</label>
      <input id="syncInput" value="${cur}" placeholder="e.g. rishabh-cfe-2026" autocomplete="off">
      <div class="modal-actions">
        <button class="btn ghost" style="flex:1" onclick="CFE.closeModal()">Cancel</button>
        <button class="btn gold" style="flex:1" onclick="CFE.saveSyncCode()">Enable sync</button></div>`;
    m.classList.add('show');
    setTimeout(()=>{const i=document.getElementById('syncInput'); i&&i.focus();},80);
  }
  function saveSyncCode(){
    const v=(document.getElementById('syncInput').value||'').trim().toLowerCase().replace(/\s+/g,'-');
    if(v.length<4){ toast('Use at least 4 characters'); return; }
    syncCode=v;
    try{ localStorage.setItem('cfe_sync_code',v); }catch(e){ MEM.cfe_sync_code=v; }
    setSyncUI('on'); closeModal(); toast('Sync enabled');
    pullCloud().then(()=>pushCloud());
  }
  function closeModal(){ document.getElementById('modal').classList.remove('show'); }

  function exportProgress(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cfe-progress.json'; a.click();
    toast('Progress exported');
  }
  function importProgress(){
    const inp=document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader();
      r.onload=()=>{ try{ state=JSON.parse(r.result); save(); go('home'); toast('Progress imported'); }catch(x){ toast('Invalid file'); } };
      r.readAsText(f);}; inp.click();
  }
  function resetAll(){
    if(!confirm('Reset all progress? This cannot be undone.')) return;
    state=blankState(); save(); go('home'); toast('Reset complete');
  }

  /* ===================== TOAST ===================== */
  let tT;
  function toast(msg){ const t=document.getElementById('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(tT); tT=setTimeout(()=>t.classList.remove('show'),2200); }

  /* ===================== INIT ===================== */
  function init(){
    state=loadLocal();
    const tabs=document.getElementById('tabs');
    if(tabs) tabs.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) go(b.dataset.tab); });
    const sBtn=document.getElementById('syncBtn'); if(sBtn) sBtn.addEventListener('click',openSyncModal);
    const sChip=document.getElementById('syncChip'); if(sChip) sChip.addEventListener('click',openSyncModal);
    const modal=document.getElementById('modal'); if(modal) modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
    render();
    initSync();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();

  const API={ go,startDay,openLesson,lessonNext,exitFlow,answer,qNext,qPrev,retryQuiz,afterDay,
    startQuiz,startMock,startCustom,practiceChapter,drillWeak,drillType,drillChapter,fcTurn,fcNext,fcPrev,fcFilter,fcRate,
    openSyncModal,saveSyncCode,closeModal,exportProgress,importProgress,resetAll };
  if(typeof window!=='undefined') window.CFE=API;
  return API;
})();
if(typeof window!=='undefined' && !window.CFE) window.CFE=CFE;
