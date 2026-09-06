const Sequence = require("../models/Sequence");

const getNextSequence = async (name, { session } = {}) => {
  const options = {
    new: true,
    upsert: true,
  };
  if (session) options.session = session;
  const sequence = await Sequence.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    options
  );

  return sequence.value;
};

module.exports = {
  getNextSequence,
};
