# Backend Setup for Nominatim Extension

## Prerequisites
- Node.js installed
- MongoDB running (local or remote)

## Setup Instructions

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up MongoDB connection (optional):
```bash
# For local MongoDB (default)
export MONGODB_URI=mongodb://localhost:27017

# For MongoDB Atlas or remote instance
export MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net
```

4. Start the server:
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### POST /api/addresses/enhanced
Save an enhanced address with component extraction and scoring.

**Request Body:**
```json
{
  "display_name": "123 Main Street, Downtown, New York, NY, United States",
  "nominatim_data": { /* optional: full nominatim response */ }
}
```

**Response (Success):**
```json
{
  "success": true,
  "id": "mongodb_object_id",
  "message": "Address saved successfully",
  "components": {
    "street": "123 Main Street",
    "city": "New York",
    "country": "United States"
  },
  "score": 0.85
}
```

**Response (Duplicate):**
```json
{
  "success": false,
  "message": "Address already saved",
  "duplicate": true,
  "existing_id": "mongodb_object_id"
}
```

### POST /api/addresses
Save a validated address to MongoDB (legacy format).

**Request Body:**
```json
{
  "address": "123 Main St, City, Country",
  "country": "Country Name",
  "status": 2
}
```

**Response:**
```json
{
  "success": true,
  "id": "mongodb_object_id",
  "message": "Address saved successfully"
}
```

### GET /api/addresses
Retrieve saved addresses (latest 100).

**Response:**
```json
[
  {
    "_id": "mongodb_object_id",
    "address": "123 Main St, City, Country",
    "country": "Country Name",
    "status": 2,
    "timestamp": "2024-01-10T12:00:00.000Z",
    "source": "nominatim_extension"
  }
]
```

### POST /api/addresses/score
Check address score using Nominatim API validation.

**Request Body:**
```json
{
  "address": "123 Main St, City, Country"
}
```

**Response:**
```json
{
  "address": "123 Main St, City, Country",
  "score": 0.85,
  "timestamp": "2024-01-10T12:00:00.000Z"
}
```

**Score Ranges:**
- `1.0`: Area < 100 m² (very precise)
- `0.9`: Area < 1,000 m² (precise)
- `0.8`: Area < 10,000 m² (good)
- `0.7`: Area < 100,000 m² (acceptable)
- `0.3`: Area ≥ 100,000 m² (imprecise)
- `0.0`: Invalid address or API error

### POST /api/addresses/bounding-box
Compute bounding box areas for Nominatim results.

**Request Body:**
```json
{
  "results": [
    {
      "boundingbox": ["lat_south", "lat_north", "lon_west", "lon_east"],
      "display_name": "Address name"
    }
  ]
}
```

**Response:**
```json
{
  "areas_data": [
    {
      "south": 12.34,
      "north": 12.35,
      "west": 56.78,
      "east": 56.79,
      "width_m": 1000.5,
      "height_m": 1100.2,
      "area_m2": 1100550.1,
      "result": { /* original result object */ }
    }
  ],
  "total_results": 1,
  "processed_results": 1
}
```

## Database Structure

**Database:** `osm_addresses`
**Collection:** `validated_addresses`

**Enhanced Document Schema (status: 1):**
```javascript
{
  country: String,      // Extracted country name
  city: String,         // Extracted city name (using patterns + geonames)
  street: String,       // Extracted street address
  address: String,      // Full display_name from Nominatim (unique index)
  score: Number,        // Validation score from checkWithNominatim
  status: 1,            // Enhanced format identifier
  timestamp: Date,      // When the address was saved
  source: String,       // Source identifier
  nominatim_metadata: { // Optional metadata from Nominatim
    place_id: String,
    osm_type: String,
    osm_id: String,
    category: String,
    type: String
  }
}
```

**Legacy Document Schema (status: 2):**
```javascript
{
  address: String,      // Full address from Nominatim
  country: String,      // Country name
  status: 2,            // Legacy format identifier
  timestamp: Date,      // When the address was saved
  source: String        // Source identifier
}
```

**Database Indexes:**
- Unique index on `address` field to prevent duplicates