# Nominatim Address Validator

A Chrome extension for capturing, validating, and storing addresses from OpenStreetMap's Nominatim interface.

## Features

- **Click Tracking** - Capture coordinates from map clicks on nominatim.openstreetmap.org
- **Reverse Geocoding** - Convert coordinates to full addresses via Nominatim API
- **Address Validation** - Multi-layer validation including:
  - Format checking (length, structure, special characters)
  - Region validation using GeoNames database
  - Bounding box area scoring for precision assessment
- **MongoDB Storage** - Save validated addresses with extracted components (street, city, country)
- **Duplicate Detection** - Prevents saving duplicate addresses

## Architecture

```
├── Extension (Chrome MV3)
│   ├── content.js          # Map interaction & UI overlay
│   ├── popup.js/html       # Extension popup interface
│   ├── background.js       # Coordinate storage
│   └── check/              # Address validation logic
│       ├── address_check_browser.js
│       └── geonames_*.json # City/country reference data
│
└── Backend (Node.js + Express)
    ├── api.js              # REST API endpoints
    └── address_score.js    # Nominatim scoring algorithm
```

## Installation

### Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select project folder

### Backend
```bash
cd backend
npm install
npm run dev
```

Requires MongoDB running locally (default: `mongodb://localhost:27017`)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/addresses/enhanced` | Save address with component extraction |
| POST | `/api/addresses/score` | Get address precision score |
| GET | `/api/addresses` | Retrieve saved addresses |

## Scoring System

Addresses are scored based on Nominatim bounding box area:

| Area (m²) | Score |
|-----------|-------|
| < 100 | 1.0 (very precise) |
| < 1,000 | 0.9 (precise) |
| < 10,000 | 0.8 (good) |
| < 100,000 | 0.7 (acceptable) |
| ≥ 100,000 | 0.3 (imprecise) |

## Usage

1. Navigate to [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org)
2. Click on the map to capture coordinates
3. Click "Send" to reverse geocode
4. Review validation results (format, region, score)
5. Click "Save to Database" for valid addresses (score ≥ 0.9)

## Tech Stack

- **Extension**: Chrome Manifest V3, vanilla JS
- **Backend**: Node.js, Express, MongoDB
- **Data**: GeoNames cities/countries database
- **API**: OpenStreetMap Nominatim
