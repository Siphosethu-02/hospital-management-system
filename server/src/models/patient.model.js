// src/models/patient.model.js

const { pool, withTransaction } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    p.id, p.patient_code, p.user_id, p.first_name, p.last_name, p.date_of_birth,
    p.gender, p.blood_group, p.phone, p.email, p.address, p.city,
    p.allergies, p.chronic_conditions,
    p.emergency_contact_name, p.emergency_contact_phone, p.emergency_contact_relation,
    p.insurance_provider, p.insurance_policy_number,
    p.profile_image_url, p.registered_by, p.is_active,
    p.created_at, p.updated_at,
    ru.first_name AS registered_by_first_name,
    ru.last_name AS registered_by_last_name
  FROM patients p
  LEFT JOIN users ru ON ru.id = p.registered_by
`;

async function list({ search, gender, bloodGroup, isActive, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (search) {
    where.push(
      `(p.first_name LIKE :search OR p.last_name LIKE :search
        OR p.patient_code LIKE :search OR p.phone LIKE :search OR p.email LIKE :search)`
    );
    params.search = `%${search}%`;
  }
  if (gender) {
    where.push('p.gender = :gender');
    params.gender = gender;
  }
  if (bloodGroup) {
    where.push('p.blood_group = :bloodGroup');
    params.bloodGroup = bloodGroup;
  }
  if (isActive !== undefined) {
    where.push('p.is_active = :isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('p.') ? sortBy : `p.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM patients p ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE p.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE p.patient_code = :code LIMIT 1`, { code });
  return rows[0] || null;
}

/**
 * Generates a human-friendly, sequential-looking patient code such as
 * PT-2026-000123, without a separate counter table: it locks the
 * matching rows for the current year inside a transaction to avoid a
 * race between two receptionists registering patients at the same instant.
 */
async function generatePatientCode(connection) {
  const year = new Date().getFullYear();
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count FROM patients WHERE patient_code LIKE :prefix FOR UPDATE`,
    { prefix: `PT-${year}-%` }
  );
  const nextSeq = rows[0].count + 1;
  return `PT-${year}-${String(nextSeq).padStart(6, '0')}`;
}

async function create(data) {
  return withTransaction(async (connection) => {
    const patientCode = await generatePatientCode(connection);

    const [result] = await connection.execute(
      `INSERT INTO patients (
        patient_code, first_name, last_name, date_of_birth, gender, blood_group,
        phone, email, address, city, allergies, chronic_conditions,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        insurance_provider, insurance_policy_number, registered_by
      ) VALUES (
        :patientCode, :firstName, :lastName, :dateOfBirth, :gender, :bloodGroup,
        :phone, :email, :address, :city, :allergies, :chronicConditions,
        :emergencyContactName, :emergencyContactPhone, :emergencyContactRelation,
        :insuranceProvider, :insurancePolicyNumber, :registeredBy
      )`,
      {
        patientCode,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        bloodGroup: data.bloodGroup || 'unknown',
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        allergies: data.allergies || null,
        chronicConditions: data.chronicConditions || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emergencyContactRelation: data.emergencyContactRelation || null,
        insuranceProvider: data.insuranceProvider || null,
        insurancePolicyNumber: data.insurancePolicyNumber || null,
        registeredBy: data.registeredBy || null,
      }
    );

    const [rows] = await connection.execute(`${BASE_SELECT} WHERE p.id = :id LIMIT 1`, {
      id: result.insertId,
    });
    return rows[0];
  });
}

const UPDATABLE_FIELDS = [
  'first_name', 'last_name', 'date_of_birth', 'gender', 'blood_group',
  'phone', 'email', 'address', 'city', 'allergies', 'chronic_conditions',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
  'insurance_provider', 'insurance_policy_number',
];

async function update(id, fields) {
  const setClauses = [];
  const params = { id };

  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = :${key}`);
      params[key] = fields[key];
    }
  }

  if (setClauses.length === 0) return findById(id);

  await pool.execute(`UPDATE patients SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function updateImage(id, imageUrl) {
  await pool.execute('UPDATE patients SET profile_image_url = :imageUrl WHERE id = :id', {
    id,
    imageUrl,
  });
  return findById(id);
}

async function setActive(id, isActive) {
  await pool.execute('UPDATE patients SET is_active = :isActive WHERE id = :id', {
    id,
    isActive: isActive ? 1 : 0,
  });
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM patients WHERE id = :id', { id });
}

async function findByUserId(userId) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE p.user_id = :userId LIMIT 1`, { userId });
  return rows[0] || null;
}

/**
 * Links a patient record to a login account (patients.user_id -> users.id).
 * The UNIQUE constraint on patients.user_id means the database itself
 * guarantees a user can never be linked to more than one patient record;
 * this function additionally guards against overwriting an existing
 * link on the PATIENT side (a patient can't be linked to two accounts).
 */
async function linkUserAccount(patientId, userId) {
  await pool.execute('UPDATE patients SET user_id = :userId WHERE id = :patientId', { patientId, userId });
  return findById(patientId);
}

module.exports = {
  list,
  findById,
  findByCode,
  findByUserId,
  linkUserAccount,
  create,
  update,
  updateImage,
  setActive,
  remove,
};
