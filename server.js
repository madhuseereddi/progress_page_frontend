const express = require("express");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const http = require("http");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://progress-fe.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: ["http://localhost:3000", "https://progress-fe.onrender.com"],
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(cookieParser());

const dbPool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Saimadhu@123",
  database: "progresdb",
});

// Create required tables if they don't exist
async function createTables() {
  let connection;
  try {
    connection = await dbPool.getConnection();

    // Create todos table
    const createTodoTableQuery = `CREATE TABLE IF NOT EXISTS todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    await connection.execute(createTodoTableQuery);

    // Create face_data table
    const createFaceDataTableQuery = `CREATE TABLE IF NOT EXISTS face_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        day DATE NOT NULL,
        imgSrc LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    await connection.execute(createFaceDataTableQuery);

    // Create otp table
    const createOtpTableQuery = `CREATE TABLE IF NOT EXISTS otp (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )`;
    await connection.execute(createOtpTableQuery);

    // Create verification_status table
    const createVerificationStatusTableQuery = `CREATE TABLE IF NOT EXISTS verification_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        unique_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    await connection.execute(createVerificationStatusTableQuery);

    console.log("Tables created or already exist.");
  } catch (error) {
    console.error("Error creating tables:", error);
  } finally {
    if (connection) connection.release();
  }
}


createTables();

// Generate a 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Email transport configuration using Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "seereddym@gmail.com",
    pass: "wdjn psjv ssba woxz", // Replace with your app-specific password
  },
});

// Endpoint to send OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60000); // OTP valid for 5 minutes

  let connection;
  try {
    connection = await dbPool.getConnection();

    // Store OTP in the database
    const query = "INSERT INTO otp (email, otp, expires_at) VALUES (?, ?, ?)";
    await connection.execute(query, [email, otp, expiresAt]);

    // Send OTP via email
    const mailOptions = {
      from: '"no-reply@quotidian.com" <noreply@yourdomain.com>',
      to: email,
      subject: "Your OTP for Verification",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border-radius: 5px;">
          <p>Dear Valued User,</p>
          <p>Your OTP for account verification is:</p>
          <span style="font-weight: bold; font-size: 20px; letter-spacing: 7px;">${otp}</span>
          <p>This OTP is valid for the next 5 minutes.</p>
          <p>Thank you for choosing our service.</p>
        </div>
      `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ error: "Error sending OTP." });
      }
      io.emit("otpSent", { email });
      res.status(200).json({ message: "OTP sent successfully!" });
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to verify OTP
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  let connection;
  try {
    connection = await dbPool.getConnection();

    const query =
      "SELECT * FROM otp WHERE email = ? AND otp = ? AND expires_at > NOW()";
    const [rows] = await connection.execute(query, [email, otp]);

    if (rows.length > 0) {
      await connection.execute("DELETE FROM otp WHERE email = ? AND otp = ?", [
        email,
        otp,
      ]);
      io.emit("verificationAccepted", { email });
      res.cookie("verificationStatus", "accepted", { httpOnly: true });
      res.status(200).json({ message: "OTP verified successfully!" });
    } else {
      res.cookie("verificationStatus", "rejected", { httpOnly: true });
      res.status(400).json({ error: "Invalid or expired OTP." });
    }
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});



// Endpoint to get todos
app.get("/getting_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();
    const [rows] = await connection.execute("SELECT * FROM todos");
    res.json(rows);
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to post todo items
app.post("/posting_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();

    const { todoItem } = req.body;

    if (!todoItem) {
      return res.status(400).json({ error: "Todo item is required." });
    }

    const currentDate = new Date();
    const query = "INSERT INTO todos (item, created_at) VALUES (?, ?)";
    const [result] = await connection.execute(query, [todoItem, currentDate]);

    res
      .status(201)
      .json({ id: result.insertId, item: todoItem, date: currentDate });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to save face data
app.post("/save_face_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();

    const { day, imgSrc } = req.body;

    if (!day || !imgSrc) {
      return res.status(400).json({ error: "Day and imgSrc are required." });
    }

    const query = "INSERT INTO face_data (day, imgSrc) VALUES (?, ?)";
    const [result] = await connection.execute(query, [day, imgSrc]);

    res.status(201).json({ id: result.insertId, day, imgSrc });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to get the latest face data
app.get("/getting_face_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();
    const [rows] = await connection.execute(
      "SELECT imgSrc FROM face_data ORDER BY created_at DESC LIMIT 1"
    );
    res.json(rows);
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Database connection error");
  } finally {
    if (connection) connection.release();
  }
});

fetchVerificationStatus = async () => {
  const { email } = this.state;
  if (!email) return; // Ensure email is present

  try {
    const response = await fetch(`https://separated-dot-variraptor.glitch.me/verification-status/${email}`, {
      method: "GET",
      credentials: "include",
    });

    // Check if the response is OK (status in the range 200-299)
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    // Update this logic based on the response from the server
    if (data.message.includes("accept")) {
      this.handleVerificationAccepted();
    } else if (data.message.includes("reject")) {
      this.handleVerificationRejected();
    } else {
      this.setState({ otpStatusMessage: data.message });
    }
  } catch (error) {
    console.error("Error fetching verification status:", error);
    this.setState({ otpStatusMessage: "An error occurred while fetching verification status." });
  }
};

// Server setup
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
