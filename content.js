// Script to extract and display last click from Nominatim interface
let lastClickCoords = null;

function extractLastClick() {
  const mapPositionInner = document.getElementById('map-position-inner');
  if (mapPositionInner) {
    const text = mapPositionInner.textContent;
    const clickMatch = text.match(/last click: ([\d.-]+),([\d.-]+)/);

    if (clickMatch) {
      lastClickCoords = {
        lat: parseFloat(clickMatch[1]),
        lon: parseFloat(clickMatch[2])
      };
      updateDisplay();
      console.log('Extracted coordinates:', lastClickCoords);
    }
  }
}

function updateDisplay() {
  const coordsElement = document.getElementById('click-coords');
  console.log('Updating display, element found:', !!coordsElement, 'coords:', lastClickCoords);

  if (coordsElement && lastClickCoords) {
    coordsElement.textContent = `${lastClickCoords.lat}, ${lastClickCoords.lon}`;
    console.log('Display updated with:', coordsElement.textContent);
  } else {
    console.log('Cannot update display - element or coords missing');
  }
}

function createDisplay() {
  // Check if display already exists
  if (document.getElementById('nominatim-click-tracker')) {
    console.log('Display already exists');
    return;
  }

  const display = document.createElement('div');
  display.id = 'nominatim-click-tracker';
  display.innerHTML = `
    <div class="click-tracker-header">Last Click</div>
    <div class="click-tracker-coords" id="click-coords">Click on map</div>
    <div class="click-tracker-buttons">
      <button id="copy-coords">Copy</button>
      <button id="send-request">Send</button>
    </div>
    <div class="click-tracker-result" id="reverse-result" style="display: none;"></div>
  `;

  document.body.appendChild(display);
  console.log('Display created and added to body');

  // Copy button
  document.getElementById('copy-coords').addEventListener('click', () => {
    if (lastClickCoords) {
      const coordsText = `${lastClickCoords.lat}, ${lastClickCoords.lon}`;
      navigator.clipboard.writeText(coordsText).then(() => {
        const button = document.getElementById('copy-coords');
        button.textContent = 'Copied!';
        setTimeout(() => button.textContent = 'Copy', 1000);
      });
    }
  });

  // Send request button
  document.getElementById('send-request').addEventListener('click', () => {
    if (lastClickCoords) {
      sendReverseRequest(lastClickCoords.lat, lastClickCoords.lon);
    }
  });
}

async function sendReverseRequest(lat, lon) {
  const button = document.getElementById('send-request');
  const resultDiv = document.getElementById('reverse-result');

  button.textContent = 'Loading...';
  button.disabled = true;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = 'Sending request...';

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    console.log('Sending request to:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('Response received:', data);
    displayResult(data);

  } catch (error) {
    console.error('Error:', error);
    resultDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    button.textContent = 'Send';
    button.disabled = false;
  }
}

async function checkAddressScore(address) {
  try {
    console.log('Requesting score for address:', address);
    const response = await fetch('http://localhost:3000/api/addresses/score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address })
    });

    console.log('Score API response status:', response.status);
    const result = await response.json();
    console.log('Score API response data:', result);

    if (response.ok) {
      console.log('Address score result:', result);
      return result.score;
    } else {
      console.error('Failed to get address score:', result.error);
      return 0.0; // Return 0.0 instead of null for better display
    }
  } catch (error) {
    console.error('Error checking address score:', error);
    return 0.0; // Return 0.0 instead of null for better display
  }
}

// Extract address components from Nominatim response
function extractAddressComponents(data) {
  const address = data.address || {};

  // Extract city (try multiple fields in priority order)
  const cityFields = ['city', 'town', 'village', 'municipality', 'suburb', 'district'];
  let city = null;
  for (const field of cityFields) {
    if (address[field]) {
      city = address[field];
      break;
    }
  }

  // Extract street (try multiple fields in priority order)
  const streetFields = ['road', 'street', 'pedestrian', 'path', 'footway'];
  let street = null;
  for (const field of streetFields) {
    if (address[field]) {
      street = address[field];
      break;
    }
  }

  // Add house number if available
  // if (address.house_number && street) {
  //   street = `${address.house_number} ${street}`;
  // }

  return {
    city: city || 'Unknown',
    street: street || 'Unknown',
    country: address.country || 'Unknown'
  };
}

async function saveToMongoDBEnhanced(displayName, nominatimData) {
  try {
    // Extract components from Nominatim data
    const components = extractAddressComponents(nominatimData);

    const response = await fetch('http://localhost:3000/api/addresses/enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: displayName,
        nominatim_data: nominatimData,
        components: components  // Send pre-extracted components
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('Enhanced address saved to MongoDB:', result);
      return { success: true, result };
    } else if (result.duplicate) {
      console.log('Address already exists:', result.message);
      return { success: false, duplicate: true, message: result.message };
    } else {
      console.error('Failed to save enhanced address:', result.error);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error saving enhanced address to MongoDB:', error);
    return { success: false, message: error.message };
  }
}

async function saveToMongoDB(address, country, status = 2) {
  try {
    const response = await fetch('http://localhost:3000/api/addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        country,
        status
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('Address saved to MongoDB:', result);
      return true;
    } else {
      console.error('Failed to save address:', result.error);
      return false;
    }
  } catch (error) {
    console.error('Error saving to MongoDB:', error);
    return false;
  }
}

async function displayResult(data) {
  const resultDiv = document.getElementById('reverse-result');

  if (data.error) {
    resultDiv.innerHTML = `<div class="error">Error: ${data.error}</div>`;
    return;
  }

  const address = data.display_name || 'No address found';
  const country = (data.address || {}).country;
  const category = data.category || 'Unknown';

  // Show loading state
  resultDiv.innerHTML = `
    <div class="result-header">Reverse Geocoding Result:</div>
    <div class="result-address">${address}</div>
    <div class="result-details">
      <div><strong>Country:</strong> ${country}</div>
      <div><strong>Checking address validity...</strong></div>
    </div>
  `;

  // Use the address checking functions
  const looks = window.addressCheck.looksLikeAddress(address);
  const region = await window.addressCheck.validateAddressRegion(address, country || '');
  const bbox = window.addressCheck.computeBoundingBoxAreasMeters(data.boundingbox || [0, 0, 0, 0]);

  // Get address score from backend (this will be calculated again during save, but good for display)
  let score = null;
  try {
    score = await checkAddressScore(address);
    console.log('Score received:', score, typeof score);
  } catch (error) {
    console.error('Error getting score:', error);
  }

  // Format score display
  let scoreDisplay = 'N/A';
  let scoreClass = 'score-low';
  if (score !== null && score !== undefined && !isNaN(score) && score >= 0) {
    scoreDisplay = score.toFixed(2);
    if (score >= 0.8) scoreClass = 'score-high';
    else if (score >= 0.5) scoreClass = 'score-medium';
    else scoreClass = 'score-low';
  } else {
    console.log('Score is invalid:', score);
  }
  let save_status = true
  if (!looks) save_status = false
  if (!region) save_status = false
  if (score < 0.9) save_status = false
  resultDiv.innerHTML = `
    <div class="result-header">Reverse Geocoding Result:</div>
    <div class="result-address">${address}</div>
    <div class="result-details">
      <div><strong>Country:</strong> ${country}</div>
      <div><strong>Looks like address:</strong> ${looks}</div>
      <div><strong>Valid region:</strong> ${region}</div>
      <div><strong>Bounding Box Area:</strong> ${bbox.toFixed(2)} m²</div>
      <div><strong>Nominatim Score:</strong> <span class="${scoreClass}">${scoreDisplay}</span></div>
    </div>
    <div class="manual-save-section">
      <button id="manual-save" ${!save_status ? 'disabled' : ''}>
        Save to Database
      </button>
      <button id="check-score" ${!address ? 'disabled' : ''}>
        Recheck Score
      </button>
    </div>
    <div id="save-result" class="save-result"></div>
  `;

  // Add save button functionality (enhanced save only)
  const saveBtn = document.getElementById('manual-save');
  if (saveBtn && !saveBtn.disabled) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const saveResult = await saveToMongoDBEnhanced(address, data);
      const saveResultDiv = document.getElementById('save-result');

      if (saveResult.success) {
        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.backgroundColor = '#4CAF50';

        const components = saveResult.result.components;
        const score = saveResult.result.score;

        saveResultDiv.innerHTML = `
          <div class="save-status success">
            ✓ Address saved successfully!
            <div class="component-breakdown">
              <div><strong>Street:</strong> ${components.street}</div>
              <div><strong>City:</strong> ${components.city}</div>
              <div><strong>Country:</strong> ${components.country}</div>
              <div><strong>Score:</strong> ${score.toFixed(2)}</div>
            </div>
          </div>
        `;
      } else if (saveResult.duplicate) {
        saveBtn.textContent = 'Already Saved';
        saveBtn.style.backgroundColor = '#ffc107';
        saveResultDiv.innerHTML = `
          <div class="save-status warning">⚠ ${saveResult.message}</div>
        `;
        setTimeout(() => {
          saveBtn.textContent = 'Save to Database';
          saveBtn.style.backgroundColor = '';
          saveBtn.disabled = false;
        }, 3000);
      } else {
        saveBtn.textContent = 'Failed ✗';
        saveBtn.style.backgroundColor = '#f44336';
        saveResultDiv.innerHTML = `
          <div class="save-status error">✗ ${saveResult.message}</div>
        `;
        setTimeout(() => {
          saveBtn.textContent = 'Save to Database';
          saveBtn.style.backgroundColor = '';
          saveBtn.disabled = false;
        }, 3000);
      }
    });
  }

  // Add recheck score button functionality
  const recheckScoreBtn = document.getElementById('check-score');
  if (recheckScoreBtn && !recheckScoreBtn.disabled) {
    recheckScoreBtn.addEventListener('click', async () => {
      recheckScoreBtn.textContent = 'Checking...';
      recheckScoreBtn.disabled = true;

      const newScore = await checkAddressScore(address);

      if (newScore !== null && newScore !== undefined && !isNaN(newScore) && newScore >= 0) {
        const scoreElement = resultDiv.querySelector('.result-details div:last-child span');
        if (scoreElement) {
          scoreElement.textContent = newScore.toFixed(2);
          scoreElement.className = '';
          if (newScore >= 0.8) scoreElement.className = 'score-high';
          else if (newScore >= 0.5) scoreElement.className = 'score-medium';
          else scoreElement.className = 'score-low';
        }
      }

      recheckScoreBtn.textContent = 'Recheck Score';
      recheckScoreBtn.disabled = false;
    });
  }
}

function setupMapClickListener() {
  const mapElement = document.getElementById('map');
  if (mapElement) {
    mapElement.addEventListener('click', (event) => {
      console.log('Map clicked');
      // Wait a bit for Nominatim to update the display
      setTimeout(() => {
        extractLastClick();
      }, 200);
    });
  }
}

function setupObserver() {
  const mapPositionInner = document.getElementById('map-position-inner');
  if (mapPositionInner) {
    const observer = new MutationObserver((mutations) => {
      console.log('DOM changed, checking for coordinates');
      extractLastClick();
    });

    observer.observe(mapPositionInner, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also observe the parent container
    const mapPosition = document.getElementById('map-position');
    if (mapPosition) {
      observer.observe(mapPosition, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }
}

function init() {
  console.log('Nominatim click tracker initializing...');

  // Wait a bit for the page to fully load
  setTimeout(() => {
    createDisplay();
    setupMapClickListener();
    setupObserver();
    extractLastClick(); // Get initial value if any
  }, 1000);
}

// Wait for page load and setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

