const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const FEEDS = [
  {name:'Reuters',url:'https://www.reutersagency.com/feed/?taxonomy=markets&post_type=reuters-best',bias:'Center'},
  {name:'BBC',url:'https://feeds.bbci.co.uk/news/world/rss.xml',bias:'Center'},
  {name:'Guardian',url:'https://www.theguardian.com/world/rss',bias:'Center-Left'},
  {name:'Fox News',url:'https://moxie.foxnews.com/google-publisher/world.xml',bias:'Right'},
  {name:'Al Jazeera',url:'https://www.aljazeera.com/xml/rss/all.xml',bias:'Center-Left'},
  {name:'Jacobin',url:'https://jacobin.com/feed',bias:'Left'},
  {name:'National Review',url:'https://www.nationalreview.com/feed/',bias:'Right'},
  {name:'Cato',url:'https://www.cato.org/rss/recent-op-eds',bias:'Libertarian'},
  {name:'UN News',url:'https://news.un.org/feed/subscribe/en/news/all/rss.xml',bias:'State/Official'},
  {name:'NPR',url:'https://feeds.npr.org/1004/rss.xml',bias:'Center-Left'},
  {name:'Democracy Now',url:'https://www.democracynow.org/democracynow.rss',bias:'Left'},
  {name:'National Interest',url:'https://nationalinterest.org/feed',bias:'Center-Right'},
  {name:'Antiwar',url:'https://original.antiwar.com/feed/',bias:'Libertarian'},
  {name:'Monthly Review',url:'https://monthlyreview.org/feed/',bias:'Marxist'},
  {name:'Daily Maverick',url:'https://www.dailymaverick.co.za/feed/',bias:'Center-Left'},
  {name:'Intercept',url:'https://theintercept.com/feed/?lang=en',bias:'Left'},
  {name:'Financial Times',url:'https://www.ft.com/world?format=rss',bias:'Center'},
  {name:'Jerusalem Post',url:'https://www.jpost.com/Rss/RssFeedsHeadlines.aspx',bias:'Center-Right'},
  {name:'Haaretz',url:'https://www.haaretz.com/misc/rss-feeds',bias:'Center-Left'},
  {name:'WSJ',url:'https://feeds.a.dj.com/rss/RSSWorldNews.xml',bias:'Center-Right'},
];

const CONFLICT_KWS = {
  'ukraine-russia':['ukraine','russia','putin','kyiv','moscow','donbas','crimea'],
  'gaza-israel':['gaza','israel','palestinian','palestine','hamas','idf','netanyahu'],
  'sudan-civil-war':['sudan','sudanese','rsf','burhan','khartoum','darfur'],
  'myanmar-civil-war':['myanmar','burma','burmese','rohingya','tatmadaw'],
  'drc-conflict':['congo','drc','kinshasa','m23','kivu'],
  'syria-civil-war':['syria','syrian','assad','damascus','aleppo'],
  'sahel-crisis':['sahel','mali','burkina','niger','wagner'],
  'yemen-civil-war':['yemen','yemeni','houthi','sanaa','aden'],
  'kashmir-conflict':['kashmir','kashmiri'],
  'taiwan-strait':['taiwan','taiwanese','taipei'],
  'iran-protests':['iran','iranian','tehran','khamenei'],
  'haiti-crisis':['haiti','haitian'],
  'venezuela-crisis':['venezuela','venezuelan','caracas','maduro'],
  'ethiopia-tigray':['ethiopia','ethiopian','tigray','tplf'],
  'south-sudan-conflict':['south sudan','juba'],
};

function matchConflict(t,d){const tx=(t+' '+(d||'')).toLowerCase();for(const[id,kws]of Object.entries(CONFLICT_KWS))for(const kw of kws)if(tx.includes(kw))return id;return null;}

function httpGet(url){return new Promise((res,rej)=>{const req=https.get(url,{timeout:15000},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return res(httpGet(r.headers.location));let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));});req.on('error',rej);req.on('timeout',()=>{req.destroy();rej(new Error('timeout'));});});}

function parseRSS(xml){const items=[];const matches=xml.match(/<item>[\s\S]*?<\/item>/g)||[];for(const item of matches.slice(0,4)){const title=(item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\])?<\/title>/i)||[])[1]?.trim()||'';const desc=(item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\])?<\/description>/i)||[])[1]?.trim()||'';const link=(item.match(/<link>(.*?)<\/link>/i)||[])[1]?.trim()||'';const pubDate=(item.match(/<pubDate>(.*?)<\/pubDate>/i)||[])[1]?.trim()||new Date().toISOString();if(title)items.push({title,description:desc,link,pubDate});}return items;}

async function insertArticle(article,feed){
  const cid=matchConflict(article.title,article.description);
  const body=JSON.stringify({title:article.title.slice(0,500),summary:(article.description||'').slice(0,2000),url:(article.link||'').slice(0,1000),source:feed.name,source_feed:feed.name,bias:feed.bias,confidence:0.7,emotional_score:0.3,credibility_score:3,flagged_phrases:[],reasoning:'Source: '+feed.name,conflict_id:cid,published_at:new Date(article.pubDate).toISOString()});
  return new Promise(resolve=>{const u=new URL(SUPABASE_URL+'/rest/v1/articles');const req=https.request(u,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates'},timeout:10000},r=>{resolve(r.statusCode===201||r.statusCode===204);});req.on('error',()=>resolve(false));req.on('timeout',()=>{req.destroy();resolve(false);});req.write(body);req.end();});
}

async function main(){
  let total=0,stored=0;
  for(const feed of FEEDS){
    process.stdout.write(feed.name+' ... ');
    try{
      const xml=await httpGet(feed.url);
      const articles=parseRSS(xml);
      process.stdout.write(articles.length+' articles → ');
      let fs=0;
      for(const a of articles){if(await insertArticle(a,feed)){stored++;fs++;}}
      console.log(fs+' stored');
      total+=articles.length;
    }catch(e){console.log('ERROR: '+e.message);}
    await new Promise(r=>setTimeout(r,500));
  }
  console.log('\n=== Done: '+total+' fetched, '+stored+' stored ===');
  if(stored===0){console.error('No articles stored — check secrets');process.exit(1);}
}

main().catch(e=>{console.error(e);process.exit(1);});
