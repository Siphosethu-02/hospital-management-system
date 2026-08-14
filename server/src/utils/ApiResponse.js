// src/utils/ApiResponse.js
// Consistent success response envelope, mirroring ApiError for failures.
// Every successful endpoint should respond with `new ApiResponse(...).send(res)`
// so the frontend can rely on one predictable shape:
// { success: true, message, data, meta }

class ApiResponse {
  constructor(statusCode, message = 'Success', data = null, meta = null) {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
    if (meta) this.meta = meta;
  }

  send(res) {
    const { statusCode, ...body } = this;
    return res.status(statusCode).json(body);
  }
}

module.exports = ApiResponse;
