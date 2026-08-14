// src/routes/public.routes.js
// No authentication - powers the public marketing site.

const express = require('express');
const controller = require('../controllers/public.controller');

const router = express.Router();

router.get('/departments', controller.listPublicDepartments);
router.get('/doctors', controller.listPublicDoctors);

module.exports = router;
