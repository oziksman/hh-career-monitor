async function minimizeWindow(page){
 const session=await page.context().newCDPSession(page);
 try{
  const {windowId}=await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
  const {bounds}=await session.send('Browser.getWindowBounds',{windowId});
  if(bounds.windowState!=='minimized')throw Error('Chrome window did not minimize');
  return bounds.windowState;
 }finally{await session.detach()}
}
module.exports={minimizeWindow};
