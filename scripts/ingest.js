const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

function matchConflict(t, d) {
  const text = (t + ' ' + (d || '')).toLowerCase();
  for (const [id, kws] of Object.entries(CONFLICT_KWS)) {
    for (const kw of kws) { if (text.includes(kw)) return id; }
  }
  return null;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  console.log(`  XML: ${xml.length} chars, ${itemMatches.length} <item>, ${entryMatches.length} <entry>`);
  for (const item of [...itemMatches, ...entryMatches].slice(0, 4)) {
    const tm = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const dm = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || item.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const lm = item.match(/<link>(.*?)<\/link>/i) || item.match(/<link[^>]*href="([^"]*)"/i);
    const pdm = item.match(/<pubDate>(.*?)<\/pubDate>/i) || item.match(/<published>(.*?)<\/published>/i);
    if (tm && tm[1].trim().length > 5) {
      items.push({ title: tm[1].trim(), description: (dm && dm[1].trim()) || '', link: (lm && lm[1].trim()) || '', pubDate: (pdm && pdm[1].trim()) || new Date().toISOString() });
    }
  }
  return items;
}

async function insertArticle(article, feed) {
  const conflictId = matchConflict(article.title, article.description);
  const { error } = await supabase.from('articles').insert({
    title: article.title.slice(0, 500),
    summary: (article.description || '').slice(0, 2000),
    url: (article.link || 'https://example.com/' + Date.now()).slice(0, 1000),
    source: feed.name,
    source_feed: feed.name,
    bias: feed.bias,
    confidence: 0.7,
    emotional_score: 0.3,
    credibility_score: 3,
    flagged_phrases: [],
    reasoning: `Source: ${feed.name}`,
    conflict_id: conflictId,
    published_at: new Date(article.pubDate).toISOString(),
  });
  if (error) {
    console.log(`    ERROR: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  console.log('=== ConflictLens RSS Ingest ===');
  console.log(`Supabase: ${SUPABASE_URL}`);

  const { data: td, error: te } = await supabase.from('conflicts').select('id').limit(1);
  if (te) { console.error(`Connection FAILED: ${te.message}`); process.exit(1); }
  console.log(`Connected. Conflicts: ${td ? td.length : 0}`);

  let total = 0, stored = 0;
  for (const feed of FEEDS) {
    console.log(`\n${feed.name}`);
    try {
      const xml = await httpGet(feed.url);
      const articles = parseRSS(xml);
      console.log(`  Articles: ${articles.length}`);
      let fs = 0;
      for (const a of articles) {
        console.log(`    -> "${a.title.slice(0, 50)}..."`);
        if (await insertArticle(a, feed)) { stored++; fs++; }
        await new Promise(r => setTimeout(r, 50));
      }
      console.log(`  Stored: ${fs}/${articles.length}`);
      total += articles.length;
    } catch (e) { console.log(`  FAIL: ${e.message}`); }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== ${total} fetched, ${stored} stored ===`);
  const { count } = await supabase.from('articles').select('*', { count: 'exact', head: true });
  console.log(`DB total: ${count}`);

  if (stored === 0) { console.error('Nothing stored!'); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
