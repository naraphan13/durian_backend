require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const errorMiddleware = require("./middlewares/errorMiddleware");
const notFound = require("./middlewares/notFound");

// const authRouter = require("./routes");
const billRouter = require("./routes/bill-router"); // ✅ เพิ่มตรงนี้
const authRouter = require("./routes/auth-router"); // ✅ เพิ่มตรงนี้
const exportPdfRoute = require('./routes/export-router');
const app = express();

app.use(cors({
    origin: "https://dreamy-cheesecake-ba1c61.netlify.app",
    credentials: true // ถ้าคุณส่ง cookie หรือ token ก็เปิดด้วย
  }))
app.use(morgan("dev"));
app.use(express.json());

// ✅ เส้นทาง API
app.use("/v1/auth", authRouter);
app.use("/v1/bills", billRouter); // ✅ ใช้ route บิลแทน todo
app.use('/api', exportPdfRoute);

app.use(notFound);
app.use(errorMiddleware);

const port = process.env.PORT || 9999;
app.listen(port, () => console.log(`✅ Server running on port ${port}`));
