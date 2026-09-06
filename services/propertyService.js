const Property = require("../models/Property");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const AppError = require("../utils/AppError");
const { ROLES: CANONICAL_ROLES } = require("../constants/roleCatalogue");
const { isRole, isPlatformAdministratorRole } = require("../utils/rbac");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const Location = require("../models/Location");

const PUBLIC_PROPERTY_FILTER = {
  verificationStatus: PROPERTY_VERIFICATION_STATUS.VERIFIED,
  status: PROPERTY_STATUS.AVAILABLE,
  isArchived: false,
};

const PUBLIC_PROPERTY_SELECT =
  "-owner -createdBy -assignedAgent -verifiedBy -inspectionNotes -verificationStatus -isArchived";

const withPublicVisibility = (filter = {}) => ({
  ...filter,
  ...PUBLIC_PROPERTY_FILTER,
});

const populatePublicLocation = (query) => query.populate(
  "location", "country region district municipality city area postalCode latitude longitude"
);

const getProperties = (filter, sortOption, skip, limit) => {
  return populatePublicLocation(Property.find(withPublicVisibility(filter))
    .select(PUBLIC_PROPERTY_SELECT)
    .sort(sortOption)
    .skip(skip)
    .limit(limit));
};

const countProperties = (filter) => {
  return Property.countDocuments(withPublicVisibility(filter));
};

const getPublicProperties = async (query) => {
  const filter = { ...PUBLIC_PROPERTY_FILTER };

  if (query.location) {
    const location = await Location.findOne({ _id: query.location, active: true }).select("_id");
    if (!location) throw new AppError("Active location not found.", 400, "INVALID_LOCATION_FILTER");
    filter.location = location._id;
  } else if (query.region || query.city || query.area) {
    const locationFilter = { active: true };
    for (const field of ["region", "city", "area"]) {
      if (query[field]) locationFilter[field] = query[field];
    }
    const locationIds = await Location.find(locationFilter).distinct("_id");
    filter.location = { $in: locationIds };
  }

  if (query.propertyType) {
    filter.propertyType = query.propertyType;
  }

  if (query.listingType) {
    filter.listingType = query.listingType;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.bedrooms) {
    filter.bedrooms = Number(query.bedrooms);
  }

  if (query.featured) {
    filter.featured = query.featured === "true";
  }

  if (query.minPrice || query.maxPrice) {
    filter.price = {};

    if (query.minPrice) {
      filter.price.$gte = Number(query.minPrice);
    }

    if (query.maxPrice) {
      filter.price.$lte = Number(query.maxPrice);
    }
  }

  const page = Number(query.page) || 1;
const limit = Number(query.limit) || 20;
const skip = (page - 1) * limit;

let sortOption = { createdAt: -1 };

switch (query.sort) {
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

const total = await Property.countDocuments(filter);

const properties = await populatePublicLocation(Property.find(filter)
  .select(PUBLIC_PROPERTY_SELECT)
  .sort(sortOption)
  .skip(skip)
  .limit(limit));

return {
  properties,
  total,
  page,
  limit,
};
};

const getPropertyById = async (id) => {
  const publicPropertyQuery = Property.findOne({
    _id: id,
    ...PUBLIC_PROPERTY_FILTER,
  }).select(PUBLIC_PROPERTY_SELECT);
  const property = typeof publicPropertyQuery.populate === "function"
    ? await publicPropertyQuery.populate(
      "location", "country region district municipality city area postalCode latitude longitude"
    )
    : await publicPropertyQuery;

  if (!property) {
    throw new AppError(
      "Property not found",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }

  return property;
};

const createProperty = async (data, currentUser) => {
  const property = await Property.create({
    ...data,
    createdBy: currentUser._id,
  });

  return property;
};

const updateProperty = async (id, data, currentUser) => {
  const property = await Property.findById(id);

  if (!property) {
    throw new AppError(
      "Property not found",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }

  // Ownership check
  if (
    !isPlatformAdministratorRole(currentUser.role) &&
    property.createdBy.toString() !== currentUser._id.toString()
  ) {
    throw new AppError(
      "You are not authorized to update this property.",
      403,
      "FORBIDDEN"
    );
  }

  // Allowed fields only
  if (data.title !== undefined)
    property.title = data.title;

  if (data.description !== undefined)
    property.description = data.description;

  if (data.price !== undefined)
    property.price = data.price;

  if (data.location !== undefined)
    property.location = data.location;

  if (data.category !== undefined)
    property.category = data.category;

  if (data.propertyType !== undefined)
    property.propertyType = data.propertyType;

  if (data.listingType !== undefined)
    property.listingType = data.listingType;

  if (data.currency !== undefined)
    property.currency = data.currency;

  if (data.bedrooms !== undefined)
    property.bedrooms = data.bedrooms;

  if (data.bathrooms !== undefined)
    property.bathrooms = data.bathrooms;

  if (data.parkingSpaces !== undefined)
    property.parkingSpaces = data.parkingSpaces;

  if (data.areaSize !== undefined)
    property.areaSize = data.areaSize;

  if (data.furnished !== undefined)
    property.furnished = data.furnished;

  if (data.images !== undefined)
    property.images = data.images;

  if (data.videoUrl !== undefined)
    property.videoUrl = data.videoUrl;

  if (data.virtualTourUrl !== undefined)
    property.virtualTourUrl = data.virtualTourUrl;

  if (data.amenities !== undefined)
    property.amenities = data.amenities;

  if (data.negotiable !== undefined)
    property.negotiable = data.negotiable;

  // Admin-only fields
  if (isPlatformAdministratorRole(currentUser.role)) {
    if (data.status !== undefined)
      property.status = data.status;

    if (data.verificationStatus !== undefined)
      property.verificationStatus = data.verificationStatus;

    if (data.featured !== undefined)
      property.featured = data.featured;

    if (data.isArchived !== undefined)
      property.isArchived = data.isArchived;

    if (data.inspectionNotes !== undefined)
      property.inspectionNotes = data.inspectionNotes;
  }

  await property.save();

  return property;
};

const deleteProperty = async (id) => {
  const property = await Property.findById(id);

  if (!property) {
    throw new AppError(
      "Property not found",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }

  await property.deleteOne();

  return true;
};

const searchProperties = async (query) => {
  const filter = { ...PUBLIC_PROPERTY_FILTER };

  if (query.country) {
    filter.country = query.country;
  }

  if (query.location) {
    filter.location = query.location;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.propertyType) {
    filter.propertyType = query.propertyType;
  }

  if (query.listingType) {
    filter.listingType = query.listingType;
  }

  if (query.featured) {
    filter.featured = query.featured === "true";
  }

  return await populatePublicLocation(Property.find(filter).select(PUBLIC_PROPERTY_SELECT));
};

const getManagementProperties = async (query = {}, currentUser) => {
  let { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = query;
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = {};
  for (const field of ["status", "verificationStatus", "listingType", "category", "location", "owner", "assignedAgent", "isArchived"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  if (isRole(currentUser.role, CANONICAL_ROLES.AGENT)) {
    delete filter.assignedAgent;
    filter.$or = [{ createdBy: currentUser._id }, { assignedAgent: currentUser._id }];
  }
  const skip = (page - 1) * limit;
  const direction = sortOrder === "asc" ? 1 : -1;
  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate("location", "country region city area")
      .populate("owner", "name email")
      .populate("createdBy", "name email")
      .populate("assignedAgent", "name email")
      .sort({ [sortBy]: direction }).skip(skip).limit(limit),
    Property.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return {
    properties,
    pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
};

module.exports = {
  getProperties,
  countProperties,
  getPublicProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties,
  getManagementProperties,
};
