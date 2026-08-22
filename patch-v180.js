(() => {
  const SUBSTITUTE_ROOM_GROUPS = [
    { id:"science-multi", name:"理科・多目的室グループ", rooms:["物理室","生物室","多目的室"] }
  ];

  const originalConflictEntriesV180 = conflictEntries;
  const originalRenderDailyDayV180 = renderDailyDay;
  const originalRenderDailyClassWeekV180 = renderDailyClassWeek;

  function roomGroupFor(room){
    return SUBSTITUTE_ROOM_GROUPS.find(g=>g.rooms.includes(room)) || null;
  }

  function uniqueLessonsAt(date,day,p){
    const map=new Map();
    state.classes.forEach(cls=>{
      if(!periodsForClass(cls).includes(p))return;
      const l=getDaily(cls,date,day,p);if(!l)return;
      const gid=l.groupId||`${cls}-${day}-${p}`;
      if(!map.has(gid))map.set(gid,{groupId:gid,lesson:l,classes:new Set()});
      const item=map.get(gid);
      (l.participants?.length?l.participants:[cls]).forEach(c=>item.classes.add(c));
    });
    return [...map.values()].map(x=>({...x,classes:[...x.classes]}));
  }

  function groupedRoomSituation(date,day,p,group){
    const lessons=uniqueLessonsAt(date,day,p).filter(x=>(x.lesson.rooms||[]).some(r=>group.rooms.includes(r)));
    const byRoom={};group.rooms.forEach(r=>byRoom[r]=[]);
    lessons.forEach(x=>{
      (x.lesson.rooms||[]).filter(r=>group.rooms.includes(r)).forEach(r=>byRoom[r].push(x));
    });
    const conflictRooms=group.rooms.filter(r=>new Set(byRoom[r].map(x=>x.groupId)).size>1);
    if(!conflictRooms.length)return null;

    const uniqueGroups=new Map();
    lessons.forEach(x=>uniqueGroups.set(x.groupId,x));
    const occupiedRooms=group.rooms.filter(r=>byRoom[r].length>0);
    const freeRooms=group.rooms.filter(r=>byRoom[r].length===0);
    const resolvable=uniqueGroups.size<=group.rooms.length;
    const conflictGroups=new Map();
    conflictRooms.forEach(r=>byRoom[r].forEach(x=>conflictGroups.set(x.groupId,x)));

    return {
      groupId:group.id,
      groupName:group.name,
      rooms:[...group.rooms],
      conflictRooms,
      freeRooms,
      occupiedRooms,
      lessonCount:uniqueGroups.size,
      resolvable,
      lessons:[...conflictGroups.values()]
    };
  }

  function roomCandidateSituations(date){
    const out=[];
    DAYS.forEach(day=>allPeriodsForSchool().forEach(p=>{
      SUBSTITUTE_ROOM_GROUPS.forEach(group=>{
        const s=groupedRoomSituation(date,day,p,group);
        if(s)out.push({...s,date,day,p});
      });
    }));
    return out;
  }

  function candidateForSlot(cls,date,day,p){
    return roomCandidateSituations(date).find(s=>s.day===day&&+s.p===+p&&s.resolvable&&s.lessons.some(x=>x.classes.includes(cls)))||null;
  }

  conflictEntries=function(date){
    const base=originalConflictEntriesV180(date);
    const situations=roomCandidateSituations(date);
    const resolvableKeys=new Set();
    situations.filter(s=>s.resolvable).forEach(s=>{
      s.lessons.forEach(x=>s.conflictRooms.forEach(room=>resolvableKeys.add(`${s.day}-${s.p}-${room}-${x.groupId}`)));
    });
    const roomCandidates=[];
    situations.filter(s=>s.resolvable).forEach(s=>roomCandidates.push(s));
    const unresolvedRoom=(base.room||[]).filter(x=>!resolvableKeys.has(`${x.day}-${x.p}-${x.room}-${x.groupId}`));
    return {...base,room:unresolvedRoom,roomCandidates};
  };

  function candidateClassFor(cls,date,day,p){
    return candidateForSlot(cls,date,day,p)?"room-candidate-cell":"";
  }

  function candidateText(s){
    const classes=[...new Set(s.lessons.flatMap(x=>x.classes))].join("・");
    const conflict=s.conflictRooms.join("・");
    const free=s.freeRooms.length?s.freeRooms.join("・"):"グループ内の別室";
    return `${s.p}限 ${classes}：${conflict}が重複 → 候補 ${free}（手動で変更）`;
  }

  renderDayStatus=function(date,day){
    const c=conflictEntries(date);
    const t=(c.teacher||[]).filter(x=>x.day===day),r=(c.room||[]).filter(x=>x.day===day),a=(c.availability||[]).filter(x=>x.day===day);
    const candidates=(c.roomCandidates||[]).filter(x=>x.day===day);
    const hasHard=t.length||r.length||a.length;
    let html=hasHard
      ?`<div class="status bad">この日の確認事項：教員重複 ${t.length}件 / 教室重複 ${r.length}件 / 勤務時間外 ${a.length}件</div>`
      :`<div class="status ok">この日の教員・教室・勤務時間の重大な重複はありません。</div>`;
    if(candidates.length){
      html+=`<div class="status room-candidate-status"><strong>代替教室の候補 ${candidates.length}件</strong><div class="small">物理室・生物室・多目的室は代替可能グループとして判定しています。自動変更は行いません。</div>${candidates.map(s=>`<div class="room-candidate-item">${esc(candidateText(s))}</div>`).join("")}</div>`;
    }
    $("#dailyStatus").innerHTML=html;
  };

  function markCandidateCells(root=document){
    root.querySelectorAll("#dailyTable td.slot").forEach(td=>{
      const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period;
      if(cls&&date&&day&&candidateForSlot(cls,date,day,p))td.classList.add("room-candidate-cell");
    });
  }

  function appendWeekCandidateStatus(date){
    if(ui.dailyMode!=="class")return;
    const cls=$("#dailyClass")?.value;if(!cls)return;
    const wd=weekDates(date),list=[];
    DAYS.forEach(day=>{
      const actual=wd[day];
      roomCandidateSituations(actual).filter(s=>s.day===day&&s.resolvable&&s.lessons.some(x=>x.classes.includes(cls))).forEach(s=>list.push(s));
    });
    if(!list.length)return;
    $("#dailyStatus").insertAdjacentHTML("beforeend",`<div class="status room-candidate-status"><strong>${cls}の代替教室候補 ${list.length}件</strong>${list.map(s=>`<div class="room-candidate-item">${fmtCandidateDate(s.date)} ${esc(candidateText(s))}</div>`).join("")}</div>`);
  }

  function fmtCandidateDate(s){
    const d=parseLocalDate(s);return `${d.getMonth()+1}/${d.getDate()}`;
  }

  renderDailyDay=function(date,day){
    originalRenderDailyDayV180(date,day);
    if(day)markCandidateCells(document);
  };

  renderDailyClassWeek=function(date){
    originalRenderDailyClassWeekV180(date);
    markCandidateCells(document);
    appendWeekCandidateStatus(date);
  };

  function injectLegend(){
    const legend=document.querySelector(".legend");if(!legend||legend.querySelector(".room-candidate-legend"))return;
    const span=document.createElement("span");span.className="room-candidate-legend";span.innerHTML=`<i class="dot room-candidate-dot"></i>代替教室候補`;legend.appendChild(span);
  }

  const style=document.createElement("style");
  style.textContent=`
    td.room-candidate-cell{box-shadow:inset 0 0 0 3px #d4a000!important}
    .room-candidate-status{background:#fff8d8;color:#725300;border:1px solid #ead27a}
    .room-candidate-item{margin-top:6px;padding-top:6px;border-top:1px dashed #dfc45a;font-size:12px}
    .dot.room-candidate-dot{background:#d4a000}
  `;
  document.head.appendChild(style);

  injectLegend();
  const prevRenderAll=renderAll;
  renderAll=function(){prevRenderAll();injectLegend();markCandidateCells(document)};
  renderAll();
})();