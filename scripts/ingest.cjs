const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const {parseStringPromise} = require('xml2js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const FEEDS = [
  {name:'Reuters',url:'https://www.reutersagency.com/feed/?taxonomy=markets&post_type=reuters-best',bias:'Center'},
  {name:'BBC',url:'https://feeds.bbci.co.uk/news/world/rss.xml',bias:'Center'},
  {name:'Guardian',url:'https://www.theguardian.com/world/rss',bias:'Center-Left'},
  {name:'Fox News',url:'https://moxie.foxnews.com/google-publisher/world.xml',bias:'Right'},
  {name:'Al Jazeera',url:'https://www.aljazeera.com/xml/rss/all.xml',bias:'Center-Left'},
  {name:'Jacobin',url:'https://jacobin.com/feed',bias:'Left'},
  {name:'National Review',url:'https://www.nationalreview.com/feed/',bias:'Right'},
  {name:'Cato Institute',url:'https://www.cato.org/rss/recent-op-eds',bias:'Libertarian'},
  {name:'UN News',url:'https://news.un.org/feed/subscribe/en/news/all/rss.xml',bias:'State/Official'},
];

const CONFLICT_KWS = {
  'ukraine-russia':['ukraine','russia','putin','kyiv','donbas'],
  'gaza-israel':['gaza','israel','palestinian','hamas','idf'],
  'sudan-civil-war':['sudan','rsf','burhan','darfur'],
  'myanmar-civil-war':['myanmar','burma','rohingya'],
  'syria-civil-war':['syria','assad','damascus'],
  'yemen-civil-war':['yemen','houthi','sanaa'],
  'taiwan-strait':['taiwan','taipei','pla'],
  'iran-protests':['iran','tehran','khamenei'],
  'haiti-crisis':['haiti','port-au-prince'],
};

function matchConflict(t,d){const tx=(t+' '+d).toLowerCase();for(const[id,kws]of Object.entries(CONFLICT_KWS))for(const kw of kws)if(tx.includes(kw))return id;return null;}

async function insert(a,feed){
  const cid=matchConflict(a.title,a.description||'');
  const ok=await fetch(`${SUPABASE_URL}/rest/v1/articles`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates'},body:JSON.stringify({title:a.title.slice(0,500),summary:(a.description||'').slice(0,2000),url:(a.link||'').slice(0,1000),source:feed.name,source_feed:feed.name,bias:feed.bias,confidence:0.7,emotional_score:0.3,credibility_score:3,flagged_phrases:[],reasoning:`Source: ${feed.name}`,conflict_id:cid,published_at:new Date().toISOString()})});
  return ok.status===201||ok.status===204;
}

async function main(){
  let total=0,stored=0;
  for(const f of FEEDS){
    try{
      const r=await fetch(f.url,{timeout:10000});if(!r.ok)continue;
      const x=await r.text();
      const p=await parseStringPromise(x);
      const items=(p?.rss?.channel?.[0]?.item||p?.feed?.entry||[]).slice(0,3);
      const arts=(Array.isArray(items)?items:[items]).map(i=>({title:i.title?.[0]||'',description:i.description?.[0]||'',link:(typeof i.link?.[0]==='object'?i.link[0]._:i.link?.[0])||''})).filter(i=>i.title);
      for(const a of arts){if(await insert(a,f))stored++;total++;}
    }catch(e){}
  }
  console.log(`Fetched ${total}, stored ${stored}`);
}
main().catch(e=>console.error(e));
