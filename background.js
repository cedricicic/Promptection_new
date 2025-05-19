chrome.runtime.onInstalled.addListener(() => {
  // Initialize default state with some example patterns
  const defaultState = {
    enabled: false,
    replacements: {},
    settings: {
      maskStyle: "replace",
      patterns: {
        "Email": {
          pattern: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
          flags: "g",
          enabled: true,
          priority: 0
        },
        "Phone": {
          pattern: "(?:\\b(?:\\+\\d{1,2}\\s?)?[\\(]?\\d{3}[\\)]?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b)|(?:\\+\\d{1,3}[\\s.-]?\\d{1,4}[\\s.-]?\\d{2,4}[\\s.-]?\\d{2,4}(?:\\s?(?:x|ext|#)\\s?\\d{1,5})?)\\b",
          flags: "g",
          enabled: true,
          priority: 1
        },
        "Credit Card": {
          pattern: "\\b(?:\\d{4}[- ]?){3}\\d{4}\\b",
          flags: "g",
          enabled: true,
          priority: 2
        },
        "SSN": {
          pattern: "\\d{3}-\\d{2}-\\d{4}",
          flags: "g",
          enabled: true,
          priority: 3
        }
      }
    }
  };

  // Set initial state in Chrome storage
  chrome.storage.sync.get("state", (data) => {
    if (!data.state) {
      chrome.storage.sync.set({ state: defaultState }, () => {
        console.log("Default state initialized");
      });
    }
  });
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle explicit toggle state action (only way to change enabled flag)
  if (message.action === "toggleState") {
    // Make a deep copy to avoid reference issues
    const stateCopy = JSON.parse(JSON.stringify(message.state));
    
    // Explicitly set the enabled state from the toggle action
    stateCopy.enabled = message.enabled;
    
    // Store the state with the updated enabled flag
    chrome.storage.sync.set({ state: stateCopy }, () => {
      console.log("Enabled state toggled to:", stateCopy.enabled);
      
      // Broadcast the update to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          try {
            chrome.tabs.sendMessage(
              tab.id, 
              { action: "updateState", state: stateCopy }
            ).catch(() => {
              // Ignore errors from tabs without content script
            });
          } catch (err) {
            // Ignore errors
          }
        });
      });
      
      if (sendResponse) {
        sendResponse({ success: true });
      }
    });
    
    return true; // Keep the messaging channel open for the async response
  }
  // Handle regular state updates (shouldn't change enabled state from content scripts)
  else if (message.action === "stateUpdated") {
    // Make a deep copy to avoid reference issues
    const stateCopy = JSON.parse(JSON.stringify(message.state));
    
    // Preserve the enabled state from storage to prevent auto-enabling
    chrome.storage.sync.get("state", (data) => {
      if (data.state && sender.tab) {
        // If this message came from a content script (tab exists), 
        // preserve the current enabled state to prevent auto-enabling
        stateCopy.enabled = data.state.enabled;
      }
      
      // Store the state immediately in sync storage to ensure persistence
      chrome.storage.sync.set({ state: stateCopy }, () => {
        console.log("State updated in background.js:", stateCopy);
        
        // Broadcast the update to all tabs
        chrome.tabs.query({}, (tabs) => {
          let pendingTabs = tabs.length;
          let successCount = 0;
          
          // If no tabs, consider it successful
          if (pendingTabs === 0 && sendResponse) {
            sendResponse({ success: true, updatedTabs: 0 });
            return;
          }
          
          tabs.forEach((tab) => {
            try {
              chrome.tabs.sendMessage(
                tab.id, 
                { action: "updateState", state: stateCopy },
                (response) => {
                  pendingTabs--;
                  if (response && response.success) {
                    successCount++;
                  }
                  
                  // When all tabs have responded, send a response back
                  if (pendingTabs === 0 && sendResponse) {
                    sendResponse({ 
                      success: true, 
                      updatedTabs: successCount,
                      totalTabs: tabs.length
                    });
                  }
                }
              );
            } catch (err) {
              // Ignore errors from tabs that don't have the content script running
              pendingTabs--;
              console.log(`Failed to update tab ${tab.id}: ${err.message}`);
              
              // When all tabs have responded, send a response back
              if (pendingTabs === 0 && sendResponse) {
                sendResponse({ 
                  success: true, 
                  updatedTabs: successCount,
                  totalTabs: tabs.length
                });
              }
            }
          });
        });
      });
    });
    
    return true; // Keep the messaging channel open for the async response
  }
});

// When a new tab is activated, update it with the current state
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.sync.get("state", (data) => {
    if (data.state) {
      chrome.tabs.sendMessage(activeInfo.tabId, { 
        action: "updateState", 
        state: data.state 
      }).catch(() => {
        // Ignore errors from tabs that don't have the content script running
      });
    }
  });
});