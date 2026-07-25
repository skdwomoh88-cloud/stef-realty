const Property = require("../models/Property");

const getProperties = (filter, sortOption, skip, limit) => {
  return Property.find(filter)
    .sort(sortOption)
    .skip(skip)
    .limit(limit);
};

const countProperties = (filter) => {
  return Property.countDocuments(filter);
};

module.exports = {
  getProperties,
  countProperties,
};