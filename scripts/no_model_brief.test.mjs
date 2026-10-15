import test from 'node:test';
import assert from 'node:assert/strict';
import {allowed,MEDIA,classify,recent,dedupe,completedBars,excerpt,render} from './no_model_brief.mjs';
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
