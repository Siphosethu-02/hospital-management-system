// src/models/labResult.model.js

const { pool } = require('../config/db');

async function findByTestId(testId) {
  const [rows] = await pool.execute(
    `SELECT lr.*, uu.first_name AS uploaded_by_first_name, uu.last_name AS uploaded_by_last_name,
            ru.first_name AS reviewed_by_first_name, ru.last_name AS reviewed_by_last_name
     FROM laboratory_results lr
     LEFT JOIN users uu ON uu.id = lr.uploaded_by
     LEFT JOIN users ru ON ru.id = lr.reviewed_by
     WHERE lr.laboratory_test_id = :testId LIMIT 1`,
    { testId }
  );
  return rows[0] || null;
}

async function create({ laboratoryTestId, resultSummary, resultData, reportFileUrl, uploadedBy }) {
  const [result] = await pool.execute(
    `INSERT INTO laboratory_results (laboratory_test_id, result_summary, result_data, report_file_url, uploaded_by)
     VALUES (:laboratoryTestId, :resultSummary, :resultData, :reportFileUrl, :uploadedBy)`,
    {
      laboratoryTestId,
      resultSummary: resultSummary || null,
      resultData: resultData ? JSON.stringify(resultData) : null,
      reportFileUrl: reportFileUrl || null,
      uploadedBy,
    }
  );
  const [rows] = await pool.execute('SELECT * FROM laboratory_results WHERE id = :id', { id: result.insertId });
  return rows[0];
}

async function markReviewed(laboratoryTestId, reviewedBy) {
  await pool.execute(
    `UPDATE laboratory_results SET reviewed_by = :reviewedBy, reviewed_at = NOW()
     WHERE laboratory_test_id = :laboratoryTestId`,
    { reviewedBy, laboratoryTestId }
  );
  return findByTestId(laboratoryTestId);
}

module.exports = { findByTestId, create, markReviewed };
