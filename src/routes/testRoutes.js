const express = require("express");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Test
 *   description: Test endpoints
 */

/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Test the API
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: API is working
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API is working!
 */
router.get("/", (req, res) => {
  res.json({ message: "API is working!" });
});

module.exports = router;
