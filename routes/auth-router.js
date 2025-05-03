// 📁 routes/auth-router.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../models/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';



router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // ตรวจความถูกต้องเบื้องต้น
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    // แฮชรหัสผ่าน
    const hashedPassword = await bcrypt.hash(password, 10);

    // สร้างผู้ใช้ใหม่ โดยบังคับ role = 'user'
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'user', // ✅ ป้องกันไม่ให้สร้าง admin จาก frontend
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

  } catch (err) {
    console.error(err);

    // ตรวจ email ซ้ำ (Prisma error code P2002)
    if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
      return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสมัคร' });
  }
});

module.exports = router;


// ✅ POST /v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        role: user.role, // ✅ สำคัญ!
      }
    });;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

module.exports = router;