import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,merge} from './chatgpt_brief.mjs';
import {render} from './no_model_brief.mjs';
const now=new Date('2026-10-16T00:01:00Z');
const article={title:'回购提议',summary:'董事长提议，尚待审议。',analysis:'提议不等于实施；应核实审批。',sourceLabel:'证券时报',published_date:'2026-10-15T12:00:00Z',url:'https://www.stcn.com/article/detail/1.html',stance:'利好'};
const draft={version:1,date:'2026-10-16',researchedAt:'2026-10-16T00:00:00Z',news:[article],analysts:[]};
test('reject stale drafts, untrusted sources and personal addresses',()=>{
 assert.equal(validate(draft,now),draft);
 assert.throws(()=>validate({...draft,date:'2026-10-15'},now));
 assert.throws(()=>validate({...draft,news:[{...article,url:'https://stcn.com.evil.test/x'}]},now));
 assert.throws(()=>validate({...draft,news:[{...article,summary:'Email me at private@example.com'}]},now));
});
test('model summaries survive HTML rendering and preserve private stock data',()=>{
 const report={date:'2026-10-16',generatedAt:now.toISOString(),news:[],analysts:[],markets:[],stocks:[],warnings:[],quality:{news:0,markets:0,analysts:0,stocks:0,english:0,noBody:0}};
 const merged=merge(report,{...draft,news:[{...article,summary:'客观事实 <script>alert(1)</script>'}]});
 const html=render(merged);
 assert.match(html,/董事长|回购提议/);assert.match(html,/分析与核实边界/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/ChatGPT检索与分析测试/);assert.doesNotMatch(html,/本版不能判断/);
 assert.equal(report.news.length,0);
});

test('validate and merge optional verified priority sections without mutating source',()=>{
 const extra={...article,title:'风险及事件',summary:'已披露事实。'};
 const d={...draft,riskUpdates:[extra],marketBreadth:[extra],eventCalendar:[extra]};
 validate(d,now);
 const base={stocks:[],quality:{}};
 const r=merge(base,d);
 assert.equal(r.riskUpdates[0].summary,extra.summary);assert.equal(base.riskUpdates,undefined);
 assert.throws(()=>validate({...d,eventCalendar:'bad'},now),/INVALID_SUPPLEMENT/);
 assert.throws(()=>validate({...d,riskUpdates:[{...extra,url:'https://evil.example/a'}]},now),/INVALID_SOURCE_OR_STANCE/);
});
