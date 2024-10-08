// server.js
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const Camp = require("./models/camp");
const Disease = require("./models/disease");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors"); // Import the cors package
const NewsAPI = require("newsapi");
const SOSCall = require("./models/sos");
const Alert = require("./models/alert");

//get MONGO_URI from .env file
require("dotenv").config();

const mongoURI = process.env.MONGO_URI;

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());

// Middleware to parse JSON requests
app.use(express.json());
app.use(express.json());

// Route for geocoding an address
app.get("/api/geocode", async (req, res) => {
  const { address } = req.query;

  if (!address) {
    return res
      .status(400)
      .json({ error: "Address query parameter is required." });
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: address,
          format: "json",
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "MyGeocodingApp/1.0 (myemail@example.com)", // Replace with your app name and email
        },
      }
    );

    if (response.data.length === 0) {
      return res.status(404).json({ error: "No results found." });
    }

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching data from Nominatim." });
  }
});

app.post("/api/sos", async (req, res) => {
  const { latitude, longitude } = req.body;

  // Validate input
  if (!latitude || !longitude) {
    return res
      .status(400)
      .json({ error: "Latitude and longitude are required." });
  }

  try {
    // Reverse geocode the latitude and longitude
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          lat: latitude,
          lon: longitude,
          format: "json",
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "MyGeocodingApp/1.0 (myemail@example.com)", // Replace with your app name and email
        },
      }
    );

    if (!response.data) {
      return res
        .status(404)
        .json({ error: "No results found for the provided coordinates." });
    }

    // Extract the address and set it as the name
    const name = response.data.display_name; // You can customize this based on your needs

    // Create a new SOS Call
    const sosCall = new SOSCall({
      name,
      latitude,
      longitude,
      location: name, // Save the reverse geocoded location
    });

    // Save the SOS call to the database
    await sosCall.save();

    res.status(201).json(sosCall);
  } catch (error) {
    console.error("Error during SOS call processing:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the SOS call." });
  }
});
// Route for reverse geocoding
app.get("/api/reverse", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res
      .status(400)
      .json({ error: "Latitude and longitude query parameters are required." });
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          lat,
          lon,
          format: "json",
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "MyGeocodingApp/1.0 (myemail@example.com)", // Replace with your app name and email
        },
      }
    );

    if (!response.data) {
      return res.status(404).json({ error: "No results found." });
    }

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching data from Nominatim." });
  }
});

const NEWS_API_KEY = "5e0769b62ed044efa93bee69c0042e86";

app.get("/api/latest-epidemics", async (req, res) => {
  try {
    // Make a call to the News API to fetch latest epidemics
    const response = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: "Technology", // Search query
        language: "en", // Specify the language

        apiKey: NEWS_API_KEY, // Your News API key
      },
    });

    // Send the response from the News API back to the client
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching latest epidemics:", error.message);
    res.status(500).json({
      message: "Error fetching latest epidemics",
      error: error.message,
    });
  }
});

app.post("/camp/add", async (req, res) => {
  try {
    const { name, address, capacity, requirements, latitude, longitude } =
      req.body;

    // If latitude and longitude are not provided, perform reverse geocoding
    let lat = latitude;
    let lng = longitude;

    if (!lat || !lng) {
      // Make an API call to get latitude and longitude using Nominatim
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: address,
            format: "json",
            addressdetails: 1,
          },
          headers: {
            "User-Agent": "MyGeocodingApp/1.0 (myemail@example.com)", // Replace with your app name and email
          },
        }
      );

      // Check if we got results
      if (response.data.length > 0) {
        const result = response.data[0];
        lat = result.lat;
        lng = result.lon;
      } else {
        return res.status(404).json({
          message: "Unable to find coordinates for the given address.",
        });
      }
    }

    // Create a new Camp document using the extracted data
    const newCamp = new Camp({
      name,
      address,
      capacity,
      latitude: lat,
      longitude: lng,
      requirements,
    });

    // Save the new Camp document to the database
    await newCamp.save();

    // Send a success response
    res.status(201).json({ message: "Camp saved successfully", data: newCamp });
  } catch (error) {
    console.error("Error saving camp data:", error);
    res
      .status(500)
      .json({ message: "Error saving camp data", error: error.message });
  }
});

// PUT endpoint to edit an existing camp using its _id
app.patch("/camp/edit", async (req, res) => {
  try {
    const { id, name, address, capacity, requirements } = req.body; // Use id as the MongoDB _id

    // Create an update object, only including fields that were provided
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (requirements !== undefined) updateData.requirements = requirements;

    // Find the camp by _id and update it with the new data
    const updatedCamp = await Camp.findByIdAndUpdate(
      id, // Use the _id field for the query
      updateData,
      { new: true, runValidators: true } // Return the updated document
    );

    // Check if the camp was found and updated
    if (!updatedCamp) {
      return res.status(404).json({ message: "Camp not found" });
    }

    // Send a success response with the updated camp data
    res
      .status(200)
      .json({ message: "Camp updated successfully", data: updatedCamp });
  } catch (error) {
    console.error("Error updating camp data:", error);
    res
      .status(500)
      .json({ message: "Error updating camp data", error: error.message });
  }
});

app.get("/camp/all", async (req, res) => {
  try {
    // Retrieve all camp documents from the database
    const camps = await Camp.find();

    // Send a success response with the retrieved camp data
    res
      .status(200)
      .json({ message: "Camps retrieved successfully", data: camps });
  } catch (error) {
    console.error("Error retrieving camp data:", error);
    res
      .status(500)
      .json({ message: "Error retrieving camp data", error: error.message });
  }
});

app.post("/disease/add", async (req, res) => {
  try {
    const { name, date, severity, mortality, location } = req.body;

    // Find the existing disease by name and location (case-insensitive search)
    const existingDisease = await Disease.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      location,
    });

    let disease;

    if (existingDisease) {
      // If disease exists, increment the number field by 1
      disease = await Disease.findOneAndUpdate(
        { _id: existingDisease._id }, // Find by existing disease's _id
        { $inc: { number: 1 } }, // Increment the number field
        { new: true } // Return the updated document
      );
    } else {
      // If no disease exists, create a new one with number set to 1
      disease = new Disease({
        name,
        date,
        severity,
        mortality,
        location,
        number: 1, // Start new disease with number 1, not 0
      });
      await disease.save(); // Save the new disease document
    }

    // Send a success response with the updated disease
    res.status(201).json({
      message: existingDisease
        ? "Existing disease updated successfully"
        : "New disease added successfully",
      data: disease,
    });
  } catch (error) {
    console.error("Error adding disease data:", error);
    res
      .status(500)
      .json({ message: "Error adding disease data", error: error.message });
  }
});

app.get("/disease/all", async (req, res) => {
  try {
    // Fetch all diseases from the database
    const diseases = await Disease.find();

    // Check if diseases are found
    if (diseases.length === 0) {
      return res.status(404).json({ message: "No diseases found" });
    }

    // Send a success response with the list of diseases
    res
      .status(200)
      .json({ message: "Diseases retrieved successfully", data: diseases });
  } catch (error) {
    console.error("Error retrieving diseases:", error);
    res
      .status(500)
      .json({ message: "Error retrieving diseases", error: error.message });
  }
});

app.get("/disease/largest", async (req, res) => {
  try {
    // Fetch all diseases from the database
    const diseases = await Disease.find();

    // Check if diseases are found
    if (diseases.length === 0) {
      return res.status(404).json({ message: "No diseases found" });
    }

    // Find the disease with the largest number of cases
    const largestDisease = diseases.reduce((max, disease) => {
      return disease.number > max.number ? disease : max;
    }, diseases[0]); // Initialize with the first disease

    // Send a success response with the disease with the largest number
    res.status(200).json({
      message:
        "Disease with the largest number of cases retrieved successfully",
      data: largestDisease,
    });
  } catch (error) {
    console.error(
      "Error retrieving disease with the largest number of cases:",
      error
    );
    res.status(500).json({
      message: "Error retrieving disease with the largest number of cases",
      error: error.message,
    });
  }
});

app.post("/api/alert", async (req, res) => {
  const { location, disease, radius } = req.body;

  if (!location || !disease || !radius) {
    return res
      .status(400)
      .json({ error: "All fields are required: location, disease, radius." });
  }

  try {
    // Reverse geocode the location to get latitude and longitude
    const geoResponse = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: location,
          format: "json",
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "MyGeocodingApp/1.0 (myemail@example.com)", // Replace with your app name and email
        },
      }
    );

    if (!geoResponse.data || geoResponse.data.length === 0) {
      return res
        .status(404)
        .json({ error: "No results found for the provided location." });
    }

    // Extract latitude and longitude from the response
    const { lat: latitude, lon: longitude } = geoResponse.data[0];

    // Create a new Alert
    const newAlert = new Alert({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      disease,
      radius,
      location, // Save the user-provided location
    });

    // Save the alert to the database
    const savedAlert = await newAlert.save();

    res.status(201).json(savedAlert);
  } catch (error) {
    console.error("Error during alert processing:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the alert." });
  }
});
// Get all alerts
app.get("/api/alerts", async (req, res) => {
  try {
    const alerts = await Alert.find();
    res.status(200).json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Endpoint for removing an alert by ID
app.delete("/api/alerts/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Use findByIdAndDelete instead of findByIdAndRemove
    const deletedAlert = await Alert.findByIdAndDelete(id);

    if (!deletedAlert) {
      return res.status(404).json({ error: "Alert not found." });
    }

    res
      .status(200)
      .json({ message: "Alert removed successfully.", alert: deletedAlert });
  } catch (error) {
    console.error("Error during alert deletion:", error);
    res
      .status(500)
      .json({ error: "An error occurred while deleting the alert." });
  }
});

mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
