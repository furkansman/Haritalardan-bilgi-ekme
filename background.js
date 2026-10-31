// Minimal MV3 worker: tab ownership only. Collection runs in the Maps content script.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'identify-tab' && sender.tab) respond({tabId: sender.tab.id});
});
