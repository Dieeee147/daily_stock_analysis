import test from 'node:test';
import assert from 'node:assert/strict';
import {allowed,MEDIA,classify,recent,dedupe,completedBars,excerpt,render,relatedNews,historyMetrics} from './no_model_brief.mjs';
test('reject lookalike hosts, forums and unsafe schemes',()=>{
 assert.equal(allowed('https://www.stcn.com/article/1',MEDIA),true);
 for(const u of ['https://stcn.com.evil.example/a','https://evil.example/stcn.com','javascript:alert(1)','https://www.stcn.com/forum/a'])assert.equal(allowed(u,MEDIA),false);
});
test('classify explicit events without treating price moves as good news',()=>{
 assert.equal(classify('公司股价涨停'), '中性');
 assert.equal(classify('公司拟回购股份'), '利好');
 assert.equal(classify('公司未收到立案调查通知'), '中性');
 assert.equal(classify('公司回购股份并披露减持计划'), '中性');
});
test('require known publication date within window and reject future',()=>{
 const now=new Date('2026-10-16T00:00:00Z');
 assert.equal(recent({published_date:'2026-10-15T10:00:00Z'},now,3),true);
 for(const d of ['', '2026-10-17','2026-01-01'])assert.equal(recent({published_date:d},now,3),false);
});
test('deduplicate canonical urls and near-identical headlines',()=>{
 const result=dedupe([{url:'https://stcn.com/1?utm_source=a',title:'某上市公司发布股份回购进展公告'},{url:'https://stcn.com/1?utm_source=b',title:'另一标题'},{url:'https://cnstock.com/2',title:'某上市公司发布股份回购进展公告！'}]);
 assert.equal(result.length,1);
});
test('exclude live US daily bar before close and retain it after conservative close',()=>{
 const r={timestamp:[Date.parse('2026-10-14T13:30:00Z')/1000,Date.parse('2026-10-15T13:30:00Z')/1000],indicators:{quote:[{close:[100,105]}]}};
 assert.equal(completedBars(r,new Date('2026-10-15T17:00:00Z'),'America/New_York',17).length,1);
 assert.equal(completedBars(r,new Date('2026-10-16T00:00:00Z'),'America/New_York',17).length,2);
});
test('never invent a summary when article body is unavailable or English',()=>{
 assert.equal(excerpt({content:'网页摘要'}).limited,true);
 assert.equal(excerpt({raw_content:'This is an English article about market developments.'}).limited,true);
 assert.equal(excerpt({raw_content:'公司公告称，预计本期净利润同比增长百分之五十。'}).limited,false);
});
test('render escapes untrusted content and discloses coverage gaps',()=>{
 const report={date:'2026-10-16',generatedAt:'test',quality:{news:1,markets:0,analysts:0,stocks:0,english:0,noBody:1},news:[{title:'<script>注入</script>',url:'https://www.stcn.com/a',published_date:'2026-10-15'}],markets:[],analysts:[],stocks:[],warnings:[]};
 const html=render(report);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('未取得原文正文'));
 assert.ok(html.includes('有效指标不足10项'));
});

function watchFixture(){
 const stock={code:'000001',name:'示例股份',price:12.34,change:-1.25,date:'2026-10-16',amount:123400000,volume:123400,turnover:2.5,range20:'10—15',range60:'8—18',return20:5.5,return60:-3.2,ma20:12,ma60:13,bias20:2.8333,bias60:-5.0769,metricDate:'2026-10-16',source:'https://gu.qq.com/sz000001',events:[]};
 const item={title:'示例股份披露回购提议',summary:'董事长提出回购，尚待审议。',analysis:'提议不能等同于已经实施。',stance:'利好',url:'https://www.stcn.com/a',sourceLabel:'测试来源',published_date:'2026-10-16'};
 return {date:'2026-10-17',generatedAt:'test',editorial:true,quality:{news:1,markets:0,analysts:0,stocks:1,english:0,noBody:0},news:[item],markets:[],analysts:[],stocks:[stock],warnings:[]};
}
test('watchlist table shows period changes while moving averages remain in analysis',()=>{
 const html=render(watchFixture());
 for(const text of ['股票代码','股票名称','收盘参考（元）','日涨跌（%）','成交额（亿元）','成交量（万股）','换手率（%）','近20日涨跌幅（%）','近60日涨跌幅（%）','2026-10-16','12.34','-1.25','1.23','12.34','5.50','-3.20'])assert.ok(html.includes(text),text);
 assert.match(html,/<table class="stock-table"/);
 assert.ok(!html.includes('近20日区间（元）'));
 assert.ok(html.includes('MA20 12.00元'));
 assert.ok(html.includes('MA60 13.00元'));
 assert.ok(html.indexOf('MA20 12.00元')>html.indexOf('关联新闻、事实摘要与分析'));
});
test('company association requires explicit company name or bounded six digit code',()=>{
 const stock={code:'000001',name:'示例股份'};
 assert.equal(relatedNews(stock,[{title:'医药行业政策发布'},{title:'编号1000001的其他新闻'}]).length,0);
 assert.equal(relatedNews(stock,[{title:'000001发布公告'},{title:'示例股份发布公告'}]).length,2);
});
test('associated verified news is cross referenced and duplicate lead removed',()=>{
 const r=watchFixture();r.stocks[0].events=[{...r.news[0],url:r.news[0].url+'?utm_source=test'}];
 const html=render(r);
 assert.ok(html.includes('对应重要新闻第1条'));
 assert.ok(html.includes('提议不能等同于已经实施。'));
 assert.ok(!html.includes('补充公告检索线索（未逐条核验'));
 assert.ok(html.indexOf('关联新闻、事实摘要与分析')>html.indexOf('</tbody></table>',html.indexOf('class="stock-table"')));
});
test('missing quote values and unverified future events remain explicit and escaped',()=>{
 const r=watchFixture();r.stocks[0]={...r.stocks[0],name:'<script>注入</script>',price:null,amount:null,volume:null,turnover:null,events:[{title:'<script>公告线索</script>',url:'https://www.stcn.com/b',published_date:'2026-10-16'}]};
 const html=render(r);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('待核实'));
 assert.ok(html.includes('补充公告检索线索（未逐条核验'));
 assert.ok(html.includes('未列出不能理解为近期无事件'));
});

test('period returns use 21 and 61 closes while moving averages use 20 and 60',()=>{
 const rows=Array.from({length:61},(_,i)=>[new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10),'0',String(i+1)]);
 const m=historyMetrics(rows);
 assert.ok(Math.abs(m.return20-(61/41-1)*100)<1e-10);
 assert.equal(m.return60,6000);assert.equal(m.ma20,51.5);assert.equal(m.ma60,31.5);
 assert.ok(Math.abs(m.bias20-(61/51.5-1)*100)<1e-10);
 assert.equal(historyMetrics(rows.slice(-20)).return20,null);
 assert.equal(historyMetrics(rows.slice(-60)).return60,null);
 assert.equal(historyMetrics(rows.slice(-20)).ma20,51.5);
 const missing=rows.map(r=>[...r]);missing.at(-3)[2]='';
 assert.equal(historyMetrics(missing).return20,null);assert.equal(historyMetrics(missing).ma20,null);
 assert.throws(()=>historyMetrics([...rows,rows[0]]),/DUPLICATE_HISTORY_DATE/);
});
test('priority sections keep verified facts and explicit missing coverage',()=>{
 const r=watchFixture();r.riskUpdates=[{...r.news[0],title:'新增风险样例',summary:'已披露风险事实。'}];
 r.marketBreadth=[{...r.news[0],title:'市场广度样例',summary:'指定范围的涨跌家数。'}];
 r.eventCalendar=[{...r.news[0],title:'已预约事件样例',summary:'预约日期可能变更。'}];
 const html=render(r);
 for(const text of ['新增风险样例','市场广度样例','已预约事件样例'])assert.ok(html.includes(text));
});
