const crypto = require("crypto");

const CORRELATION_ID_HEADER = "x-correlation-id";
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const correlationId = (req, res, next) => {
  const inbound = req.get(CORRELATION_ID_HEADER);
  req.correlationId = typeof inbound === "string" && SAFE_CORRELATION_ID.test(inbound)
    ? inbound
    : crypto.randomUUID();
  res.set(CORRELATION_ID_HEADER, req.correlationId);
  next();
};

module.exports = { correlationId, CORRELATION_ID_HEADER, SAFE_CORRELATION_ID };
