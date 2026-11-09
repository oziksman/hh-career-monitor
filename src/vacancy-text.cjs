async function vacancyText(page){
 const header=await page.locator('main').evaluate(main=>{
  const copy=main.cloneNode(true);
  copy.querySelectorAll('script,style,noscript,svg,iframe,[data-qa="vacancy-description"],.vacancy-description').forEach(el=>el.remove());
  copy.querySelectorAll('p,li,div,h1,h2,h3,br').forEach(el=>el.append('\n'));
  return copy.textContent.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
 });
 const description=await page.locator('[data-qa="vacancy-description"],.vacancy-description').first().evaluate(el=>{
  const copy=el.cloneNode(true);
  copy.querySelectorAll('script,style,noscript,svg,iframe').forEach(e=>e.remove());
  copy.querySelectorAll('p,li,div,br').forEach(e=>e.append('\n'));
  return copy.textContent.trim();
 });
 if(description.length<50)throw Error('HH: описание вакансии не прочитано');
 return header+'\nОписание вакансии:\n'+description;
}
module.exports={vacancyText};
