const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scanSearch,snapshot}=require('../src/search-scan.cjs');
const url='https://hh.ru/search/vacancy?resume=test';
const rows=(start,count)=>Array.from({length:count},(_,i)=>({url:`https://hh.ru/vacancy/${start+i}`,title:`Vacancy ${start+i}`}));
test('only matching visible IDs receive unambiguous publication timestamps',()=>{
 const links=rows(1,3),at='2026-11-06T17:34:41.539+03:00';
 const result=require('../src/search-scan.cjs').rowsFrom({links,publications:[{id:'99',at},{id:'2',at},{id:'3',at},{id:'3',at:'2026-11-06T18:34:41.539+03:00'}]});
 assert.equal(result.length,3);assert.equal(result[0].searchPublication,undefined);
 assert.deepEqual(result[1].searchPublication,{day:'2026-11-06',at:'2026-11-06T14:34:41.539Z'});
 assert.equal(result[2].searchPublication,undefined);
});
function fake(pages){
 let index=-1,step=0,scrolls=0;
 return {get scrolls(){return scrolls},goto:async()=>{index++;step=0},waitForSelector:async()=>{},
 evaluate:async()=>{const states=pages[index];return {url,title:'Search',text:'',empty:false,next:null,pageSize:50,...states[Math.min(step,states.length-1)]}},
 locator:()=>({count:async()=>1,last:()=>({scrollIntoViewIfNeeded:async()=>{scrolls++}})}),
 keyboard:{press:async()=>{}},waitForTimeout:async()=>{step++}};
}
test('waits for lazy loading from 20 to 31 cards',async()=>{
 const p=fake([[{total:31,links:rows(1,20)},{total:31,links:rows(1,20)},{total:31,links:rows(1,31)}]]);
 assert.equal((await scanSearch(p,{searchUrl:url})).length,31);assert.ok(p.scrolls>=2);
});
test('incomplete lazy loading cannot be reported as success',async()=>{
 await assert.rejects(scanSearch(fake([[{total:31,links:rows(1,20)}]]),{searchUrl:url,searchLoadRounds:6}),/Incomplete HH search/);
});
test('collects subsequent pages and deduplicates links',async()=>{
 const p=fake([[{total:31,pageSize:20,next:url+'&page=1',links:rows(1,20)}],[{total:31,pageSize:20,links:[...rows(21,11),...rows(21,1)]}]]);
 assert.equal((await scanSearch(p,{searchUrl:url})).length,31);
});
test('refuses truncated page limit and CAPTCHA',async()=>{
 await assert.rejects(scanSearch(fake([[{total:31,pageSize:20,next:url+'&page=1',links:rows(1,20)}]]),{searchUrl:url,maxSearchPages:1}),/page limit/);
 await assert.rejects(scanSearch(fake([[{total:null,title:'captcha',links:[]}]]),{searchUrl:url}),/HH access check/);
});
test('verified zero results succeeds',async()=>{
 assert.deepEqual(await scanSearch(fake([[{total:0,empty:true,links:[]}]]),{searchUrl:url}),[]);
});
test('numbered HH pager works without pager-next; final page stops',()=>{
 const {runInNewContext}=require('node:vm');
 const document={body:{innerText:''},title:'HH',querySelector:s=>s==='h1'?{innerText:'Найдены 52 подходящие вакансии для резюме'}:null,
  querySelectorAll:s=>s==='a[data-qa="pager-page"]'?[{href:url+'&page=0'},{href:url+'&page=1'}]:s.includes('combobox')?[{innerText:'50 вакансий'}]:[]};
 const read=page=>runInNewContext('('+snapshot.toString()+')()',{document,location:{href:url+'&page='+page},URL});
 assert.equal(read(0).next,url+'&page=1');assert.equal(read(1).next,null);assert.equal(read(0).total,52);assert.equal(read(0).pageSize,50);
});

test('drops cards replaced during HH hydration',async()=>{
 const p=fake([[{total:29,links:rows(100,29)},{total:29,links:rows(200,29)}]]);
 const actual=await scanSearch(p,{searchUrl:url});
 assert.equal(actual.length,29);assert.equal(actual[0].id,'200');
});
test('refuses extra cards outside the reported result count',async()=>{
 await assert.rejects(scanSearch(fake([[{total:29,links:rows(1,58)}]]),{searchUrl:url}),/Incomplete HH search/);
});

test('changing pagination can repeat a card without requiring an extra final card',async()=>{
 const p=fake([[{total:31,pageSize:20,next:url+'&page=1',links:rows(1,20)}],[{total:31,pageSize:20,links:rows(20,11)}]]);
 const result=await scanSearch(p,{searchUrl:url});
 assert.equal(result.length,30);assert.equal(new Set(result.map(r=>r.id)).size,30);
});
