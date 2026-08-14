// src/utils/asyncHandler.js
// Wraps an async Express route handler so that any rejected promise
// (thrown error) is forwarded to next(), landing in our centralized
// error-handling middleware instead of crashing the process or
// requiring a try/catch in every single controller.

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
