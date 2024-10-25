const express = require("express");
const sqlite3 = require("sqlite3").verbose(); // Import SQLite
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const http = require("http");
const cookieParser = require("cookie-parser");

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://progress-fe.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "https://progress-fe.onrender.com"],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(cookieParser());

// Initialize SQLite database
const db = new sqlite3.Database("progress.db", (err) => {
  if (err) {
    console.error("Could not connect to SQLite database", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Create required tables if they don't exist
function createTables() {
  const createTodoTableQuery = `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
  
  const createFaceDataTableQuery = `CREATE TABLE IF NOT EXISTS face_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day DATE NOT NULL,
      imgSrc TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
  
  const createOtpTableQuery = `CREATE TABLE IF NOT EXISTS otp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    )`;
  
  const createVerificationStatusTableQuery = `CREATE TABLE IF NOT EXISTS verification_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      action TEXT NOT NULL,
      unique_id TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

  db.serialize(() => {
    db.run(createTodoTableQuery);
    db.run(createFaceDataTableQuery);
    db.run(createOtpTableQuery);
    db.run(createVerificationStatusTableQuery);
  });

  console.log("Tables created or already exist.");
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
app.post("/send-otp", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60000).toISOString(); // OTP valid for 5 minutes

  // Store OTP in the database
  const query = "INSERT INTO otp (email, otp, expires_at) VALUES (?, ?, ?)";
  db.run(query, [email, otp, expiresAt], function (error) {
    if (error) {
      console.error("Error storing OTP:", error);
      return res.status(500).json({ error: "Error sending OTP." });
    }

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
  });
});

// Endpoint to verify OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  const query =
    "SELECT * FROM otp WHERE email = ? AND otp = ? AND expires_at > datetime('now')";
  db.get(query, [email, otp], (error, row) => {
    if (error) {
      console.error("Database connection error:", error);
      return res.status(500).send("Database connection error");
    }

    if (row) {
      db.run("DELETE FROM otp WHERE email = ? AND otp = ?", [email, otp]);
      io.emit("verificationAccepted", { email });
      res.cookie("verificationStatus", "accepted", { httpOnly: true });
      res.status(200).json({ message: "OTP verified successfully!" });
    } else {
      res.cookie("verificationStatus", "rejected", { httpOnly: true });
      res.status(400).json({ error: "Invalid or expired OTP." });
    }
  });
});

// Endpoint to get todos
app.get("/getting_data", (req, res) => {
  db.all("SELECT * FROM todos", [], (error, rows) => {
    if (error) {
      console.error("Database connection error:", error);
      return res.status(500).send("Database connection error");
    }
    res.json(rows);
  });
});

// Endpoint to post todo items
app.post("/posting_data", (req, res) => {
  const { todoItem } = req.body;

  if (!todoItem) {
    return res.status(400).json({ error: "Todo item is required." });
  }

  const currentDate = new Date().toISOString();
  const query = "INSERT INTO todos (item, created_at) VALUES (?, ?)";
  db.run(query, [todoItem, currentDate], function (error) {
    if (error) {
      console.error("Database connection error:", error);
      return res.status(500).send("Database connection error");
    }
    res.status(201).json({ id: this.lastID, item: todoItem, date: currentDate });
  });
});

// Endpoint to save face data
app.post("/save_face_data", (req, res) => {
  const { day, imgSrc } = req.body;

  if (!day || !imgSrc) {
    return res.status(400).json({ error: "Day and imgSrc are required." });
  }

  const query = "INSERT INTO face_data (day, imgSrc) VALUES (?, ?)";
  db.run(query, [day, imgSrc], function (error) {
    if (error) {
      console.error("Database connection error:", error);
      return res.status(500).send("Database connection error");
    }
    res.status(201).json({ id: this.lastID, day, imgSrc });
  });
});

// Endpoint to get the latest face data
app.get("/getting_face_data", (req, res) => {
  db.get(
    "SELECT imgSrc FROM face_data ORDER BY created_at DESC LIMIT 1",
    (error, row) => {
      if (error) {
        console.error("Database connection error:", error);
        return res.status(500).send("Database connection error");
      }
      res.json(row);
    }
  );
});

// Email verification endpoint
app.post("/verify-mail", (req, res) => {
  const { email } = req.body;

  const uniqueId = Date.now();
  const acceptLink = `https://separated-dot-variraptor.glitch.me/verify/accept/${uniqueId}/${email}`;
  const rejectLink = `https://separated-dot-variraptor.glitch.me/verify/reject/${uniqueId}/${email}`;

  const mailOptions = {
    from: '"Verification Team" <no-reply@quotidian.com>',
    to: email,
    subject: "Email Verification Request",
    html: `
      <h1>Email Verification</h1>
      <p>Please verify your email address by clicking one of the links below:</p>
      <a href="${acceptLink}" style="padding: 10px; background-color: green; color: white; text-decoration: none;">Accept</a>
      <a href="${rejectLink}" style="padding: 10px; background-color: red; color: white; text-decoration: none;">Reject</a>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      return res.status(500).json({ error: "Error sending verification email." });
    }

    const query = "INSERT INTO verification_status (email, action, unique_id) VALUES (?, ?, ?)";
    db.run(query, [email, 'pending', uniqueId], (err) => {
      if (err) {
        console.error("Error saving verification status:", err);
        return res.status(500).json({ error: "Error saving verification status." });
      }

      io.emit("verificationEmailSent", { email });
      res.status(200).json({ message: "Verification email sent!" });
    });
  });
});

// Endpoint to check verification status
// Accept or reject verification
app.get('/verify/:action/:uniqueId/:email', async (req, res) => {
  const { action, uniqueId, email } = req.params;

  // Log the incoming parameters
  console.log("Received:", { action, uniqueId, email });

  // Check if parameters are defined
  if (!action || !uniqueId || !email) {
    return res.status(400).json({ message: "Missing parameters." });
  }

  const timestamp = Date.now();
  const actionSubstring = action.substring(0, 6);

  // Ensure the action is either "accept" or "reject"
  if (actionSubstring === 'accept' || actionSubstring === 'reject') {
    const query = `INSERT INTO verification_status (email, action, unique_id, timestamp) VALUES (?, ?, ?, ?)`;
    
    db.run(query, [email, action, uniqueId, new Date(timestamp)], function (error) {
      if (error) {
        console.error("Database error:", error.message);
        return res.status(500).json({ error: "Database error.", details: error.message });
      }

      res.send({
        message: `Verification ${action}ed!`,
        uniqueAction: `${action}_${timestamp}`, // Concatenated action with timestamp
      });
    });
  } else {
    res.status(400).json({ message: "Invalid action" });
  }
});

// Retrieve verification status
app.get("/verification-status/:email", async (req, res) => {
  const { email } = req.params;

  const query = `SELECT action, timestamp FROM verification_status WHERE email = ? ORDER BY timestamp DESC LIMIT 1`;

  db.get(query, [email], (error, row) => {
    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Database error." });
    }

    if (row) {
      const { action, timestamp } = row;
      res.json({ message: `Last verification action: ${action} at ${new Date(timestamp).toISOString()}` });
    } else {
      res.json({ message: "No verification action has been performed yet." });
    }
  });
});


// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
