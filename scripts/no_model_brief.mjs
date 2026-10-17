import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const MEDIA=['stcn.com','cnstock.com','cs.com.cn','xinhuanet.com','news.cn','gov.cn','stats.gov.cn','pbc.gov.cn','sse.com.cn','szse.cn','cninfo.com.cn','reuters.com','wsj.com','cnbc.com','bloomberg.com','ft.com','caixin.com','yicai.com','21jingji.com'];
export const BANKS=['jpmorgan.com','goldmansachs.com','morganstanley.com','ubs.com','cicc.com','htsec.com'];
const DISCLAIMER='本内容仅信息整理，不构成投资建议，请查阅交易所原始公告核实。';
const warnings=[];
const number=x=>x===null||x===undefined||x===''||!Number.isFinite(Number(x))?null:Number(x);
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const clean=x=>String(x||'').replace(/<[^>]*>/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*_\x60>|]/g,' ').replace(/\s+/g,' ').trim();
export function allowed(url,domains){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))&&!/guba|comment|forum|community|\/opinion\/|\/video\//i.test(u.pathname);}catch{return false;}
}
export function canonical(url){try{const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|spm|from|source)/i.test(k))u.searchParams.delete(k);return u.href;}catch{return '';}}
export function classify(title){
 const s=String(title||'').replace(/(?:未|尚未|不存在|不涉及|不构成|终止)[^，。；]{0,12}(?:立案|处罚|问询|减持|诉讼|重组|回购|增持)/g,'');
 const bad=/大额亏损|预亏|商誉减值|立案调查|行政处罚|监管问询|问询函|减持计划|拟减持|重大诉讼|项目终止|终止.{0,8}项目|产品召回|产品重大问题/.test(s);
 const good=/业绩预增|大幅预增|大幅增长|扭亏为盈|回购股份|股份回购|增持股份|重大合同|重大订单|重大资产重组|重大资产收购/.test(s);
 return good!==bad?(good?'利好':'利空'):'中性';
}
export const dateKey=(date,zone='Asia/Shanghai')=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function recent(item,now,days){const t=Date.parse(item.published_date||'');return Number.isFinite(t)&&t<=now.getTime()&&t>=now.getTime()-days*86400000;}
export function dedupe(items){
 const urls=new Set(),titles=[];
 const grams=t=>new Set(Array.from({length:Math.max(0,t.length-2)},(_,i)=>t.slice(i,i+3)));
 return items.filter(x=>{const url=canonical(x.url),title=clean(x.title).toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');if(!url||!title||urls.has(url))return false;
 const a=grams(title);if(titles.some(b=>[...a].filter(g=>b.has(g)).length/Math.max(1,Math.min(a.size,b.size))>0.82))return false;urls.add(url);titles.push(a);return true;});
}
async function request(url,options={}){
 const r=await fetch(url,{...options,headers:{'User-Agent':'daily-stock-brief/1.0',...options.headers},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw new Error('HTTP_'+r.status);return r;
}
async function pool(items,task,workers=3){const output=new Array(items.length);let index=0;await Promise.all(Array.from({length:Math.min(workers,items.length)},async()=>{while(index<items.length){const n=index++;output[n]=await task(items[n],n);}}));return output;}
async function search(query,domains,days,now,label){
 const key=String(process.env.TAVILY_API_KEYS||'').split(',').map(x=>x.trim()).find(Boolean);if(!key)throw new Error('缺少 TAVILY_API_KEYS');
 try{const r=await request('https://api.tavily.com/search',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({query,topic:'general',search_depth:'basic',max_results:8,include_answer:false,include_raw_content:'text',include_published_date:true,filter_by_published_date:true,include_domains:domains,start_date:dateKey(new Date(now.getTime()-days*86400000),'UTC'),end_date:dateKey(now,'UTC')})});
 const data=await r.json();return(data.results||[]).filter(x=>allowed(x.url,domains)&&recent(x,now,days)).map(x=>({...x,url:canonical(x.url),category:label}));}
 catch(e){warnings.push(label+'检索失败（'+(e.message.startsWith('HTTP_')?e.message:'网络或超时')+'）');return [];}
}
export function excerpt(item){
 const text=clean(item.raw_content);
 if(!text)return {text:'未取得原文正文，仅保留标题与来源链接，不生成事实摘要。',limited:true};
 if(!/[\u3400-\u9fff]/u.test(text.slice(0,800)))return {text:'检索到英文原文；本模式不自动翻译或归纳，请查看原文。',limited:true};
 const lines=text.match(/[^。！？\n]{12,}[。！？]?/g)||[text];
 const chosen=lines.find(x=>/同比|环比|亿元|净利润|回购|增持|减持|公告|利率|通胀|订单|调查/.test(x))||lines[0];
 const start=chosen.search(/[\u3400-\u9fff]/u);return{text:Array.from(chosen.slice(Math.max(0,start))).slice(0,24).join('')+(Array.from(chosen).length>24?'…':''),limited:false};
}
function sourceName(url){
 const host=new URL(url).hostname,names={'stcn.com':'证券时报','cnstock.com':'上海证券报','cs.com.cn':'中国证券报','reuters.com':'路透','wsj.com':'华尔街日报','cnbc.com':'CNBC','bloomberg.com':'彭博','ft.com':'金融时报','jpmorgan.com':'摩根大通','goldmansachs.com':'高盛','morganstanley.com':'摩根士丹利','ubs.com':'瑞银','cninfo.com.cn':'巨潮资讯','sse.com.cn':'上交所','szse.cn':'深交所','yicai.com':'第一财经','caixin.com':'财新'};
 const d=Object.keys(names).find(d=>host===d||host.endsWith('.'+d));return d?names[d]:host;
}
const cnTitle=x=>/[\u3400-\u9fff]/u.test(clean(x.title))?Array.from(clean(x.title)).slice(0,20).join('')+(Array.from(clean(x.title)).length>20?'…':''):sourceName(x.url)+'｜英文原文（无自动翻译）';
export function historyMetrics(rows){
 const ordered=[...rows].filter(r=>Array.isArray(r)&&/^\d{4}-\d{2}-\d{2}$/.test(r[0])).sort((a,b)=>a[0].localeCompare(b[0]));
 if(new Set(ordered.map(r=>r[0])).size!==ordered.length)throw new Error('DUPLICATE_HISTORY_DATE');
 const closes=ordered.map(r=>number(r[2])),last=closes.at(-1);
 const valid=n=>closes.length>=n&&closes.slice(-n).every(v=>v!==null&&v>0);
 const mean=n=>valid(n)?closes.slice(-n).reduce((a,b)=>a+b,0)/n:null;
 const ma20=mean(20),ma60=mean(60);
 return {metricDate:ordered.at(-1)?.[0]||null,qfqClose:last??null,
  return20:valid(21)?(last/closes.at(-21)-1)*100:null,
  return60:valid(61)?(last/closes.at(-61)-1)*100:null,ma20,ma60,
  bias20:ma20&&last>0?(last/ma20-1)*100:null,bias60:ma60&&last>0?(last/ma60-1)*100:null};
}
export async function stockQuote(code,now){
 const symbol=(/^[69]/.test(code)?'sh':'sz')+code;
 const x={code,name:code,price:null,change:null,date:null,volume:null,amount:null,turnover:null,range20:null,range60:null,return20:null,return60:null,ma20:null,ma60:null,bias20:null,bias60:null,metricDate:null,source:'https://gu.qq.com/'+symbol};
 try{const r=await request('https://qt.gtimg.cn/q='+symbol);const fields=new TextDecoder('gb18030').decode(await r.arrayBuffer()).split('"')[1]?.split('~')||[];
 if(fields[2]!==code)throw new Error('QUOTE_ID_MISMATCH');
 x.name=fields[1];x.price=number(fields[3]);x.change=number(fields[32]);const t=fields[30]||'';if(!/^\d{14}$/.test(t))throw new Error('QUOTE_DATE_MISSING');
 x.date=t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8);x.volume=number(fields[6])===null?null:number(fields[6])*100;
 x.amount=number(fields[37])===null?null:number(fields[37])*10000;x.turnover=number(fields[38]);
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(x.date===dateKey(now)&&hour<16){x.price=null;x.change=null;x.amount=null;x.volume=null;x.turnover=null;x.note='当前为未完成行情，等待已完成日线。';}
 }catch{x.price=null;x.change=null;x.date=null;x.amount=null;x.volume=null;x.turnover=null;x.note='行情获取失败或缺少可核实时间。';}
 try{const r=await request('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+symbol+',day,,,80,qfq');const d=(await r.json()).data?.[symbol];
 const rows=(d?.qfqday||d?.day||[]).filter(r=>r[0]<dateKey(now));
 if(rows.length){const last=rows.at(-1),prev=rows.at(-2);
 if(x.price===null){x.price=number(last[2]);x.date=last[0];x.change=prev&&number(prev[2])?((number(last[2])/number(prev[2])-1)*100):null;x.note='采用最近已完成日线；不拼接不同时点的即时指标。';}
 const range=n=>rows.length>=n?Math.min(...rows.slice(-n).map(r=>number(r[4])).filter(v=>v!==null)).toFixed(2)+'—'+Math.max(...rows.slice(-n).map(r=>number(r[3])).filter(v=>v!==null)).toFixed(2):null;
 x.range20=range(20);x.range60=range(60);
 if(Array.isArray(d?.qfqday)){
  const metrics=historyMetrics(rows);
  if(metrics.metricDate===x.date)Object.assign(x,metrics);
  else x.note=(x.note||'')+' 历史日线与收盘参考日期不一致，20/60日涨跌幅和均线不展示。';
 }else x.note=(x.note||'')+' 未确认前复权历史日线，20/60日涨跌幅和均线待核实。';}
 }catch{x.note=(x.note||'')+' 20/60日历史数据未取得。';}
 return x;
}
const INDICATORS=[
 ['^DJI','道琼斯工业指数','点','America/New_York',17],['^GSPC','标普500','点','America/New_York',17],['^IXIC','纳斯达克综合','点','America/New_York',17],['^SOX','费城半导体指数','点','America/New_York',17],['^VIX','波动率指数','点','America/New_York',18],
 ['^STOXX50E','欧洲斯托克50','点','Europe/Berlin',18],['^FTSE','英国富时100','点','Europe/London',18],['^GDAXI','德国DAX','点','Europe/Berlin',18],['^TNX','美国10年期国债收益率','%','America/New_York',18],['^FVX','美国5年期国债收益率','%','America/New_York',18],
 ['DX-Y.NYB','美元指数','点','America/New_York',18],['EURUSD=X','欧元/美元','美元/欧元','UTC',24],['JPY=X','美元/日元','日元/美元','UTC',24],['GBPUSD=X','英镑/美元','美元/英镑','UTC',24],['GC=F','黄金近月期货','美元/盎司','America/New_York',18],['CL=F','WTI近月原油期货','美元/桶','America/New_York',18],['BZ=F','布伦特近月原油期货','美元/桶','America/New_York',18]];
export function completedBars(result,now,zone,closeHour){
 const today=dateKey(now,zone),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
 const closes=result?.indicators?.quote?.[0]?.close||[];
 return(result?.timestamp||[]).map((t,i)=>({time:new Date(t*1000),close:number(closes[i])})).filter(r=>r.close!==null&&(dateKey(r.time,zone)<today||(dateKey(r.time,zone)===today&&hour>=closeHour)));
}
export async function indicator(def,now){
 const[symbol,name,unit,zone,hour]=def,x={symbol,name,unit,value:null,change:null,date:null,source:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/history/'};
 try{const r=await request('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1mo&interval=1d');const rows=completedBars((await r.json()).chart?.result?.[0],now,zone,hour);if(rows.length<2)throw new Error('INSUFFICIENT_HISTORY');
 const last=rows.at(-1),prev=rows.at(-2);x.value=last.close;x.date=dateKey(last.time,zone);x.change=unit==='%'?(last.close-prev.close)*100:(last.close/prev.close-1)*100;x.changeUnit=unit==='%'?'基点':'%';
 if(now.getTime()-last.time.getTime()>7*86400000){x.value=null;x.change=null;x.note='数据超过7天，未作为本期数值。';}
 }catch{x.note='未取得可核实的已完成日线。';}return x;
}
export async function collect(now=new Date()){
 const codes=String(process.env.STOCK_LIST||'').split(/[,，、;；\s]+/).filter(Boolean);
 if(!codes.length||codes.some(c=>!/^\d{6}$/.test(c)))throw new Error('STOCK_LIST必须为A股6位代码。');
 const[stocks,markets]=await Promise.all([pool([...new Set(codes)],c=>stockQuote(c,now)),pool(INDICATORS,d=>indicator(d,now))]);
 const queries=[['中国 财经 股市 头条 上市公司 业绩 回购 监管 公告 '+dateKey(now),'中国财经'],['A股 上市公司 最新 公告 业绩预告 重大合同 回购 增持 减持','上市公司'],['美国 财经 美股 通胀 美联储 头条 最新','美国财经'],['US stocks economy Federal Reserve inflation latest Reuters Wall Street Journal CNBC','美国财经'],['中国 财经 股市 头条 最新 证券时报 上海证券报 第一财经','中国财经']];
 const groups=await pool(queries,([q,label])=>search(q,MEDIA,3,now,label),2);
 const events=await pool(stocks,async s=>({code:s.code,items:dedupe(await search(s.code+' '+s.name+' 公告 业绩 回购 减持 立案',MEDIA,3,now,'自选股公告'))}),2);
 const analystGroups=await pool([['摩根大通 高盛 摩根士丹利 中国 经济 展望 研报 最新',BANKS,'机构观点'],['投资策略 首席分析师 研报 观点 A股 中国经济',MEDIA,'具名分析师']],([q,domains,label])=>search(q,domains,90,now,label),2);
 const score=x=>(/[\u3400-\u9fff]/u.test(x.title)?4:0)+(x.raw_content?3:0)+(classify(x.title)!=='中性'?2:0)+(Number(x.score)||0);
 const ranked=dedupe([...groups.flat(),...events.flatMap(x=>x.items)]).sort((a,b)=>score(b)-score(a)||Date.parse(b.published_date)-Date.parse(a.published_date));
 const us=ranked.filter(x=>x.category==='美国财经').slice(0,2);
 const news=dedupe([...ranked.filter(x=>x.category!=='美国财经').slice(0,8),...us,...ranked]).slice(0,10);
 const analysts=dedupe(analystGroups.flat()).filter(x=>BANKS.some(d=>new URL(x.url).hostname===d||new URL(x.url).hostname.endsWith('.'+d))).slice(0,5);
 stocks.forEach(s=>s.events=events.find(x=>x.code===s.code)?.items.slice(0,2)||[]);
 return{generatedAt:now.toISOString(),date:dateKey(now),news,markets,analysts,stocks,warnings,mode:'无模型原文摘录试用',quality:{news:news.length,markets:markets.filter(x=>x.value!==null).length,analysts:analysts.length,stocks:stocks.filter(x=>x.price!==null).length,english:news.filter(x=>!/[\u3400-\u9fff]/u.test(x.title)).length,noBody:news.filter(x=>!x.raw_content).length}};
}
const f=(n,d=2)=>n===null||n===undefined?'待核实':Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
export function relatedNews(stock,news){
 const code=String(stock.code||''),name=clean(stock.name||'');
 const codePattern=/^\d{6}$/.test(code)?new RegExp('(^|[^0-9])'+code+'([^0-9]|$)'):null;
 return news.map((item,index)=>({item,index:index+1})).filter(({item})=>{
  const text=clean((item.title||'')+' '+(item.summary||''));
  return (codePattern&&codePattern.test(text))||(name.length>=3&&name!==code&&text.includes(name));
 });
}
export function render(report,css=''){
 const styles={};for(const m of css.matchAll(/([^{}]+)\{([^{}]+)\}/g))for(const s of m[1].split(','))if(/^(?:[a-z]+|\.[\w-]+)$/.test(s.trim()))styles[s.trim()]=m[2];
 const el=(tag,cls,body)=>'<'+tag+(cls?' class="'+cls+'"':'')+' style="'+esc((styles[tag]||'')+cls.split(' ').map(c=>styles['.'+c]||'').join(''))+'">'+body+'</'+tag+'>';
 const link=(url,label='原文')=>'<a href="'+esc(url)+'" style="color:#087b88;text-decoration:underline">'+esc(label)+'</a>';
 const article=(x,i,view=false)=>{const quote=excerpt(x),state=x.summary?x.stance:(view?'中性':classify(x.title)),kind=state==='利好'?'good':state==='利空'?'bad':'neutral';
 return el('div','card',el('h3','',el('span','tag '+kind,esc(view?'机构观点':state))+esc((i+1)+'　'+(x.summary?x.title:cnTitle(x))))+(x.summary?el('p','',esc('事实摘要：'+x.summary))+el('p','',esc('分析与核实边界：'+x.analysis)):el('p','',esc(quote.limited?quote.text:'原文摘录：'+quote.text)))+el('p','meta','来源：'+esc(x.sourceLabel||sourceName(x.url))+'｜发布日期：'+esc(x.published_date)+'｜'+link(x.url)+(x.extraSources||[]).map(y=>'｜'+link(y.url,y.label)).join('')));};
 const q=report.quality,status='本期取得：新闻 '+q.news+'/10；国际指标 '+q.markets+'/'+report.markets.length+'；机构观点 '+q.analysts+'；关注公司 '+report.stocks.length+' 家'+'。新闻无正文 '+q.noBody+' 条、英文标题 '+q.english+' 条。';
 const seenArticles=new Map();
 const linkedArticle=(x,i,label,view=false)=>{
  const key=canonical(x.url),prior=seenArticles.get(key);
  if(prior)return el('div','card',el('h3','',esc((i+1)+'　'+x.title))+el('p','meta','同一来源已见「'+esc(prior)+'」，事实不重复展开。｜定性：'+esc(x.stance||'中性')+'｜来源：'+esc(x.sourceLabel||sourceName(x.url))+'｜'+link(x.url)));
  seenArticles.set(key,label+'第'+(i+1)+'条');return article(x,i,view);
 };

 const validMarkets=report.markets.filter(x=>typeof x.value==='number'&&Number.isFinite(x.value));
 const rows=validMarkets.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+f(x.value)+'</td><td>'+esc(x.unit)+'</td><td>'+(x.change===null?'—':f(x.change)+' '+esc(x.changeUnit))+'</td><td>'+esc(x.date||'未取得')+'</td><td>'+link(x.source)+(x.note?'<br>'+esc(x.note):'')+'</td></tr>').join('');
 const table=el('div','scroll','<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>'+['指标','数值','单位','变化','数据日期','来源'].map(h=>'<th style="background:#edf3f5;text-align:left">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>');
 const companySections=[['重要新闻',report.news],['政策变化与落地进度',report.policyUpdates],['国内经济温度',report.macroEconomy],['货币、信用与财政',report.liquidityFiscal],['中美及外部风险',report.externalRisks],['产业政策与经营验证',report.industryPolicy],['新增风险与公告进展',report.riskUpdates],['未来5—10个交易日事件日历',report.eventCalendar]];
 const companyItems=[],newsIndex=new Map();
 for(const [label,items] of companySections)for(const [i,item] of (items||[]).entries()){
  const key=canonical(item.url);if(newsIndex.has(key))continue;
  const reference=label+'第'+(i+1)+'条';newsIndex.set(key,reference);companyItems.push({...item,reference});
 }
 const associationCards=report.stocks.map(x=>{
  const related=relatedNews(x,companyItems),covered=new Set(related.map(({item})=>canonical(item.url)));
  const leads=dedupe(x.events||[]).filter(y=>!covered.has(canonical(y.url)));
  if(!related.length&&!leads.length)return '';
  const verified=related.map(({item,index})=>el('div','',el('p','meta','对应'+esc(item.reference)+'｜定性：'+esc(item.stance||classify(item.title))+'｜'+link(item.url,'原文'))+
   (item.summary?el('p','',esc('事实摘要：'+item.summary))+el('p','',esc('分析与核实边界：'+item.analysis)):el('p','small','仅取得新闻标题或短摘录，未形成公司层面的语义分析。')))).join('');
  const supplemental=leads.length?el('p','meta','补充公告检索线索（未逐条核验，不代表正式公告完整清单）')+leads.map(y=>newsIndex.has(canonical(y.url))?el('p','small','同一来源见'+esc(newsIndex.get(canonical(y.url)))+'；具体公司关联尚待核实。 '+link(y.url,'原文')):article(y,0)).join(''):'';
  return el('div','card',el('h3','',esc(x.code+' '+x.name))+verified+supplemental);
 }).filter(Boolean).join('');
 const stocks=el('h3','','关联新闻、事实摘要与分析')+el('p','small','仅将正文或标题明确提及公司名称、代码的新闻及政策事项直接关联；同行业或题材相近不作为关联依据。重复来源不再次列为公告线索。')+
  (associationCards||el('p','small','本期未取得可明确关联的重要新闻或补充公告线索；这不代表公司没有披露。'))+
  el('p','small','事件核实状态：以事件日历逐项列出的来源、状态和核实时间为准；未列出不能理解为近期无事件。已预约日期可能变更，计划开始不等于已经实施。');

 let sectionNumber=0;
 const section=(title,body)=>body?el('div','section',el('h2','',String(++sectionNumber).padStart(2,'0')+' · '+esc(title))+body):'';
 const articlesSection=(title,items,view=false)=>(items||[]).length?section(title,(view?el('p','sub','公开观点保留原始发布日期及假设；机构预测不等于已公布数据，公开评论不冒充完整付费研报。'):'')+items.map((x,i)=>linkedArticle(x,i,title,view)).join('')):'';
 const parts=[
  articlesSection('今日宏观与政策三项变化',report.dailyHighlights),
  articlesSection('政策变化与落地进度',report.policyUpdates),
  articlesSection('国内经济温度',report.macroEconomy),
  articlesSection('货币、信用与财政',report.liquidityFiscal),
  articlesSection('中美及外部风险',report.externalRisks),
  articlesSection('产业政策与经营验证',report.industryPolicy),
  articlesSection('新增风险与公告进展',report.riskUpdates),
  articlesSection('A股市场广度与成交活跃度',report.marketBreadth),
  articlesSection('重要新闻（目标十条，跨栏目事件去重）',report.news),
  validMarkets.length?section('隔夜国际市场与宏观指标',el('p','sub','第三方已完成日线参考；变化为相邻已完成日线之差。收益率用基点，其余用百分比；汇率使用最近完整UTC日线。')+table):'',
  articlesSection('机构与具名分析师观点',report.analysts,true),
  associationCards?section('关注公司关联信息',stocks):'',
  articlesSection('未来5—10个交易日事件日历',report.eventCalendar)
 ];
 const coverage=el('p','small',esc(status))+
  (q.markets<10?el('p','small','有效指标不足10项；本期国际市场数据覆盖有限。'):'')+
  (report.warnings.length?el('p','small',esc(report.warnings.join('；'))):'')+
  el('p','small','无重要新增内容的栏目已隐藏；未展示不代表没有风险或没有事件。信息源缺失、抓取失败或核实不足不能解释为“无变化”。');
 parts.push(section('数据覆盖与核实说明',coverage));
 const content=parts.join('');
 const note=report.editorial?'ChatGPT检索与分析测试版：新闻和机构观点由ChatGPT阅读来源后整理，分析仅解释已披露事实和核实边界，不预测股价。关注公司公告补充仍为规则检索，未逐条完成人工核验。定时运行可用模型由平台分配，不保证与当前对话使用完全相同的模型。':'无模型试用版：不调用任何模型API。采用来源白名单、发布时间筛选、短原文摘录和标题事件规则分类；不做语义摘要、英文翻译或涨跌预测。新闻观察窗为最近72小时，机构观点为最近90天，旧观点保留原始日期。按来源可得性和标题规则排序，不代表热度排名。';
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A股投资简报｜'+report.date+'</title><style>'+css+'</style></head><body>'+el('div','page',el('div','hero',el('div','eyebrow','A股每日简报 · '+report.date)+'<h1 style="margin:7px 0;font-size:30px;color:#fff">A股投资简报</h1>'+el('p','',esc(report.date+'｜北京时间｜'+(report.editorial?'ChatGPT检索与分析测试':'无模型原文摘录试用'))))+el('div','body',el('div','note',esc(note))+content+el('div','footer','<b>'+DISCLAIMER+'</b><br>生成时间：'+esc(report.generatedAt)+'（UTC）；报告日期按北京时间。')) )+'</body></html>';
}
async function main(){
 const report=await collect(),css=await fs.readFile(path.join(ROOT,'no_model_brief.css'),'utf8');
 const output=path.resolve('reports');await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'daily-brief.html'),render(report,css));
 await fs.writeFile(path.join(output,'daily-brief.json'),JSON.stringify(report));
 await fs.writeFile(path.join(output,'daily-brief.txt'),'A股投资简报 '+report.date+'\n无模型原文摘录试用，请阅读HTML正文或附件。\n'+DISCLAIMER);
 console.log('BRIEF_QUALITY='+JSON.stringify(report.quality));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## 无模型简报数据覆盖\n\n'+Object.entries(report.quality).map(([k,v])=>'- '+k+': '+v).join('\n')+'\n\n不调用模型API；报告内容不写入公开日志或artifact。\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('简报生成失败；请检查自选股、Tavily配置和网络状态。未发送邮件。');process.exitCode=1;});
