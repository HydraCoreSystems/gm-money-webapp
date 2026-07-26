import { getNotificationSettings } from '../lib/notifications.js';

(async ()=>{
  try{
    const res = await getNotificationSettings();
    console.log('got', JSON.stringify(res, null, 2));
  }catch(e){
    console.error('err', e.message||e);
  }
})();
