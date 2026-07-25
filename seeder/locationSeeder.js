require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Location = require("../models/Location");

connectDB();

const locations = [
  {
    country: "Ghana",
    region: "Greater Accra",
    district: "Accra Metropolitan",
    municipality: "Accra",
    city: "Accra",
    area: "East Legon",
  },
  {
    country: "Ghana",
    region: "Greater Accra",
    district: "Accra Metropolitan",
    municipality: "Accra",
    city: "Accra",
    area: "Airport Residential",
  },
  {
    country: "Ghana",
    region: "Greater Accra",
    district: "Accra Metropolitan",
    municipality: "Accra",
    city: "Accra",
    area: "Cantonments",
  },
];

const importData = async () => {
  try {
    await Location.deleteMany();
    await Location.insertMany(locations);

    console.log("Locations Imported");

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

importData();