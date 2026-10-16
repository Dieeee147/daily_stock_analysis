import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect,render,allowed,MEDIA,BANKS,dateKey} from './no_model_brief.mjs';
export function validate(d,now=new Date()){
 if(d.version!==1||d.date!==dateKey(now)||!Number.isFinite(Date.parse(d.researchedAt))||Date.parse(d.researchedAt)>now.getTime()+60000||now.getTime()-Date.parse(d.researchedAt)>24*3600000)throw new Error('STALE_OR_INVALID_DRAFT');
 if(!Array.isArray(d.news)||d.news.length<1||d.news.length>10||!Array.isArray(d.analysts)||d.analysts.length>5)throw new Error('INVALID_SECTIONS');
 const domains=[...MEDIA,...BANKS,'apnews.com','am.gs.com','bls.gov','census.gov','imf.org','gold.org'];
 for(const x of [...d.news,...d.analysts]){
  if(!allowed(x.url,domains)||!['利好','利空','中性'].includes(x.stance))throw new Error('INVALID_SOURCE_OR_STANCE');
  for(const key of ['title','summary','analysis','sourceLabel','published_date'])if(typeof x[key]!=='string'||!x[key].trim()||x[key].length>1800)throw new Error('INVALID_ARTICLE');
  if(!Number.isFinite(Date.parse(x.published_date))||Date.parse(x.published_date)>now.getTime())throw new Error('INVALID_PUBLICATION_DATE');
 }
 for(const x of [...d.news,...d.analysts])for(const y of x.extraSources||[])if(!allowed(y.url,domains)||typeof y.label!=='string')throw new Error('INVALID_EXTRA_SOURCE');
 if(JSON.stringify(d).match(/[^\s"<>]+@[^\s"<>]+\.[^\s"<>]+/))throw new Error('PERSONAL_EMAIL_IN_PUBLIC_DRAFT');
 return d;
}
export function merge(report,draft){
 const reportCopy={...report,editorial:true,date:draft.date,mode:'ChatGPT检索与分析测试'};
 reportCopy.news=draft.news.map(x=>({...x,raw_content:x.summary}));
 reportCopy.analysts=draft.analysts.map(x=>({...x,raw_content:x.summary}));
 reportCopy.quality={...report.quality,news:draft.news.length,analysts:draft.analysts.length,english:0,noBody:0};
 return reportCopy;
}
async function main(){
 const draft=validate(JSON.parse(await fs.readFile('.github/chatgpt-brief.json','utf8')));
 const report=merge(await collect(),draft);
 const css=await fs.readFile(new URL('./no_model_brief.css',import.meta.url),'utf8');
 await fs.mkdir('reports',{recursive:true});
 await fs.writeFile('reports/daily-brief.html',render(report,css));
 await fs.writeFile('reports/daily-brief.json',JSON.stringify(report));
 await fs.writeFile('reports/daily-brief.txt','A股投资简报 '+report.date+'\nChatGPT重新检索与分析，请阅读HTML正文或附件。\n本内容仅信息整理，不构成投资建议，请查阅交易所原始公告核实。');
 console.log('CHATGPT_BRIEF_QUALITY='+JSON.stringify(report.quality));
 console.log('EDITORIAL_RESEARCHED_AT='+draft.researchedAt);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('ChatGPT简报生成失败：'+(/^[A-Z_]+$/.test(e.message)?e.message:e.name));process.exitCode=1;});
