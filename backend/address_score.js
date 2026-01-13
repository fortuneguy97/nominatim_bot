// JavaScript version of address_score.py
const fetch = require('node-fetch');

/**
 * Computes bounding box areas in meters instead of degrees.
 * @param {Array} nominatimResults - Array of Nominatim result objects
 * @returns {Array} Array of area data objects
 */
function computeBoundingBoxAreasMeters(nominatimResults) {
    if (!Array.isArray(nominatimResults)) {
        return [];
    }
    
    const areas = [];
    for (const item of nominatimResults) {
        if (!item.boundingbox) {
            continue;
        }
        
        // Extract and convert bounding box coords to floats
        const [south, north, west, east] = item.boundingbox.map(parseFloat);
        
        // Approx center latitude for longitude scaling
        const centerLat = (south + north) / 2.0;
        const latM = 111000;  // meters per degree latitude
        const lonM = 111000 * Math.cos(centerLat * Math.PI / 180);  // meters per degree longitude
        const heightM = Math.abs(north - south) * latM;
        const widthM = Math.abs(east - west) * lonM;
        const areaM2 = widthM * heightM;
        
        areas.push({
            south: south,
            north: north,
            west: west,
            east: east,
            width_m: widthM,
            height_m: heightM,
            area_m2: areaM2,
            result: item  // Keep reference to original result
        });
    }
    
    return areas;
}

/**
 * Validates address using Nominatim API and returns a score based on bounding box areas.
 * @param {string} address - The address to validate
 * @returns {Promise<number|string|object>} Score, error string, or result object
 * Returns:
 *   - number (score) for success
 *   - "TIMEOUT" for timeout
 *   - "API_ERROR" for API failures (network errors, exceptions)
 *   - 0.0 for invalid address (API succeeded but address not found/filtered out)
 */
async function checkWithNominatim(address) {
    try {
        const url = "https://nominatim.openstreetmap.org/search";
        const params = new URLSearchParams({
            q: address,
            format: "json"
        });
        
        const headers = {
            "User-Agent": "MIID-Local-Test/1.0"
        };
        
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${url}?${params}`, {
            headers: headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const results = await response.json();
        
        // Check if we have any results
        if (results.length === 0) {
            return 0.0;
        }
        
        // Extract numbers from the original address for matching
        const originalNumbers = new Set((address.toLowerCase().match(/[0-9]+/g) || []));

        // Filter results based on place_rank, name check, and numbers check
        const filteredResults = [];
        for (const result of results) {
            // Check place_rank is 20 or above
            const placeRank = result.place_rank || 0;
            if (placeRank < 20) {
                continue;
            }
            
            // Check that 'name' field exists and is in the original address
            const name = result.name || '';
            if (name) {
                // Check if name is in the address (case-insensitive)
                if (!address.toLowerCase().includes(name.toLowerCase())) {
                    continue;
                }
            }
            
            // Check that numbers in display_name match numbers from the original address
            const displayName = result.display_name || '';
            
            console.log(`${displayName} \n ${address}`);
            if (displayName) {
                const displayNumbers = new Set((displayName.toLowerCase().match(/[0-9]+/g) || []));
                if (originalNumbers.size > 0) {
                    // Ensure display numbers exactly match original numbers (no new numbers, no missing numbers)
                    if (!setsEqual(displayNumbers, originalNumbers)) {
                        continue;
                    }
                }
            }
            
            filteredResults.push(result);
        }
        
        // If no results pass the filters, return 0.0
        if (filteredResults.length === 0) {
            return 0.0;
        }
        
        // Calculate bounding box areas for all results (not just filtered)
        const areasData = computeBoundingBoxAreasMeters(results);
        
        if (areasData.length === 0) {
            return 0.0;
        }
        
        // Extract areas
        const areas = areasData.map(item => item.area_m2);
        
        // Use the total area for scoring
        const totalArea = areas.reduce((sum, area) => sum + area, 0);
        
        // Score based on total area
        let score;
        if (totalArea < 100) {
            score = 1.0;
        } else if (totalArea < 1000) {
            score = 0.9;
        } else if (totalArea < 10000) {
            score = 0.8;
        } else if (totalArea < 100000) {
            score = 0.7;
        } else {
            score = 0.3;
        }
        
        // Store simplified score details (only score and num_results for cache)
        const numResults = areas.length;
        
        // Return full details (commented out like in Python version)
        // return {
        //     score: score,
        //     num_results: numResults,
        //     areas: areas,
        //     total_area: totalArea,
        //     areas_data: areasData
        // };
        
        return score;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`API timeout for address: ${address}`);
            return 0.0;
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log(`Request exception for address '${address}': ${error.name}: ${error.message}`);
            return 0.0;
        } else if (error instanceof SyntaxError) {
            // JSON parsing error
            console.log(`ValueError (likely JSON parsing) for address '${address}': ${error.message}`);
            return 0.0;
        } else if (error.message && (error.message.toLowerCase().includes('codec') && error.message.toLowerCase().includes('encode'))) {
            console.log(`Encoding error for address '${address}' (treating as timeout): ${error.message}`);
            return 0.0;
        } else {
            console.log(`Unexpected exception for address '${address}': ${error.name}: ${error.message}`);
            return 0.0;
        }
    }
}

/**
 * Helper function to compare two Sets for equality
 * @param {Set} set1 - First set
 * @param {Set} set2 - Second set
 * @returns {boolean} True if sets are equal
 */
function setsEqual(set1, set2) {
    if (set1.size !== set2.size) {
        return false;
    }
    for (const item of set1) {
        if (!set2.has(item)) {
            return false;
        }
    }
    return true;
}

/**
 * Extract street address from display_name
 * Looks for the first part containing numbers (street address pattern)
 * @param {string} displayName - Full address from Nominatim
 * @returns {string} Street address or first part as fallback
 */
function extractStreet(displayName) {
    if (!displayName) return 'Unknown';
    
    const parts = displayName.split(',').map(p => p.trim());
    
    // Look for first part with numbers (typical street address)
    for (const part of parts) {
        if (/\d/.test(part)) {
            return part;
        }
    }
    
    // Fallback to first part
    return parts[0] || 'Unknown';
}

/**
 * Extract city from display_name using patterns and existing logic
 * @param {string} displayName - Full address from Nominatim
 * @returns {string} City name or 'Unknown'
 */
function extractCity(displayName) {
    if (!displayName) return 'Unknown';
    
    const parts = displayName.split(',').map(p => p.trim());
    
    // Pattern 1: Look for parts containing city indicators
    const cityPatterns = /\b(city|town|village|municipality|borough|district|township|commune)\b/i;
    for (const part of parts) {
        if (cityPatterns.test(part)) {
            // Remove the city indicator and return clean name
            return part.replace(cityPatterns, '').trim() || part;
        }
    }
    
    // Pattern 2: Use existing extractCityCountry logic as fallback
    // This requires the country mapping logic, so let's implement a simple version
    const countryMapping = {
        "usa": "united states", "us": "united states", "united states of america": "united states",
        "uk": "united kingdom", "great britain": "united kingdom", "britain": "united kingdom"
    };
    
    if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].toLowerCase();
        const normalizedCountry = countryMapping[lastPart] || lastPart;
        
        // Look for city in second-to-last or third-to-last position
        if (parts.length >= 3) {
            const cityCandidate = parts[parts.length - 3];
            // Avoid parts that look like states/regions (short codes)
            if (cityCandidate.length > 2 && !/^[A-Z]{2}$/.test(cityCandidate)) {
                return cityCandidate;
            }
        }
        
        if (parts.length >= 2) {
            const cityCandidate = parts[parts.length - 2];
            // Avoid parts that look like states/regions (short codes)
            if (cityCandidate.length > 2 && !/^[A-Z]{2}$/.test(cityCandidate)) {
                return cityCandidate;
            }
        }
    }
    
    return 'Unknown';
}

/**
 * Extract country from display_name
 * @param {string} displayName - Full address from Nominatim
 * @returns {string} Country name
 */
function extractCountry(displayName) {
    if (!displayName) return 'Unknown';
    
    const parts = displayName.split(',').map(p => p.trim());
    const lastPart = parts[parts.length - 1];
    
    // Basic country mapping
    const countryMapping = {
        "usa": "united states", "us": "united states", "united states of america": "united states",
        "uk": "united kingdom", "great britain": "united kingdom", "britain": "united kingdom",
        "uae": "united arab emirates"
    };
    
    const normalized = countryMapping[lastPart.toLowerCase()] || lastPart;
    return normalized;
}

/**
 * Parse address components from Nominatim display_name
 * @param {string} displayName - Full address from Nominatim
 * @returns {object} Parsed address components
 */
function parseAddressComponents(displayName) {
    return {
        street: extractStreet(displayName),
        city: extractCity(displayName),
        country: extractCountry(displayName)
    };
}

// Export functions for use as a module
module.exports = {
    computeBoundingBoxAreasMeters,
    checkWithNominatim,
    parseAddressComponents,
    extractStreet,
    extractCity,
    extractCountry
};

// Test code (equivalent to Python's if __name__ == "__main__")
if (require.main === module) {
    const address = "175-4 Street, Asmara, Maekel Region, Eritrea";
    
    checkWithNominatim(address).then(result => {
        console.log(result);
    }).catch(error => {
        console.error('Error:', error);
    });
}