chrome.action.onClicked.addListener(tab => {
  if (tab.id === undefined) return
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
})
