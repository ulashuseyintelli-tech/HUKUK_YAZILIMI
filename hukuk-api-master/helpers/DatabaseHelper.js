const createLookup = (from, localField, foreignField, as) => {
  return {
    $lookup: {
      from,
      localField,
      foreignField,
      as,
    },
  };
};

module.exports = { createLookup };
