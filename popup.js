// Popup script for the Nominatim extension
document.addEventListener('DOMContentLoaded', function() {
  const coordsElement = document.getElementById('popup-coords');
  const copyButton = document.getElementById('copy-popup-coords');
  const refreshButton = document.getElementById('refresh-coords');
  const statusMessage = document.getElementById('status-message');

  let currentCoords = null;

  // Load stored coordinates
  function loadCoordinates() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (tab.url.includes('nominatim.openstreetmap.org')) {
        // Try to get coordinates from content script
        chrome.tabs.sendMessage(tab.id, {type: 'getCoords'}, function(response) {
          if (chrome.runtime.lastError) {
            statusMessage.textContent = 'Extension not loaded on this page';
            return;
          }
          
          if (response && response.coords) {
            updateDisplay(response.coords);
          } else {
            coordsElement.textContent = 'No clicks detected yet';
            statusMessage.textContent = 'Click on the map to capture coordinates';
          }
        });
      } else {
        coordsElement.textContent = 'Not on Nominatim page';
        statusMessage.textContent = 'Navigate to nominatim.openstreetmap.org';
      }
    });
  }

  function updateDisplay(coords) {
    currentCoords = coords;
    coordsElement.textContent = `${coords.lat}, ${coords.lon}`;
    statusMessage.textContent = 'Coordinates captured successfully';
  }

  // Copy coordinates to clipboard
  copyButton.addEventListener('click', function() {
    if (currentCoords) {
      const coordsText = `${currentCoords.lat}, ${currentCoords.lon}`;
      navigator.clipboard.writeText(coordsText).then(function() {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        statusMessage.textContent = 'Coordinates copied to clipboard';
        
        setTimeout(function() {
          copyButton.textContent = originalText;
          statusMessage.textContent = '';
        }, 2000);
      });
    } else {
      statusMessage.textContent = 'No coordinates to copy';
    }
  });

  // Refresh coordinates
  refreshButton.addEventListener('click', function() {
    loadCoordinates();
  });

  // Initial load
  loadCoordinates();

  // Listen for coordinate updates
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'updateCoords') {
      updateDisplay(request.coords);
    }
  });
});