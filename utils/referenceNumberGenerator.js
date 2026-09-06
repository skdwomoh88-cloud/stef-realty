const sequenceService = require("../services/sequenceService");

const generateReferenceNumber = async (
  prefix,
  sequenceName
) => {
  const sequence =
    await sequenceService.getNextSequence(sequenceName);

  const year = new Date().getFullYear();

  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
};

module.exports = {
  generateReferenceNumber,
};