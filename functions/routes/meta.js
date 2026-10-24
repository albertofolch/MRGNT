const express = require('express');
const { DISCIPLINES, NOTICIAS_CATEGORIES } = require('../constants');
const { setPublicCache } = require('../lib/cache');

const router = express.Router();

router.get('/', (req, res) => {
  setPublicCache(req, res);
  res.json({ disciplines: DISCIPLINES, noticiasCategories: NOTICIAS_CATEGORIES });
});

module.exports = router;
