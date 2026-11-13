/* STACK 03 — état partagé entre le panneau de contrôle et les scènes OBS.
   Deux modes :
   · servi par server.js (http://…) : l'état vit sur le serveur, poussé en direct par Socket.IO ;
   · ouvert en file:/// (sans serveur) : localStorage + BroadcastChannel + relecture toutes les 400 ms.
   Le même fichier est chargé par server.js (require) pour partager les calculs. */
(function(){
  var KEY='stack03.state.v1';

  function blankMaps(n){var a=[];for(var i=0;i<n;i++)a.push({a:'',b:''});return a;}
  function blankVeto(){var st=[];for(var i=0;i<7;i++)st.push({map:'',side:''});return {first:'a',steps:st,show:true,lock:false};}
  function blankPlayers(){var p=[];for(var i=0;i<5;i++)p.push({n:'',ag:''});return p;}
  function blankStation(a,b,bo,label){return {a:a,b:b,bo:bo,label:label,map:1,maps:blankMaps(5),show:true,veto:blankVeto()};}
  function defaults(){
    return {
      v:1,
      vetos:{},
      teams:[{name:'ÉQUIPE 1',tag:'EQ1',color:'#f06c00',players:blankPlayers()},{name:'ÉQUIPE 2',tag:'EQ2',color:'#2652a8',players:blankPlayers()},{name:'ÉQUIPE 3',tag:'EQ3',color:'#e8b923',players:blankPlayers()},{name:'ÉQUIPE 4',tag:'EQ4',color:'#1a8b4a',players:blankPlayers()}],
      mapPool:['Abyss','Ascent','Haven','Lotus','Split','Summit','Sunset'],
      stations:{1:blankStation(0,1,1,'Poules · Round 1'),2:blankStation(2,3,1,'Poules · Round 1')},
      poules:[[{a:'',b:''},{a:'',b:''}],[{a:'',b:''},{a:'',b:''}],[{a:'',b:''},{a:'',b:''}]],
      bracket:{d1:{maps:blankMaps(3)},d2:{maps:blankMaps(3)},gf:{maps:blankMaps(3)},pf:{maps:blankMaps(3)}},
      timeout:{team:-1,label:'Timeout tactique',duration:60,endsAt:0},
      start:{at:0,label:'Début des matchs à 10:00'},
      casters:{a:'Caster 1',b:'Caster 2'},
      sponsorsLoop:5
    };
  }
  var SCHEDULE=[{r:1,m:[[0,1],[2,3]]},{r:2,m:[[0,2],[1,3]]},{r:3,m:[[0,3],[1,2]]}];

  function merge(base,over){
    if(over===null||typeof over!=='object'||Array.isArray(base)&&!Array.isArray(over))return base;
    if(Array.isArray(base)){return Array.isArray(over)?over.map(function(v,i){return i<base.length&&typeof base[i]==='object'&&base[i]!==null?merge(base[i],v):v;}):base;}
    var out={};for(var k in base){out[k]=(k in over)?(typeof base[k]==='object'&&base[k]!==null?merge(base[k],over[k]):over[k]):base[k];}
    for(var k2 in over){if(!(k2 in out))out[k2]=over[k2];}
    return out;
  }

  /* ---------- calculs ---------- */
  function num(v){return (v===''||v===null||v===undefined||isNaN(parseInt(v,10)))?null:parseInt(v,10);}
  function seriesWins(maps,bo){
    var a=0,b=0;
    for(var i=0;i<bo&&i<maps.length;i++){var x=num(maps[i].a),y=num(maps[i].b);if(x!==null&&y!==null){if(x>y)a++;else if(y>x)b++;}}
    return {a:a,b:b,need:Math.ceil(bo/2)};
  }
  function standings(s){
    var T=[0,1,2,3].map(function(i){return {i:i,v:0,d:0,pj:0,pts:0,rd:0};});
    SCHEDULE.forEach(function(round,ri){round.m.forEach(function(m,mi){
      var sc=s.poules[ri][mi],x=num(sc.a),y=num(sc.b);if(x===null||y===null)return;
      var A=T[m[0]],B=T[m[1]];A.pj++;B.pj++;A.rd+=x-y;B.rd+=y-x;
      if(x>y){A.v++;A.pts+=3;B.d++;}else if(y>x){B.v++;B.pts+=3;A.d++;}
    });});
    var sorted=T.slice().sort(function(p,q){return q.pts-p.pts||q.rd-p.rd||q.v-p.v||p.i-q.i;});
    var done=T.every(function(t){return t.pj>=3;});
    return {rows:sorted,done:done};
  }
  function bracketView(s){
    var st=standings(s),seed=st.rows.map(function(r){return r.i;});
    var out={seeds:seed,pouleDone:st.done};
    function ser(key,ta,tb){
      var m=s.bracket[key].maps,w=seriesWins(m,3);
      var winner=w.a>=2?'a':w.b>=2?'b':null;
      return {ta:ta,tb:tb,maps:m,wa:w.a,wb:w.b,winner:winner,live:(w.a+w.b>0||m.some(function(x){return num(x.a)!==null||num(x.b)!==null;}))};
    }
    var hasSeeds=st.done||st.rows.some(function(r){return r.pj>0;});
    var d1=ser('d1',hasSeeds?seed[0]:null,hasSeeds?seed[3]:null);
    var d2=ser('d2',hasSeeds?seed[1]:null,hasSeeds?seed[2]:null);
    function w(d){return d.winner==='a'?d.ta:d.winner==='b'?d.tb:null;}
    function l(d){return d.winner==='a'?d.tb:d.winner==='b'?d.ta:null;}
    var gf=ser('gf',w(d1),w(d2)),pf=ser('pf',l(d1),l(d2));
    out.d1=d1;out.d2=d2;out.gf=gf;out.pf=pf;
    out.champion=gf.winner==='a'?gf.ta:gf.winner==='b'?gf.tb:null;
    out.second=gf.winner==='a'?gf.tb:gf.winner==='b'?gf.ta:null;
    out.third=pf.winner==='a'?pf.ta:pf.winner==='b'?pf.tb:null;
    return out;
  }
  /* Séquence de veto (7 maps) : BO1 = 6 bans ; BO3 = ban ban pick pick ban ban ; BO5 = ban ban pick pick pick pick ; dernière map = decider */
  function vetoSequence(bo,first){
    var f=first==='b'?'b':'a',o=f==='a'?'b':'a',seq;
    if(bo>=5)seq=[['ban',f],['ban',o],['pick',f],['pick',o],['pick',f],['pick',o]];
    else if(bo>=3)seq=[['ban',f],['ban',o],['pick',f],['pick',o],['ban',f],['ban',o]];
    else seq=[['ban',f],['ban',o],['ban',f],['ban',o],['ban',f],['ban',o]];
    seq.push(['decider','']);
    return seq.map(function(x){return {act:x[0],team:x[1]};});
  }
  /* Prochaine action attendue du veto d'une station (liens équipes).
     Le côté d'une map pick est choisi par l'adversaire ; celui du decider par l'équipe qui a commencé.
     Renvoie null quand le veto est terminé. kind : ban | pick | side | decider (la régie doit choisir). */
  function vetoNext(st){
    var bo=parseInt(st.bo,10)||1,v=st.veto,f=v.first==='b'?'b':'a',seq=vetoSequence(bo,f);
    for(var i=0;i<7;i++){
      var x=v.steps[i]||{},q=seq[i];
      if(!x.map)return q.act==='decider'?{i:i,kind:'decider',team:''}:{i:i,kind:q.act,team:q.team};
      if(q.act==='pick'&&!x.side)return {i:i,kind:'side',team:q.team==='a'?'b':'a',map:x.map};
      if(q.act==='decider'&&!x.side)return {i:i,kind:'side',team:f,map:x.map};
    }
    return null;
  }
  function tname(s,i){return (i===null||i===undefined||i<0)?'À DÉTERMINER':s.teams[i].name;}
  function tcol(s,i){return (i===null||i===undefined||i<0)?'#3a2832':(s.teams[i].color||'#e33bae');}
  function ttag(s,i){return (i===null||i===undefined||i<0)?'—':s.teams[i].tag;}
  function pad(n){return (n<10?'0':'')+n;}
  function fmt(ms){ms=Math.max(0,ms);var t=Math.ceil(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),x=t%60;return (h?h+':'+pad(m):pad(m))+':'+pad(x);}
  function fmtMS(ms){ms=Math.max(0,ms);var t=Math.ceil(ms/1000);return Math.floor(t/60)+':'+pad(t%60);}

  var api={tcol:tcol,vetoSequence:vetoSequence,vetoNext:vetoNext,KEY:KEY,SCHEDULE:SCHEDULE,defaults:defaults,merge:merge,
    num:num,seriesWins:seriesWins,standings:standings,bracketView:bracketView,tname:tname,ttag:ttag,fmt:fmt,fmtMS:fmtMS,
    blankMaps:blankMaps,blankStation:blankStation};

  /* Node (server.js) : uniquement les calculs. */
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}

  /* ---------- synchronisation (navigateur) ---------- */
  var listeners=[];
  function emit(s){listeners.forEach(function(f){try{f(s);}catch(e){console.error(e);}});}
  function parse(raw){var d=defaults();if(!raw)return d;try{return merge(d,JSON.parse(raw));}catch(e){return d;}}

  var SERVER=/^https?:$/.test(location.protocol)&&typeof io==='function';
  if(SERVER){
    /* Clé régie : nécessaire pour modifier l'état depuis un autre PC que le serveur (?key=… une fois, puis mémorisée). */
    var key=new URLSearchParams(location.search).get('key');
    try{if(key)localStorage.setItem('stack03.key',key);else key=localStorage.getItem('stack03.key');}catch(e){}
    var cache=null,sock=io('/stack03',{auth:{key:key||''}});
    sock.on('state',function(raw){if(raw===cache)return;cache=raw;emit(parse(raw));});
    sock.on('connect',function(){api.connected=true;document.dispatchEvent(new CustomEvent('stack:status',{detail:{connected:true}}));});
    sock.on('disconnect',function(){api.connected=false;document.dispatchEvent(new CustomEvent('stack:status',{detail:{connected:false}}));});
    sock.on('readonly',function(){document.dispatchEvent(new CustomEvent('stack:readonly'));});
    api.load=function(){return parse(cache);};
    api.save=function(s){cache=JSON.stringify(s);sock.emit('state:set',cache);emit(s);};
    api.onChange=function(fn){listeners.push(fn);if(cache!==null)fn(parse(cache));};
    api.server=true;api.socket=sock;api.key=key||'';
  }else{
    var bc=null; try{bc=new BroadcastChannel('stack03');}catch(e){}
    var last='';
    var load=function(){var raw=null;try{raw=localStorage.getItem(KEY);}catch(e){}return parse(raw);};
    var check=function(){
      var raw=null;try{raw=localStorage.getItem(KEY);}catch(e){}
      if(raw!==null&&raw!==last){last=raw;emit(load());}
    };
    api.load=load;
    api.save=function(s){
      var raw=JSON.stringify(s);last=raw;
      try{localStorage.setItem(KEY,raw);}catch(e){}
      if(bc)try{bc.postMessage(raw);}catch(e){}
      emit(s);
    };
    api.onChange=function(fn){listeners.push(fn);fn(load());};
    window.addEventListener('storage',function(e){if(e.key===KEY)check();});
    if(bc)bc.onmessage=function(e){if(e.data!==last){last=e.data;try{localStorage.setItem(KEY,e.data);}catch(x){} emit(load());}};
    setInterval(check,400);
    api.server=false;
  }

  /* ---------- sponsors en boucle ---------- */
  function mountSponsors(el,opts){
    opts=opts||{};
    el.classList.add('sponsor-box');if(opts.rightBar)el.classList.add('right-bar');
    var base=(opts.base||'assets/');
    el.innerHTML='<i class="bar"></i>'+
      '<div class="sp on"><img src="'+base+'logo-lst-2023-white.svg" alt="LST" onerror="this.outerHTML=\'<span class=txt>LST</span>\'"></div>'+
      '<div class="sp"><img src="'+base+'credit-mutuel.svg" alt="Crédit Mutuel"></div>'+
      '<div class="sp"><img class="wide" src="'+base+'logols4bv3.svg" alt="Team LS4B"></div>';
    var items=el.querySelectorAll('.sp'),k=0;
    setInterval(function(){items[k].classList.remove('on');k=(k+1)%items.length;items[k].classList.add('on');},opts.every||10000);
  }
  api.mountSponsors=mountSponsors;

  window.Stack=api;
})();
