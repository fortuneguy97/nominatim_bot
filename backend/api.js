// Backend API for handling MongoDB operations
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { computeBoundingBoxAreasMeters, checkWithNominatim, parseAddressComponents } = require('./address_score');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = "mongodb://admin:fjkfjrj!20020415@localhost:27017/?authSource=admin";
const DB_NAME = 'osm_addresses';
const COLLECTION_NAME = 'validated_addresses';

let db;

// Connect to MongoDB
MongoClient.connect(MONGODB_URI)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db(DB_NAME);
    
    // Create unique index on address field to prevent duplicates
    db.collection(COLLECTION_NAME).createIndex(
      { address: 1 }, 
      { unique: true, background: true }
    ).then(() => {
      console.log('Unique index created on address field');
    }).catch(error => {
      // Index might already exist, that's okay
      if (error.code !== 11000) {
        console.error('Error creating index:', error);
      }
    });
  })
  .catch(error => console.error('MongoDB connection error:', error));

// Enhanced address saving with component extraction and scoring
app.post('/api/addresses/enhanced', async (req, res) => {
  try {
    const { display_name, nominatim_data, components } = req.body;
    
    let osm_type = "";
    if(nominatim_data.osm_type === "way") osm_type = "W"
    if(nominatim_data.osm_type === "node") osm_type = "N"
    let osm_id = nominatim_data.osm_id
    osm = `${osm_type}${osm_id}`
    console.log(osm)

    if (!display_name) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    console.log(`Processing enhanced address save: ${display_name}`);
    
    // Check for duplicates first
    const existingAddress = await db.collection(COLLECTION_NAME).findOne({ 
      address: display_name 
    });
    
    if (existingAddress) {
      return res.json({ 
        success: false,
        message: 'Address already saved',
        duplicate: true,
        existing_id: existingAddress._id
      });
    }
    
    // Calculate score using Nominatim validation
    console.log('Calculating address score...');
    const score = await checkWithNominatim(display_name);
    
    // Use pre-extracted components from frontend, or fallback to parsing
    let finalComponents;
    if (components) {
      finalComponents = components;
      console.log('Using pre-extracted components:', components);
    } else {
      console.log('Fallback: parsing components from display_name...');
      finalComponents = parseAddressComponentsLegacy(display_name);
    }
    
    // Create enhanced document
    const document = {
      address: display_name,
      city: finalComponents.city,
      country: finalComponents.country,
      street: finalComponents.street,
      score: score,
      status: 1, // Enhanced format
      osm_id: osm
      // timestamp: new Date(),
      // source: 'nominatim_extension'
    };
    
    // Add nominatim_data if provided (for debugging/reference)
    // if (nominatim_data) {
    //   document.nominatim_metadata = {
    //     place_id: nominatim_data.place_id,
    //     osm_type: nominatim_data.osm_type,
    //     osm_id: nominatim_data.osm_id,
    //     category: nominatim_data.category,
    //     type: nominatim_data.type
    //   };
    // }

    const result = await db.collection(COLLECTION_NAME).insertOne(document);
    
    console.log('Enhanced address saved successfully:', result.insertedId);
    
    res.json({ 
      success: true, 
      id: result.insertedId,
      message: 'Address saved successfully',
      components: finalComponents,
      score: score
    });
    
  } catch (error) {
    console.error('Error saving enhanced address:', error);
    res.status(500).json({ error: 'Failed to save address' });
  }
});

// Save validated address (legacy endpoint)
app.post('/api/addresses', async (req, res) => {
  try {
    const { address, country, status = 2 } = req.body;
    
    if (!address || !country) {
      return res.status(400).json({ error: 'Address and country are required' });
    }

    const document = {
      address,
      country,
      status,
      // timestamp: new Date(),
      // source: 'nominatim_extension'
    };

    const result = await db.collection(COLLECTION_NAME).insertOne(document);
    
    res.json({ 
      success: true, 
      id: result.insertedId,
      message: 'Address saved successfully' 
    });
    
  } catch (error) {
    console.error('Error saving address:', error);
    res.status(500).json({ error: 'Failed to save address' });
  }
});

// Check address score using Nominatim
app.post('/api/addresses/score', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    console.log(`Checking score for address: ${address}`);
    const score = await checkWithNominatim(address);
    console.log(`Score calculated: ${score} (type: ${typeof score})`);
    
    res.json({ 
      address,
      score,
      // timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error checking address score:', error);
    res.status(500).json({ error: 'Failed to check address score', details: error.message });
  }
});

// Compute bounding box areas
app.post('/api/addresses/bounding-box', async (req, res) => {
  try {
    const { results } = req.body;
    
    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    const areasData = computeBoundingBoxAreasMeters(results);
    
    res.json({ 
      areas_data: areasData,
      total_results: results.length,
      processed_results: areasData.length
    });
    
  } catch (error) {
    console.error('Error computing bounding box areas:', error);
    res.status(500).json({ error: 'Failed to compute bounding box areas' });
  }
});

// Get saved addresses (optional - for viewing saved data)
app.get('/api/addresses', async (req, res) => {
  try {
    const addresses = await db.collection(COLLECTION_NAME)
      .find({})
      // .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    
    res.json(addresses);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});