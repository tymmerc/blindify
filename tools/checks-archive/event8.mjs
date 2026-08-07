import { chromium } from "@playwright/test"
import fs from "fs"
const BASE="https://tymmerc.eu/blindify", API=`${BASE}/api`
const SHOTS="/opt/blindify/maquettes/shots/event8"
const KEY=(()=>{try{return fs.readFileSync("/opt/blindify/.e2e-bypass-key","utf8").trim()}catch{return ""}})()
const H={Origin:"https://tymmerc.eu",Referer:"https://tymmerc.eu/blindify/"}
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const SPOTIFY="https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"
const DEEZER="https://www.deezer.com/profile/2529"

async function newPlayer(browser,nick){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
    userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    extraHTTPHeaders: KEY?{"X-E2E-Key":KEY}:{}})
  const page=await ctx.newPage()
  for(let a=0;a<6;a++){
    const r=await page.request.post(`${API}/auth/guest`,{data:{nickname:nick},headers:H})
    if(r.ok())return {ctx,page,nick}
    if(r.status()===429){await sleep(15000);continue}
    throw new Error(`guest ${nick}: ${r.status()}`)
  }
  throw new Error(`guest ${nick}: 429 retries`)
}
async function settle(page,nick,opts={}){
  for(let pass=0;pass<6;pass++){
    await sleep(1400)
    const gb=page.locator("button",{hasText:/Jouer sans compte/i}).first()
    if(await gb.isVisible({timeout:900}).catch(()=>false)){await gb.click();await sleep(2200);continue}
    const ps=page.locator("input[placeholder*='pseudo'],input[placeholder*='Pseudo'],input[placeholder*='appelles']").first()
    if(await ps.isVisible({timeout:900}).catch(()=>false)){await ps.fill(nick);await page.locator("button",{hasText:/Continuer|Valider|Go|parti/i}).first().click().catch(()=>{});await sleep(1600);continue}
    if(opts.create){const c=page.locator("button,a").filter({hasText:/Cr[ée]er une (partie|salle)/i}).first();if(await c.isVisible({timeout:900}).catch(()=>false)){await c.click();await sleep(2500);continue}}
    if(opts.joinCode){const ci=page.locator("input[placeholder*='code'],input[placeholder*='Code'],input[placeholder*='CODE']").first();if(await ci.isVisible({timeout:900}).catch(()=>false)){await ci.fill(opts.joinCode);await page.locator("button").filter({hasText:/Rejoindre|Go|Valider/i}).first().click().catch(()=>{});await sleep(2200);continue}}
    const t=await page.locator("body").innerText().catch(()=>"")
    if(/Code|Lancer|Attente|participant|Crew|Salle/i.test(t))return true
  }
  return false
}
function codeOf(t){return (t.match(/\b([A-HJ-NP-Z2-9]{6})\b/g)||[]).filter(x=>/\d/.test(x))[0]||""}
async function extractCode(page){
  const t=await page.locator("body").innerText()
  let c=codeOf(t); if(c)return c
  const tiles=t.match(/(?:\b[A-HJ-NP-Z2-9][\s]+){4,7}[A-HJ-NP-Z2-9]\b/)
  if(tiles){const j=tiles[0].replace(/\s+/g,"");if(j.length===6)return j}
  return ""
}
async function importMusic(page,url){
  const res=await page.request.post(`${API}/import/playlists`,{data:{url},headers:H})
  if(!res.ok())return {ok:false,step:"resolve",status:res.status()}
  const d=(await res.json()).data
  const ids=d.playlists.slice(0,3).map(p=>p.id)
  const sync=await page.request.post(`${API}/import/sync-all`,{data:{provider:d.provider,playlistIds:ids,maxTracksPerPlaylist:10},headers:H})
  if(!sync.ok())return {ok:false,step:"sync",status:sync.status()}
  return {ok:true,synced:(await sync.json()).data.synced}
}
async function readState(page){
  const t=await page.locator("body").innerText().catch(()=>"")
  const round=t.match(/Round\s+(\d+)\s*\/\s*(\d+)/i)
  const guess=await page.locator("input[placeholder='Titre du morceau'],input[aria-label='Titre du morceau']").first().isVisible({timeout:250}).catch(()=>false)
  const over=/Rejouer|Partie termin/i.test(t)
  const reveal=/LA R[ÉE]PONSE|Pr[êe]t pour la suite|prochain round/i.test(t)
  return {round:round?`${round[1]}/${round[2]}`:null, phase: guess?"GUESSING":over?"OVER":reveal?"REVEAL":"?"}
}
async function answer(page,title,artist){
  const ti=page.locator("input[placeholder='Titre du morceau'],input[aria-label='Titre du morceau']").first()
  const ar=page.locator("input[placeholder='Tape ici...'],input[aria-label='Artiste']").first()
  if(title!=null)await ti.fill(title).catch(()=>{})
  if(artist!=null)await ar.fill(artist).catch(()=>{})
  await page.locator("button",{hasText:/Valider ma r[ée]ponse|Valider/i}).first().click().catch(()=>{})
}
async function waitAll(players,pred,label,ms=60000){
  const start=Date.now()
  while(Date.now()-start<ms){
    const st=await Promise.all(players.map(p=>readState(p.page)))
    if(st.every(pred))return st
    await sleep(800)
  }
  return await Promise.all(players.map(p=>readState(p.page)))
}

;(async()=>{
  const browser=await chromium.launch()
  const names=["Prez","Lea","Marc","Jo","Sara","Tom","Ines","Yann","Zoe"] // 1 prez + 8 participants
  const players=[]
  for(const n of names){ players.push(await newPlayer(browser,n)); log("guest",n,"ok") }
  const [host,...parts]=players

  // 1. présentateur crée la room event
  await host.page.goto(`${BASE}/multiplayer?mode=event&intent=host&nickname=${host.nick}`,{waitUntil:"domcontentloaded"})
  await settle(host.page,host.nick,{create:true})
  let code=""; for(let i=0;i<16&&!code;i++){await host.page.waitForTimeout(1000);code=await extractCode(host.page)}
  if(!code){await host.page.screenshot({path:`${SHOTS}/debug-host.png`});throw new Error("pas de code")}
  log("room event:",code)

  // 2. 8 participants rejoignent
  for(const p of parts){
    await p.page.goto(`${BASE}/multiplayer?mode=event&code=${code}&nickname=${p.nick}`,{waitUntil:"domcontentloaded"})
  }
  for(const p of parts){ await settle(p.page,p.nick,{joinCode:code}) }
  await sleep(3000)
  const lobbyTxt=await host.page.locator("body").innerText()
  const seen=parts.filter(p=>lobbyTxt.includes(p.nick)).length
  log(`présentateur voit ${seen}/8 participants`)
  await host.page.screenshot({path:`${SHOTS}/00-presenter-lobby.png`})

  // 3. 2 importeurs distincts (Spotify + Deezer)
  const imp1=await importMusic(parts[0].page,SPOTIFY)
  const imp2=await importMusic(parts[1].page,DEEZER)
  log("import Lea(spotify):",JSON.stringify(imp1),"| Marc(deezer):",JSON.stringify(imp2))
  await sleep(2000)

  // 4. lancement
  const launch=host.page.locator("button").filter({hasText:/lancer la partie|press start|lancer/i}).first()
  await launch.click({timeout:12000}).catch(async()=>{await host.page.screenshot({path:`${SHOTS}/debug-launch.png`})})
  log("partie lancée")

  // 5. rounds : capture chaque téléphone
  let reachedOver=false
  for(let r=1;r<=12;r++){
    const st=await waitAll(parts,s=>s.phase==="GUESSING"||s.phase==="OVER",`round ${r} guessing`)
    if(st.every(s=>s.phase==="OVER")){reachedOver=true;break}
    const rounds=[...new Set(st.map(s=>s.round))]
    log(`round ${st[0].round} GUESSING — synchro 8 tel: ${rounds.length===1?"OUI":"NON "+JSON.stringify(rounds)}`)
    if(r===1){ for(let i=0;i<parts.length;i++) await parts[i].page.screenshot({path:`${SHOTS}/r1-phone${i+1}-${parts[i].nick}.png`}) }
    // réponses variées : certains justes-ish, certains faux, un ne répond pas
    const acts=[
      ()=>answer(parts[0].page,"Titre A","Artiste A"),
      ()=>answer(parts[1].page,"Titre B","Artiste B"),
      ()=>answer(parts[2].page,"n'importe quoi","xxx"),
      ()=>answer(parts[3].page,"Titre D",null),
      ()=>Promise.resolve(), // Sara ne répond pas
      ()=>answer(parts[5].page,"Titre F","Artiste F"),
      ()=>answer(parts[6].page,"zzz","yyy"),
      ()=>answer(parts[7].page,"Titre H","Artiste H"),
    ]
    await Promise.all(acts.map(f=>f()))
    const rev=await waitAll(parts,s=>s.phase==="REVEAL"||s.phase==="OVER",`round ${r} reveal`)
    if(r===1){ for(let i=0;i<parts.length;i++) await parts[i].page.screenshot({path:`${SHOTS}/r1reveal-phone${i+1}-${parts[i].nick}.png`}) }
    if(rev.every(s=>s.phase==="OVER")){reachedOver=true;break}
  }

  // 6. fin : capture résultats sur chaque téléphone + lecture scores
  await waitAll(parts,s=>s.phase==="OVER","attente fin",40000)
  for(let i=0;i<parts.length;i++) await parts[i].page.screenshot({path:`${SHOTS}/final-phone${i+1}-${parts[i].nick}.png`})
  await host.page.screenshot({path:`${SHOTS}/final-presenter.png`})
  const finalTxt=await parts[0].page.locator("body").innerText().catch(()=>"")
  const scoreboard=parts.map(p=>p.nick).filter(n=>finalTxt.includes(n))
  log("OVER atteint:",reachedOver,"| noms au classement:",scoreboard.length,scoreboard.join(","))
  console.log("\n===== RESULTAT =====")
  console.log("room:",code,"| participants vus au lobby:",seen,"/8")
  console.log("import:",imp1.ok?"spotify OK":"spotify KO",imp2.ok?"deezer OK":"deezer KO")
  console.log("partie terminée:",reachedOver)
  for(const p of players) await p.ctx.close()
  await browser.close(); process.exit(0)
})().catch(e=>{console.error("EVENT8 ERROR:",e.message,e.stack);process.exit(1)})
