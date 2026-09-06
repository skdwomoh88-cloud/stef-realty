const generateCaseNumber = async (Case) => {
  const year = new Date().getFullYear();

  const count = await Case.countDocuments();

  const sequence = String(count + 1).padStart(6, "0");

  return `SR-${year}-${sequence}`;
};

module.exports = generateCaseNumber;