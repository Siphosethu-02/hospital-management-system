// src/utils/pagination.js
// Shared pagination parsing + response-meta shaping, so every list
// endpoint (users, patients, departments, and later appointments,
// medicines, invoices, ...) behaves identically.

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reads page/limit/sortBy/order from req.query with sane defaults and
 * bounds, and returns everything a model's list() function needs.
 *
 * @param {object} query  req.query
 * @param {string[]} allowedSortColumns  whitelist to prevent SQL injection via ORDER BY
 * @param {string} defaultSort
 */
function parsePagination(query, allowedSortColumns = ['created_at'], defaultSort = 'created_at') {
  const page = Math.max(parseInt(query.page, 10) || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = (page - 1) * limit;

  let sortBy = defaultSort;
  if (query.sortBy && allowedSortColumns.includes(query.sortBy)) {
    sortBy = query.sortBy;
  }

  const order = String(query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return { page, limit, offset, sortBy, order };
}

/**
 * @param {number} total   total matching rows (from a COUNT(*) query)
 * @param {number} page
 * @param {number} limit
 */
function buildMeta(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

/**
 * Guarantees a value is a safe non-negative integer, for the one place
 * in this codebase where a value is interpolated directly into a SQL
 * string instead of bound as a query parameter: LIMIT/OFFSET.
 *
 * WHY THIS EXISTS: mysql2's pool.execute() uses MySQL's binary
 * prepared-statement protocol (COM_STMT_PREPARE / COM_STMT_EXECUTE).
 * That protocol does not accept bound parameters in the LIMIT/OFFSET
 * clause position - MySQL's parser resolves LIMIT/OFFSET at PREPARE
 * time, not at EXECUTE time, so binding `LIMIT :limit OFFSET :offset`
 * (or `LIMIT ? OFFSET ?`) causes the server to reject the statement
 * with "Incorrect arguments to mysqld_stmt_execute". This reproduces
 * on any MySQL version/host and is unrelated to parameter types,
 * named vs positional placeholders, or Docker - it's a mysql2 +
 * MySQL server protocol limitation (see sidorares/node-mysql2 issues
 * discussing LIMIT/OFFSET placeholders).
 *
 * The correct fix is to never bind LIMIT/OFFSET through execute() -
 * interpolate them directly into the SQL string instead. That's only
 * safe because they're guaranteed integers; this function is the single
 * choke point that guarantees it, so every call site fails loudly
 * instead of ever interpolating an unvalidated value.
 */
function sqlInt(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected a non-negative integer for SQL interpolation (LIMIT/OFFSET), got: ${value}`);
  }
  return value;
}

module.exports = { parsePagination, buildMeta, sqlInt };
