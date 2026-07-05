const Property = require("../models/Property");

// Get all properties
const getProperties = async (req, res) => {
  try {
    const {
      location,
      listingType,
      propertyType,
      category,
      maxPrice,
      sort,
    } = req.query;

    const filter = {};

    // Location (case-insensitive)
    if (location) {
      filter.location = {
        $regex: location,
        $options: "i",
      };
    }

    // Sale / Rent
    if (listingType) {
      filter.listingType = listingType;
    }

    // Property Type
    if (propertyType) {
      filter.propertyType = propertyType;
    }

    // Residential / Commercial
    if (category) {
      filter.category = category;
    }

    // Maximum Price
    if (maxPrice) {
      filter.price = {
        $lte: Number(maxPrice),
      };
    }

    // Sorting
    let sortOption = { createdAt: -1 };

    switch (sort) {
      case "oldest":
        sortOption = { createdAt: 1 };
        break;

      case "price-low":
        sortOption = { price: 1 };
        break;

      case "price-high":
        sortOption = { price: -1 };
        break;

      default:
        sortOption = { createdAt: -1 };
    }

    const properties = await Property.find(filter).sort(sortOption);

    res.json(properties);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get a single property
const getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    res.json(property);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Create a property
const createProperty = async (req, res) => {
  try {
    console.log("BODY RECEIVED:", req.body);

    const property = new Property(req.body);

    const savedProperty = await property.save();

    res.status(201).json(savedProperty);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

// Update a property
const updateProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!property) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    res.json(property);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Delete a property
const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    res.json({
      message: "Property deleted successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Search properties
const searchProperties = async (req, res) => {
  try {
    const query = {};

    if (req.query.country) {
      query.country = req.query.country;
    }

    if (req.query.location) {
      query.location = req.query.location;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.propertyType) {
      query.propertyType = req.query.propertyType;
    }

    if (req.query.listingType) {
      query.listingType = req.query.listingType;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.featured) {
      query.featured = req.query.featured === "true";
    }

    const properties = await Property.find(query);

    res.json(properties);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties,
};