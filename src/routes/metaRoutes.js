const express = require('express');
const { listStates, listCities, listCategories } = require('../controllers/metaController');

const router = express.Router();

router.get('/states', listStates);
router.get('/cities', listCities);
router.get('/categories', listCategories);

module.exports = router;
