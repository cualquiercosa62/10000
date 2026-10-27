/* 10000 (Diez mil) rules. Shared by the server (Node) and the browser.
   1 = 100, 5 = 50. Three of a kind in one roll: three 1s = 1000, three of any other number = number x 100.
   A 4th or 5th die of the same number only adds if it is a 1 (100) or a 5 (50).
   Five of the same number in one roll wins the game. No straights. No minimum to open. */
(function(){
const GOAL=10000;
const counts=v=>{const c=[0,0,0,0,0,0,0];v.forEach(d=>c[d]++);return c};

// Points for a set of dice the player keeps from one roll. valid=false if any kept die does not score.
function scoreKeep(vals){
  const c=counts(vals);let pts=0,valid=vals.length>0;
  for(let f=1;f<=6;f++){
    let n=c[f];if(!n)continue;
    if(n>=3){pts+=f===1?1000:f*100;n-=3}
    if(n){if(f===1)pts+=100*n;else if(f===5)pts+=50*n;else valid=false}
  }
  return{points:pts,valid};
}
const fiveSame=vals=>vals.length===5&&vals.every(d=>d===vals[0]);
function rollScores(vals){const c=counts(vals);return c[1]>0||c[5]>0||c.some((n,f)=>f>0&&n>=3)}
// Best keep: every die that scores.
function bestKeep(vals){
  const c=counts(vals),idx=[];
  vals.forEach((d,i)=>{if(d===1||d===5||c[d]>=3)idx.push(i)});
  // only the first three of a non-1/5 number score
  const seen={};const out=[];for(const i of idx){const d=vals[i];seen[d]=(seen[d]||0)+1;if(d!==1&&d!==5&&seen[d]>3)continue;out.push(i)}
  return out;
}

const nm=(s,p)=>s.players[p]?.name||'Someone';
function addLog(s,t){s.log=[t,...(s.log||[])].slice(0,40)}
const rollDice=n=>Array.from({length:n},()=>1+Math.floor(Math.random()*6));

function startTurn(s){
  const p=s.order[s.turnIdx];
  s.turn={pid:p,total:0,kept:[],roll:null,left:5,phase:'start'};
}
function newGame(s){
  s.scores={};s.order.forEach(p=>s.scores[p]=0);
  s.turnIdx=Math.floor(Math.random()*s.order.length);s.status='playing';s.winner=null;s.log=[];s.last=null;s.round=1;
  startTurn(s);addLog(s,`${nm(s,s.order[s.turnIdx])} starts.`);
}
function endTurn(s){s.turnIdx=(s.turnIdx+1)%s.order.length;startTurn(s)}
function win(s,p,why){s.status='gameover';s.winner=p;addLog(s,`${nm(s,p)} wins${why?' '+why:''}!`)}

function doRoll(s,p){
  const t=s.turn;
  if(s.status!=='playing'||!t||t.pid!==p)return 'Not your turn.';
  if(t.phase!=='start')return 'Choose which dice to keep first.';
  const r=rollDice(t.left);t.roll=r;
  if(fiveSame(r)){s.last={kind:'five',pid:p,roll:r};win(s,p,`with five ${r[0]}s in one roll`);return null}
  if(!rollScores(r)){
    s.last={kind:'bust',pid:p,roll:r,lost:t.total};
    addLog(s,`${nm(s,p)} rolled ${r.join(' ')}: nothing scores${t.total?`, and loses ${t.total} points`:''}.`);
    endTurn(s);return null;
  }
  t.phase='choose';return null;
}
// Keep some dice from the current roll, then roll again or stop.
function keep(s,p,idx,then){
  const t=s.turn;
  if(s.status!=='playing'||!t||t.pid!==p)return 'Not your turn.';
  if(t.phase!=='choose'||!t.roll)return 'Roll first.';
  idx=[...new Set(idx.map(Number))].filter(i=>Number.isInteger(i)&&i>=0&&i<t.roll.length);
  if(!idx.length)return 'Pick at least one die that scores.';
  const vals=idx.map(i=>t.roll[i]);const sc=scoreKeep(vals);
  if(!sc.valid)return 'Every die you keep has to score: 1s, 5s, or three of a kind.';
  t.total+=sc.points;t.kept.push({dice:vals,points:sc.points});t.left-=vals.length;t.roll=null;t.phase='start';
  const hot=t.left===0;if(hot)t.left=5;
  const sum=s.scores[p]+t.total;
  if(s.opts.finish==='exact'&&sum>GOAL){
    s.last={kind:'over',pid:p,lost:t.total};
    addLog(s,`${nm(s,p)} went over ${GOAL} and loses ${t.total} points.`);endTurn(s);return null;
  }
  if(then==='stop'||sum===GOAL||(s.opts.finish!=='exact'&&sum>=GOAL)){
    s.scores[p]=sum;s.last={kind:'bank',pid:p,points:t.total};
    addLog(s,`${nm(s,p)} scores ${t.total} (total ${sum}).`);
    if(sum>=GOAL){win(s,p,`with ${sum}`);return null}
    endTurn(s);return null;
  }
  if(hot)addLog(s,`${nm(s,p)} scored with all five dice and rolls all five again.`);
  return doRoll(s,p);
}

const API={GOAL,scoreKeep,fiveSame,rollScores,bestKeep,nm,addLog,newGame,startTurn,endTurn,doRoll,keep,counts};
if(typeof module!=='undefined')module.exports=API;else window.DiezMil=API;
})();
