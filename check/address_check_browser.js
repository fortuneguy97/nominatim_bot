// Browser-compatible version of address_check.js
// Removed fs and path dependencies for use in browser extensions

// Country mapping - exact same as Python version
const COUNTRY_MAPPING = {
    // Korea variations
    "korea, south": "south korea",
    "korea, north": "north korea",
    
    // Cote d'Ivoire variations
    "cote d ivoire": "ivory coast",
    "côte d'ivoire": "ivory coast",
    "cote d'ivoire": "ivory coast",
    
    // Gambia variations
    "the gambia": "gambia",
    
    // Netherlands variations
    "netherlands": "the netherlands",
    "holland": "the netherlands",
    
    // Congo variations
    "congo, democratic republic of the": "democratic republic of the congo",
    "drc": "democratic republic of the congo",
    "congo, republic of the": "republic of the congo",
    
    // Burma/Myanmar variations
    "burma": "myanmar",

    // Bonaire variations
    'bonaire': 'bonaire, saint eustatius and saba',
    
    // Additional common variations
    "usa": "united states",
    "us": "united states",
    "united states of america": "united states",
    "uk": "united kingdom",
    "great britain": "united kingdom",
    "britain": "united kingdom",
    "uae": "united arab emirates",
    "u.s.a.": "united states",
    "u.s.": "united states",
    "u.k.": "united kingdom",
};

// Global cache for geonames data
let _geonamesCache = null;
let _citiesData = null;
let _countriesData = null;

/**
 * Get cached geonames data, loading it only once.
 * Browser version - loads from extension files
 */
async function getGeonamesData() {
    if (_geonamesCache === null) {
        console.log("Loading geonames data for the first time...");
        const startTime = Date.now();
        
        try {
            // Load cities and countries data from JSON files using fetch
            const citiesResponse = await fetch(chrome.runtime.getURL('check/geonames_cities.json'));
            const countriesResponse = await fetch(chrome.runtime.getURL('check/geonames_countries.json'));
            
            _citiesData = await citiesResponse.json();
            _countriesData = await countriesResponse.json();
            _geonamesCache = true;
            
            const endTime = Date.now();
            console.log(`Geonames data loaded in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        } catch (error) {
            console.error("Error loading geonames data:", error);
            throw error;
        }
    }
    
    return [_citiesData, _countriesData];
}

/**
 * Check if a city is actually in the specified country using geonames data.
 */
async function cityInCountry(cityName, countryName) {
    if (!cityName || !countryName) {
        return false;
    }
    
    try {
        const [cities, countries] = await getGeonamesData();
        
        const cityNameLower = cityName.toLowerCase();
        const countryNameLower = countryName.toLowerCase();
        
        // Find country code
        let countryCode = null;
        for (const [code, data] of Object.entries(countries)) {
            if (data.name && data.name.toLowerCase().trim() === countryNameLower.trim()) {
                countryCode = code;
                break;
            }
        }
        
        if (!countryCode) {
            return false;
        }
        
        // Only check cities that are actually in the specified country
        const cityWords = cityNameLower.split(' ');
        
        for (const [cityId, cityData] of Object.entries(cities)) {
            // Skip cities not in the target country
            if (cityData.countrycode !== countryCode) {
                continue;
            }
            
            const cityDataName = (cityData.name || "").toLowerCase();
            
            // Check exact match first
            if (cityDataName.trim() === cityNameLower.trim()) {
                return true;
            }
            // Check first word match
            else if (cityWords.length >= 2 && cityDataName.startsWith(cityWords[0])) {
                return true;
            }
            // Check second word match
            else if (cityWords.length >= 2 && cityDataName.includes(cityWords[1])) {
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error(`Error checking city '${cityName}' in country '${countryName}':`, error);
        return false;
    }
}

/**
 * Extract city and country from an address.
 */
async function extractCityCountry(address, twoParts = false) {
    if (!address) {
        return ["", ""];
    }

    address = address.toLowerCase();
    
    const parts = address.split(",").map(p => p.trim());
    if (parts.length < 2) {
        return ["", ""];
    }

    // Determine country and its normalized form
    const lastPart = parts[parts.length - 1];
    const singlePartNormalized = COUNTRY_MAPPING[lastPart] || lastPart;
    
    let countryCheckingName = '';
    let normalizedCountry = '';
    let usedTwoPartsForCountry = false;
    
    // If twoParts flag is set, also try two-part country
    if (twoParts && parts.length >= 2) {
        const twoPartRaw = `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
        const twoPartNormalized = COUNTRY_MAPPING[twoPartRaw] || twoPartRaw;

        if (twoPartRaw !== twoPartNormalized) {
            countryCheckingName = twoPartNormalized;
            normalizedCountry = twoPartNormalized;
            usedTwoPartsForCountry = true;
        }
    }

    if (countryCheckingName === '') {
        // Single-part country
        countryCheckingName = singlePartNormalized;
        normalizedCountry = singlePartNormalized;
        usedTwoPartsForCountry = false;
    }

    // If no country found, return empty
    if (!normalizedCountry) {
        return ["", ""];
    }

    // Check each section from right to left (excluding the country)
    const excludeCount = usedTwoPartsForCountry ? 2 : 1;
    
    for (let i = excludeCount + 1; i <= parts.length; i++) {
        const candidateIndex = -i;
        if (Math.abs(candidateIndex) > parts.length) {
            break;
        }
        
        const candidatePart = parts[parts.length + candidateIndex];
        if (!candidatePart) {
            continue;
        }
            
        const words = candidatePart.split(' ');
        
        // Try different combinations of words (1-2 words max)
        for (let numWords = 0; numWords < words.length; numWords++) {
            const currentWord = words[numWords];

            // Try current word
            const candidates = [currentWord];

            // Also try current + previous (if exists)
            if (numWords > 0) {
                const prevPlusCurrent = words[numWords - 1] + " " + words[numWords];
                candidates.push(prevPlusCurrent);
            }

            for (const cityCandidate of candidates) {
                // Skip if contains numbers or is too short
                if (/\d/.test(cityCandidate)) {
                    continue;
                }

                // Validate the city exists in the country
                if (await cityInCountry(cityCandidate, countryCheckingName)) {
                    return [cityCandidate, normalizedCountry];
                }
            }
        }
    }

    return ["", normalizedCountry];
}

/**
 * Check if any Western Sahara city appears in the generated address.
 */
function checkWesternSaharaCities(generatedAddress) {
    if (!generatedAddress) {
        return false;
    }
    
    // Western Sahara cities
    const WESTERN_SAHARA_CITIES = [
        "laayoune", "dakhla", "boujdour", "es semara", "sahrawi", "tifariti", "aousserd"
    ];
    
    const genLower = generatedAddress.toLowerCase();
    
    // Check if any of the cities appear in the generated address
    for (const city of WESTERN_SAHARA_CITIES) {
        if (genLower.includes(city)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if a string looks like a valid address.
 */
function looksLikeAddress(address) {
    address = address.trim().toLowerCase();

    // Keep all letters (Latin and non-Latin) and numbers
    const addressLen = address.replace(/[^\w]/g, '');
    if (addressLen.length < 30) {
        return false;
    }
    if (addressLen.length > 300) {  // maximum length check
        return false;
    }

    // Count letters (both Latin and non-Latin)
    const letterMatches = address.match(/[^\W\d]/g);
    const letterCount = letterMatches ? letterMatches.length : 0;
    if (letterCount < 20) {
        return false;
    }

    if (/^[^a-zA-Z]*$/.test(address)) {  // no letters at all
        return false;
    }
    if (new Set(address).size < 5) {  // all chars basically the same
        return false;
    }
    
    // Has at least one digit in a comma-separated section
    // Replace hyphens and semicolons with empty strings before counting numbers
    const addressForNumberCount = address.replace(/-/g, '').replace(/;/g, '');
    // Split address by commas and check for numbers in each section
    const sections = addressForNumberCount.split(',').map(s => s.trim());
    const sectionsWithNumbers = [];
    for (const section of sections) {
        // Only match ASCII digits (0-9), not other numeric characters
        const numberGroups = section.match(/[0-9]+/g);
        if (numberGroups && numberGroups.length > 0) {
            sectionsWithNumbers.push(section);
        }
    }
    // Need at least 1 section that contains numbers
    if (sectionsWithNumbers.length < 1) {
        return false;
    }

    if ((address.match(/,/g) || []).length < 2) {
        return false;
    }
    
    // Check for special characters that should not be in addresses
    const specialChars = ['`', ':', '%', '\n', '@', '*', '^', '[', ']', '{', '}', '_', '«', '»'];
    if (specialChars.some(char => address.includes(char))) {
        return false;
    }
    
    return true;
}

/**
 * Validate that generated address has correct region from seed address.
 */
async function validateAddressRegion(generatedAddress, seedAddress) {
    if (!generatedAddress || !seedAddress) {
        return false;
    }
    
    // Special handling for disputed regions not in geonames
    const seedLower = seedAddress.toLowerCase();
    
    // Special handling for Western Sahara - check for cities instead of region name
    if (seedLower === "west sahara" || seedLower === "western sahara") {
        return checkWesternSaharaCities(generatedAddress);
    }
    
    // Other special regions
    const OTHER_SPECIAL_REGIONS = ["luhansk", "crimea", "donetsk"];
    if (OTHER_SPECIAL_REGIONS.includes(seedLower)) {
        // If seed is a special region, check if that region appears in generated address
        const genLower = generatedAddress.toLowerCase();
        return genLower.includes(seedLower);
    }
    
    // Extract city and country from both addresses
    const [genCity, genCountry] = await extractCityCountry(generatedAddress, seedAddress.includes(','));
    const seedAddressLower = seedAddress.toLowerCase();
    const seedAddressMapped = COUNTRY_MAPPING[seedAddress.toLowerCase()] || seedAddress.toLowerCase();

    
    // If no city was extracted from generated address, it's an error
    if (!genCity) {
        return false;
    }
    
    // If no country was extracted from generated address, it's an error
    if (!genCountry) {
        return false;
    }
    
    // Check if either city or country matches
    const cityMatch = genCity && seedAddressLower && genCity === seedAddressLower;
    const countryMatch = genCountry && seedAddressLower && genCountry === seedAddressLower;
    const mappedMatch = genCountry && seedAddressMapped && genCountry === seedAddressMapped;

    
    if (!(cityMatch || countryMatch || mappedMatch)) {
        return false;
    }
    
    return true;
}

/**
 * Compute bounding box areas in square meters.
 */
function computeBoundingBoxAreasMeters(nominatimResults) {
    const [south, north, west, east] = nominatimResults.map(parseFloat);
        
    // Approx center latitude for longitude scaling
    const centerLat = (south + north) / 2.0;
    const latM = 111000;  // meters per degree latitude
    const lonM = 111000 * Math.cos(centerLat * Math.PI / 180);  // meters per degree longitude
    const heightM = Math.abs(north - south) * latM;
    const widthM = Math.abs(east - west) * lonM;
    const areaM2 = widthM * heightM;
    
    return areaM2;
}

// Make functions available globally for content script
window.addressCheck = {
    looksLikeAddress,
    validateAddressRegion,
    computeBoundingBoxAreasMeters,
    extractCityCountry,
    cityInCountry,
    checkWesternSaharaCities,
    getGeonamesData,
    COUNTRY_MAPPING
};