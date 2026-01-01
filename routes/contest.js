const express = require('express');
const router = express.Router();
const contestController= require('../controllers/contestController');
const upload = require('../config/multer-config');


router.post('/create', (req, res, next) => {req.folderName = 'IDT-MEDIA/contests-banners';next();}, upload.single('bannerImage'), contestController.createContest);
router.get('/all',contestController.getAllContests)
router.get('/:contestID',contestController.getContestById)
  

module.exports = router;
