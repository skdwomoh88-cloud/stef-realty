const asyncHandler = require("../utils/asyncHandler");
const propertyService = require("../services/propertyService");

// Get all properties
const getProperties = asyncHandler(async (req, res, next) => {
  const result = await propertyService.getPublicProperties(req.query);

  res.json({
  success: true,
  page: result.page,
  limit: result.limit,
  total: result.total,
  totalPages: Math.ceil(result.total / result.limit),
  count: result.properties.length,
  data: result.properties,
});
});

// Get a single property
const getPropertyById = asyncHandler(async (req, res) => {
  const property = await propertyService.getPropertyById(
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: property,
  });
});

// Create a property
const createProperty = asyncHandler(async (req, res) => {
  const property = await propertyService.createProperty(
    req.body,
    req.user
  );

  res.status(201).json({
    success: true,
    data: property,
  });
});

// Update a property
const updateProperty = asyncHandler(async (req, res) => {
  const property = await propertyService.updateProperty(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    data: property,
  });
});

// Delete a property
const deleteProperty = asyncHandler(async (req, res) => {
  await propertyService.deleteProperty(req.params.id);

  res.status(200).json({
    success: true,
    message: "Property deleted successfully.",
  });
});

// Search properties
const searchProperties = asyncHandler(async (req, res) => {
  const properties = await propertyService.searchProperties(
    req.query
  );

  res.status(200).json({
    success: true,
    count: properties.length,
    data: properties,
  });
});

const getPublicProperties = asyncHandler(async (req, res) => {
  const result = await propertyService.getPublicProperties(req.query);

res.json({
  success: true,
  page: result.page,
  limit: result.limit,
  total: result.total,
  totalPages: Math.ceil(result.total / result.limit),
  count: result.properties.length,
  data: result.properties,
});
});

const getManagementProperties = asyncHandler(async (req, res) => {
  const result = await propertyService.getManagementProperties(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.properties.length,
    data: result.properties,
    pagination: result.pagination,
  });
});

module.exports = {
  getProperties,
  getPropertyById,
  getPublicProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties,
  getManagementProperties,
};
