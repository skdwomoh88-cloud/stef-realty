const Property = require("../models/Property");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const propertyService = require("../services/propertyService");

// Get all properties
const getProperties = asyncHandler(async (req, res, next) => {
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

    // Region
if (req.query.region) {
  filter.region = {
    $regex: req.query.region,
    $options: "i",
  };
}

// City
if (req.query.city) {
  filter.city = {
    $regex: req.query.city,
    $options: "i",
  };
}

// Area
if (req.query.area) {
  filter.area = {
    $regex: req.query.area,
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

    if (req.query.featured) {
  filter.featured = req.query.featured === "true";
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

    const page = Number(req.query.page) || 1;
const limit = Number(req.query.limit) || 20;
const skip = (page - 1) * limit;

const total = await propertyService.countProperties(filter);

const properties = await propertyService.getProperties(
  filter,
  sortOption,
  skip,
  limit
);

    res.json({
  success: true,
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  count: properties.length,
  data: properties,
});
});

// Get a single property
const getPropertyById = asyncHandler(async (req, res, next) => {
    const property = await Property.findById(req.params.id);

    if (!property) {
  return next(
  new AppError(
    "Property not found",
    404,
    "PROPERTY_NOT_FOUND"
  )
);
}

    res.json({
  success: true,
  data: property,
});
});

// Create a property
const createProperty = asyncHandler(async (req, res, next) => {
  
    console.log("BODY RECEIVED:", req.body);

    const property = new Property({
  ...req.body,
  createdBy: req.user._id,
});

    const savedProperty = await property.save();

    res.status(201).json({
      success: true,
      data: savedProperty,
    });
});

// Update a property
const updateProperty = asyncHandler(async (req, res, next) => {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!property) {
  return next(
  new AppError(
    "Property not found",
    404,
    "PROPERTY_NOT_FOUND"
  )
);
}

    res.json({
  success: true,
  data: property,
});
});

// Delete a property
const deleteProperty = asyncHandler(async (req, res, next) => {
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
  return next(
  new AppError(
    "Property not found",
    404,
    "PROPERTY_NOT_FOUND"
  )
);
}

    res.json({
  success: true,
  message: "Property deleted successfully",
});
});

// Search properties
const searchProperties = asyncHandler(async (req, res, next) => {
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

    res.json({
  success: true,
  count: properties.length,
  data: properties,
});
});

module.exports = {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties,
};