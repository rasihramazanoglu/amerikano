import { useReducer, useEffect, useRef } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const RANK_VALUES = {A:15,2:5,3:5,4:5,5:5,6:5,7:5,8:5,9:5,10:10,J:10,Q:10,K:10};
const RANK_ORDER  = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
const AI_NAMES    = ["Sofia","Marco","Leila"];

const CONTRACTS = [
  {round:1,desc:"2 Sets of 3",        sets:2,runs:0},
  {round:2,desc:"1 Set + 1 Run of 3", sets:1,runs:1},
  {round:3,desc:"2 Runs of 3",        sets:0,runs:2},
  {round:4,desc:"3 Sets of 3",        sets:3,runs:0},
  {round:5,desc:"2 Sets + 1 Run of 3",     sets:2,runs:1},
  {round:6,desc:"1 Set + 2 Runs of 3",     sets:1,runs:2},
  {round:7,desc:"3 Runs of 3",        sets:0,runs:3},
];

// ── Deck ─────────────────────────────────────────────────────────────────────
function createDeck() {
  const d=[];
  for(let n=0;n<2;n++){
    for(const s of SUITS) for(const r of RANKS) d.push({rank:r,suit:s,id:`${r}${s}${n}`});
    d.push({rank:"JK",suit:"J",id:`joker${n}`,isJoker:true});
  }
  return d;
}
function shuffle(d){const a=[...d];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cardValue(c){return c.isJoker?25:RANK_VALUES[c.rank]||5;}
function handScore(h){return h.reduce((s,c)=>s+cardValue(c),0);}

// ── Validation ────────────────────────────────────────────────────────────────
function isSet(cards){
  if(cards.length<3||cards.length>4) return false;
  const nj=cards.filter(c=>!c.isJoker);
  if(!nj.length) return false;
  const r=nj[0].rank;
  if(!nj.every(c=>c.rank===r)) return false;
  const suits=nj.map(c=>c.suit);
  return new Set(suits).size===suits.length;
}
function isRun(cards){
  if(cards.length<3) return false;
  const nj=cards.filter(c=>!c.isJoker);
  if(!nj.length) return false;
  if([...new Set(nj.map(c=>c.suit))].length>1) return false;
  const sorted=[...nj].sort((a,b)=>RANK_ORDER[a.rank]-RANK_ORDER[b.rank]);
  let jokers=cards.length-nj.length;
  for(let i=1;i<sorted.length;i++){
    const gap=RANK_ORDER[sorted[i].rank]-RANK_ORDER[sorted[i-1].rank]-1;
    if(gap<0) return false;
    jokers-=gap;
    if(jokers<0) return false;
  }
  return true;
}
function isValidMeld(cards){return isSet(cards)||isRun(cards);}
function contractMet(melds,contract){
  return melds.filter(m=>isSet(m)).length>=contract.sets&&
         melds.filter(m=>isRun(m)).length>=contract.runs;
}

// ── AI ────────────────────────────────────────────────────────────────────────
function aiDiscard(hand){
  const rg={};
  hand.forEach(c=>{if(!c.isJoker){rg[c.rank]=rg[c.rank]||[];rg[c.rank].push(c);}});
  const useful=new Set();
  Object.values(rg).forEach(g=>{if(g.length>=2)g.forEach(c=>useful.add(c.id));});
  const cands=hand.filter(c=>!useful.has(c.id)&&!c.isJoker);
  const pool=cands.length?cands:hand.filter(c=>!c.isJoker);
  return(pool.length?pool:hand).sort((a,b)=>cardValue(b)-cardValue(a))[0];
}
// AI decides whether to buy a discarded card
// Returns true if the card is useful (completes a pair/run) and buys < 3
function aiBuyDecision(hand,card,buysUsed,metContract){
  if(metContract||buysUsed>=3||card.isJoker) return card.isJoker && !metContract && buysUsed<3;
  const rg={};
  hand.forEach(c=>{if(!c.isJoker){rg[c.rank]=rg[c.rank]||[];rg[c.rank].push(c);}});
  // Buy if it completes a pair for a set
  if(rg[card.rank]&&rg[card.rank].length>=1) return Math.random()<0.7;
  // Buy if it fits a suit run
  const samesuit=hand.filter(c=>c.suit===card.suit&&!c.isJoker);
  if(samesuit.length>=2) return Math.random()<0.5;
  return false;
}
function aiBuildMelds(hand,contract){
  const rg={},sg={};
  hand.forEach(c=>{if(!c.isJoker){
    rg[c.rank]=rg[c.rank]||[];rg[c.rank].push(c);
    sg[c.suit]=sg[c.suit]||[];sg[c.suit].push(c);
  }});
  const melds=[],used=new Set();
  for(let i=0;i<contract.sets;i++){
    for(const g of Object.values(rg)){
      const av=g.filter(c=>!used.has(c.id));
      const bySuit={};av.forEach(c=>{if(!bySuit[c.suit])bySuit[c.suit]=c;});
      const uniq=Object.values(bySuit);
      if(uniq.length>=3){const sl=uniq.slice(0,3);sl.forEach(c=>used.add(c.id));melds.push(sl);break;}
    }
  }
  for(let i=0;i<contract.runs;i++){
    for(const g of Object.values(sg)){
      const av=g.filter(c=>!used.has(c.id)).sort((a,b)=>RANK_ORDER[a.rank]-RANK_ORDER[b.rank]);
      for(let j=0;j<=av.length-3;j++){
        const sl=av.slice(j,j+3);
        if(isRun(sl)){sl.forEach(c=>used.add(c.id));melds.push(sl);break;}
      }
    }
  }
  return melds;
}

// ── Buy eligibility ──────────────────────────────────────────────────────────
// Returns ordered list of player turns that are eligible to buy (clockwise, skip active)
function buyEligible(activeTurn, metContract, buysUsed){
  const order=["player","ai0","ai1","ai2"];
  const activeIdx=order.indexOf(activeTurn);
  // clockwise starting after active player
  const eligible=[];
  for(let i=1;i<=3;i++){
    const t=order[(activeIdx+i)%4];
    const pi=pIdx(t);
    if(!metContract[pi]&&buysUsed[pi]<3) eligible.push(t);
  }
  return eligible;
}

// ── Turn helpers ──────────────────────────────────────────────────────────────
const TURN_ORDER=["player","ai0","ai1","ai2"];
function nextTurn(cur){return TURN_ORDER[(TURN_ORDER.indexOf(cur)+1)%4];}
function pIdx(turn){return turn==="player"?0:parseInt(turn[2])+1;}
function turnName(turn){return turn==="player"?"You":AI_NAMES[parseInt(turn[2])];}

// ── Deal ──────────────────────────────────────────────────────────────────────
function dealRound(roundIndex,gameScores){
  const deck=shuffle(createDeck());
  const firstPlayer=TURN_ORDER[roundIndex%4];
  const fp=pIdx(firstPlayer);
  const hands=[[],[],[],[]];
  for(let p=0;p<4;p++) hands[p]=deck.splice(0,13);
  hands[fp].push(deck.pop());
  return {
    deck,hands,
    melds:[[],[],[],[]],
    metContract:[false,false,false,false],
    buysUsed:[0,0,0,0],        // how many buys each player has used this round
    discardPile:[],
    turn:firstPlayer,
    phase:"discard_first",
    selectedCards:[],
    stagingGroups:[],
    // buying state
    buyWindow:false,           // true = buy window is open
    buyWindowCard:null,        // the card up for buying
    buyWindowFor:null,         // whose turn it was when discard happened (they draw from deck instead)
    buyWindowNext:null,        // who draws next after buy resolves
    message:firstPlayer==="player"
      ?"You go first — 14 cards. Select 1 to discard."
      :`${turnName(firstPlayer)} goes first (14 cards)…`,
    roundOver:false,
    aiTurnPending:firstPlayer!=="player",
    gameScores:gameScores||{0:0,1:0,2:0,3:0},
  };
}
function initialState(){return{...dealRound(0,{0:0,1:0,2:0,3:0}),roundIndex:0,gameOver:false};}

// ── End round ──────────────────────────────────────────────────────────────────
function endRound(state,winnerTurn,hands,lastDiscard){
  const scores={...state.gameScores};
  for(let i=0;i<4;i++){
    const h=hands[i]||state.hands[i];
    if(i!==pIdx(winnerTurn)) scores[i]+=handScore(h);
  }
  const isLast=state.roundIndex>=6;
  let winnerName=turnName(winnerTurn);
  if(isLast){
    const minS=Math.min(...Object.values(scores));
    const wi=Object.keys(scores).find(k=>scores[k]===minS);
    winnerName=wi==="0"?"You":AI_NAMES[parseInt(wi)-1];
  }
  return{...state,hands,discardPile:[...state.discardPile,lastDiscard],
    gameScores:scores,roundOver:true,gameOver:isLast,aiTurnPending:false,
    message:`${turnName(winnerTurn)} went out! Round over.`,winnerName};
}

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state,action){
  switch(action.type){

    case "REORDER_HAND":{
      const{from,to}=action;
      const h=[...state.hands[0]];
      const[moved]=h.splice(from,1);h.splice(to,0,moved);
      return{...state,hands:state.hands.map((hh,i)=>i===0?h:hh)};
    }

    case "TOGGLE_CARD_FIRST":{
      if(state.turn!=="player"||state.phase!=="discard_first") return state;
      // Can't select a card that's already in a staging group
      return{...state,selectedCards:[action.id]};
    }

    case "FIRST_DISCARD":{
      if(state.turn!=="player"||state.phase!=="discard_first") return state;
      if(state.selectedCards.length!==1) return{...state,message:"Select 1 card to discard."};
      const cid=state.selectedCards[0];
      const card=state.hands[0].find(c=>c.id===cid);
      const hands=state.hands.map((h,i)=>i===0?h.filter(c=>c.id!==cid):h);
      const nt=nextTurn("player");
      return{...state,hands,discardPile:[...state.discardPile,card],
        selectedCards:[],stagingGroups:[],
        turn:nt,phase:"draw",aiTurnPending:nt!=="player",
        message:nt==="player"?"Your turn — draw a card.":`${turnName(nt)}'s turn…`};
    }

    case "DRAW_DECK":{
      if(state.turn!=="player"||state.phase!=="draw") return state;
      const deck=[...state.deck];
      if(!deck.length) return{...state,message:"Deck is empty!"};
      const card=deck.pop();
      const hands=state.hands.map((h,i)=>i===0?[...h,card]:h);
      return{...state,deck,hands,phase:"meld",selectedCards:[],
        message:`Drew ${card.isJoker?"Joker":card.rank+card.suit}. Group cards to build contract, then Go Down.`};
    }

    case "DRAW_DISCARD":{
      if(state.turn!=="player"||state.phase!=="draw") return state;
      if(!state.discardPile.length) return state;
      const dp=[...state.discardPile];const card=dp.pop();
      const hands=state.hands.map((h,i)=>i===0?[...h,card]:h);
      return{...state,discardPile:dp,hands,phase:"meld",selectedCards:[],
        message:`Picked up ${card.isJoker?"Joker":card.rank+card.suit}. Group cards then Go Down.`};
    }

    case "TOGGLE_CARD":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      const id=action.id;
      // Cards already committed to staging groups cannot be selected here
      const inStaging=state.stagingGroups.flat().includes(id);
      if(inStaging) return state;
      const sel=state.selectedCards.includes(id)
        ?state.selectedCards.filter(x=>x!==id)
        :[...state.selectedCards,id];
      return{...state,selectedCards:sel};
    }

    // Add selected cards as a new staging group
    case "STAGE_GROUP":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      if(state.metContract[0]) return{...state,message:"Already down — just lay off or discard."};
      if(state.selectedCards.length<3) return{...state,message:"Select at least 3 cards to stage."};
      const contract=CONTRACTS[state.roundIndex];
      const cards=state.hands[0].filter(c=>state.selectedCards.includes(c.id));
      if(!isSet(cards)&&!isRun(cards))
        return{...state,message:"Not a valid set or run. Fix the selection."};
      // Check we don't exceed contract requirements
      const newGroups=[...state.stagingGroups,state.selectedCards];
      const groupCards=newGroups.map(g=>state.hands[0].filter(c=>g.includes(c.id)));
      const setsCount=groupCards.filter(g=>isSet(g)).length;
      const runsCount=groupCards.filter(g=>isRun(g)).length;
      if(setsCount>contract.sets||runsCount>contract.runs)
        return{...state,message:`Contract only needs ${contract.sets} set(s) and ${contract.runs} run(s).`};
      return{...state,stagingGroups:newGroups,selectedCards:[],
        message:`Group ${newGroups.length} staged. ${newGroups.length<(contract.sets+contract.runs)?"Add more groups or disband.":"Ready to Go Down!"}`};
    }

    // Remove a staging group — cards return to hand (selectable again)
    case "DISBAND_GROUP":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      if(state.metContract[0]) return{...state,message:"Already down — can't disband."};
      const newGroups=state.stagingGroups.filter((_,i)=>i!==action.groupIdx);
      return{...state,stagingGroups:newGroups,selectedCards:[],
        message:"Group disbanded — cards returned to hand."};
    }

    // Commit all staging groups to the table at once if contract is fully met
    case "GO_DOWN":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      if(state.metContract[0]) return{...state,message:"Already down!"};
      const contract=CONTRACTS[state.roundIndex];
      if(!state.stagingGroups.length) return{...state,message:"Stage your groups first."};
      const groupCards=state.stagingGroups.map(g=>state.hands[0].filter(c=>g.includes(c.id)));
      // Validate every group
      for(const g of groupCards){
        if(!isSet(g)&&!isRun(g))
          return{...state,message:"One of your groups is not a valid set or run."};
      }
      if(!contractMet(groupCards,contract))
        return{...state,message:`Need ${contract.sets} set(s) and ${contract.runs} run(s) to go down.`};
      // Commit
      const usedIds=new Set(state.stagingGroups.flat());
      const hands=state.hands.map((h,i)=>i===0?h.filter(c=>!usedIds.has(c.id)):h);
      const newMelds=state.melds.map((m,i)=>i===0?[...m,...groupCards]:m);
      const metContract=state.metContract.map((v,i)=>i===0?true:v);
      if(hands[0].length===0){
        // Went out immediately on going down (no discard needed? normally must discard but allow)
        return endRound({...state,hands,melds:newMelds,metContract},
          "player",hands,null);
      }
      return{...state,hands,melds:newMelds,metContract,stagingGroups:[],selectedCards:[],
        message:"You're down! Tap 1 card, then tap a meld on the table to lay it off. Or discard to end your turn."};
    }

    // Lay off a single selected card onto an existing table meld
    case "LAYOFF":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      if(!state.metContract[0])
        return{...state,message:"You must go down before laying off."};
      if(state.selectedCards.length!==1) return{...state,message:"Select exactly 1 card."};
      const cid=state.selectedCards[0];
      const card=state.hands[0].find(c=>c.id===cid);
      const{ownerTurn,meldIdx}=action;
      const oi=pIdx(ownerTurn);
      let valid=true;
      const newMelds=state.melds.map((ms,i)=>{
        if(i!==oi) return ms;
        const m=[...ms];const ext=[...m[meldIdx],card];
        if(!isSet(ext)&&!isRun(ext)){valid=false;return ms;}
        m[meldIdx]=ext;return m;
      });
      if(!valid) return{...state,message:"That card doesn't fit that meld."};
      const hands=state.hands.map((h,i)=>i===0?h.filter(c=>c.id!==cid):h);
      if(hands[0].length===0)
        return endRound({...state,hands,melds:newMelds},"player",hands,null);
      return{...state,melds:newMelds,hands,selectedCards:[],message:"Laid off!"};
    }

    case "DISCARD":{
      if(state.turn!=="player"||state.phase!=="meld") return state;
      if(state.selectedCards.length!==1) return{...state,message:"Select exactly 1 card to discard."};
      const cid=state.selectedCards[0];
      if(state.stagingGroups.flat().includes(cid))
        return{...state,message:"That card is staged — disband the group first."};
      const card=state.hands[0].find(c=>c.id===cid);
      const hands=state.hands.map((h,i)=>i===0?h.filter(c=>c.id!==cid):h);
      if(hands[0].length===0&&state.metContract[0])
        return endRound(state,"player",hands,card);
      const nt=nextTurn("player");
      const eligible=buyEligible("player",state.metContract,state.buysUsed);
      if(eligible.length>0){
        return{...state,hands,discardPile:[...state.discardPile,card],
          selectedCards:[],stagingGroups:[],
          buyWindow:true,buyWindowCard:card,buyWindowFor:"player",buyWindowNext:nt,
          aiTurnPending:false,
          message:`Any player want to buy ${card.isJoker?"Joker":card.rank+card.suit}?`};
      }
      return{...state,hands,discardPile:[...state.discardPile,card],
        selectedCards:[],stagingGroups:[],
        turn:nt,phase:"draw",aiTurnPending:nt!=="player",
        message:nt==="player"?"Your turn — draw a card.":`${turnName(nt)}'s turn…`};
    }

    // Player buys the card in the buy window
    case "PLAYER_BUY":{
      if(!state.buyWindow||state.metContract[0]||state.buysUsed[0]>=3) return state;
      const card=state.buyWindowCard;
      const penalty=state.deck.length>0?state.deck[state.deck.length-1]:null;
      const deck=penalty?state.deck.slice(0,-1):state.deck;
      const newHand=[...state.hands[0],card,...(penalty?[penalty]:[])];
      const hands=state.hands.map((h,i)=>i===0?newHand:h);
      const buysUsed=state.buysUsed.map((b,i)=>i===0?b+1:b);
      // The player whose turn it was now draws from deck instead
      const activeIdx=pIdx(state.buyWindowFor);
      const nt=state.buyWindowNext;
      // active player draws from deck as compensation
      let deckFinal=[...deck];
      let handsFinal=[...hands];
      if(state.buyWindowFor!=="player"&&deckFinal.length>0){
        const comp=deckFinal.pop();
        const ai=pIdx(state.buyWindowFor);
        handsFinal=handsFinal.map((h,i)=>i===ai?[...h,comp]:h);
      }
      return{...state,hands:handsFinal,deck:deckFinal,buysUsed,
        buyWindow:false,buyWindowCard:null,buyWindowFor:null,buyWindowNext:null,
        turn:nt,phase:"draw",aiTurnPending:nt!=="player",
        message:`You bought ${card.isJoker?"Joker":card.rank+card.suit}! +1 penalty card.`};
    }

    // Skip buying — close window and advance turn
    case "PASS_BUY":{
      if(!state.buyWindow) return state;
      const nt=state.buyWindowNext;
      return{...state,
        buyWindow:false,buyWindowCard:null,buyWindowFor:null,buyWindowNext:null,
        turn:nt,phase:"draw",aiTurnPending:nt!=="player",
        message:nt==="player"?"Your turn — draw a card.":`${turnName(nt)}'s turn…`};
    }

    case "AI_TURN":{
      const cur=state.turn;
      if(cur==="player") return state;
      const pi=pIdx(cur);
      const contract=CONTRACTS[state.roundIndex];
      let hand=[...state.hands[pi]];
      let deck=[...state.deck];
      let dp=[...state.discardPile];
      let melds=state.melds.map(m=>[...m]);
      let metC=[...state.metContract];

      if(state.phase==="discard_first"){
        const discard=aiDiscard(hand);
        hand=hand.filter(c=>c.id!==discard.id);dp=[...dp,discard];
        const nt=nextTurn(cur);
        const hands=state.hands.map((h,i)=>i===pi?hand:h);
        return{...state,hands,discardPile:dp,turn:nt,phase:"draw",
          selectedCards:[],stagingGroups:[],aiTurnPending:nt!=="player",
          message:nt==="player"?"Your turn — draw a card.":`${turnName(nt)}'s turn…`};
      }

      if(deck.length>0) hand.push(deck.pop());

      if(!metC[pi]){
        const built=aiBuildMelds(hand,contract);
        if(contractMet(built,contract)){
          const usedIds=new Set(built.flat().map(c=>c.id));
          hand=hand.filter(c=>!usedIds.has(c.id));
          melds[pi]=[...melds[pi],...built];
          metC[pi]=true;
        }
      }

      const discard=aiDiscard(hand);
      hand=hand.filter(c=>c.id!==discard.id);
      dp=[...dp,discard];
      const hands=state.hands.map((h,i)=>i===pi?hand:h);

      if(hand.length===0&&metC[pi])
        return endRound({...state,hands,melds,metContract:metC},cur,hands,discard);

      const nt=nextTurn(cur);
      const eligible=buyEligible(cur,metC,state.buysUsed);
      const discardLabel=discard.isJoker?"Joker":discard.rank+discard.suit;

      // Check if any AI in eligible wants to buy
      let buyerTurn=null;
      for(const t of eligible){
        if(t==="player") continue; // player decides via UI
        const bi=pIdx(t);
        if(aiBuyDecision(hands[bi],discard,state.buysUsed[bi],metC[bi])){
          buyerTurn=t; break;
        }
      }

      if(buyerTurn){
        // AI buys immediately
        const bi=pIdx(buyerTurn);
        const penalty=deck.length>0?deck[deck.length-1]:null;
        const deckAfter=penalty?deck.slice(0,-1):deck;
        const handsAfter=hands.map((h,i)=>i===bi?[...h,discard,...(penalty?[penalty]:[])]:h);
        // active player gets comp draw
        let deckFinal=[...deckAfter];
        let handsFinal=[...handsAfter];
        if(deckFinal.length>0){
          const comp=deckFinal.pop();
          handsFinal=handsFinal.map((h,i)=>i===pi?[...h,comp]:h);
        }
        const buysUsed=state.buysUsed.map((b,i)=>i===bi?b+1:b);
        // open buy window for player if player is also eligible and hasn't decided
        const playerEligible=eligible.includes("player");
        if(playerEligible){
          // show window briefly so player can see, but AI already bought — just advance
        }
        return{...state,hands:handsFinal,deck:deckFinal,melds,metContract:metC,buysUsed,
          discardPile:dp,
          turn:nt,phase:"draw",selectedCards:[],stagingGroups:[],aiTurnPending:nt!=="player",
          message:`${turnName(buyerTurn)} bought ${discardLabel}! ${nt==="player"?"Your turn — draw.":turnName(nt)+"'s turn…"}`};
      }

      // No AI wants to buy — open window if player is eligible, else advance
      if(eligible.includes("player")){
        return{...state,hands,deck,discardPile:dp,melds,metContract:metC,
          selectedCards:[],stagingGroups:[],
          buyWindow:true,buyWindowCard:discard,buyWindowFor:cur,buyWindowNext:nt,
          aiTurnPending:false,
          message:`${turnName(cur)} discarded ${discardLabel}. Buy it? (+1 penalty card)`};
      }

      return{...state,hands,deck,discardPile:dp,melds,metContract:metC,
        turn:nt,phase:"draw",selectedCards:[],stagingGroups:[],aiTurnPending:nt!=="player",
        message:nt==="player"
          ?`${turnName(cur)} discarded ${discardLabel}. Your turn — draw.`
          :`${turnName(nt)}'s turn…`};
    }

    case "NEXT_ROUND":
      if(state.roundIndex>=6) return state;
      return{...dealRound(state.roundIndex+1,state.gameScores),roundIndex:state.roundIndex+1,gameOver:false};
    case "NEW_GAME": return initialState();
    default: return state;
  }
}

// ── Drag reorder ──────────────────────────────────────────────────────────────
function useDragReorder(dispatch){
  const dragFrom=useRef(null);
  return{
    onDragStart:(i)=>{dragFrom.current=i;},
    onDragOver:(e,i)=>{
      e.preventDefault();
      if(dragFrom.current!==null&&dragFrom.current!==i){
        dispatch({type:"REORDER_HAND",from:dragFrom.current,to:i});
        dragFrom.current=i;
      }
    },
    onDragEnd:()=>{dragFrom.current=null;},
  };
}

// ── Card ──────────────────────────────────────────────────────────────────────
const CW=46,CH=68;
function Card({card,selected,staged,onClick,faceDown,draggable,onDragStart,onDragOver,onDragEnd}){
  if(faceDown) return(
    <div style={{width:CW,height:CH,borderRadius:6,flexShrink:0,
      background:"linear-gradient(135deg,#1a4a2e,#0d2e1a)",
      border:"1.5px solid #2a6042",display:"flex",alignItems:"center",
      justifyContent:"center",fontSize:12,color:"#2a6042",userSelect:"none"}}>✦</div>
  );
  const isRed=card.suit==="♥"||card.suit==="♦";
  const isJoker=card.isJoker;
  const color=isJoker?"#8b00aa":isRed?"#c0392b":"#1a1a2e";
  let bg="linear-gradient(160deg,#fefefe,#f0ede6)";
  let border="1.5px solid #c8bfaa";
  let shadow="0 2px 6px rgba(0,0,0,0.35)";
  let ty=0;
  if(selected){bg="linear-gradient(160deg,#fffbe6,#fff3b0)";border="2px solid #d4a017";shadow="0 0 0 2px #d4a017,0 6px 18px rgba(0,0,0,0.6)";ty=-11;}
  else if(staged){bg="linear-gradient(160deg,#e8f4ff,#d0e8ff)";border="2px solid #4a90d9";shadow="0 0 0 1px #4a90d9,0 4px 10px rgba(0,0,0,0.4)";ty=-6;}
  return(
    <div draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
      onClick={onClick} style={{width:CW,height:CH,borderRadius:6,flexShrink:0,
        background:bg,border,boxShadow:shadow,
        transform:`translateY(${ty}px)`,transition:"transform 0.12s,box-shadow 0.12s",
        cursor:onClick?"pointer":"default",display:"flex",flexDirection:"column",
        alignItems:"flex-start",justifyContent:"space-between",
        padding:"3px 4px",userSelect:"none"}}>
      <div style={{fontSize:11,fontWeight:800,color,lineHeight:1,fontFamily:"Georgia,serif"}}>
        {isJoker?"JK":card.rank}
      </div>
      <div style={{fontSize:isJoker?10:16,color,lineHeight:1,alignSelf:"center",fontWeight:isJoker?700:400}}>
        {isJoker?"★":card.suit}
      </div>
      <div style={{fontSize:11,fontWeight:800,color,lineHeight:1,transform:"rotate(180deg)",fontFamily:"Georgia,serif"}}>
        {isJoker?"JK":card.rank}
      </div>
    </div>
  );
}

// ── Staging area ──────────────────────────────────────────────────────────────
function StagingArea({stagingGroups,hand,contract,onDisband,canDisband}){
  if(!stagingGroups.length) return null;
  const needed=contract.sets+contract.runs;
  return(
    <div style={{background:"rgba(74,144,217,0.07)",border:"1px dashed #4a90d9",
      borderRadius:8,padding:"6px 10px",marginBottom:6}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
        <span style={{fontSize:9,letterSpacing:1.5,color:"#4a90d9",textTransform:"uppercase",fontWeight:700}}>
          Staged Groups ({stagingGroups.length}/{needed})
        </span>
        <span style={{fontSize:9,color:"#6aaa7a",fontStyle:"italic"}}>
          Click a group to disband it
        </span>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {stagingGroups.map((grp,gi)=>{
          const cards=hand.filter(c=>grp.includes(c.id));
          const valid=isSet(cards)||isRun(cards);
          return(
            <div key={gi}
              onClick={canDisband?()=>onDisband(gi):undefined}
              title="Click to disband this group"
              style={{display:"flex",gap:2,padding:"4px 6px",borderRadius:6,cursor:canDisband?"pointer":"default",
                background:valid?"rgba(74,144,217,0.12)":"rgba(192,57,43,0.12)",
                border:`1px solid ${valid?"#4a90d9":"#c0392b"}`,
                position:"relative"}}>
              {cards.map(c=><Card key={c.id} card={c} staged/>)}
              <div style={{position:"absolute",top:-7,left:"50%",transform:"translateX(-50%)",
                background:valid?"#4a90d9":"#c0392b",color:"#fff",
                fontSize:8,padding:"1px 5px",borderRadius:3,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap"}}>
                {valid?(isSet(cards)?"SET":"RUN"):"INVALID"} · ×
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Meld zone (committed table melds) ─────────────────────────────────────────
function MeldZone({melds,ownerTurn,onLayoff,canLayoff}){
  if(!melds.length) return null;
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {melds.map((meld,i)=>(
        <div key={i} onClick={canLayoff?()=>onLayoff(ownerTurn,i):undefined}
          title={canLayoff?"Tap to lay off your selected card here":""}
          style={{display:"flex",gap:1,padding:"4px 6px",borderRadius:6,
            background:canLayoff?"rgba(212,160,23,0.1)":"rgba(255,255,255,0.05)",
            border:canLayoff?"2px dashed #d4a017":"1px solid rgba(255,255,255,0.1)",
            boxShadow:canLayoff?"0 0 8px rgba(212,160,23,0.3)":"none",
            cursor:canLayoff?"pointer":"default",
            transition:"all 0.15s",
            position:"relative"}}>
          {canLayoff&&<div style={{
            position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
            background:"#d4a017",color:"#1a1a0a",fontSize:8,fontWeight:700,
            padding:"1px 5px",borderRadius:3,letterSpacing:0.5,whiteSpace:"nowrap",
            pointerEvents:"none",
          }}>TAP TO LAY OFF</div>}
          {meld.map(c=><Card key={c.id} card={c}/>)}
        </div>
      ))}
    </div>
  );
}

// ── Opponent row ──────────────────────────────────────────────────────────────
function OpponentRow({name,hand,melds,metContract,isTurn,onLayoff,canLayoff,ownerTurn,buysUsed}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,
      background:isTurn?"rgba(212,160,23,0.07)":"rgba(0,0,0,0.18)",
      border:`1px solid ${isTurn?"rgba(212,160,23,0.5)":"rgba(255,255,255,0.06)"}`,
      borderRadius:8,padding:"5px 10px",minHeight:52}}>
      <div style={{minWidth:46,textAlign:"center",flexShrink:0}}>
        <div style={{fontSize:10,fontWeight:700,color:isTurn?"#d4a017":"#7ab88a",
          letterSpacing:0.5,textTransform:"uppercase",lineHeight:1}}>{name}</div>
        <div style={{fontSize:9,color:"#4a7060",marginTop:2}}>{hand.length}🃏</div>
        {metContract&&<div style={{fontSize:8,color:"#d4a017",marginTop:1}}>✓ DOWN</div>}
        <div style={{fontSize:8,color:"#4a7060",marginTop:1}}>B:{buysUsed}/3</div>
      </div>
      <div style={{display:"flex",gap:2,flexShrink:1,overflow:"hidden"}}>
        {hand.map(c=><Card key={c.id} card={c} faceDown/>)}
      </div>
      {melds.length>0&&(
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.08)",paddingLeft:6,flexShrink:0}}>
          <MeldZone melds={melds} ownerTurn={ownerTurn} onLayoff={onLayoff} canLayoff={canLayoff}/>
        </div>
      )}
    </div>
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────────
function Btn({label,color,disabled,onClick,title}){
  return(
    <button onClick={onClick} disabled={disabled} title={title} style={{
      background:disabled?"rgba(255,255,255,0.03)":`${color}18`,
      border:`1px solid ${disabled?"rgba(255,255,255,0.08)":color}`,
      borderRadius:6,color:disabled?"#385248":color,
      fontSize:11,fontWeight:700,padding:"6px 12px",flexShrink:0,
      cursor:disabled?"not-allowed":"pointer",letterSpacing:0.5,
      fontFamily:"Georgia,serif",transition:"all 0.1s",
    }}>{label}</button>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function ContractRummy(){
  const[state,dispatch]=useReducer(reducer,undefined,initialState);
  const drag=useDragReorder(dispatch);
  const contract=CONTRACTS[state.roundIndex];

  useEffect(()=>{
    if(state.aiTurnPending&&!state.roundOver){
      const t=setTimeout(()=>dispatch({type:"AI_TURN"}),800);
      return()=>clearTimeout(t);
    }
  },[state.aiTurnPending,state.roundOver,state.turn,state.phase]);

  const topDiscard=state.discardPile[state.discardPile.length-1];
  const isPlayer=state.turn==="player";
  const canDraw=isPlayer&&state.phase==="draw";
  const canMeld=isPlayer&&state.phase==="meld";
  const inFirst=isPlayer&&state.phase==="discard_first";
  const alreadyDown=state.metContract[0];

  // Cards in staging groups
  const stagedIds=new Set(state.stagingGroups.flat());

  // Can lay off: player is down, exactly 1 card selected, not staged
  const canLayoff=canMeld&&alreadyDown&&
    state.selectedCards.length===1&&
    !stagedIds.has(state.selectedCards[0]);

  const onLayoff=(ownerTurn,meldIdx)=>{
    if(canLayoff) dispatch({type:"LAYOFF",ownerTurn,meldIdx});
  };

  // Go Down button enabled when staged groups fully satisfy contract
  const stagingCards=state.stagingGroups.map(g=>state.hands[0].filter(c=>g.includes(c.id)));
  const canGoDown=canMeld&&!alreadyDown&&
    state.stagingGroups.length>0&&
    contractMet(stagingCards,contract)&&
    stagingCards.every(g=>isSet(g)||isRun(g));

  // Stage button: valid meld from selected, not too many groups
  const selectedCards=state.hands[0].filter(c=>state.selectedCards.includes(c.id));
  const selIsValidMeld=selectedCards.length>=3&&isValidMeld(selectedCards);
  const currentSets=stagingCards.filter(g=>isSet(g)).length;
  const currentRuns=stagingCards.filter(g=>isRun(g)).length;
  const wouldBeSet=selIsValidMeld&&isSet(selectedCards);
  const wouldBeRun=selIsValidMeld&&isRun(selectedCards);
  const canStage=canMeld&&!alreadyDown&&selIsValidMeld&&
    (wouldBeSet?currentSets<contract.sets:currentRuns<contract.runs);

  return(
    <div style={{minHeight:"100vh",
      background:"radial-gradient(ellipse at 50% 0%,#1b4d30 0%,#0b2b1a 55%,#071c0f 100%)",
      fontFamily:"Georgia,'Times New Roman',serif",color:"#e8dfc8",
      padding:"8px 10px",boxSizing:"border-box",display:"flex",flexDirection:"column",gap:7}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontSize:8,letterSpacing:3,color:"#6aaa7a",textTransform:"uppercase"}}>Amerikano</div>
          <div style={{fontSize:15,fontWeight:700,color:"#d4a017",lineHeight:1.2}}>
            Round {state.roundIndex+1}/7 · {contract.desc}
          </div>
        </div>
        <div style={{display:"flex",gap:8,background:"rgba(0,0,0,0.3)",borderRadius:8,
          padding:"5px 10px",border:"1px solid rgba(255,255,255,0.07)"}}>
          {[["You",0],...AI_NAMES.map((n,i)=>[n,i+1])].map(([name,idx])=>(
            <div key={idx} style={{textAlign:"center",minWidth:34}}>
              <div style={{fontSize:8,letterSpacing:0.5,color:"#6aaa7a",textTransform:"uppercase"}}>{name}</div>
              <div style={{fontSize:15,fontWeight:700,
                color:state.turn===(idx===0?"player":`ai${idx-1}`)?"#d4a017":"#e8dfc8"}}>
                {state.gameScores[idx]}
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:3}}>
          {CONTRACTS.map((_,i)=>(
            <div key={i} style={{width:20,height:20,borderRadius:"50%",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:9,fontWeight:700,
              background:i===state.roundIndex?"rgba(212,160,23,0.25)":"rgba(0,0,0,0.2)",
              border:`1px solid ${i===state.roundIndex?"#d4a017":i<state.roundIndex?"#2a5a3a":"rgba(255,255,255,0.08)"}`,
              color:i===state.roundIndex?"#d4a017":i<state.roundIndex?"#3a7a4a":"#4a6a58",
            }}>{i+1}</div>
          ))}
        </div>
      </div>

      {/* Opponents */}
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {AI_NAMES.map((name,ai)=>(
          <OpponentRow key={ai} name={name} hand={state.hands[ai+1]} melds={state.melds[ai+1]}
            metContract={state.metContract[ai+1]} isTurn={state.turn===`ai${ai}`}
            canLayoff={canLayoff} onLayoff={onLayoff} ownerTurn={`ai${ai}`}
            buysUsed={state.buysUsed[ai+1]}/>
        ))}
      </div>

      {/* Table center */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{textAlign:"center"}}>
          <div onClick={canDraw?()=>dispatch({type:"DRAW_DECK"}):undefined}
            style={{opacity:canDraw?1:0.35,cursor:canDraw?"pointer":"default",transition:"opacity 0.15s"}}>
            <Card card={{rank:"",suit:""}} faceDown/>
          </div>
          <div style={{fontSize:8,color:"#6aaa7a",marginTop:2,letterSpacing:1}}>DECK·{state.deck.length}</div>
        </div>
        <div style={{textAlign:"center"}}>
          {topDiscard
            ?<div onClick={canDraw?()=>dispatch({type:"DRAW_DISCARD"}):undefined}
               style={{opacity:canDraw?1:0.35,cursor:canDraw?"pointer":"default"}}>
               <Card card={topDiscard}/>
             </div>
            :<div style={{width:CW,height:CH,borderRadius:6,
               border:"1.5px dashed rgba(255,255,255,0.12)",
               display:"flex",alignItems:"center",justifyContent:"center",
               color:"rgba(255,255,255,0.15)",fontSize:16}}>∅</div>
          }
          <div style={{fontSize:8,color:"#6aaa7a",marginTop:2,letterSpacing:1}}>DISCARD</div>
        </div>
        <div style={{flex:1,minWidth:100}}>
          <div style={{display:"inline-block",padding:"2px 7px",borderRadius:4,marginBottom:3,
            background:isPlayer?"rgba(212,160,23,0.12)":"rgba(106,170,122,0.08)",
            border:`1px solid ${isPlayer?"#d4a017":"#6aaa7a"}`,
            fontSize:9,letterSpacing:1,color:isPlayer?"#d4a017":"#8aca9a",fontWeight:700}}>
            {isPlayer?"YOUR TURN":`${turnName(state.turn).toUpperCase()}'S TURN`}
          </div>
          <div style={{fontSize:11,color:"#b0cabb",fontStyle:"italic",lineHeight:1.4}}>{state.message}</div>
        </div>
        {state.melds[0].length>0&&(
          <div style={{borderLeft:"1px solid rgba(212,160,23,0.18)",paddingLeft:8}}>
            <div style={{fontSize:8,color:"#d4a017",letterSpacing:1,marginBottom:3,textTransform:"uppercase"}}>Your Melds</div>
            <MeldZone melds={state.melds[0]} ownerTurn="player" onLayoff={onLayoff} canLayoff={canLayoff}/>
          </div>
        )}
      </div>

      {/* Player hand area */}
      <div style={{background:"rgba(0,0,0,0.28)",borderRadius:10,padding:"8px 10px",
        border:`1.5px solid ${inFirst?"#c0392b":alreadyDown?"rgba(212,160,23,0.6)":state.stagingGroups.length?"#4a90d9":"rgba(212,160,23,0.18)"}`,
        boxShadow:inFirst?"0 0 12px rgba(192,57,43,0.25)":alreadyDown?"0 0 10px rgba(212,160,23,0.15)":state.stagingGroups.length?"0 0 8px rgba(74,144,217,0.15)":"none"}}>

        {/* Staging area */}
        {!alreadyDown&&(
          <StagingArea
            stagingGroups={state.stagingGroups}
            hand={state.hands[0]}
            contract={contract}
            onDisband={(gi)=>dispatch({type:"DISBAND_GROUP",groupIdx:gi})}
            canDisband={canMeld}
          />
        )}

        {/* Header + buttons */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          marginBottom:7,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,letterSpacing:1.5,color:"#d4a017",textTransform:"uppercase",fontWeight:700}}>
              Your Hand ({state.hands[0].length})
            </span>
            {inFirst&&<span style={{fontSize:10,color:"#e74c3c",fontWeight:700}}>SELECT 1 TO DISCARD FIRST</span>}
            {alreadyDown&&<span style={{fontSize:10,color:"#d4a017"}}>✓ DOWN</span>}
            <span style={{fontSize:9,color:"#4a7060"}}>Buys: {state.buysUsed[0]}/3</span>
            {!alreadyDown&&state.stagingGroups.length>0&&(
              <span style={{fontSize:10,color:"#4a90d9"}}>
                {state.stagingGroups.length}/{contract.sets+contract.runs} groups staged
              </span>
            )}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {inFirst
              ?<Btn label="Discard to Start" color="#e74c3c"
                  disabled={state.selectedCards.length!==1}
                  onClick={()=>dispatch({type:"FIRST_DISCARD"})}/>
              :<>
                {!alreadyDown&&<>
                  <Btn label="Stage Group" color="#4a90d9"
                    disabled={!canStage}
                    onClick={()=>dispatch({type:"STAGE_GROUP"})}
                    title="Select cards for one meld, then stage"/>
                  <Btn label="Go Down ↓" color="#d4a017"
                    disabled={!canGoDown}
                    onClick={()=>dispatch({type:"GO_DOWN"})}
                    title="Commit all staged groups to the table"/>
                </>}
                <Btn label="Discard" color="#b05020"
                  disabled={!canMeld||state.selectedCards.length!==1||stagedIds.has(state.selectedCards[0])}
                  onClick={()=>dispatch({type:"DISCARD"})}/>
              </>
            }
          </div>
        </div>

        {/* Card row */}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:10}}>
          <div style={{display:"flex",gap:5,width:"max-content"}}>
            {state.hands[0].map((card,i)=>{
              const isStaged=stagedIds.has(card.id);
              const isSelected=state.selectedCards.includes(card.id);
              return(
                <Card key={card.id} card={card}
                  selected={isSelected} staged={isStaged&&!isSelected}
                  onClick={()=>{
                    if(inFirst) dispatch({type:"TOGGLE_CARD_FIRST",id:card.id});
                    else if(canMeld&&!isStaged) dispatch({type:"TOGGLE_CARD",id:card.id});
                  }}
                  draggable={!isStaged}
                  onDragStart={!isStaged?()=>drag.onDragStart(i):undefined}
                  onDragOver={!isStaged?(e)=>drag.onDragOver(e,i):undefined}
                  onDragEnd={!isStaged?drag.onDragEnd:undefined}
                />
              );
            })}
          </div>
        </div>
        <div style={{fontSize:9,color:"#3a6a4a",fontStyle:"italic",marginTop:2}}>
          {alreadyDown
            ?"Tap 1 card to select it → then tap a meld on the table to lay it off. Or tap 1 card → Discard to end turn."
            :"Select cards for a meld → Stage Group · Stage all groups → Go Down ↓ · Click staged group to disband"}
        </div>
      </div>

      {/* Buy window */}
      {state.buyWindow&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:90}}>
          <div style={{background:"linear-gradient(160deg,#1a3d28,#0d2318)",
            border:"2px solid #4a90d9",borderRadius:14,
            padding:"22px 32px",textAlign:"center",maxWidth:300}}>
            <div style={{fontSize:11,letterSpacing:2,color:"#4a90d9",textTransform:"uppercase",marginBottom:6}}>
              Buy Opportunity
            </div>
            <div style={{fontSize:13,color:"#a8c8b0",marginBottom:14,lineHeight:1.6}}>
              {state.message}
            </div>
            {/* Show the card */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
              {state.buyWindowCard&&<Card card={state.buyWindowCard}/>}
            </div>
            <div style={{fontSize:10,color:"#7ab88a",marginBottom:14}}>
              You have used {state.buysUsed[0]}/3 buys this round
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button
                onClick={()=>dispatch({type:"PLAYER_BUY"})}
                disabled={state.buysUsed[0]>=3||state.metContract[0]}
                style={{
                  background:state.buysUsed[0]>=3||state.metContract[0]?"rgba(255,255,255,0.05)":"rgba(74,144,217,0.2)",
                  border:`1px solid ${state.buysUsed[0]>=3||state.metContract[0]?"rgba(255,255,255,0.1)":"#4a90d9"}`,
                  borderRadius:7,color:state.buysUsed[0]>=3||state.metContract[0]?"#385248":"#4a90d9",
                  fontWeight:700,fontSize:12,padding:"8px 20px",
                  cursor:state.buysUsed[0]>=3||state.metContract[0]?"not-allowed":"pointer",
                  fontFamily:"Georgia,serif",letterSpacing:0.5,
                }}>
                Buy (+1 card)
              </button>
              <button
                onClick={()=>dispatch({type:"PASS_BUY"})}
                style={{
                  background:"rgba(176,80,32,0.15)",border:"1px solid #b05020",
                  borderRadius:7,color:"#b05020",fontWeight:700,fontSize:12,
                  padding:"8px 20px",cursor:"pointer",
                  fontFamily:"Georgia,serif",letterSpacing:0.5,
                }}>
                Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round/game over */}
      {state.roundOver&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"linear-gradient(160deg,#1a3d28,#0d2318)",
            border:"2px solid #d4a017",borderRadius:14,
            padding:"24px 36px",textAlign:"center",maxWidth:360}}>
            <div style={{fontSize:24,color:"#d4a017",marginBottom:6,fontWeight:700}}>
              {state.gameOver?"Game Over!":"Round Over!"}
            </div>
            <div style={{fontSize:13,color:"#a8c8b0",marginBottom:14,lineHeight:1.6}}>{state.message}</div>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:14,flexWrap:"wrap"}}>
              {[["You",0],...AI_NAMES.map((n,i)=>[n,i+1])].map(([name,idx])=>(
                <div key={idx} style={{textAlign:"center",padding:"5px 10px",
                  background:"rgba(0,0,0,0.3)",borderRadius:7,
                  border:"1px solid rgba(255,255,255,0.09)"}}>
                  <div style={{fontSize:9,color:"#7ab88a",textTransform:"uppercase"}}>{name}</div>
                  <div style={{fontSize:19,fontWeight:700}}>{state.gameScores[idx]}</div>
                </div>
              ))}
            </div>
            {state.gameOver&&(
              <div style={{fontSize:15,color:"#d4a017",marginBottom:12,fontWeight:700}}>
                🏆 {state.winnerName} wins!
              </div>
            )}
            <button onClick={()=>dispatch({type:state.gameOver?"NEW_GAME":"NEXT_ROUND"})}
              style={{background:"linear-gradient(135deg,#d4a017,#b8860b)",
                border:"none",borderRadius:8,color:"#1a1a0a",
                fontWeight:700,fontSize:13,padding:"9px 26px",
                cursor:"pointer",letterSpacing:1}}>
              {state.gameOver?"New Game":"Next Round →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
