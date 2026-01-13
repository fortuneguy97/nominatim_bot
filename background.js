// Background script for coordinate storage and communication
let lastCoordinates = null;

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'updateCoords') {
    lastCoordinates = request.coords;
    
    // Store in chrome storage for persistence
    chrome.storage.local.set({
      lastClick: request.coords,
      timestamp: Date.now()
    });
  }
  
  if (request.type === 'getCoords') {
    sendResponse({ coords: lastCoordinates });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
});