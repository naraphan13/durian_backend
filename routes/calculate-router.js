// 📁 routes/calculate-router.js
const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  const { totalWeight, basePrice, grades } = req.body;

  const parsedWeight = Number(totalWeight);
  const parsedBasePrice = Number(basePrice);

  let totalDeductions = 0;
  let deductedWeight = 0;

  for (const grade of grades) {
    const weight = Number(grade.weight);
    const price = Number(grade.price);
    totalDeductions += weight * price;
    deductedWeight += weight;
  }

  const netAmount = parsedWeight * parsedBasePrice - totalDeductions;
  const remainingWeight = parsedWeight - deductedWeight;
  const finalPrice = netAmount / remainingWeight;

  res.json({
    netAmount,
    remainingWeight,
    finalPrice,
  });
});

module.exports = router;
